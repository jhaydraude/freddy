import mongoose from 'mongoose';
import { configManager } from '../config/config-manager';

let nsConn: mongoose.Connection | null = null;
let initializationPromise: Promise<void> | null = null;

export async function connectToDatabase() {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      // 1. Establish Freddy Connection (Default)
      const freddyUri = configManager.getFreddyMongoUri();
      console.error(`Connecting to Freddy DB...`);
      await mongoose.connect(freddyUri);
      console.error('Connected to Freddy DB successfully.');

      // 2. Establish Nightscout Connection (Secondary)
      const nsUri = configManager.getNightscoutMongoUri();
      if (nsUri) {
        console.error(`Connecting to Nightscout DB: ${nsUri.split('@').pop()}...`);
        nsConn = mongoose.createConnection(nsUri);
        await nsConn.asPromise();
        console.error('Connected to Nightscout DB successfully.');
      }

      // 3. Global initialization (only once)
      if (!(global as any)._freddyInitialized) {
        (global as any)._freddyInitialized = true;
        await initializeFreddy();
      }
    } catch (err) {
      initializationPromise = null;
      console.error('Error connecting to databases:', err);
      throw err;
    }
  })();

  return initializationPromise;
}

export function getFreddyConn(): mongoose.Connection {
  return mongoose.connection;
}

export function getNightscoutConn(): mongoose.Connection {
  if (!nsConn) throw new Error('Nightscout connection not initialized or configured.');
  return nsConn;
}

export function getNightscoutConnection() {
  return getNightscoutConn();
}

async function initializeFreddy() {
  console.error('Initializing Freddy Services...');
  try {
    const { SystemConfig } = await import('./models');

    // 1. Load system config from DB
    const configs = await SystemConfig.find({});
    const dbConfig: Record<string, any> = {};
    configs.forEach((c: any) => { dbConfig[c.key] = c.value; });

    configManager.updateConfig(dbConfig);
    console.error('Freddy Settings loaded from database.');

    // 2. Start Sync Worker (Repurposed as invalidator)
    const { getSyncWorker } = await import('../ns/sync-worker');
    const worker = getSyncWorker();
    worker.start();
    console.error('Freddy Sync Worker started (Invalidation Mode).');
  } catch (err) {
    console.error('Failed to initialize Freddy services:', err);
  }
}

export async function disconnectFromDatabase() {
  await mongoose.disconnect();
  if (nsConn) await nsConn.close();
  nsConn = null;
  initializationPromise = null;
}
