import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getCOB } from '../src/lib/cob-logic.js';
import { Treatment } from '../src/db/models.js';
import { getBolusAbsorption } from '../src/lib/cob-logic.js';

async function main() {
    await connectToDatabase();

    // Check timestamps with oscillation
    const timestamps = [
        '2025-12-29T01:14:00.000Z', // COB: 31.3
        '2025-12-29T01:19:00.000Z', // COB: 28
        '2025-12-29T01:24:00.000Z', // COB: 25.3
        '2025-12-29T01:29:00.000Z', // COB: 46.7 <- Jump!
        '2025-12-29T01:34:00.000Z', // COB: 83.8 <- Big jump!
        '2025-12-29T01:39:00.000Z', // COB: 18.9 <- Big drop!
    ];

    for (const ts of timestamps) {
        const result = await getCOB(ts, false);
        const date = new Date(ts);
        const timeStr = date.toISOString().substring(11, 16);

        console.log(`\n===== ${timeStr} =====`);
        console.log(`Total COB: ${result.calculated.cob}`);
        console.log(`  Pending: ${result.calculated.pendingCOB}`);
        console.log(`  Active: ${result.calculated.activeCOB}`);

        // Now manually calculate per-treatment breakdown
        const treatments = await Treatment.find({
            eventType: { $in: ['Meal Bolus', 'Carb Correction'] },
            carbs: { $exists: true, $gt: 0 },
            created_at: {
                $lte: date.toISOString(),
                $gte: new Date(date.getTime() - (12 * 60 * 60 * 1000)).toISOString()
            }
        });

        console.log(`  Treatments contributing:`);
        for (const t of treatments) {
            const eventTime = new Date(t.created_at).getTime();
            const duration = t.duration ? t.duration / (1000 * 60) : 0;
            const timeSinceEventMin = (date.getTime() - eventTime) / (1000 * 60);

            const abs = getBolusAbsorption(timeSinceEventMin, t.carbs, duration, result.settings.absorptionRate);
            const remaining = Math.max(0, t.carbs - abs.absorbed);

            if (remaining > 0.1) {
                const tTimeStr = new Date(t.created_at).toISOString().substring(11, 19);
                console.log(`    [${tTimeStr}] ${t.carbs}g (dur: ${duration.toFixed(0)}min) -> ${remaining.toFixed(1)}g remaining`);
            }
        }
    }

    await disconnectFromDatabase();
}

main();
