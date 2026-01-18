import mongoose, { Schema } from 'mongoose';

const EntrySchema = new Schema({
    date: { type: Number, required: true, index: true },
    type: { type: String, index: true },
    heartrate: { type: Number },
    steps: { type: Number },
}, { collection: 'entries', strict: false });

async function main() {
    const nsUri = 'mongodb://nightscoutuser:nightscoutpass@192.168.201.100:27017/nightscout';
    console.log(`--- Activity Health Check (Direct) ---`);
    console.log(`Target: ${nsUri.split('@').pop()}\n`);

    try {
        await mongoose.connect(nsUri);
        console.log('Connected to Nightscout database.');
    } catch (err) {
        console.error('Failed to connect:', err);
        process.exit(1);
    }

    const Entry = mongoose.model('EntryHealth', EntrySchema);

    // 1. Overall Stats
    const stats = await Entry.aggregate([
        { $match: { type: 'activity' } },
        {
            $group: {
                _id: null,
                count: { $sum: 1 },
                first: { $min: '$date' },
                last: { $max: '$date' },
                hrCount: { $sum: { $cond: [{ $gt: ['$heartrate', null] }, 1, 0] } },
                stepCount: { $sum: { $cond: [{ $gt: ['$steps', null] }, 1, 0] } }
            }
        }
    ]);

    if (stats.length === 0) {
        console.log('No activity records found.');
        process.exit(0);
    }

    const s = stats[0];
    console.log(`Summary:`);
    console.log(`  Total Activity Records: ${s.count}`);
    console.log(`  Heart Rate Records:     ${s.hrCount}`);
    console.log(`  Step Records:           ${s.stepCount}`);
    console.log(`  Timespan:               ${new Date(s.first).toISOString()} to ${new Date(s.last).toISOString()}`);

    // 2. Check for Redundant Heart Rate (spacing < 1m)
    const hrDuplicates = await Entry.aggregate([
        { $match: { type: 'activity', heartrate: { $exists: true } } },
        { $sort: { date: 1 } },
        { $setWindowFields: { output: { prevDate: { $shift: { by: -1, output: '$date' } } }, sortBy: { date: 1 } } },
        { $project: { delta: { $subtract: ['$date', '$prevDate'] } } },
        { $match: { delta: { $lt: 60000 } } },
        { $count: 'redundantHR' }
    ]);

    // 3. Check for Redundant Steps (spacing < 5m, identical value)
    const stepDuplicates = await Entry.aggregate([
        { $match: { type: 'activity', steps: { $exists: true } } },
        { $sort: { date: 1 } },
        {
            $setWindowFields: {
                output: {
                    prevDate: { $shift: { by: -1, output: '$date' } },
                    prevSteps: { $shift: { by: -1, output: '$steps' } }
                }, sortBy: { date: 1 }
            }
        },
        {
            $project: {
                delta: { $subtract: ['$date', '$prevDate'] },
                isIdentical: { $eq: ['$steps', '$prevSteps'] }
            }
        },
        { $match: { delta: { $lt: 300000 }, isIdentical: true } },
        { $count: 'redundantSteps' }
    ]);

    // 4. Check for Sub-second bursts (Across all types)
    const bursts = await Entry.aggregate([
        { $match: { type: 'activity' } },
        { $sort: { date: 1 } },
        {
            $setWindowFields: {
                output: {
                    prevDate: { $shift: { by: -1, output: '$date' } },
                    prevHasHR: { $shift: { by: -1, output: '$heartrate' } },
                    prevHasSteps: { $shift: { by: -1, output: '$steps' } }
                }, sortBy: { date: 1 }
            }
        },
        {
            $project: {
                delta: { $subtract: ['$date', '$prevDate'] },
                hasHR: { $gt: ['$heartrate', null] },
                hasSteps: { $gt: ['$steps', null] },
                prevHasHR: { $gt: ['$prevHasHR', null] },
                prevHasSteps: { $gt: ['$prevHasSteps', null] }
            }
        },
        { $match: { delta: { $lt: 1000 } } },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                hr_hr: { $sum: { $cond: [{ $and: ['$hasHR', '$prevHasHR'] }, 1, 0] } },
                step_step: { $sum: { $cond: [{ $and: ['$hasSteps', '$prevHasSteps'] }, 1, 0] } },
                hr_step: { $sum: { $cond: [{ $or: [{ $and: ['$hasHR', '$prevHasSteps'] }, { $and: ['$hasSteps', '$prevHasHR'] }] }, 1, 0] } }
            }
        }
    ]);

    console.log(`\nRedundancy Analysis:`);
    console.log(`  Redundant HR (<1m spacing):      ${hrDuplicates[0]?.redundantHR || 0}`);
    console.log(`  Redundant Steps (<5m identical):  ${stepDuplicates[0]?.redundantSteps || 0}`);
    console.log(`  Sub-second Bursts (<1s Total):   ${bursts[0]?.total || 0}`);
    if (bursts.length > 0) {
        console.log(`    - HR <-> HR:                   ${bursts[0].hr_hr}`);
        console.log(`    - Steps <-> Steps:             ${bursts[0].step_step}`);
        console.log(`    - HR <-> Steps:                ${bursts[0].hr_step}`);
    }

    // 5. Sample Recent Data
    const recent = await Entry.find({ type: 'activity' }).sort({ date: -1 }).limit(10).lean();
    console.log(`\nMost Recent Activity Records:`);
    for (const r of recent as any[]) {
        const typeStr = r.heartrate !== undefined ? `HR: ${r.heartrate}` : `Steps: ${r.steps}`;
        console.log(`  ${new Date(r.date).toISOString()} - ${typeStr}`);
    }

    process.exit(0);
}

main().catch(console.error);
