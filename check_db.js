import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://freddydev:freddydev@192.168.201.100:27017/freddy_db_dev?authSource=admin';

async function run() {
    try {
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;

        console.log('--- Collections ---');
        const collections = await db.listCollections().toArray();
        console.log(collections.map(c => c.name));

        const latestTuning = await db.collection('carb_absorption_tuning').findOne({}, { sort: { created_at: -1 } });
        console.log('\n--- Latest Tuning ---');
        console.log(JSON.stringify(latestTuning, null, 2));

        const treatmentsCount = await db.collection('treatments_cache').countDocuments({ carbs: { $gt: 0 } });
        console.log('\n--- Treatments with Carbs ---');
        console.log(treatmentsCount);

        const profilesCount = await db.collection('profiles_cache').countDocuments();
        console.log('\n--- Profiles ---');
        console.log(profilesCount);

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

run();
