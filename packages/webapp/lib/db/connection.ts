import mongoose from 'mongoose';
import { configManager } from '../config/config-manager';

const FREDDY_URI = configManager.getFreddyMongoUri();

export async function connectToDatabase() {
  try {
    if (mongoose.connection.readyState === 0) {
      console.error(`Connecting to Freddy DB: ${FREDDY_URI.split('@').pop()}...`);
      await mongoose.connect(FREDDY_URI);

      // Verify this is a Freddy database
      const collections = await mongoose.connection.db?.listCollections({ name: 'system_config' }).toArray();
      if (!collections || collections.length === 0) {
        console.error('\n' + '='.repeat(60));
        console.error('ERROR: Target database does not appear to be a Freddy database.');
        console.error('The "system_config" collection is missing.');
        console.error('Please run: npm run setup-db');
        console.error('='.repeat(60) + '\n');
        process.exit(1);
      }

      console.error('Connected to Freddy DB successfully.');

      // Global initialization (only once)
      if (!(global as any)._freddyInitialized) {
        (global as any)._freddyInitialized = true;
        await initializeFreddy();
      }
    }
  } catch (error) {
    console.error('Error connecting to Freddy DB:', error);
    process.exit(1);
  }
}

async function initializeFreddy() {
  console.error('Initializing Freddy Services...');
  try {
    const { SystemConfig } = await import('./models');
    const { getSyncWorker } = await import('../ns/sync-worker');

    // 1. Load system config from DB
    const configs = await SystemConfig.find({});
    const dbConfig: Record<string, any> = {};
    configs.forEach(c => { dbConfig[c.key] = c.value; });

    configManager.updateConfig(dbConfig);
    console.error('Freddy Settings loaded from database.');

    // 2. Initial Data Check (Bootstrap Profile)
    await bootstrapProfile();

    // 3. Start Sync Worker
    const worker = getSyncWorker();
    worker.start();
    console.error('Freddy Sync Worker started.');
  } catch (err) {
    console.error('Failed to initialize Freddy services:', err);
  }
}

async function bootstrapProfile() {
  const { Profile, SystemConfig } = await import('./models');

  const count = await Profile.countDocuments();
  if (count > 0) {
    console.error('SyncWorker: Profile store already initialized.');
    return;
  }

  console.error('SyncWorker: Profile store empty. Attempting to bootstrap...');

  // Try migrating from legacy Nightscout DB if URI is present
  const nsUri = configManager.getNightscoutMongoUri();
  if (nsUri) {
    try {
      console.error('SyncWorker: Attempting migration from Nightscout DB...');
      const nsConn = getNightscoutConnection();
      // Wait for connection to be ready (it's a createConnection thing)
      await new Promise((resolve, reject) => {
        nsConn.on('open', resolve);
        nsConn.on('error', reject);
        setTimeout(() => reject(new Error('NS connection timeout')), 5000);
      });

      const nsProfile = await nsConn.collection('profile').find({}).sort({ startDate: -1 }).limit(1).toArray();

      if (nsProfile && nsProfile.length > 0) {
        const p = nsProfile[0];
        // Remove _id to allow Freddy DB to assign its own
        delete (p as any)._id;
        await Profile.create(p);
        console.error('SyncWorker: Successfully migrated latest profile from Nightscout.');
        await nsConn.close();
        return;
      }
      await nsConn.close();
    } catch (err: any) {
      console.error(`SyncWorker: Migration failed: ${err.message}. Falling back to default seed.`);
    }
  }

  // Fallback: Seed a default minimal profile
  console.error('SyncWorker: Seeding default bootstrap profile.');
  const bootstrapProfile = {
    startDate: new Date(0).toISOString(), // Beginning of time
    defaultProfile: 'Standard',
    store: {
      'Standard': {
        dia: 3,
        carbratio: [{ time: '00:00', value: 10 }],
        sens: [{ time: '00:00', value: 50 }],
        basal: [{ time: '00:00', value: 0.5 }],
        target_low: [{ time: '00:00', value: 80 }],
        target_high: [{ time: '00:00', value: 120 }],
        units: 'mg/dL'
      }
    },
    created_at: new Date().toISOString()
  };

  await Profile.create(bootstrapProfile);
  console.error('SyncWorker: Default bootstrap profile created.');
}

/**
 * Returns a separate connection to the legacy Nightscout database.
 * Internal use only for sync/migration.
 */
export function getNightscoutConnection() {
  const nsUri = configManager.getNightscoutMongoUri();
  return mongoose.createConnection(nsUri);
}

export async function disconnectFromDatabase() {
  await mongoose.disconnect();
}
