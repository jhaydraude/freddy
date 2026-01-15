import { connectToDatabase } from '../lib/db/connection';
import { Entry } from '../lib/db/models';
import mongoose from 'mongoose';

async function main() {
    const isDryRun = process.argv.includes('--execute') ? false : true;

    await connectToDatabase();

    console.log(`--- Activity Data Cleanup (${isDryRun ? 'DRY RUN' : 'EXECUTE'}) ---\n`);

    const activityTypes = ['steps', 'heartrate'];
    const idsToDelete: mongoose.Types.ObjectId[] = [];

    let totalOriginalStepSum = 0;
    let totalSmartStepSum = 0;

    for (const type of activityTypes) {
        console.log(`Analyzing ${type}...`);

        const records = await Entry.find({
            type: 'activity',
            [type]: { $exists: true }
        }).sort({ date: 1 }).lean();

        if (records.length === 0) {
            console.log(`  No records found for ${type}.`);
            continue;
        }

        let lastTime = 0;
        let lastValue: any = null;
        let typeDeleted = 0;

        // Thresholds
        const thresholdMs = type === 'steps' ? 300000 : 60000;

        for (const r of records) {
            const currentValue = r[type as keyof typeof r];
            const currentTime = r.date;

            // Tracking for Step Verification
            if (type === 'steps') {
                totalOriginalStepSum += (currentValue as number || 0);
            }

            if (currentValue === lastValue && (currentTime - lastTime) < thresholdMs) {
                // REDUNDANT BURST
                idsToDelete.push(r._id as mongoose.Types.ObjectId);
                typeDeleted++;
            } else {
                // UNIQUE RECORD
                if (type === 'steps') {
                    totalSmartStepSum += (currentValue as number || 0);
                }
                lastTime = currentTime;
                lastValue = currentValue;
            }
        }

        console.log(`  Found ${typeDeleted} redundant ${type} records out of ${records.length}.`);
    }

    console.log('\n--- Verification Metrics (Step Count) ---');
    console.log(`Total Original (Naive) Sum: ${totalOriginalStepSum}`);
    console.log(`Expected (Smart) Sum:        ${totalSmartStepSum}`);
    console.log(`Potential Reduction:         ${totalOriginalStepSum - totalSmartStepSum} steps`);
    console.log(`Records to be Deleted:       ${idsToDelete.length}`);

    if (idsToDelete.length === 0) {
        console.log('\nNo cleanup needed.');
        process.exit(0);
    }

    if (isDryRun) {
        console.log('\nDry run complete. No changes made.');
        console.log('To apply these changes, run with: npx tsx scripts/cleanup-activity-duplicates.ts --execute');
    } else {
        console.log('\nExecuting deletion...');

        // Bulk delete for efficiency
        const result = await Entry.deleteMany({
            _id: { $in: idsToDelete }
        });

        console.log(`\nSuccessfully deleted ${result.deletedCount} activity records.`);

        // Post-Execution Verification
        const finalStepSumRecords = await Entry.find({
            type: 'activity',
            steps: { $exists: true }
        }).lean();
        const finalStepSum = finalStepSumRecords.reduce((sum, r) => sum + (r.steps || 0), 0);

        console.log('\n--- Post-Cleanup Verification ---');
        console.log(`Target Smart Sum: ${totalSmartStepSum}`);
        console.log(`Actual Simple Sum: ${finalStepSum}`);

        if (finalStepSum === totalSmartStepSum) {
            console.log('  ✓ SUCCESS: Additive integrity maintained.');
        } else {
            console.log('  ✗ WARNING: Sum mismatch detect. Please investigate.');
        }
    }

    process.exit(0);
}

main().catch(console.error);
