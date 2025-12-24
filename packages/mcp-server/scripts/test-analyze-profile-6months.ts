/**
 * Test script: Run holistic profile analysis on 6 months of data with 2-hour windows
 */

import { connectToDatabase } from '../src/db/connection.js';
import { generateTimeWindows } from '../src/lib/profile-analysis-logic.js';
import { resolveActiveProfile, getProfileStore } from '../src/lib/profile-logic.js';

async function main() {
    await connectToDatabase();
    console.log('✅ Connected to database\n');

    // Calculate date range: 6 months of data
    const endDate = new Date('2025-12-23'); // Current date
    const startDate = new Date('2024-06-23'); // 6 months ago
    const windowHours = 2;

    console.log(`📊 Analyzing profile parameters:`);
    console.log(`   Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`   Window size: ${windowHours} hours\n`);

    // Generate time windows
    const windows = await generateTimeWindows({ startDate, endDate, windowHours });

    if (windows.length === 0) {
        console.error('❌ No time windows generated');
        process.exit(1);
    }

    // Fetch current profile
    console.log('📋 Fetching current active profile...');
    let currentProfile = null;
    try {
        const profileInfo = await resolveActiveProfile(new Date());
        if (profileInfo?.profileData) {
            currentProfile = profileInfo.profileData;
        } else if (profileInfo?.doc) {
            currentProfile = getProfileStore(profileInfo.doc, profileInfo.activeProfileName);
        }

        if (currentProfile) {
            console.log(`   Current ISF: ${currentProfile.sens?.[0]?.value || 'N/A'}`);
            console.log(`   Current ICR: ${currentProfile.carbratio?.[0]?.value || 'N/A'}`);
            console.log(`   Current Basal (avg): ${currentProfile.basal ?
                (currentProfile.basal.reduce((sum: number, b: any) => sum + b.value, 0) / currentProfile.basal.length).toFixed(3) : 'N/A'} U/hr\n`);
        }
    } catch (error) {
        console.error('⚠️  Failed to fetch current profile:', error);
    }

    // Call Python analysis service
    console.log('🔧 Sending data to analysis service...\n');
    const analysisUrl = process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000';

    try {
        const response = await fetch(`${analysisUrl}/api/v1/analyze/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                windows: windows,
                current_profile: currentProfile
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Analysis failed: ${response.status}`);
            console.error(errorText);
            process.exit(1);
        }

        const result = await response.json();

        // Display results
        console.log('═══════════════════════════════════════════════════════════');
        console.log('                   PROFILE ANALYSIS RESULTS');
        console.log('═══════════════════════════════════════════════════════════\n');

        console.log('📈 Data Quality:');
        console.log(`   Windows analyzed: ${result.windows_analyzed}`);
        console.log(`   Stable windows: ${result.stable_windows}`);
        console.log(`   Meal windows: ${result.meal_windows}`);
        console.log(`   Model fit (R²): ${result.r_squared.toFixed(3)}`);
        console.log(`   RMSE: ${result.rmse.toFixed(1)} mg/dL`);
        console.log(`   MAE: ${result.mae.toFixed(1)} mg/dL\n`);

        console.log('🎯 Estimated Parameters:');
        console.log(`   ISF: ${result.estimated_isf.toFixed(1)} mg/dL per unit`);
        console.log(`   ICR: ${result.estimated_icr.toFixed(1)} g per unit`);
        console.log(`   Basal (avg): ${(result.estimated_basal_rates.reduce((a: number, b: number) => a + b, 0) / 24).toFixed(3)} U/hr\n`);

        console.log('⏰ Hourly Basal Rates:');
        for (let i = 0; i < 24; i += 6) {
            const rates = result.estimated_basal_rates.slice(i, i + 6)
                .map((r: number, j: number) => `${String(i + j).padStart(2, '0')}:00=${r.toFixed(3)}U`)
                .join('  ');
            console.log(`   ${rates}`);
        }
        console.log();

        if (result.current_profile && result.recommended_profile) {
            console.log('📊 Comparison:');
            console.log(`   Current ISF:       ${result.current_profile.sens[0].value} mg/dL/U`);
            console.log(`   Recommended ISF:   ${result.recommended_profile.sens[0].value} mg/dL/U`);
            console.log(`   Change:           ${((result.recommended_profile.sens[0].value / result.current_profile.sens[0].value - 1) * 100).toFixed(1)}%\n`);

            console.log(`   Current ICR:       ${result.current_profile.carbratio[0].value} g/U`);
            console.log(`   Recommended ICR:   ${result.recommended_profile.carbratio[0].value} g/U`);
            console.log(`   Change:           ${((result.recommended_profile.carbratio[0].value / result.current_profile.carbratio[0].value - 1) * 100).toFixed(1)}%\n`);
        }

        console.log('💡 Recommendation:');
        console.log(`   ${result.recommendation}\n`);

        console.log('═══════════════════════════════════════════════════════════\n');

        // Save full result to file
        const fs = await import('fs/promises');
        await fs.writeFile(
            'profile-analysis-result.json',
            JSON.stringify(result, null, 2)
        );
        console.log('💾 Full results saved to: profile-analysis-result.json\n');

    } catch (error: any) {
        console.error('❌ Error calling analysis API:', error.message);
        process.exit(1);
    }

    process.exit(0);
}

main().catch(console.error);
