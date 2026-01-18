import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import models
import { SystemConfig } from '../lib/db/models';

async function testApi() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) return;

    await mongoose.connect(mongoUri);

    // Load config from DB manually
    const configs = await SystemConfig.find({});
    const dbConfig: Record<string, any> = {};
    configs.forEach(c => { dbConfig[c.key] = c.value; });

    const url = dbConfig.nightscout_url;
    const apiKey = dbConfig.nightscout_api_key;

    if (!url || !apiKey) {
        console.error('Nightscout URL or API Key not found in database configuration.');
        await mongoose.connection.close();
        return;
    }

    const baseUrl = url.replace(/\/api\/v3\/?$/, '').replace(/\/$/, '');
    console.log(`Testing Nightscout JWT generation at: ${baseUrl}`);

    // Step 1: Request JWT
    const authUrl = `${baseUrl}/api/v2/authorization/request/${apiKey}`;
    console.log(`Requesting JWT from: ${authUrl}`);

    let jwt;
    try {
        const res = await fetch(authUrl);
        console.log(`Auth request result: ${res.status} ${res.statusText}`);
        if (res.ok) {
            const data = await res.json();
            jwt = data.token;
            console.log(`JWT obtained: ${jwt.substring(0, 20)}...`);
        } else {
            const err = await res.json().catch(() => ({}));
            console.error(`Auth failed: ${JSON.stringify(err)}`);
            await mongoose.connection.close();
            return;
        }
    } catch (e: any) {
        console.error(`Auth request error: ${e.message}`);
        await mongoose.connection.close();
        return;
    }

    // Step 2: Test V3 call with JWT
    const testUrl = `${baseUrl}/api/v3/entries?count=1`;
    console.log(`\nTesting V3 call with JWT: ${testUrl}`);
    try {
        const res = await fetch(testUrl, {
            headers: { 'Authorization': `Bearer ${jwt}` }
        });
        console.log(`V3 call result: ${res.status} ${res.statusText}`);
        if (res.ok) {
            const data = await res.json();
            console.log(`Success! Received ${data.length} entries.`);
        } else {
            const err = await res.json().catch(() => ({}));
            console.error(`V3 call failed: ${JSON.stringify(err)}`);
        }
    } catch (e: any) {
        console.error(`V3 test error: ${e.message}`);
    }

    await mongoose.connection.close();
}

testApi();
