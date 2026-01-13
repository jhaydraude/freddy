
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function main() {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/freddy';
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db();
        const collection = db.collection('computedstatus');

        const total = await collection.countDocuments();
        console.log(`Total ComputedStatus documents: ${total}`);

        const latestArr = await collection.find().sort({ timestamp: -1 }).limit(1).toArray();
        const oldestArr = await collection.find().sort({ timestamp: 1 }).limit(1).toArray();

        if (latestArr.length > 0 && oldestArr.length > 0) {
            const latest = latestArr[0];
            const oldest = oldestArr[0];
            console.log(`Coverage: ${oldest.timestamp.toISOString()} to ${latest.timestamp.toISOString()}`);

            const spanMs = latest.timestamp.getTime() - oldest.timestamp.getTime();
            const days = spanMs / (1000 * 60 * 60 * 24);
            console.log(`Roughly coverage span: ${days.toFixed(2)} days`);

            const idealCount = Math.floor(spanMs / (5 * 60 * 1000));
            const density = (total / idealCount) * 100;
            console.log(`Density: ${density.toFixed(1)}% (Actual: ${total} / Ideal: ${idealCount})`);
        } else {
            console.log('No ComputedStatus documents found.');
        }

    } finally {
        await client.close();
    }
}

main().catch(console.error);
