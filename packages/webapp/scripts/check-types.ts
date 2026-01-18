import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkTypes() {
    const freddyUri = process.env.MONGO_URI;
    if (!freddyUri) return;

    const freddyConn = await mongoose.createConnection(freddyUri).asPromise();
    const entryCol = freddyConn.collection('entries_cache');

    const sample = await entryCol.findOne({ date: { $exists: true } });
    if (sample) {
        console.log(`\nSample Entry:`);
        console.log(`- date: ${sample.date} (Type: ${typeof sample.date})`);
        console.log(`- sgv: ${sample.sgv} (Type: ${typeof sample.sgv})`);

        // Deep check for Jan 17 entries
        const target = new Date('2026-01-17T20:56:33.001Z').getTime();
        const janSample = await entryCol.findOne({ date: target });
        if (janSample) {
            console.log(`\nJan 17 Entry (Exact match on Number):`);
            console.log(`- Found! date: ${janSample.date} (Type: ${typeof janSample.date})`);
        } else {
            const janSampleStr = await entryCol.findOne({ date: target.toString() });
            if (janSampleStr) {
                console.log(`\nJan 17 Entry (Found as STRING!):`);
                console.log(`- date: ${janSampleStr.date} (Type: ${typeof janSampleStr.date})`);
            } else {
                console.log(`\nJan 17 Entry (NOT FOUND by precise match).`);

                // Search by regex or partial
                const allJan = await entryCol.find({ dateString: /2026-01-17/ }).limit(1).toArray();
                if (allJan.length > 0) {
                    console.log(`\nJan 17 Entry (Found by dateString):`);
                    console.log(`- date: ${allJan[0].date} (Type: ${typeof allJan[0].date})`);
                }
            }
        }
    }

    await freddyConn.close();
}

checkTypes();
