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

        const { recalculateStatusRange } = await import('@/lib/logic/cache-logic');

        const end = endTime ? new Date(endTime) : new Date();
        const start = body.hoursBack !== undefined
            ? new Date(end.getTime() - (body.hoursBack * 60 * 60 * 1000))
            : (body.startTime ? new Date(body.startTime) : new Date(end.getTime() - (4 * 60 * 60 * 1000)));

        const { total, calculated, failed } = await recalculateStatusRange(
            start,
            end,
            bucketSize,
            includeAttribution
        );

        return NextResponse.json({
            success: true,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            hoursBack: body.hoursBack,
            bucketSize,
            totalBuckets: total,
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
