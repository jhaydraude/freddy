import 'dotenv/config';
import { connectToDatabase } from '../lib/db/connection';
import { populateClassificationQueue } from '../lib/logic/classification-queue';

async function main() {
    try {
        await connectToDatabase();
        console.log('Connected to database');

        const count = await populateClassificationQueue(3); // 3 days
        console.log(`Successfully added ${count} windows to the classification queue.`);

        process.exit(0);
    } catch (error) {
        console.error('Queue population failed:', error);
        process.exit(1);
    }
}

main();
