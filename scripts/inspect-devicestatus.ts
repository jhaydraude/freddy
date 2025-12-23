import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection.js';
import { DeviceStatus } from '../src/db/models.js';

async function main() {
    await connectToDatabase();

    console.log('Fetching recent DeviceStatus records...');
    // Get last 20 records that have openaps data
    const docs = await DeviceStatus.find({
        "openaps": { $exists: true }
    })
        .sort({ created_at: -1 })
        .limit(20)
        .lean();

    console.log(`Found ${docs.length} records.`);

    if (docs.length > 0) {
        // Inspect the first one in detail
        console.log('--- Sample Document Structure (Depth 3) ---');
        console.dir(docs[0], { depth: 3, colors: true });

        // Check specifically for carb-related keys in all docs
        console.log('\n--- Searching for "carb" related keys ---');
        const carbKeys = new Set<string>();

        const search = (obj: any, prefix: string) => {
            if (!obj || typeof obj !== 'object') return;
            for (const key of Object.keys(obj)) {
                if (key.toLowerCase().includes('carb')) {
                    carbKeys.add(`${prefix}.${key} = ${JSON.stringify(obj[key])}`);
                }
                if (typeof obj[key] === 'object') {
                    search(obj[key], `${prefix}.${key}`);
                }
            }
        };

        docs.forEach(doc => search(doc, 'root'));

        Array.from(carbKeys).sort().forEach(k => console.log(k));
    }

    await disconnectFromDatabase();
}

main();
