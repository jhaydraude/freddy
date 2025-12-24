import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ quiet: true } as any);

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/nightscout';

export async function connectToDatabase() {
  try {
    if (mongoose.connection.readyState === 0) {
      console.error('Connecting to MongoDB...');
      await mongoose.connect(MONGO_URI);
      console.error('Connected to MongoDB successfully.');
    }
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
}

export async function disconnectFromDatabase() {
  await mongoose.disconnect();
}
