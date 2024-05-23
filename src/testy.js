import weights from './weights.js';
import calculateRating from './calculateRating.js';

const player = {
    rating: 2500
};

const matches = [
    {
        hero_name: 'Bounty Hunter',
        win: true,
        benchmarkPct: {
            gold_per_min: 0.9,
            xp_per_min: 0.8,
            kills_per_min: 0.9,
            last_hits_per_min: 0.7,
            hero_damage_per_min: 1.0,
            hero_healing_per_min: 0.4,
            tower_damage: 0.6
        }
    },
    {
        hero_name: 'Invoker',
        win: true,
        benchmarkPct: {
            gold_per_min: 0.84,
            xp_per_min: 0.57,
            kills_per_min: 0.97,
            last_hits_per_min: 0.67,
            hero_damage_per_min: 0.55,
            hero_healing_per_min: 0.76,
            tower_damage: 0.99
        }
    },
    {
        hero_name: 'Terrorblade',
        win: false,
        benchmarkPct: {
            gold_per_min: 0.9,
            xp_per_min: 0.8,
            kills_per_min: 0.9,
            last_hits_per_min: 0.7,
            hero_damage_per_min: 1.0,
            hero_healing_per_min: 0.4,
            tower_damage: 0.6
        }
    }
];

const updatedRating = calculateRating(player, matches, weights);

console.log('Итоговый рейтинг:', updatedRating.rating);
console.log('Изменение рейтинга:', updatedRating.totalRatingChange);