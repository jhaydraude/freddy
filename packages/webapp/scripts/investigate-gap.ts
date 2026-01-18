import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function investigateGap() {
    const freddyUri = process.env.MONGO_URI;
    const nsDbUri = process.env.NIGHTSCOUT_MONGO_URI;
    if (!freddyUri || !nsDbUri) return;

    const freddyConn = await mongoose.createConnection(freddyUri).asPromise();
    const nsConn = await mongoose.createConnection(nsDbUri).asPromise();

    // Timestamp from screenshot: 15:58 local.
    // User current time is 20:46-05:00.
    // So 15:58 local is roughly 5 hours ago from current system time (20:46).
    const targetTime = new Date('2026-01-17T15:58:00'); // Assuming local time for the chart
    const tsNumber = targetTime.getTime();

    // Check a window around that time (+/- 15 mins)
    const startWindow = tsNumber - 15 * 60 * 1000;
    const endWindow = tsNumber + 15 * 60 * 1000;

    console.log(`\n--- Gap Investigation (Around ${targetTime.toISOString()}) ---\n`);

    const query = { date: { $gte: startWindow, $lte: endWindow }, type: 'sgv' };

    const cacheEntries = await freddyConn.collection('entries_cache').find(query).sort({ date: 1 }).toArray();
    const sourceEntries = await nsConn.collection('entries').find(query).sort({ date: 1 }).toArray();

    console.log(`Freddy Cache Found: ${cacheEntries.length} entries`);
    console.log(`Nightscout Source Found: ${sourceEntries.length} entries`);

    if (sourceEntries.length > 0) {
        console.log('\nSample Source Entries:');
        sourceEntries.slice(0, 5).forEach(e => {
            console.log(`- ${new Date(e.date).toISOString()} : SGV ${e.sgv}`);
        });
    }

    if (cacheEntries.length > 0) {
        console.log('\nSample Cache Entries:');
        cacheEntries.slice(0, 5).forEach(e => {
            console.log(`- ${new Date(e.date).toISOString()} : SGV ${e.sgv}`);
        });
    } else if (sourceEntries.length > 0) {
        console.log('\n❌ Entries exist in Source but MISSING in Cache.');
    } else {
        console.log('\n❓ No entries found in either Source or Cache for this window.');
    }

    await freddyConn.close();
    await nsConn.close();
}

investigateGap();
