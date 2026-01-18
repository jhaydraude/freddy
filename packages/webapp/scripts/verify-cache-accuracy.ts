import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function verifyCache() {
    const freddyUri = process.env.MONGO_URI;
    const nsDbUri = process.env.NIGHTSCOUT_MONGO_URI;

    if (!freddyUri || !nsDbUri) {
        console.error('Missing MONGO_URI or NIGHTSCOUT_MONGO_URI in .env');
        return;
    }

    const freddyConn = await mongoose.createConnection(freddyUri).asPromise();
    const nsConn = await mongoose.createConnection(nsDbUri).asPromise();

    const collections = [
        { cache: 'entries_cache', source: 'entries', field: 'date' },
        { cache: 'treatments_cache', source: 'treatments', field: 'created_at' },
        { cache: 'profiles_cache', source: 'profile', field: 'startDate' },
        { cache: 'devicestatus_cache', source: 'devicestatus', field: 'created_at' }
    ];

    console.log('\n--- Cache Accuracy Report ---\n');

    for (const col of collections) {
        // Look at last 24 hours
        let since: any;
        if (col.field === 'date') {
            since = Date.now() - 24 * 60 * 60 * 1000;
        } else {
            since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        }

        const query = { [col.field]: { $gte: since } };

        const cacheCol = freddyConn.collection(col.cache);
        const sourceCol = nsConn.collection(col.source);

        const cacheCount = await cacheCol.countDocuments(query);
        const sourceCount = await sourceCol.countDocuments(query);

        const match = cacheCount === sourceCount;
        const status = match ? '✅ MATCH' : `❌ MISMATCH (${cacheCount} vs ${sourceCount})`;

        console.log(`${col.source.padEnd(15)}: ${status}`);

        if (!match && sourceCount > 0) {
            console.log(`   - Potential delay or sync filter issue.`);
        }
    }

    // Check one specific record for field integrity
    console.log('\n--- Field Integrity Check (Entries) ---');
    const sampleSource = await nsConn.collection('entries').findOne({ type: 'sgv' }, { sort: { date: -1 } });
    if (sampleSource) {
        const sampleCache = await freddyConn.collection('entries_cache').findOne({ date: sampleSource.date });
        if (sampleCache) {
            console.log('✅ Found matching sample in cache.');
            const sourceKeys = Object.keys(sampleSource).filter(k => k !== '_id');
            const missingKeys = sourceKeys.filter(k => !(k in sampleCache));
            if (missingKeys.length > 0) {
                console.log(`⚠️  Cache missing keys from source: ${missingKeys.join(', ')}`);
            } else {
                console.log('✅ All source fields replicated in cache.');
            }
        } else {
            console.log('❌ Failed to find recent source sample in cache.');
        }
    }

    await freddyConn.close();
    await nsConn.close();
    console.log('\nVerification complete.');
}

verifyCache();
