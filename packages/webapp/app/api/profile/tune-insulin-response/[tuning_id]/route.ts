import { NextRequest, NextResponse } from 'next/server';
import { insulinResponseTuningService } from '@/lib/services/insulin-response-tuning';
import { connectToDatabase } from '@/lib/db/connection';

/**
 * GET /api/profile/tune-insulin-response/[tuning_id]
 * Get status and results of a specific tuning run
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    try {
        await connectToDatabase();
        const { tuning_id } = await params;

        const result = await insulinResponseTuningService.getTuningStatus(tuning_id);

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Error fetching tuning status:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch tuning status' },
            { status: 404 }
        );
    }
}
