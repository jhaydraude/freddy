import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { DeviceStatus } from '../src/db/models.js';

async function main() {
    await connectToDatabase();

    // Get a record with configuration
    const doc = await DeviceStatus.findOne({
        "configuration": { $exists: true }
    }).sort({ created_at: -1 }).lean();

    if (doc) {
        console.log('--- Configuration Object ---');
        console.dir(doc.configuration, { depth: null, colors: true });
    } else {
        console.log('No configuration found in recent devicestatus.');
    }

    await disconnectFromDatabase();
}

main();
