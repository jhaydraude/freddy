import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { DeviceStatus } from '../src/db/models.js';

async function main() {
    await connectToDatabase();

    console.log('Searching for COB in DeviceStatus...');

    // Fetch distinct fields or recent docs
    const docs = await DeviceStatus.find({ "openaps": { $exists: true } })
        .sort({ created_at: -1 })
        .limit(5)
        .lean();

    docs.forEach((doc: any) => {
        console.log(`\n[${doc.created_at}]`);
        if (doc.openaps?.suggested?.COB !== undefined) console.log(`  openaps.suggested.COB: ${doc.openaps.suggested.COB}`);
        if (doc.openaps?.enacted?.COB !== undefined) console.log(`  openaps.enacted.COB: ${doc.openaps.enacted.COB}`);
        if (doc.openaps?.cob !== undefined) console.log(`  openaps.cob: ${doc.openaps.cob}`);
        if (doc.pump?.extended?.COB !== undefined) console.log(`  pump.extended.COB: ${doc.pump.extended.COB}`);
    });

    await disconnectFromDatabase();
}

main();
