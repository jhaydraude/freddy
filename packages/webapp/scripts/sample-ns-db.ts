import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function sampleDb() {
    const nsDbUri = process.env.NIGHTSCOUT_MONGO_URI;
    if (!nsDbUri) return;

    const nsConn = await mongoose.createConnection(nsDbUri).asPromise();
    const entriesCol = nsConn.collection('entries');

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).getTime();

    const sample = await entriesCol.find({
        type: { $in: ['activity', 'heart_rate', 'steps'] },
        date: { $gte: since }
    }).limit(3).toArray();

    console.log('Sample Recent Database Entries:');
    console.log(JSON.stringify(sample, null, 2));

    await nsConn.close();
}

sampleDb();
