import { connectToDatabase } from '../lib/db/connection';
import { ActivityRecord } from '../lib/db/models';

async function main() {
    await connectToDatabase();

    const steps = await ActivityRecord.findOne({ type: 'steps' }).lean();
    const hr = await ActivityRecord.findOne({ type: 'heart_rate' }).lean();

    console.log('Steps sample:', JSON.stringify(steps, null, 2));
    console.log('\nHR sample:', JSON.stringify(hr, null, 2));

    const stepsCount = await ActivityRecord.countDocuments({ type: 'steps' });
    const hrCount = await ActivityRecord.countDocuments({ type: 'heart_rate' });

    console.log(`\nTotal steps records: ${stepsCount}`);
    console.log(`Total heart_rate records: ${hrCount}`);

    process.exit(0);
}

main().catch(console.error);
