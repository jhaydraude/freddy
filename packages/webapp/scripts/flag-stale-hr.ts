/**
 * Flag stale heart rate records in the database.
 * 
 * Stale HR = identical heartrate value repeated for 15+ consecutive minutes
 * (3+ records at ~5 min spacing, or 15+ records at ~1 min spacing).
 * 
 * This happens when the watch reports a cached HR during sleep/charging.
 * Instead of deleting, we set { stale: true } so all queries can filter them out
 * while preserving the raw data for auditing.
 * 
 * Usage: npx tsx scripts/flag-stale-hr.ts [--dry-run]
 */

import { connectToDatabase } from '../lib/db/connection';
import { Entry } from '../lib/db/models';

const STALE_RUN_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes of identical HR = stale

async function flagStaleHR(dryRun: boolean) {
    await connectToDatabase();

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Flag Stale Heart Rate Records ${dryRun ? '(DRY RUN)' : ''}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Get all HR records sorted by date
    const hrRecords = await Entry.find({
        type: 'activity',
        heartrate: { $exists: true, $gt: 0 }
    }).sort({ date: 1 }).select('_id date heartrate stale').lean();

    console.log(`Total HR records: ${hrRecords.length}`);

    // Find runs of identical HR values
    let runStart = 0;
    let runValue = -1;
    let totalStaleRecords = 0;
    let totalRuns = 0;
    const staleIds: any[] = [];

    for (let i = 0; i <= hrRecords.length; i++) {
        const current = hrRecords[i];
        const sameValue = current && current.heartrate === runValue;

        if (sameValue) {
            // Continue the run
        } else {
            // End of run — check if it's long enough to be stale
            if (runStart < i && i > 0) {
                const runDuration = hrRecords[i - 1].date - hrRecords[runStart].date;

                if (runDuration >= STALE_RUN_THRESHOLD_MS) {
                    const runLength = i - runStart;
                    const staleCount = runLength - 1; // First record is legitimate
                    totalRuns++;
                    totalStaleRecords += staleCount;

                    if (totalRuns <= 10) {
                        const startTime = new Date(hrRecords[runStart].date).toISOString();
                        const endTime = new Date(hrRecords[i - 1].date).toISOString();
                        console.log(`  Run #${totalRuns}: ${runLength} records at ${runValue} BPM, ${startTime} → ${endTime} (${Math.round(runDuration / 60000)} min) — keeping first, flagging ${staleCount}`);
                    }

                    // Skip runStart (the original legitimate reading), flag the rest
                    for (let j = runStart + 1; j < i; j++) {
                        staleIds.push(hrRecords[j]._id);
                    }
                }
            }

            // Start new run
            runStart = i;
            runValue = current?.heartrate ?? -1;
        }
    }

    if (totalRuns > 10) {
        console.log(`  ... and ${totalRuns - 10} more runs`);
    }

    console.log(`\nStale runs detected: ${totalRuns}`);
    console.log(`Total stale records: ${totalStaleRecords} / ${hrRecords.length} (${((totalStaleRecords / hrRecords.length) * 100).toFixed(1)}%)`);

    // Check how many are already flagged
    const alreadyFlagged = hrRecords.filter(r => (r as any).stale === true).length;
    console.log(`Already flagged: ${alreadyFlagged}`);

    const toFlag = staleIds.length;
    console.log(`To flag: ${toFlag}`);

    if (toFlag === 0) {
        console.log('\n✅ No new stale records to flag.');
        process.exit(0);
    }

    if (dryRun) {
        console.log('\n🔍 DRY RUN — no changes made. Run without --dry-run to apply.');
        process.exit(0);
    }

    // Flag in batches of 1000
    const BATCH_SIZE = 1000;
    let flagged = 0;

    for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
        const batch = staleIds.slice(i, i + BATCH_SIZE);
        const result = await Entry.updateMany(
            { _id: { $in: batch } },
            { $set: { stale: true } }
        );
        flagged += result.modifiedCount;
        process.stdout.write(`\r  Flagged ${flagged} / ${toFlag}...`);
    }

    console.log(`\n\n✅ Flagged ${flagged} records as stale.`);

    // Verify
    const verifyCount = await Entry.countDocuments({ type: 'activity', stale: true });
    console.log(`Verification: ${verifyCount} total stale records in DB.`);

    process.exit(0);
}

const dryRun = process.argv.includes('--dry-run');
flagStaleHR(dryRun).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
