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
        if (doc.openaps) {
            console.log('  openaps keys:', Object.keys(doc.openaps));
        }
        if (doc.openaps?.suggested) {
            console.log(`  openaps.suggested.COB: ${doc.openaps.suggested.COB}`);
            console.log(`  openaps.suggested.timestamp: ${doc.openaps.suggested.timestamp}`);
            console.log(`  openaps.suggested.deliverAt: ${doc.openaps.suggested.deliverAt}`);
        }
        if (doc.openaps?.enacted) {
            console.log(`  openaps.enacted.COB: ${doc.openaps.enacted.COB}`);
            console.log(`  openaps.enacted.timestamp: ${doc.openaps.enacted.timestamp}`);
        }
        if (doc.openaps?.cob) {
            console.log(`  openaps.cob: ${JSON.stringify(doc.openaps.cob)}`);
        }
    });

    await disconnectFromDatabase();
}

main();
