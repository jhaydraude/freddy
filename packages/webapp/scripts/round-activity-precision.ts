import { connectToDatabase } from '../lib/db/connection';
import { Entry } from '../lib/db/models';

async function main() {
    const isExecute = process.argv.includes('--execute');
    await connectToDatabase();

    console.log(`--- Round Activity Precision (${isExecute ? 'EXECUTE' : 'DRY RUN'}) ---`);

    const records = await Entry.find({
        type: 'activity',
        $or: [
            { heartrate: { $exists: true } },
            { steps: { $exists: true } }
        ]
    }).lean();

    console.log(`Analyzing ${records.length} records...\n`);

    let updatedCount = 0;
    let totalHRChange = 0;
    let totalStepsChange = 0;

    for (const record of records) {
        let needsUpdate = false;
        const updateDoc: any = {};

        if (record.heartrate !== undefined && record.heartrate !== Math.round(record.heartrate)) {
            updateDoc.heartrate = Math.round(record.heartrate);
            totalHRChange += Math.abs(record.heartrate - updateDoc.heartrate);
            needsUpdate = true;
        }

        if (record.steps !== undefined && record.steps !== Math.round(record.steps)) {
            updateDoc.steps = Math.round(record.steps);
            totalStepsChange += Math.abs(record.steps - updateDoc.steps);
            needsUpdate = true;
        }

        if (needsUpdate) {
            updatedCount++;
            if (isExecute) {
                await Entry.updateOne({ _id: record._id }, { $set: updateDoc });
            }
        }
    }

    console.log(`Summary:`);
    console.log(`- Records analyzed: ${records.length}`);
    console.log(`- Records needing rounding: ${updatedCount}`);
    console.log(`- Total HR deviation corrected: ${totalHRChange.toFixed(4)}`);
    console.log(`- Total Steps deviation corrected: ${totalStepsChange.toFixed(4)}`);

    if (!isExecute) {
        console.log('\nDRY RUN: No changes made to the database.');
        console.log('To apply changes, run with: npx tsx scripts/round-activity-precision.ts --execute');
    } else {
        console.log('\nSUCCESS: All records rounded.');
    }

    process.exit(0);
}

main().catch(console.error);
