import { connectToDatabase, disconnectFromDatabase } from '../db/connection.js';
import { Treatment } from '../db/models.js';

async function main() {
    await connectToDatabase();
    try {
        // Find 15g carbs with 60 min duration (60 * 60 * 1000 = 3600000 ms)
        const query = {
            carbs: 15,
            duration: 3600000
        };
        const treatments = await Treatment.find(query).lean();

        console.log(`Found ${treatments.length} treatments matching 15g/60min:`);
        console.log(JSON.stringify(treatments.slice(0, 2), null, 2));

        // Let's also search for any non-7200000 durations to see variety
        const variety = await Treatment.find({
            carbs: { $gt: 0 },
            duration: { $exists: true, $ne: 7200000 }
        }).limit(5).lean();

        console.log('\n--- VARIETY OF DURATIONS ---');
        console.log(JSON.stringify(variety, null, 2));

    } catch (error) {
        console.error('Error finding sample treatment:', error);
    } finally {
        await disconnectFromDatabase();
    }
}

main();
