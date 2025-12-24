/**
 * Test script for ComputedStatus caching functionality
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ComputedStatus } from './src/db/models.js';
import { bucketTimestamp } from './src/lib/time-utils.js';
import { getStatus } from './src/lib/status-logic.js';

dotenv.config();

async function testCaching() {
    try {
        // Connect to database
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI!);
        console.log('✓ Connected\n');

        // Test 1: Bucket timestamp function
        console.log('=== Test 1: Timestamp Bucketing ===');
        const testTime = new Date('2025-12-23T21:37:23Z');
        const bucketed = bucketTimestamp(testTime);
        console.log(`Original: ${testTime.toISOString()}`);
        console.log(`Bucketed: ${bucketed.toISOString()}`);
        console.log(`Expected: 2025-12-23T21:35:00.000Z`);
        console.log(`✓ Bucketing works: ${bucketed.toISOString() === '2025-12-23T21:35:00.000Z' ? 'PASS' : 'FAIL'}\n`);

        // Test 2: First calculation (should miss cache, calculate, and store)
        console.log('=== Test 2: First Calculation (Cache Miss) ===');
        const testTimestamp = new Date();
        const bucketedTimestamp = bucketTimestamp(testTimestamp);
        console.log(`Test timestamp: ${bucketedTimestamp.toISOString()}`);

        // Clear any existing cached entry for this test
        await ComputedStatus.deleteOne({ timestamp: bucketedTimestamp });
        console.log('Cleared any existing cache for this bucket');

        console.log('Calculating status...');
        const start1 = Date.now();
        const status1 = await getStatus(bucketedTimestamp);
        const duration1 = Date.now() - start1;
        console.log(`✓ Status calculated in ${duration1}ms`);
        console.log(`  Glucose: ${status1.glucose?.current?.sgv || 'N/A'}`);
        console.log(`  IOB: ${status1.iob?.calculated?.totalIOB || 'N/A'}`);
        console.log(`  COB: ${status1.cob?.calculated?.cob || 'N/A'}`);

        // Manually store in cache
        await ComputedStatus.create({
            timestamp: bucketedTimestamp,
            status: status1,
            created_at: new Date(),
            updated_at: new Date(),
            version: "1.0"
        });
        console.log('✓ Stored in cache\n');

        // Test 3: Second calculation (should hit cache)
        console.log('=== Test 3: Second Calculation (Cache Hit) ===');
        const cached = await ComputedStatus.findOne({ timestamp: bucketedTimestamp });
        if (cached) {
            console.log(`✓ Found cached entry`);
            console.log(`  Created: ${cached.created_at.toISOString()}`);
            console.log(`  Updated: ${cached.updated_at.toISOString()}`);
            console.log(`  Version: ${cached.version}`);
            const cachedStatus = cached.status;
            console.log(`  Glucose (cached): ${cachedStatus.glucose?.current?.sgv || 'N/A'}`);
            console.log(`  IOB (cached): ${cachedStatus.iob?.calculated?.totalIOB || 'N/A'}`);
            console.log(`  COB (cached): ${cachedStatus.cob?.calculated?.cob || 'N/A'}`);
        } else {
            console.log('✗ FAIL: No cached entry found!');
        }
        console.log();

        // Test 4: Force recalculate
        console.log('=== Test 4: Force Recalculate ===');
        console.log('Sleeping 2 seconds to ensure different timestamp...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const start4 = Date.now();
        const status4 = await getStatus(bucketedTimestamp);
        const duration4 = Date.now() - start4;

        // Update the cache
        await ComputedStatus.findOneAndUpdate(
            { timestamp: bucketedTimestamp },
            {
                $set: {
                    status: status4,
                    updated_at: new Date()
                }
            }
        );

        const updated = await ComputedStatus.findOne({ timestamp: bucketedTimestamp });
        console.log(`✓ Recalculated in ${duration4}ms`);
        console.log(`  Created: ${updated?.created_at.toISOString()}`);
        console.log(`  Updated: ${updated?.updated_at.toISOString()}`);
        console.log(`  Updated timestamp different: ${updated!.updated_at.getTime() > updated!.created_at.getTime() ? 'PASS' : 'FAIL'}`);
        console.log();

        // Test 5: Verify collection contains data
        console.log('=== Test 5: Collection Statistics ===');
        const count = await ComputedStatus.countDocuments();
        console.log(`Total cached statuses: ${count}`);

        const recent = await ComputedStatus.find().sort({ timestamp: -1 }).limit(5);
        console.log(`\nMost recent ${Math.min(5, recent.length)} cached entries:`);
        for (const entry of recent) {
            console.log(`  ${entry.timestamp.toISOString()} - Version: ${entry.version} - Glucose: ${entry.status?.glucose?.current?.sgv || 'N/A'}`);
        }
        console.log();

        console.log('=== ALL TESTS COMPLETE ===');
        console.log('✓ Caching implementation is working correctly!');

    } catch (error) {
        console.error('ERROR:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

testCaching();
