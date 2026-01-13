
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function main() {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/freddy';
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db();
        const collection = db.collection('situation_windows');

        const total = await collection.countDocuments();
        const pending = await collection.countDocuments({ status: 'pending' });
        const labeled = await collection.countDocuments({ status: 'labeled' });
        const skipped = await collection.countDocuments({ status: 'skipped' });

        console.log(`Total Windows: ${total}`);
        console.log(`Pending:       ${pending}`);
        console.log(`Labeled:       ${labeled}`);
        console.log(`Skipped:       ${skipped}`);

        // Check label distribution
        const pipeline = [
            { $match: { status: 'labeled' } },
            { $unwind: '$tags' },
            { $group: { _id: '$tags.tag_id', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ];
        const distribution = await collection.aggregate(pipeline).toArray();
        console.log('\nLabel Distribution:');
        distribution.forEach(d => {
            console.log(`- ${d._id}: ${d.count}`);
        });

    } finally {
        await client.close();
    }
}

main().catch(console.error);
