import { connectToDatabase } from '../lib/db/connection';
import { Entry } from '../lib/db/models';

async function main() {
    await connectToDatabase();

    console.log('Analyzing Activity Record Duplicates...\n');

    const activityTypes = ['heartrate', 'steps'];

    for (const type of activityTypes) {
        console.log(`--- Analyzing ${type} ---`);

        const records = await Entry.find({
            type: 'activity',
            [type]: { $exists: true }
        }).sort({ date: 1 }).lean();

        if (records.length === 0) {
            console.log(`No records found for ${type}.\n`);
            continue;
        }

        const bursts: { r1: any, r2: any, delta: number }[] = [];
        const burstThresholdMs = 1000; // 1 second

        for (let i = 1; i < records.length; i++) {
            const r1 = records[i - 1];
            const r2 = records[i];
            const delta = r2.date - r1.date;

            if (delta <= burstThresholdMs) {
                bursts.push({
                    r1,
                    r2,
                    delta
                });
            }
        }

        if (bursts.length === 0) {
            console.log(`No high-frequency bursts (within 1s) found for ${type}.\n`);
            continue;
        }

        const identicalValueBursts = bursts.filter(b => b.r1[type] === b.r2[type]);
        console.log(`Found ${bursts.length} high-frequency pairs (within 1s).`);
        console.log(`Value consistency: ${identicalValueBursts.length} / ${bursts.length} (~${Math.round(identicalValueBursts.length / bursts.length * 100)}%) have identical values.`);

        console.log('\nTop 5 Examples:');
        bursts.slice(0, 5).forEach((b, i) => {
            console.log(`Example ${i + 1}:`);
            console.log(`  R1: ${new Date(b.r1.date).toISOString()} Value: ${b.r1[type]}`);
            console.log(`  R2: ${new Date(b.r2.date).toISOString()} Value: ${b.r2[type]}`);
            console.log(`  Delta: ${b.delta}ms`);
        });

        const windows: { start: number; end: number; count: number }[] = [];
        let currentWindow: { start: number; end: number; count: number } | null = null;
        const windowGapThreshold = 5 * 60 * 1000; // 5 minutes gap between clusters

        bursts.forEach(dup => {
            if (!currentWindow) {
                currentWindow = { start: dup.r1.date, end: dup.r2.date, count: 1 };
            } else if (dup.r1.date - currentWindow.end <= windowGapThreshold) {
                currentWindow.end = dup.r2.date;
                currentWindow.count++;
            } else {
                windows.push(currentWindow);
                currentWindow = { start: dup.r1.date, end: dup.r2.date, count: 1 };
            }
        });
        if (currentWindow) windows.push(currentWindow);

        console.log(`\nThese occur in ${windows.length} distinct time clusters.`);

        if (windows.length > 0) {
            console.log('\nTop Time Clusters:');
            windows.sort((a, b) => b.count - a.count).slice(0, 10).forEach((w, i) => {
                console.log(`${i + 1}. ${new Date(w.start).toISOString()} to ${new Date(w.end).toISOString()} (${w.count + 1} records, ~${Math.round((w.end - w.start) / 1000)}s)`);
            });
        }
        console.log('\n');
    }

    process.exit(0);
}

main().catch(console.error);
