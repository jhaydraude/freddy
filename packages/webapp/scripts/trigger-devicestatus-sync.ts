import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import models
import { SystemConfig, DeviceStatus } from '../lib/db/models';

async function syncDeviceStatus() {
    const mongoUri = process.env.MONGO_URI;
    const nsDbUri = process.env.NIGHTSCOUT_MONGO_URI;
    if (!mongoUri || !nsDbUri) return;

    await mongoose.connect(mongoUri);
    const configs = await SystemConfig.find({});
    const dbConfig: Record<string, any> = {};
    (configs as any[]).forEach((c: any) => { dbConfig[c.key] = c.value; });

    const url = dbConfig.nightscout_url;
    const apiKey = dbConfig.nightscout_api_key;

    const baseUrl = url.replace(/\/api\/v3\/?$/, '').replace(/\/$/, '');

    // 1. Get JWT
    const authUrl = `${baseUrl}/api/v2/authorization/request/${apiKey}`;
    const authRes = await fetch(authUrl);
    const authData = await authRes.json();
    const jwt = authData.token;

    // 2. Query devicestatus since 24h ago
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const apiQueryUrl = `${baseUrl}/api/v3/devicestatus?created_at$gte=${since}&limit=1000`;

    console.log(`Syncing devicestatus from: ${apiQueryUrl}`);

    const res = await fetch(apiQueryUrl, {
        headers: { 'Authorization': `Bearer ${jwt}` }
    });

    if (res.ok) {
        const data = await res.json();
        const results = data.result || data;
        console.log(`Found ${results.length} devicestatus entries in Nightscout.`);

        let upserted = 0;
        for (const status of results) {
            const expireAt = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3h TTL
            await DeviceStatus.updateOne(
                { created_at: status.created_at },
                { $set: { ...status, expireAt } },
                { upsert: true }
            );
            upserted++;
        }
        console.log(`Upserted ${upserted} entries to Freddy cache.`);
    } else {
        console.error(`Status sync failed: ${res.status}`);
    }

    await mongoose.connection.close();
}

syncDeviceStatus();
