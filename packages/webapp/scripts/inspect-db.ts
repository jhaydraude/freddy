import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import models
import { SystemConfig, Entry, Treatment, Profile } from '../lib/db/models';

async function inspectDb() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) return;

    await mongoose.connect(mongoUri);

    console.log('\n--- System Configuration ---');
    const configs = await SystemConfig.find({});
    configs.forEach(c => {
        console.log(`${c.key}: ${c.key.includes('api_key') ? '********' : c.value}`);
    });

    console.log('\n--- Cache Status ---');
    const entryCount = await Entry.countDocuments();
    const treatmentCount = await Treatment.countDocuments();
    const profileCount = await Profile.countDocuments();

    console.log(`Entries: ${entryCount}`);
    console.log(`Treatments: ${treatmentCount}`);
    console.log(`Profiles: ${profileCount}`);

    if (entryCount > 0) {
        const latestEntry = await Entry.findOne().sort({ date: -1 });
        console.log(`Latest Entry: ${new Date(latestEntry?.date || 0).toISOString()} (Type: ${latestEntry?.type})`);
    }

    await mongoose.connection.close();
}

inspectDb();
