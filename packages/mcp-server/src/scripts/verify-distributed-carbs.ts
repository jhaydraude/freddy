import { calculateCOB } from '../lib/cob-logic.js';

async function testDistributedCarbs() {
    console.log('--- TESTING DISTRIBUTED CARBS (15g over 60min) ---');

    const startTime = new Date('2025-12-29T12:00:00Z');
    const treatments = [
        {
            _id: 'test-event-1',
            carbs: 15,
            duration: 60 * 60 * 1000, // 60 minutes
            created_at: startTime.toISOString(),
            eventType: 'Meal Bolus'
        }
    ];

    // ISF=50, CR=10 => 5 mg/dL per gram rise
    const isf = 50;
    const cr = 10;
    const absorptionRate = 0.5; // 30g/hr = 0.125g/5min per packet??
    // Actually, absorptionRate in calculateCOB is g/5min. 
    // Default 30g/hr = 2.5g/5min.
    const rate = 2.5;

    const checkPoints = [
        { label: 'T=0 (Start)', offsetMin: 0 },
        { label: 'T=5 (1st packet start)', offsetMin: 5 },
        { label: 'T=30 (Midway logging)', offsetMin: 30 },
        { label: 'T=60 (All packets logged)', offsetMin: 60 },
        { label: 'T=90 (Absorption continue)', offsetMin: 90 },
        { label: 'T=180 (Fully absorbed)', offsetMin: 180 }
    ];

    for (const point of checkPoints) {
        const atTime = new Date(startTime.getTime() + point.offsetMin * 60 * 1000);
        const result = calculateCOB(treatments, atTime, isf, cr, rate);

        console.log(`\n[${point.label}] at ${atTime.toISOString()}:`);
        console.log(`  COB (Total): ${result.cob}g`);
        console.log(`  COB (Active): ${result.activeCOB}g`);
        console.log(`  COB (Pending): ${result.pendingCOB}g`);
        console.log(`  Glucose Impact (RISE): ${result.glucoseImpact} mg/dL per 5min`);
        console.log(`  Relevant Events: ${result.eventCount}`);
    }
}

testDistributedCarbs().catch(console.error);
