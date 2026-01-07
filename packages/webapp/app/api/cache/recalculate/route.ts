import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { ComputedStatus } from '@/lib/db/models';
import { getStatus } from '@/lib/logic/status-logic';
import { floorToInterval } from '@/lib/logic/cache-utils';

export async function POST(request: Request) {
    try {
        await connectToDatabase();

        const body = await request.json();
        const { hoursBack = 4, endTime, bucketSize = 5, includeAttribution = true } = body;

        const end = endTime ? new Date(endTime) : new Date();
        const start = new Date(end.getTime() - (hoursBack * 60 * 60 * 1000));

        const bucketMs = bucketSize * 60 * 1000;

        // Generate timestamps for all buckets
        const timestamps: Date[] = [];
        for (let ts = start.getTime(); ts <= end.getTime(); ts += bucketMs) {
            timestamps.push(floorToInterval(new Date(ts), bucketSize));
        }

        // Delete existing cached statuses in this range
        await ComputedStatus.deleteMany({
            timestamp: {
                $gte: start,
                $lte: end
            }
        });

        // Recalculate all statuses
        const results = [];
        let calculated = 0;
        let failed = 0;

        for (const timestamp of timestamps) {
            try {
                // Force recalculation by calling getStatus
                // The write-through cache will save it automatically
                // We pass bypassCache=true to ensure we don't hit the cache we might have just deleted 
                // (though deleteMany should handle it, bypassCache is safer for recalculation)
                await getStatus(timestamp, true, includeAttribution, true);
                calculated++;
            } catch (error) {
                console.error(`Failed to calculate status for ${timestamp.toISOString()}:`, error);
                failed++;
            }
        }

        return NextResponse.json({
            success: true,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            hoursBack,
            bucketSize,
            totalBuckets: timestamps.length,
            calculated,
            failed,
            message: `Recalculated ${calculated} statuses (${failed} failed)`
        });

    } catch (error: any) {
        console.error('Error recalculating statuses:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to recalculate statuses' },
            { status: 500 }
        );
    }
}
