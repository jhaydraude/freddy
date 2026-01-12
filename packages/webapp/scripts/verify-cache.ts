import { connectToDatabase } from '../lib/db/connection';
import { ComputedStatus } from '../lib/db/models';

async function main() {
    await connectToDatabase();

    const start = new Date('2026-01-06T16:00:00Z');
    const end = new Date('2026-01-06T17:00:00Z');

    const cached = await ComputedStatus.find({
        timestamp: { $gte: start, $lte: end }
    }).sort({ timestamp: 1 }).lean();

    console.log(`\nFound ${cached.length} cached statuses in range:`);
    console.log(`Start: ${start.toISOString()}`);
    console.log(`End: ${end.toISOString()}\n`);

    if (cached.length > 0) {
        console.log('Sample cached status:');
        console.log(`  Timestamp: ${cached[0].timestamp}`);
        console.log(`  Created: ${cached[0].created_at}`);
        console.log(`  Updated: ${cached[0].updated_at}`);
        console.log(`  Has IOB: ${!!cached[0].status?.iob}`);
        console.log(`  Has COB: ${!!cached[0].status?.cob}`);
        console.log(`  Has Attribution: ${!!cached[0].status?.attribution}`);
        console.log(`  Version: ${cached[0].version}`);
    }

    process.exit(0);
}

main().catch(console.error);
