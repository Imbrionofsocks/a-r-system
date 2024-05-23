// Функция для расчета ожидаемого результата
function calculateExpectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// Функция для обновления рейтинга
function updateRating(rating, expectedScore, actualScore, kFactor, performanceMultiplier) {
    return rating + kFactor * performanceMultiplier * (actualScore - expectedScore);
}

// Функция для расчета производительности игрока на основе метрик и весов
function calculatePerformance(metrics, weights, isWin) {
    let performance = 0;
    let totalWeight = 0;
    for (const key in metrics) {
        if (weights.hasOwnProperty(key)) {
            performance += metrics[key] * weights[key];
            totalWeight += weights[key];
        }
    }

    if (totalWeight) {
        performance = performance / totalWeight;
    }
    // Применение логики множителя производительности
    if (isWin) {
        if (performance > 0.8) {
            return 1.5; // Высокие показатели в победной игре
        } else if (performance < 0.5) {
            return 0.5; // Низкие показатели в победной игре
        }
    } else {
        if (performance > 0.8) {
            return 0.5; // Высокие показатели в проигранной игре
        } else if (performance < 0.5) {
            return 1.5; // Низкие показатели в проигранной игре
        }
    }
    return 1.0; // Средние показатели
}

// Функция для расчета нового рейтинга игрока на основе матчей
export default function calculateRating(player, matches, weights, kFactor = 40) {
    if (typeof player.rating !== 'number') {
        console.error('Player rating is invalid:', { rating: player.rating });
        return;
    }

    // Сортируем матчи по возрастанию matchId
    matches.sort((a, b) => a.matchId - b.matchId);

    let rating = player.rating;
    let totalRatingChange = 0;

    matches.forEach((match, index) => {
        const opponentRating = rating + (Math.random() > 0.5 ? 100 : -100);
        const actualScore = match.win ? 1 : 0;

        // Получить веса для текущего героя
        const heroWeights = weights[match.hero_name] || {};
        console.log(`Weights for hero ${match.hero_name}:`, heroWeights);

        // Рассчитать производительность игрока и применить логический множитель
        const performanceMultiplier = calculatePerformance(match.benchmarkPct, heroWeights, match.win);
        console.log("Производительность:", performanceMultiplier);

        const expectedScore = calculateExpectedScore(rating, opponentRating);
        console.log("Ожидаемый результат:", expectedScore);

        const newRating = updateRating(rating, expectedScore, actualScore, kFactor, performanceMultiplier);
        console.log("Новый рейтинг:", newRating);

        const ratingChange = newRating - rating;
        totalRatingChange += ratingChange;
        rating = newRating;

        match.ratingChange = ratingChange;

        console.log(`После матча ${index + 1}:`);
        console.log(`Обновленный рейтинг: ${rating}`);
    });

    return {
        rating,
        totalRatingChange,
        matches
    };
}
