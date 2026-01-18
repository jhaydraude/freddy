import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function setupDatabase(dbName: string, baseUri: string, searchParams: string) {
    console.log(`\n--- Setting up database: ${dbName} ---`);

    const uri = `${baseUri.replace(/\/$/, '')}/${dbName}${searchParams}`;
    console.log(`Connecting to ${uri.replace(/:[^:]+@/, ':****@')}...`);

    const conn = await mongoose.createConnection(uri).asPromise();
    console.log(`Connected to ${dbName}`);

    // Define Collections and Indices
    const collections = [
        { name: 'entries_cache', ttl: true },
        { name: 'treatments_cache', ttl: true },
        { name: 'profiles_cache', ttl: true },
        { name: 'devicestatus_cache', ttl: true },
        { name: 'computedstatus', ttl: false },
        { name: 'profile_analysis', ttl: false },
        { name: 'system_config', ttl: false },
        { name: 'user_preferences', ttl: false }
    ];

    for (const col of collections) {
        console.log(`Ensuring collection: ${col.name}`);
        // Create collection if it doesn't exist by inserting and deleting a dummy doc
        // Or just using createCollection if supported by the driver version
        try {
            await conn.createCollection(col.name);
        } catch (e: any) {
            if (e.codeName !== 'NamespaceExists') {
                console.error(`Error creating ${col.name}:`, e.message);
            }
        }

        if (col.ttl) {
            console.log(`Creating TTL index on ${col.name}.expireAt...`);
            await conn.collection(col.name).createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
        }
    }

    // Default Config Seeding
    const configCol = conn.collection('system_config');
    const existingConfig = await configCol.countDocuments();
    if (existingConfig === 0) {
        console.log('Seeding default system configurations...');
        await configCol.insertMany([
            { key: 'sync_frequency_ms', value: 300000, updated_at: new Date() },
            { key: 'nightscout_url', value: process.env.NIGHTSCOUT_URL || '', updated_at: new Date() }
        ]);
    }

    await conn.close();
    console.log(`Finished setting up ${dbName}`);
}

async function main() {
    const fullUri = process.env.MONGO_URI || 'mongodb://localhost:27017/nightscout';
    // Extract base URI (host + port + auth, no DB name)
    const url = new URL(fullUri);
    const baseUri = `${url.protocol}//${url.username}${url.password ? ':' + url.password : ''}${url.username ? '@' : ''}${url.host}`;

    console.log(`Using base URI: ${baseUri}`);

    try {
        await setupDatabase('freddy_db', baseUri, url.search);
        await setupDatabase('freddy_db_dev', baseUri, url.search);
        console.log('\nSUCCESS: Freddy databases initialized successfully.');
    } catch (error: any) {
        console.error('\nERROR: Database setup failed:', error.message);
        process.exit(1);
    }
}

main();
