import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { DeviceStatus } from '../src/db/models.js';

async function main() {
    await connectToDatabase();

    console.log('Searching for Autosens / Ratio in DeviceStatus...');

    // Fetch recent statuses
    const docs = await DeviceStatus.find({
        "openaps": { $exists: true }
    })
        .sort({ created_at: -1 })
        .limit(10)
        .lean();

    if (docs.length === 0) {
        console.log('No openaps records found.');
        return;
    }

    docs.forEach(doc => {
        const date = doc.created_at;
        const iob = doc.openaps?.iob;
        const suggested = doc.openaps?.suggested;
        const enacted = doc.openaps?.enacted;

        console.log(`\n[${date}]`);
        if (iob) console.log(`  Reported IOB:`, iob);

        // Check for ratio/autosens in suggested
        if (suggested) {
            console.log(`  Suggested (Ratio/ISF):`);
            if (suggested.ratio) console.log(`    ratio: ${suggested.ratio}`);
            if (suggested.isf) console.log(`    isf: ${suggested.isf}`);
            if (suggested.sensitivityRatio) console.log(`    sensitivityRatio: ${suggested.sensitivityRatio}`);
        }

        // Deep search for 'ratio'
        // ... (simplified loop for now)
    });

    await disconnectFromDatabase();
}

main();
