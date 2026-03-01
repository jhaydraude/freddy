import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testApi() {
    const url = process.env.NIGHTSCOUT_URL || 'https://nightscout.haydraude.org';
    const apiKey = process.env.NIGHTSCOUT_API_KEY;
    const baseUrl = url.replace(/\/api\/v3\/?$/, '').replace(/\/$/, '');

    console.log(`Testing Nightscout V3 API at: ${baseUrl}`);

    const authHeaders = [
        { name: 'Bearer Token', headers: { 'Authorization': `Bearer ${apiKey}` } },
        { name: 'API Secret Header', headers: { 'api-secret': apiKey || '' } },
        { name: 'token= Token', headers: { 'Authorization': `token=${apiKey}` } }
    ];

    const endpoints = [
        'api/v3/entries',
        'api/v3/treatments',
        'api/v3/storage/entries'
    ];

    for (const endpoint of endpoints) {
        console.log(`\n=== Testing Endpoint: ${endpoint} ===`);
        for (const auth of authHeaders) {
            const testUrl = `${baseUrl}/${endpoint}?count=1`;
            console.log(`\n--- Using Auth: ${auth.name} ---`);
            try {
                const res = await fetch(testUrl, { headers: auth.headers as unknown as Record<string, string> });
                console.log(`Result: ${res.status} ${res.statusText}`);
                if (res.ok) {
                    const data = await res.json();
                    console.log(`Success! Data count: ${data.length}`);
                } else {
                    const err = await res.json().catch(() => ({}));
                    console.log(`Error: ${JSON.stringify(err)}`);
                }
            } catch (e: any) {
                console.error(`Test failed: ${e.message}`);
            }
        }
    }
}

testApi();
