import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import Datastore from 'nedb';
import calculateRating from './calculateRating.js';
import bignumber from 'bignumber.js'
import weights from './weights.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const __dirname = path.resolve();

const db = new Datastore({ filename: 'users.db', autoload: true });

function getLastLoginTime(req) {
    const lastLogin = req.cookies.lastLogin;
    return lastLogin ? new Date(lastLogin) : null;
}

let heroes = {};

async function fetchHeroes() {
    const response = await fetch('https://api.opendota.com/api/heroes');
    const data = await response.json();
    heroes = data.reduce((acc, hero) => {
        acc[hero.id] = hero.localized_name;
        return acc;
    }, {});
}

fetchHeroes();

function setLastLoginTime(res) {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    res.cookie('lastLogin', nextWeek.toUTCString(), { httpOnly: true });
}

app.get('/login', (req, res) => {
    const returnTo = `http://localhost:${port}/callback`;
    const steamLoginUrl = `https://steamcommunity.com/openid/login?openid.ns=http://specs.openid.net/auth/2.0&openid.mode=checkid_setup&openid.return_to=${encodeURIComponent(returnTo)}&openid.realm=http://localhost:${port}&openid.identity=http://specs.openid.net/auth/2.0/identifier_select&openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select`;
    res.redirect(steamLoginUrl);
});
app.get('/callback', (req, res) => {
    const steamIdRegex = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;
    const steamIdMatch = req.query['openid.claimed_id'].match(steamIdRegex);
    const steamId = steamIdMatch ? steamIdMatch[1] : null;
    console.log(steamId);
    if (steamId) {
        res.cookie('steamId', steamId, { httpOnly: true });
        setLastLoginTime(res);
        db.findOne({ steamId }, (err, doc) => {
            if (!doc) {
                getPlayerMetrics(bignumber(steamId).minus('76561197960265728')).then(metrics => {
                    const defaultRating = {
                        rating: 2500
                    };
                    db.insert({
                        steamId,
                        dotaID: metrics[0].playerId,
                        registeredMatch: metrics[0].matchId,
                        lastKnownMatch: metrics[0].matchId,
                        matches: metrics,
                        ...defaultRating
                    });
                    db.loadDatabase();
                });
            }
        });
        res.cookie('magicCookie', 'true', { maxAge: 7 * 24 * 60 * 60 * 1000}); // Установка magicCookie
        res.redirect('/');
    } else {
        res.status(400).send('Steam ID not found');
    }
});

app.get('/dota2id', async (req, res) => {
    const steamId = req.cookies.steamId;
    if (!steamId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    try {
        const dotaId = await getDotaId(steamId);
        res.json({ steamId, dotaId });
    } catch (error) {
        console.error("Error getting Dota ID:", error);
        res.status(500).json({ error: 'Error getting Dota ID' });
    }
});

async function getDotaId(steam32Id) {
    const url = `https://api.opendota.com/api/players/${steam32Id}`;
    const response = await fetch(url);
    const data = await response.json();

    console.log("Data from OpenDota API:", data);

    if (data.profile && data.profile.account_id) {
        return data.profile.account_id;
    } else {
        throw new Error("Dota 2 ID not found or invalid response format");
    }
}

async function getPlayerMetrics(steam32Id, lastKnownMatchId = null) {
    console.log("ID",steam32Id)
    const matchesResponse = await fetch(`https://api.opendota.com/api/players/${steam32Id}/matches`);
    const matchesData = await matchesResponse.json();
    console.log('Матчи',matchesData)
    let newMatches = [];

    for (const match of matchesData) {
        if (!lastKnownMatchId || match.match_id > lastKnownMatchId) {
            const fullMatchDataResponse = await fetch(`https://api.opendota.com/api/matches/${match.match_id}`);
            const fullMatchData = await fullMatchDataResponse.json();
            const playerId = await getDotaId(steam32Id);

            let playerMatchData = fullMatchData.players.find(player => player.account_id === playerId);
            if (playerMatchData) {
                const { radiant_win, isRadiant, hero_id, benchmarks, lane_role } = playerMatchData;
                const win = (isRadiant && radiant_win) || (!isRadiant && !radiant_win);
                const benchmarkPct = Object.keys(benchmarks).reduce((acc, key) => {
                    acc[key] = benchmarks[key].pct;
                    return acc;
                }, {});

                const heroName = heroes[hero_id] || 'Unknown Hero';
                newMatches.push({
                    playerId,
                    matchId: match.match_id,
                    win,
                    hero_name: heroName,
                    lane_role,
                    benchmarkPct
                });
            }
            if (!lastKnownMatchId) break;
        }
    }
    console.log(newMatches)
    return newMatches;
}

app.get('/playerMetrics', async (req, res) => {
    const steamId = req.cookies.steamId;
    if (!steamId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    try {
        console.log('ID',bignumber(steamId).minus('76561197960265728'))
        const steam32Id = bignumber(steamId).minus('76561197960265728');
        db.findOne({ steamId }, async (err, user) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ error: 'Database error' });
            }

            const metrics = await getPlayerMetrics(steam32Id, user ? user.lastKnownMatch : null);
            if (user) {
                if (metrics.length > 0) {
                    const updatedRating = calculateRating(user, metrics, weights);

                    updatedRating.matches.forEach(metric => {
                        user.matches.push(metric);
                    });

                    user.rating = updatedRating.rating;
                    user.lastKnownMatch = metrics[metrics.length - 1].matchId;
                    db.update({ steamId }, user, {}, err => {
                        if (err) console.error("Error updating user data:", err);
                    });
                    db.loadDatabase();
                }
                res.json({ steamId, rating: user.rating, metrics: user.matches });
            } else {
                if (metrics.length > 0) {
                    const defaultRating = {
                        rating: 2500
                    };
                    const updatedRating = calculateRating(defaultRating, metrics, weights);

                    const newUser = {
                        steamId,
                        dotaID: metrics[0].playerId,
                        registeredMatch: metrics[0].matchId,
                        lastKnownMatch: metrics[metrics.length - 1].matchId,
                        matches: updatedRating.matches,
                        rating: updatedRating.rating
                    };
                    db.insert(newUser, (err, newUser) => {
                        if (err) {
                            console.error("Error adding new user:", err);
                            return res.status(500).json({ error: 'Database error when adding user' });
                        }
                        res.json({ steamId, rating: newUser.rating, metrics: newUser.matches });
                    });
                    db.loadDatabase();
                } else {
                    res.status(404).json({ error: 'No matches available for addition' });
                }
            }
        });
    } catch (error) {
        console.error("Error getting player data:", error);
        res.status(500).json({ error: 'Error getting player data' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
