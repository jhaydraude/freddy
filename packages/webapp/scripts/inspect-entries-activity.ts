import { connectToDatabase } from '../lib/db/connection';
import { Entry } from '../lib/db/models';

async function main() {
    await connectToDatabase();

    console.log('Searching for activity entries...');

    console.log('Searching for heart rate entries...');
    const hrSample = await Entry.findOne({ type: 'activity', heartrate: { $exists: true } }).lean();
    if (hrSample) {
        console.log('Sample HR entry:', JSON.stringify(hrSample, null, 2));
    }

    console.log('\nSearching for steps entries...');
    const stepsSample = await Entry.findOne({ type: 'activity', steps: { $exists: true } }).lean();
    if (stepsSample) {
        console.log('Sample Steps entry:', JSON.stringify(stepsSample, null, 2));
    }

    const count = await Entry.countDocuments({ type: 'activity' });
    const hrCount = await Entry.countDocuments({ type: 'activity', heartrate: { $exists: true } });
    const stepsCount = await Entry.countDocuments({ type: 'activity', steps: { $exists: true } });

    console.log(`\nTotal activity entries: ${count}`);
    console.log(`Heart rate entries: ${hrCount}`);
    console.log(`Steps entries: ${stepsCount}`);

    // Frequency analysis (per hour)
    if (count > 0) {
        const latestEntry = await Entry.findOne({ type: 'activity' }).sort({ date: -1 }).lean();
        if (latestEntry) {
            const endDate = latestEntry.date;
            const startDate = endDate - (24 * 60 * 60 * 1000); // Look at last 24 hours of data

            const hr24h = await Entry.countDocuments({
                type: 'activity',
                heartrate: { $exists: true },
                date: { $gte: startDate, $lte: endDate }
            });
            const steps24h = await Entry.countDocuments({
                type: 'activity',
                steps: { $exists: true },
                date: { $gte: startDate, $lte: endDate }
            });

            console.log(`\nFrequency Analysis (last 24 hours of data):`);
            console.log(`Heart rate: ${hr24h} records (~${(hr24h / 24).toFixed(1)} per hour)`);
            console.log(`Steps: ${steps24h} records (~${(steps24h / 24).toFixed(1)} per hour)`);

            // Delta analysis for heart rate
            const hrRecords = await Entry.find({
                type: 'activity',
                heartrate: { $exists: true },
                date: { $gte: startDate, $lte: endDate }
            }).sort({ date: 1 }).lean();

            if (hrRecords.length > 1) {
                const deltas = [];
                for (let i = 1; i < hrRecords.length; i++) {
                    deltas.push(hrRecords[i].date - hrRecords[i - 1].date);
                }
                const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
                const medianDelta = deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)];
                console.log(`\nHeart Rate Delta Analysis (ms):`);
                console.log(`Average: ${Math.round(avgDelta)} ms (~${(avgDelta / 1000).toFixed(1)}s)`);
                console.log(`Median: ${medianDelta} ms (~${(medianDelta / 1000).toFixed(1)}s)`);
            }

            // Delta analysis for steps
            const stepsRecords = await Entry.find({
                type: 'activity',
                steps: { $exists: true },
                date: { $gte: startDate, $lte: endDate }
            }).sort({ date: 1 }).lean();

            if (stepsRecords.length > 1) {
                const deltas = [];
                for (let i = 1; i < stepsRecords.length; i++) {
                    deltas.push(stepsRecords[i].date - stepsRecords[i - 1].date);
                }
                const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
                const medianDelta = deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)];
                console.log(`\nSteps Delta Analysis (ms):`);
                console.log(`Average: ${Math.round(avgDelta)} ms (~${(avgDelta / 60000).toFixed(1)}m)`);
                console.log(`Median: ${medianDelta} ms (~${(medianDelta / 60000).toFixed(1)}m)`);

                console.log(`\nLatest 20 steps entries:`);
                const latestSteps = await Entry.find({ type: 'activity', steps: { $exists: true } }).sort({ date: -1 }).limit(20).lean();
                latestSteps.reverse().forEach(s => {
                    console.log(`Date: ${s.date} (${new Date(s.date).toISOString()}), Steps: ${s.steps}, ID: ${s._id}`);
                });
            }
        }
    }

    process.exit(0);
}

main().catch(console.error);
