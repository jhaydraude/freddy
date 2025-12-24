import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { DeviceStatus } from '../src/db/models.js';

async function main() {
    await connectToDatabase();

    // Find a record specifically with sensitivityConfiguration
    const doc = await DeviceStatus.findOne({
        "configuration.sensitivityConfiguration": { $exists: true }
    }).sort({ created_at: -1 }).lean();

    if (doc && doc.configuration) {
        console.log('--- Configuration found ---');
        console.dir(doc.configuration, { depth: null, colors: true });
    } else {
        console.log('No detailed configuration found.');
    }

    await disconnectFromDatabase();
}

main();
