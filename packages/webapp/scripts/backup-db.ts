import 'dotenv/config';
import { connectToDatabase } from '../lib/db/connection';
import mongoose from 'mongoose';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

async function backupDatabase() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupDir = path.join(process.cwd(), '..', '..', 'backups', `mongo_backup_${timestamp}`);

    // Create backup directory
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log(`Creating backup in: ${backupDir}`);
    console.log('Connecting to MongoDB...');

    await connectToDatabase();

    // Get all collection names
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`Found ${collections.length} collections to backup`);

    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/nightscout';

    for (const collection of collections) {
        const collectionName = collection.name;
        const outputFile = path.join(backupDir, `${collectionName}.json`);

        console.log(`Backing up collection: ${collectionName}...`);

        try {
            // Use native MongoDB driver to export
            const docs = await mongoose.connection.db.collection(collectionName).find({}).toArray();
            fs.writeFileSync(outputFile, JSON.stringify(docs, null, 2));
            console.log(`  ✓ Exported ${docs.length} documents to ${collectionName}.json`);
        } catch (error) {
            console.error(`  ✗ Failed to backup ${collectionName}:`, error);
        }
    }

    console.log(`\nBackup complete! Files saved to: ${backupDir}`);
    process.exit(0);
}

backupDatabase().catch(err => {
    console.error('Backup failed:', err);
    process.exit(1);
});
