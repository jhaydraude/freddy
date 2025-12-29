import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { getCOB } from '../src/lib/cob-logic.js';
import { getBolusAbsorption } from '../src/lib/cob-logic.js';

async function main() {
    await connectToDatabase();

    // Treatment details
    const treatmentTime = new Date('2025-12-29T00:18:38.216Z');
    const carbs = 35;
    const duration = 0;

    // Check at different timestamps
    const timestamps = [
        '2025-12-29T01:14:00.000Z',
        '2025-12-29T01:29:00.000Z',
        '2025-12-29T01:34:00.000Z',
    ];

    for (const ts of timestamps) {
        const result = await getCOB(ts, false);
        const date = new Date(ts);
        const timeStr = date.toISOString().substring(11, 16);
        const timeSinceMin = (date.getTime() - treatmentTime.getTime()) / (1000 * 60);

        const abs = getBolusAbsorption(timeSinceMin, carbs, duration, result.settings.absorptionRate);
        const remaining = Math.max(0, carbs - abs.absorbed);

        console.log(`${timeStr} (${timeSinceMin.toFixed(1)}min after treatment):`);
        console.log(`  Absorption rate: ${result.settings.absorptionRate.toFixed(3)} g/5min`);
        console.log(`  Absorbed: ${abs.absorbed.toFixed(1)}g`);
        console.log(`  Remaining: ${remaining.toFixed(1)}g`);
        console.log('');
    }

    await disconnectFromDatabase();
}

main();
