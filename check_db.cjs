
const mongoose = require('mongoose');
const { ProfileAnalysis } = require('./packages/webapp/lib/db/models');

async function checkLatest() {
    await mongoose.connect('mongodb://localhost:27017/nightmanager');
    const latest = await ProfileAnalysis.findOne().sort({ timestamp: -1 }).lean();
    console.log('Latest Analysis Timestamp:', latest.timestamp);
    console.log('Keys:', Object.keys(latest));
    console.log('Activity Coeffs:', latest.estimated_activity_coefficients);
    process.exit(0);
}

checkLatest();
