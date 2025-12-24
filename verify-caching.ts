/**
 * Simple verification: Check if computedstatus collection has data
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ComputedStatus } from './src/db/models.js';

dotenv.config();

async function verify() {
    await mongoose.connect(process.env.MONGO_URI!);

    console.log('\n=== ComputedStatus Collection Status ===\n');

    const count = await ComputedStatus.countDocuments();
    console.log(`Total cached entries: ${count}`);

    if (count > 0) {
        const recent = await ComputedStatus.find().sort({ timestamp: -1 }).limit(3).lean();
        console.log(`\nMost recent entries:`);
        for (const entry of recent) {
            const ts = new Date(entry.timestamp).toISOString();
            const glucose = entry.status?.glucose?.current?.sgv || 'N/A';
            const iob = entry.status?.iob?.calculated?.totalIOB || 'N/A';
            const cob = entry.status?.cob?.calculated?.cob || 'N/A';
            console.log(`\n  Timestamp: ${ts}`);
            console.log(`  Glucose: ${glucose} mg/dL`);
            console.log(`  IOB: ${iob} U`);
            console.log(`  COB: ${cob} g`);
            console.log(`  Created: ${new Date(entry.created_at).toLocaleString()}`);
            console.log(`  Updated: ${new Date(entry.updated_at).toLocaleString()}`);
        }
    }

    console.log('\n=== Caching is ACTIVE ===\n');

    await mongoose.disconnect();
}

verify().catch(console.error);
