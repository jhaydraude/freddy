import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkEntryTypes() {
    const freddyUri = process.env.MONGO_URI;
    if (!freddyUri) return;

    const freddyConn = await mongoose.createConnection(freddyUri).asPromise();
    const entryCol = freddyConn.collection('entries_cache');

    const types = await entryCol.distinct('type');
    console.log(`\nEntry Types found in cache: ${JSON.stringify(types)}`);

    const samples = await entryCol.find({}).sort({ date: -1 }).limit(10).toArray();
    samples.forEach(s => {
        console.log(`- Date: ${new Date(s.date).toISOString()}, Type: ${s.type}, sgv: ${s.sgv}, steps: ${s.steps}, heartrate: ${s.heartrate}`);
    });

    await freddyConn.close();
}

checkEntryTypes();
