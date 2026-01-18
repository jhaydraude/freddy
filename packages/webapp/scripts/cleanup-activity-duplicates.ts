import mongoose, { Schema } from 'mongoose';

// Local schema definition targeting the real 'entries' collection in Nightscout
const EntrySchema = new Schema({
    sgv: { type: Number },
    date: { type: Number, required: true, index: true },
    type: { type: String, index: true },
    heartrate: { type: Number },
    steps: { type: Number },
}, { collection: 'entries', strict: false });

async function main() {
    const isDryRun = process.argv.includes('--execute') ? false : true;
    const nsUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/nightscout';

    console.log(`--- Activity Data Cleanup (${isDryRun ? 'DRY RUN' : 'EXECUTE'}) ---`);
    console.log(`Target: ${nsUri.split('@').pop()}\n`);

    try {
        await mongoose.connect(nsUri);
        console.log('Connected to Nightscout database successfully.');
    } catch (err) {
        console.error('Failed to connect to Nightscout database:', err);
        process.exit(1);
    }

    const Entry = mongoose.model('EntryCleanup', EntrySchema);
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

        console.log(`  Fetched ${records.length} records for ${type}. Processing...`);

        if (records.length === 0) {
            console.log(`  No records found for ${type}.`);
            continue;
        }

        let lastTime = 0;
        let lastValue: any = null;
        let typeDeleted = 0;

        // Thresholds
        const thresholdMs = type === 'steps' ? 300000 : 60000;

        for (const r of records as any[]) {
            const currentValue = r[type];
            const currentTime = r.date;

            // Tracking for Step Verification
            if (type === 'steps') {
                totalOriginalStepSum += (currentValue || 0);
            }

            let isRedundant = false;
            if (type === 'heartrate') {
                // Strict time-based spacing (keep first record per minute)
                isRedundant = (currentTime - lastTime) < thresholdMs;
            } else { // type === 'steps'
                // 1. Delete all zeros
                // 2. Keep only if value differs OR enough time has passed
                if (currentValue === 0) {
                    isRedundant = true;
                } else if (currentValue === lastValue && (currentTime - lastTime) < thresholdMs) {
                    isRedundant = true;
                }
            }

            if (isRedundant) {
                idsToDelete.push(r._id);
                typeDeleted++;
            } else {
                if (type === 'steps') {
                    totalSmartStepSum += (currentValue || 0);
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
        const finalStepSum = (finalStepSumRecords as any[]).reduce((sum, r) => sum + (r.steps || 0), 0);

        console.log('\n--- Post-Cleanup Verification ---');
        console.log(`Target Smart Sum: ${totalSmartStepSum}`);
        console.log(`Actual Simple Sum: ${finalStepSum}`);

        if (finalStepSum === totalSmartStepSum) {
            console.log('  ✓ SUCCESS: Additive integrity maintained.');
        } else {
            console.log('  ✗ WARNING: Sum mismatch detected. Please investigate.');
        }
    }

    process.exit(0);
}

main().catch(console.error);
