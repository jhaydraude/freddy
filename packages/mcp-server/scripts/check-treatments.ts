import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { Treatment } from '../src/db/models.js';

async function main() {
    await connectToDatabase();

    // Check timeframe where COB oscillates: 01:14 to 01:39
    const startTime = new Date('2025-12-29T01:14:00.000Z');
    const endTime = new Date('2025-12-29T01:39:00.000Z');

    // Look back 12 hours for treatments (matching getCOB logic)
    const lookbackTime = new Date(startTime.getTime() - (12 * 60 * 60 * 1000));

    const treatments = await Treatment.find({
        eventType: { $in: ['Meal Bolus', 'Carb Correction'] },
        carbs: { $exists: true, $gt: 0 },
        created_at: {
            $gte: lookbackTime.toISOString(),
            $lte: endTime.toISOString()
        }
    }).sort({ created_at: 1 });

    console.log(`Found ${treatments.length} carb treatments in lookback window:\n`);

    treatments.forEach((t) => {
        console.log(`${t.created_at}: ${t.carbs}g (eventType: ${t.eventType}, duration: ${t.duration || 0}ms)`);
    });

    await disconnectFromDatabase();
}

main();
