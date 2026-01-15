import { connectToDatabase } from '../lib/db/connection';
import { Entry } from '../lib/db/models';

async function main() {
    await connectToDatabase();

    const stepRecords = await Entry.find({
        type: 'activity',
        steps: { $exists: true }
    }).sort({ date: 1 }).lean();

    if (stepRecords.length === 0) {
        console.log('No step records found.');
        process.exit(0);
    }

    const stepsPerDay: Record<string, number> = {};

    for (const r of stepRecords) {
        // Extract YYYY-MM-DD from the timestamp
        const date = new Date(r.date).toISOString().split('T')[0];
        stepsPerDay[date] = (stepsPerDay[date] || 0) + (r.steps || 0);
    }

    const days = Object.keys(stepsPerDay);
    const totalSteps = Object.values(stepsPerDay).reduce((a, b) => a + b, 0);
    const average = totalSteps / days.length;

    console.log(`Average Daily Step Count Analysis:`);
    console.log(`-----------------------------------`);
    console.log(`Total Days:    ${days.length}`);
    console.log(`Total Steps:   ${totalSteps}`);
    console.log(`Average Steps: ${Math.round(average)} per day\n`);

    console.log('Daily Breakdown:');
    days.sort().forEach(day => {
        console.log(`  ${day}: ${stepsPerDay[day]} steps`);
    });

    process.exit(0);
}

main().catch(console.error);
