import { connectToDatabase, disconnectFromDatabase } from '../db/connection.js';
import { Treatment } from '../db/models.js';

async function main() {
    await connectToDatabase();
    try {
        const distinctEventTypes = await Treatment.distinct('eventType');
        console.log('Distinct Event Types:');
        console.log(JSON.stringify(distinctEventTypes, null, 2));
    } catch (error) {
        console.error('Error fetching distinct event types:', error);
    } finally {
        await disconnectFromDatabase();
    }
}

main();
