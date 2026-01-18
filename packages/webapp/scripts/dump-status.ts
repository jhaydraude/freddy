import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function dumpStatus() {
    const freddyUri = process.env.MONGO_URI;
    if (!freddyUri) return;

    const freddyConn = await mongoose.createConnection(freddyUri).asPromise();

    const targetTime = new Date('2026-01-17T15:58:00'); // 20:58Z
    const tsNumber = targetTime.getTime();

    // Window: 15:45 to 16:15
    const start = new Date(tsNumber - 15 * 60 * 1000);
    const end = new Date(tsNumber + 15 * 60 * 1000);

    console.log(`\n--- ComputedStatus Dump (Around ${targetTime.toISOString()}) ---\n`);

    const statuses = await freddyConn.collection('computedstatus').find({
        timestamp: { $gte: start, $lte: end }
    }).sort({ timestamp: 1 }).toArray();

    console.log(`Found ${statuses.length} computed status documents.`);

    statuses.forEach(s => {
        const sgv = s.status?.glucose?.current?.sgv;
        console.log(`- ${s.timestamp.toISOString()} : SGV ${sgv ?? 'NULL'}`);
        if (!sgv) {
            console.log(`  Detail: ${JSON.stringify(s.status?.glucose || 'NO_GLUCOSE_OBJECT')}`);
        }
    });

    await freddyConn.close();
}

dumpStatus();
