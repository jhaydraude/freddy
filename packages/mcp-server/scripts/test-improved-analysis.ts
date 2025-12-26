import { handler } from '../src/tools/analyze-profile.js';
import { connectToDatabase } from '../src/db/connection.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function runTest() {
    await connectToDatabase();
    console.log('Running analyze_profile for last 7 days...');
    const result = await handler({ daysBack: 7 });
    console.log('\n--- Analysis Result ---');
    console.log(result.content[0].text);
    await mongoose.disconnect();
}

runTest().catch(console.error);
