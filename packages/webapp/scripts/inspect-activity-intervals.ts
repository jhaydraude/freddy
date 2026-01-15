import { connectToDatabase } from '../lib/db/connection';
import { Entry } from '../lib/db/models';

async function main() {
    await connectToDatabase();

    console.log('Analyzing Activity Record Intervals (Sanity Check)...\n');

    const activityTypes = ['heartrate', 'steps'];

    for (const type of activityTypes) {
        console.log(`--- Intervals for ${type} ---`);

        const records = await Entry.find({
            type: 'activity',
            [type]: { $exists: true }
        }).sort({ date: 1 }).lean();

        if (records.length < 2) {
            console.log(`  Not enough records to analyze intervals (${records.length} found).\n`);
            continue;
        }

        const deltas: number[] = [];
        for (let i = 1; i < records.length; i++) {
            deltas.push(records[i].date - records[i - 1].date);
        }

        const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        const sortedDeltas = [...deltas].sort((a, b) => a - b);
        const median = sortedDeltas[Math.floor(sortedDeltas.length / 2)];

        console.log(`  Count:  ${records.length}`);
        console.log(`  Average Interval: ${Math.round(avg / 60000 * 10) / 10} min`);
        console.log(`  Median Interval:  ${Math.round(median / 60000 * 10) / 10} min`);

        // Distribution
        const bins = {
            '< 1 min': 0,
            '1 - 4 min': 0,
            '4 - 6 min': 0,
            '6 - 15 min': 0,
            '> 15 min': 0
        };

        deltas.forEach(d => {
            const min = d / 60000;
            if (min < 1) bins['< 1 min']++;
            else if (min < 4) bins['1 - 4 min']++;
            else if (min < 6) bins['4 - 6 min']++;
            else if (min < 15) bins['6 - 15 min']++;
            else bins['> 15 min']++;
        });

        console.log('  Interval Distribution:');
        Object.entries(bins).forEach(([label, count]) => {
            const pct = Math.round(count / deltas.length * 100);
            console.log(`    ${label.padEnd(10)}: ${count} (${pct}%)`);
        });

        console.log('\n');
    }

    process.exit(0);
}

main().catch(console.error);
