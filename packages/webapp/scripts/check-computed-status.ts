
import 'dotenv/config';
import mongoose from 'mongoose';
import { ComputedStatus } from '../lib/db/models';

async function check() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/freddy';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const total = await ComputedStatus.countDocuments();
    console.log(`Total ComputedStatus documents: ${total}`);

    const latest = await ComputedStatus.findOne().sort({ timestamp: -1 });
    const oldest = await ComputedStatus.findOne().sort({ timestamp: 1 });

    if (latest && oldest) {
        console.log(`Coverage: ${oldest.timestamp.toISOString()} to ${latest.timestamp.toISOString()}`);

        const spanMs = latest.timestamp.getTime() - oldest.timestamp.getTime();
        const days = spanMs / (1000 * 60 * 60 * 24);
        console.log(`Roughly coverage span: ${days.toFixed(2)} days`);

        // Ideal count for 5-minute intervals
        const idealCount = Math.floor(spanMs / (5 * 60 * 1000));
        const density = (total / idealCount) * 100;
        console.log(`Density: ${density.toFixed(1)}% (Actual: ${total} / Ideal: ${idealCount})`);
    } else {
        console.log('No ComputedStatus documents found.');
    }

    await mongoose.disconnect();
}

check().catch(console.error);
