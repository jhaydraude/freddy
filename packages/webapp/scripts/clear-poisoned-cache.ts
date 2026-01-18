import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function clearPoisonedCache() {
    const freddyUri = process.env.MONGO_URI;
    if (!freddyUri) return;

    const freddyConn = await mongoose.createConnection(freddyUri).asPromise();
    const statusCol = freddyConn.collection('computedstatus');

    // Find all documents where sgv is null/NaN or timestamp is very old
    const result = await statusCol.deleteMany({
        $or: [
            { "status.glucose.current.sgv": null },
            { "status.glucose.current.sgv": NaN },
            { "status.glucose.timestamp": { $lte: "2026-01-01" } } // Far older than the doc timestamp
        ]
    });

    console.log(`Deleted ${result.deletedCount} poisoned computedstatus documents.`);

    await freddyConn.close();
}

clearPoisonedCache();
