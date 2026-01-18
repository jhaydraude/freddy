import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import models from Freddy
import { SystemConfig } from '../lib/db/models';

async function compareData() {
    const freddyUri = process.env.MONGO_URI;
    const nsDbUri = process.env.NIGHTSCOUT_MONGO_URI;

    if (!freddyUri || !nsDbUri) {
        console.error('Missing MONGO_URI or NIGHTSCOUT_MONGO_URI in .env');
        return;
    }

    // 1. Get API credentials from Freddy
    console.log('Connecting to Freddy DB...');
    const freddyConn = await mongoose.createConnection(freddyUri).asPromise();

    // We need to use the model on this specific connection
    const SysConfigModel = freddyConn.model('SystemConfig', (mongoose.models.SystemConfig?.schema || new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed }, { collection: 'system_config' })));

    const configs = await SysConfigModel.find({});
    const dbConfig: Record<string, any> = {};
    configs.forEach(c => { dbConfig[(c as any).key] = (c as any).value; });

    const apiUrl = dbConfig.nightscout_url;
    const apiKey = dbConfig.nightscout_api_key;
    await freddyConn.close();

    if (!apiUrl || !apiKey) {
        console.error('Nightscout API settings not found in Freddy DB');
        return;
    }

    const baseUrl = apiUrl.replace(/\/api\/v3\/?$/, '').replace(/\/$/, '');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sinceISO = since.toISOString();
    const sinceEpoch = since.getTime();

    console.log(`Comparison Window: since ${sinceISO}`);

    // 2. Query Direct MongoDB
    console.log('\n--- Direct DB Query (Nightscout) ---');
    const nsConn = await mongoose.createConnection(nsDbUri).asPromise();
    const entriesCol = nsConn.collection('entries');

    const dbQuery = {
        type: { $in: ['activity', 'heart_rate', 'steps'] },
        date: { $gte: sinceEpoch }
    };

    const dbResults = await entriesCol.find(dbQuery).sort({ date: -1 }).toArray();
    console.log(`DB found ${dbResults.length} activity entries in last 24h.`);

    // Also check total activity count in DB regardless of time
    const totalActivity = await entriesCol.countDocuments({ type: { $in: ['activity', 'heart_rate', 'steps'] } });
    console.log(`DB total untimed activity entries: ${totalActivity}`);

    // 3. Query Nightscout API
    console.log('\n--- API Query (V3) ---');
    try {
        // Get JWT
        const authUrl = `${baseUrl}/api/v2/authorization/request/${apiKey}`;
        const authRes = await fetch(authUrl);
        if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status}`);
        const authData = await authRes.json();
        const jwt = authData.token;

        const apiQueryUrl = `${baseUrl}/api/v3/entries?type$in=activity|heart_rate|steps&date$gte=${sinceEpoch}&limit=100`;
        const apiRes = await fetch(apiQueryUrl, {
            headers: { 'Authorization': `Bearer ${jwt}` }
        });

        if (apiRes.ok) {
            const apiData = await apiRes.json();
            const results = apiData.result || apiData;
            console.log(`API found ${results.length} activity entries in last 24h.`);
        } else {
            console.error(`API query failed: ${apiRes.status}`);
        }
    } catch (e: any) {
        console.error(`API testing failed: ${e.message}`);
    }

    await nsConn.close();
    console.log('\nComparison complete.');
}

compareData();
