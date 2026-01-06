import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { ComputedStatus } from '@/lib/db/models';
import { getStatus } from '@/lib/logic/status-logic';
import { floorToInterval } from '@/lib/logic/cache-utils';

export async function POST(request: Request) {
    try {
        await connectToDatabase();

        const body = await request.json();
        const { startTime, endTime, bucketSize = 5, includeAttribution = true } = body;

        if (!startTime) {
            return NextResponse.json(
                { error: 'startTime is required' },
                { status: 400 }
            );
        }

        const start = new Date(startTime);
        const end = endTime ? new Date(endTime) : new Date();
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
                await getStatus(timestamp, true, includeAttribution);
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
