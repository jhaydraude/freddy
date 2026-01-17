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

    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    // Get all collection names
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections to backup`);

    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/nightscout';

    for (const collection of collections) {
        const collectionName = collection.name;
        const outputFile = path.join(backupDir, `${collectionName}.json`);

        console.log(`Backing up collection: ${collectionName}...`);

        try {
            const cursor = db.collection(collectionName).find({});
            const totalDocs = await db.collection(collectionName).countDocuments();

            const writeStream = fs.createWriteStream(outputFile, { flags: 'w' });
            writeStream.write('[\n');

            let count = 0;
            let hasError = false;

            for await (const doc of cursor) {
                if (count > 0) {
                    writeStream.write(',\n');
                }
                const success = writeStream.write(JSON.stringify(doc, null, 2));
                if (!success) {
                    // Handle backpressure if needed, though simple write works for local files usually
                    await new Promise(resolve => writeStream.once('drain', resolve));
                }
                count++;
            }

            writeStream.write('\n]');
            writeStream.end();

            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            console.log(`  ✓ Exported ${count} documents to ${collectionName}.json`);

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
