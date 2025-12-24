/**
 * Diagnostic: Check carb and insulin entries in the database
 */

import { connectToDatabase } from '../src/db/connection.js';
import { Treatment } from '../src/db/models.js';

async function main() {
    await connectToDatabase();

    const endDate = new Date();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    console.log(`\n🔍 Analyzing treatment entries (last 30 days)...\n`);

    const allTreatments = await Treatment.find({
        created_at: {
            $gte: startDate.toISOString(),
            $lte: endDate.toISOString()
        }
    }).lean();

    // Categorize treatments
    let insulinOnly = 0;
    let carbsOnly = 0;
    let bothInsulinAndCarbs = 0;
    let neither = 0;

    let totalInsulin = 0;
    let totalCarbs = 0;

    for (const t of allTreatments) {
        const hasInsulin = t.insulin && t.insulin > 0;
        const hasCarbs = t.carbs && t.carbs > 0;

        if (hasInsulin && hasCarbs) {
            bothInsulinAndCarbs++;
            totalInsulin += t.insulin;
            totalCarbs += t.carbs;
        } else if (hasInsulin) {
            insulinOnly++;
            totalInsulin += t.insulin;
        } else if (hasCarbs) {
            carbsOnly++;
            totalCarbs += t.carbs;
        } else {
            neither++;
        }
    }

    console.log('📊 Treatment Entry Patterns:\n');
    console.log(`Total treatments: ${allTreatments.length}`);
    console.log(`  Insulin + Carbs (same entry): ${bothInsulinAndCarbs}`);
    console.log(`  Insulin only: ${insulinOnly}`);
    console.log(`  Carbs only: ${carbsOnly}`);
    console.log(`  Neither: ${neither}\n`);

    console.log('💉 Total Insulin: ' + totalInsulin.toFixed(1) + ' U');
    console.log('🍽️  Total Carbs: ' + totalCarbs.toFixed(1) + ' g\n');

    console.log('❗ Problem Identified:\n');
    console.log('Current logic marks has_meals=true ONLY when:');
    console.log('  - Single treatment has BOTH insulin AND carbs\n');
    console.log(`In your data:`);
    console.log(`  ✅ Would detect: ${bothInsulinAndCarbs} meal windows`);
    console.log(`  ❌ Would miss: ${carbsOnly} carb-only entries\n`);

    if (carbsOnly > 0) {
        console.log('💡 Solution:');
        console.log('  Change has_meals detection to trigger on ANY carb entry,');
        console.log('  regardless of whether insulin is in the same treatment.\n');
    }

    // Show some examples
    console.log('📝 Sample Entries:\n');

    const combined = allTreatments.filter(t => t.insulin > 0 && t.carbs > 0).slice(0, 3);
    if (combined.length > 0) {
        console.log('Combined Insulin + Carbs:');
        for (const t of combined) {
            console.log(`  ${new Date(t.created_at).toLocaleString()}: ${t.insulin}U + ${t.carbs}g`);
        }
        console.log();
    }

    const carbOnly = allTreatments.filter(t => !t.insulin && t.carbs > 0).slice(0, 3);
    if (carbOnly.length > 0) {
        console.log('Carbs Only:');
        for (const t of carbOnly) {
            console.log(`  ${new Date(t.created_at).toLocaleString()}: ${t.carbs}g`);
        }
        console.log();
    }

    process.exit(0);
}

main().catch(console.error);
