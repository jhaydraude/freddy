import { connectToDatabase } from './db/connection.js';
import { Treatment } from './db/models.js';

async function checkTreatments() {
    await connectToDatabase();
    const now = new Date();
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

    console.log(`Current Time: ${now.toISOString()}`);
    console.log(`Searching treatments between ${fourHoursAgo.toISOString()} and ${now.toISOString()}`);

    const treatments = await Treatment.find({
        eventType: { $in: ['Meal Bolus', 'Carb Correction'] },
        carbs: { $exists: true, $gt: 0 },
        created_at: {
            $lte: now.toISOString(),
            $gte: fourHoursAgo.toISOString()
        }
    }).sort({ created_at: -1 });

    console.log(`Found ${treatments.length} treatment(s).`);
    treatments.forEach(t => {
        console.log(`- ${t.created_at}: ${t.carbs}g carbs (${t.eventType})`);
    });

    process.exit(0);
}

checkTreatments();
