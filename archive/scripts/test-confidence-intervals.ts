/**
 * Quick test: Verify 4-hour basal blocks and confidence intervals
 * Uses last 30 days of data
 */

import { connectToDatabase } from '../src/db/connection.js';
import { generateTimeWindows } from '../src/lib/profile-analysis-logic.js';
import { resolveActiveProfile, getProfileStore } from '../src/lib/profile-logic.js';

async function main() {
    await connectToDatabase();

    const endDate = new Date();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const windowHours = 2;

    console.log(`\n📊 Testing Analysis (30 days, 2-hour windows)...\n`);

    const windows = await generateTimeWindows({ startDate, endDate, windowHours });

    // Fetch current profile
    const profileInfo = await resolveActiveProfile(new Date());
    const currentProfile = profileInfo?.profileData ||
        getProfileStore(profileInfo?.doc, profileInfo?.activeProfileName);

    // Call API
    const response = await fetch('http://localhost:8000/api/v1/analyze/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windows, current_profile: currentProfile })
    });

    if (!response.ok) {
        console.error(`❌ Failed: ${response.status}`);
        console.error(await response.text());
        process.exit(1);
    }

    const result = await response.json();

    console.log('✅ Analysis Complete!\n');
    console.log(`📈 Estimated ISF: ${result.estimated_isf.toFixed(1)} mg/dL/U`);
    console.log(`   95% CI: [${result.isf_confidence[0].toFixed(1)}, ${result.isf_confidence[1].toFixed(1)}]\n`);

    console.log(`📈 Estimated ICR: ${result.estimated_icr.toFixed(1)} g/U`);
    console.log(`   95% CI: [${result.icr_confidence[0].toFixed(1)}, ${result.icr_confidence[1].toFixed(1)}]\n`);

    console.log(`📈 4-Hour Basal Blocks:`);
    const blocks = ['0-3hr', '4-7hr', '8-11hr', '12-15hr', '16-19hr', '20-23hr'];
    for (let i = 0; i < 6; i++) {
        const [lower, upper] = result.basal_confidence[i];
        console.log(`   ${blocks[i]}: ${result.estimated_basal_rates[i].toFixed(3)} U/hr [${lower.toFixed(3)}, ${upper.toFixed(3)}]`);
    }

    console.log(`\n📊 Model Fit: R²=${result.r_squared.toFixed(3)}`);
    console.log(`📦 Windows: ${result.windows_analyzed}\n`);

    process.exit(0);
}

main().catch(console.error);
