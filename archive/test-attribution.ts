/**
 * Test glucose change attribution functionality
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ComputedStatus } from './src/db/models.js';

dotenv.config();

async function testAttribution() {
    await mongoose.connect(process.env.MONGO_URI!);

    console.log('\n=== Testing Glucose Change Attribution ===\n');

    // Clean up any existing test data
    const testTime = new Date();
    const testBucket = new Date(Math.floor(testTime.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000));
    await ComputedStatus.deleteOne({ timestamp: testBucket });
    console.log(`Test bucket: ${testBucket.toISOString()}\n`);

    // Test 1: Get status WITHOUT attribution (should be fast)
    console.log('Test 1: Status WITHOUT attribution');
    const start1 = Date.now();

    // Simulate MCP tool call
    const statusTool = await import('./src/tools/get-status.js');
    const result1 = await statusTool.handler({
        timestamp: testTime.toISOString(),
        includeAttribution: false
    });

    const duration1 = Date.now() - start1;
    const status1 = JSON.parse(result1.content[0].text);

    console.log(`✓ Duration: ${duration1}ms`);
    console.log(`✓ Glucose: ${status1.glucose?.current?.sgv || 'N/A'} mg/dL`);
    console.log(`✓ IOB: ${status1.iob?.calculated?.totalIOB || 'N/A'} U`);
    console.log(`✓ COB: ${status1.cob?.calculated?.cob || 'N/A'} g`);
    console.log(`✓ Has attribution: ${status1.attribution ? 'YES (unexpected!)' : 'NO (expected)'}`);
    console.log(`✓ Has IOB timeseries: ${status1.iob?.timeseries ? 'YES (unexpected!)' : 'NO (expected)'}`);
    console.log();

    // Test 2: Get status WITH attribution (first time - will calculate)
    console.log('Test 2: Status WITH attribution (calculating)');
    await ComputedStatus.deleteOne({ timestamp: testBucket }); // Clear cache
    const start2 = Date.now();

    const result2 = await statusTool.handler({
        timestamp: testTime.toISOString(),
        includeAttribution: true
    });

    const duration2 = Date.now() - start2;
    const status2 = JSON.parse(result2.content[0].text);

    console.log(`✓ Duration: ${duration2}ms`);
    console.log(`✓ Has attribution: ${status2.attribution ? 'YES (expected)' : 'NO (unexpected!)'}`);
    console.log(`✓ Has IOB timeseries: ${status2.iob?.timeseries ? 'YES (expected)' : 'NO (unexpected!)'}`);
    console.log(`✓ Has COB timeseries: ${status2.cob?.timeseries ? 'YES (expected)' : 'NO (unexpected!)'}`);

    if (status2.attribution) {
        console.log('\n  Attribution breakdown:');
        for (const [timeframe, data] of Object.entries(status2.attribution)) {
            if (!data) continue;
            const attr = data as any;
            console.log(`\n  ${timeframe}:`);
            console.log(`    Actual change: ${attr.glucoseChange?.actual || 0} mg/dL`);
            console.log(`    Predicted: ${attr.glucoseChange?.predicted || 0} mg/dL`);
            console.log(`    Components:`);
            console.log(`      Insulin: ${attr.components?.insulin?.value || 0} mg/dL (${attr.components?.insulin?.activity || 0} U)`);
            console.log(`      Carbs: ${attr.components?.carbs?.value || 0} mg/dL (${attr.components?.carbs?.absorption || 0} g)`);
            console.log(`      Basal: ${attr.components?.basal?.value || 0} mg/dL`);
            console.log(`      Unexplained: ${attr.components?.unexplained || 0} mg/dL`);
        }
    }
    console.log();

    // Test 3: Get status WITH attribution (cached - should be fast)
    console.log('Test 3: Status WITH attribution (from cache)');
    const start3 = Date.now();

    const result3 = await statusTool.handler({
        timestamp: testTime.toISOString(),
        includeAttribution: true
    });

    const duration3 = Date.now() - start3;
    const status3 = JSON.parse(result3.content[0].text);

    console.log(`✓ Duration: ${duration3}ms (should be much faster than Test 2)`);
    console.log(`✓ Has attribution: ${status3.attribution ? 'YES (from cache)' : 'NO'}`);
    console.log(`✓ Speedup: ${Math.round(duration2 / duration3)}x faster`);
    console.log();

    // Test 4: Verify cache contains attribution
    console.log('Test 4: Verify cache structure');
    const cached = await ComputedStatus.findOne({ timestamp: testBucket });
    if (cached) {
        console.log(`✓ Cache entry found`);
        console.log(`✓ Has status: ${cached.status ? 'YES' : 'NO'}`);
        console.log(`✓ Has attribution: ${cached.attribution ? 'YES' : 'NO'}`);
        console.log(`✓ Created: ${cached.created_at.toLocaleString()}`);
        console.log(`✓ Updated: ${cached.updated_at.toLocaleString()}`);
        console.log(`✓ Version: ${cached.version}`);
    } else {
        console.log('✗ Cache entry not found!');
    }
    console.log();

    console.log('=== All Attribution Tests Complete ===\n');

    await mongoose.disconnect();
}

testAttribution().catch(console.error);
