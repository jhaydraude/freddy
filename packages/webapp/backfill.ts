import { connectToDatabase } from './lib/db/connection';
import { recalculateStatusRange } from './lib/logic/cache-logic';
import { ComputedStatus } from './lib/db/models';

async function main() {
    console.log('Connecting to database...');
    await connectToDatabase();

    const end = new Date();
    const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);

    console.log(`Starting backfill from ${start.toISOString()} to ${end.toISOString()}...`);
    
    // Check how many v1.1 documents we have
    const v11Count = await ComputedStatus.countDocuments({ version: '1.1' });
    console.log(`Currently have ${v11Count} version 1.1 documents.`);
    
    if (true) {
        console.log('Running recalculation...');
        const result = await recalculateStatusRange(start, end, 5, true);
        console.log('Recalculation result:', result);
    } else {
        console.log('Already have v1.1 documents, skipping recalculation.');
    }

    console.log('Waiting for cache writes to finish...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('Done!');
    process.exit(0);
}

main().catch(console.error);
