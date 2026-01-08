const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/nightscout').then(async () => {
    const ProfileAnalysis = mongoose.model('ProfileAnalysis', new mongoose.Schema({}, {
        strict: false,
        collection: 'profileanalysis'
    }));

    const latest = await ProfileAnalysis.findOne().sort({ timestamp: -1 }).lean();

    console.log('\n=== LATEST ANALYSIS ===');
    console.log('Timestamp:', latest?.timestamp);
    console.log('R²:', latest?.r_squared);
    console.log('Has estimated_activity_coefficients?', !!latest?.estimated_activity_coefficients);
    console.log('Coefficients:', JSON.stringify(latest?.estimated_activity_coefficients, null, 2));
    console.log('\nFull keys:', Object.keys(latest || {}));

    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
