/**
 * Test: Verify basal rates are correctly fetched from profile
 */

import { connectToDatabase } from '../src/db/connection.js';
import { generateTimeWindows } from '../src/lib/profile-analysis-logic.js';

async function main() {
    await connectToDatabase();

    // Test with recent data
    const endDate = new Date();
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

    console.log('\n🧪 Testing Basal Rate Fix...\n');
    console.log(`Generating windows for ${startDate.toISOString()} to ${endDate.toISOString()}\n`);

    const windows = await generateTimeWindows({ startDate, endDate, windowHours: 2 });

    if (windows.length === 0) {
        console.error('❌ No windows generated');
        process.exit(1);
    }

    console.log(`\n✅ Generated ${windows.length} windows\n`);
    console.log('📊 Basal Rate Distribution:\n');

    // Group windows by basal rate
    const basalRates = new Map<number, number>();
    for (const w of windows) {
        const rate = w.basal_insulin_delivered / w.duration_hours;
        const count = basalRates.get(rate) || 0;
        basalRates.set(rate, count + 1);
    }

    // Sort and display
    const sorted = Array.from(basalRates.entries()).sort((a, b) => a[0] - b[0]);
    for (const [rate, count] of sorted) {
        console.log(`  ${rate.toFixed(3)} U/hr: ${count} windows`);
    }

    // Show sample windows
    console.log('\n📝 Sample Windows:\n');
    for (let i = 0; i < Math.min(5, windows.length); i++) {
        const w = windows[i];
        const basalRate = w.basal_insulin_delivered / w.duration_hours;
        console.log(`${i + 1}. ${new Date(w.start).toLocaleString()}`);
        console.log(`   Hour: ${w.hour_of_day}, Basal: ${basalRate.toFixed(3)} U/hr (delivered ${w.basal_insulin_delivered.toFixed(2)} U)`);
        console.log(`   Glucose: ${w.glucose_start} → ${w.glucose_end} (Δ${w.glucose_change > 0 ? '+' : ''}${w.glucose_change})`);
        console.log();
    }

    // Verify not all 1.0
    const all10 = sorted.every(([rate]) => Math.abs(rate - 1.0) < 0.001);
    if (all10) {
        console.error('❌ WARNING: All basal rates are 1.0 U/hr - may not be using profile!');
    } else {
        console.log('✅ SUCCESS: Basal rates vary - profile data is being used!');
    }

    process.exit(0);
}

main().catch(console.error);
