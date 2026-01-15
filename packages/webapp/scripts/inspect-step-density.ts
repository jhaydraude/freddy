import { connectToDatabase } from '../lib/db/connection';
import { Entry } from '../lib/db/models';

async function main() {
    await connectToDatabase();

    console.log('Inspecting high-frequency Step records (Non-identical values)...\n');

    const records = await Entry.find({
        type: 'activity',
        steps: { $exists: true }
    }).sort({ date: 1 }).lean();

    let count = 0;
    for (let i = 1; i < records.length; i++) {
        const r1 = records[i - 1];
        const r2 = records[i];
        const delta = r2.date - r1.date;

        if (delta < 30000) { // < 30 seconds
            console.log(`Pair:`);
            console.log(`  R1: ${new Date(r1.date).toISOString()} Steps: ${r1.steps}`);
            console.log(`  R2: ${new Date(r2.date).toISOString()} Steps: ${r2.steps}`);
            console.log(`  Delta: ${delta}ms`);
            count++;
        }
        if (count >= 10) break;
    }

    process.exit(0);
}

main().catch(console.error);
