const { MongoClient } = require('mongodb');
require('dotenv').config({ path: 'packages/webapp/.env' });

async function run() {
    console.log('Using MONGO_URI from .env');
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db();
        const result = await db.collection('situation_tags').updateMany(
            { tag_id: { $in: ['normal', 'dont_use'] } },
            { $set: { is_active: false } }
        );
        console.log('Successfully deactivated tags. Matches:', result.matchedCount, 'Modified:', result.modifiedCount);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.close();
    }
}

run().catch(console.error);
