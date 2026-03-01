import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import models
import { SystemConfig } from '../lib/db/models';

async function testActivities() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) return;

    await mongoose.connect(mongoUri);
    const configs = await SystemConfig.find({});
    const dbConfig: Record<string, any> = {};
    (configs as any[]).forEach((c: any) => { dbConfig[c.key] = c.value; });

    const url = dbConfig.nightscout_url;
    const apiKey = dbConfig.nightscout_api_key;
    await mongoose.connection.close();

    const baseUrl = url.replace(/\/api\/v3\/?$/, '').replace(/\/$/, '');

    // Step 1: Get JWT
    const authUrl = `${baseUrl}/api/v2/authorization/request/${apiKey}`;
    const authRes = await fetch(authUrl);
    const authData = await authRes.json();
    const jwt = authData.token;

    // Step 2: Query ALL activities (no date filter)
    const activityUrl = `${baseUrl}/api/v3/entries?type$in=activity|heart_rate|steps&limit=10`;
    console.log(`Querying any activities from: ${activityUrl}`);

    const res = await fetch(activityUrl, {
        headers: { 'Authorization': `Bearer ${jwt}` }
    });

    if (res.ok) {
        const data = await res.json();
        const result = data.result || data;
        console.log(`Found ${result.length} historical activity entries in Nightscout.`);
        if (result.length > 0) {
            console.log('Sample activity (oldest?):');
            console.log(JSON.stringify(result[0], null, 2));
        }
    } else {
        console.error(`Activities query failed: ${res.status}`);
    }
}

testActivities();
