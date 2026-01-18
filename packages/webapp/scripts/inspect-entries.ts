import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import models
import { Entry } from '../lib/db/models';

async function inspectEntries() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) return;

    await mongoose.connect(mongoUri);

    const count = await Entry.countDocuments();
    console.log(`Total Entries: ${count}`);

    if (count > 0) {
        const sample = await Entry.find().sort({ date: -1 }).limit(5);
        console.log('\n--- Latest 5 Entries ---');
        sample.forEach(e => {
            console.log(`Date: ${new Date(e.date).toISOString()}, Type: ${e.type}, SGV: ${e.sgv}, Device: ${e.device}`);
        });
    }

    await mongoose.connection.close();
}

inspectEntries();
