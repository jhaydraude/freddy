
import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { Treatment } from '../src/db/models.js';

async function checkInsulinEvents() {
    await connectToDatabase();

    // Aggregate to find all eventTypes that have insulin > 0
    const results = await Treatment.aggregate([
        { $match: { insulin: { $gt: 0 } } },
        { $group: { _id: "$eventType", count: { $sum: 1 }, avgSize: { $avg: "$insulin" } } }
    ]);

    console.log('Insulin Events Summary:');
    results.forEach(r => console.log(`  ${r._id}: ${r.count} (Avg: ${Math.round(r.avgSize * 100) / 100} U)`));

    // Check for any unhandled insulin types
    const unhandled = await Treatment.countDocuments({
        insulin: { $gt: 0 },
        eventType: { $nin: ['Meal Bolus', 'Correction Bolus'] }
    });
    console.log(`\nUnhandled Insulin Events (Not Meal/Correction): ${unhandled}`);

    if (unhandled > 0) {
        const samples = await Treatment.find({
            insulin: { $gt: 0 },
            eventType: { $nin: ['Meal Bolus', 'Correction Bolus'] }
        }).limit(3);
        console.log('Sample Unhandled:', samples.map(s => `${s.eventType}: ${s.insulin}`));
    }

    await disconnectFromDatabase();
}

checkInsulinEvents().catch(console.error);
