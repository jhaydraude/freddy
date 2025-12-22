import { connectToDatabase, disconnectFromDatabase } from './db/connection.js';
import { Treatment } from './db/models.js';

async function getEventTypeStats() {
    try {
        await connectToDatabase();
        const stats = await Treatment.aggregate([
            {
                $group: {
                    _id: '$eventType',
                    count: { $sum: 1 },
                    lastSeen: { $max: '$created_at' }
                }
            },
            {
                $sort: { lastSeen: -1 }
            }
        ]);
        console.log(JSON.stringify(stats, null, 2));
    } catch (err) {
        console.error('Error fetching stats:', err);
    } finally {
        await disconnectFromDatabase();
    }
}

getEventTypeStats();
