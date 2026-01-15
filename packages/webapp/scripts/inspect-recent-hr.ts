import { connectToDatabase } from '../lib/db/connection';
import { Entry } from '../lib/db/models';

async function main() {
    await connectToDatabase();

    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;

    const recentHR = await Entry.find({
        type: 'activity',
        heartrate: { $exists: true },
        date: { $gte: last24h }
    }).sort({ date: -1 }).limit(10).lean();

    console.log(`Found ${recentHR.length} recent heart rate records in entries collection.\n`);

    recentHR.forEach((r, i) => {
        console.log(`${i + 1}. Full Document:`);
        console.log(JSON.stringify(r, null, 2));
    });

    process.exit(0);
}

main().catch(console.error);
