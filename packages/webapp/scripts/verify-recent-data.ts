import 'dotenv/config';
import mongoose from 'mongoose';
import { Entry, Treatment, Profile, DeviceStatus, SystemConfig } from '../lib/db/models.js';
import { connectToDatabase } from '../lib/db/connection.js';

async function verifyRecentData() {
    await connectToDatabase();
    console.log('--- Verifying Recent Data (Last 7 Days) ---');

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;

    const count = await Entry.countDocuments({
        type: 'sgv',
        date: { $gte: sevenDaysAgo }
    });

    console.log(`Glucose entries (last 7 days): ${count}`);

    if (count > 0) {
        const first = await Entry.findOne({ type: 'sgv', date: { $gte: sevenDaysAgo } }).sort({ date: 1 });
        const last = await Entry.findOne({ type: 'sgv', date: { $gte: sevenDaysAgo } }).sort({ date: -1 });

        console.log(`  Start: ${new Date(first.date).toISOString()}`);
        console.log(`  End:   ${new Date(last.date).toISOString()}`);
    }

    const treatmentsCount = await Treatment.countDocuments({
        created_at: { $gte: new Date(sevenDaysAgo).toISOString() }
    });
    console.log(`Treatments (last 7 days): ${treatmentsCount}`);

    process.exit(0);
}

verifyRecentData().catch(err => {
    console.error(err);
    process.exit(1);
});
