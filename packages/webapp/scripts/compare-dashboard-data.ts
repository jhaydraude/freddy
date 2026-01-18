import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function comparePreciseValues() {
    const freddyUri = process.env.MONGO_URI;
    const nsDbUri = process.env.NIGHTSCOUT_MONGO_URI;
    if (!freddyUri || !nsDbUri) return;

    const freddyConn = await mongoose.createConnection(freddyUri).asPromise();
    const nsConn = await mongoose.createConnection(nsDbUri).asPromise();

    const dashboardValues = [
        { sgv: 8.8, timestamp: '2026-01-18T01:36:33.000Z' },
        { sgv: 8.7, timestamp: '2026-01-18T01:31:33.000Z' },
        { sgv: 8.7, timestamp: '2026-01-18T01:26:35.000Z' }
    ];

    console.log('\n--- Precise Data Parity Check ---\n');

    for (const val of dashboardValues) {
        const ts = new Date(val.timestamp).getTime();

        // Query Freddy Cache
        const cacheEntry = await freddyConn.collection('entries_cache').findOne({
            date: { $gte: ts - 2000, $lte: ts + 2000 }
        });

        // Query Nightscout Source
        const sourceEntry = await nsConn.collection('entries').findOne({
            date: { $gte: ts - 2000, $lte: ts + 2000 }
        });

        console.log(`Timestamp: ${val.timestamp}`);
        console.log(`Dashboard: ${val.sgv} mmol`);

        if (cacheEntry) {
            const cacheMmol = Math.round((cacheEntry.sgv / 18.018) * 10) / 10;
            console.log(`Cache    : ${cacheMmol} mmol (Raw: ${cacheEntry.sgv})`);
        } else {
            console.log(`Cache    : ❌ NOT FOUND`);
        }

        if (sourceEntry) {
            const sourceMmol = Math.round((sourceEntry.sgv / 18.018) * 10) / 10;
            console.log(`Source   : ${sourceMmol} mmol (Raw: ${sourceEntry.sgv})`);
        } else {
            console.log(`Source   : ❌ NOT FOUND`);
        }
        console.log('---');
    }

    await freddyConn.close();
    await nsConn.close();
}

comparePreciseValues();
