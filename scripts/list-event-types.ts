import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import mongoose from 'mongoose';

async function main() {
    await connectToDatabase();
    const db = mongoose.connection.db!;

    // Find event types that have carbs > 0
    const results = await db.collection('treatments').aggregate([
        { $match: { carbs: { $exists: true, $gt: 0 } } },
        {
            $group: {
                _id: '$eventType',
                count: { $sum: 1 },
                avgCarbs: { $avg: '$carbs' },
                minCarbs: { $min: '$carbs' },
                maxCarbs: { $max: '$carbs' }
            }
        },
        { $sort: { count: -1 } }
    ]).toArray();

    console.log('Event types containing carb information:');
    console.log('========================================');
    results.forEach((r: any) => {
        console.log(` - ${r._id}`);
        console.log(`     ${r.count} entries | avg: ${Math.round(r.avgCarbs)}g | range: ${r.minCarbs}-${r.maxCarbs}g`);
    });

    await disconnectFromDatabase();
}

main();
