import mongoose from 'mongoose';
import { CarbAbsorptionTuning } from './packages/webapp/lib/db/models/carb-absorption-tuning';

async function run() {
    const MONGO_URI = 'mongodb://freddydev:freddydev@192.168.201.100:27017/freddy_db_dev?authSource=admin';
    try {
        await mongoose.connect(MONGO_URI);
        const latest = await CarbAbsorptionTuning.findOne().sort({ created_at: -1 });
        console.log(JSON.stringify(latest, null, 2));
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

run();
