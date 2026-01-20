import { NextRequest, NextResponse } from 'next/server';
import { insulinResponseTuningService } from '@/lib/services/insulin-response-tuning';
import { connectToDatabase } from '@/lib/db/connection';

/**
 * POST /api/profile/tune-insulin-response
 * Start a new insulin response tuning run
 */
export async function POST(request: NextRequest) {
    try {
        await connectToDatabase();
        const body = await request.json();

        const config = {
            analysis_period_days: body.analysis_period_days,
            window_hours: body.window_hours,
            include_activity: body.include_activity
        };

        const tuning_id = await insulinResponseTuningService.startTuning(config);

        return NextResponse.json({
            tuning_id,
            status: 'running',
            estimated_duration_seconds: 45
        });

    } catch (error: any) {
        console.error('Error starting insulin response tuning:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to start tuning' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/profile/tune-insulin-response/history
 * Get tuning history
 */
export async function GET(request: NextRequest) {
    try {
        await connectToDatabase();
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '10');

        const history = await insulinResponseTuningService.getTuningHistory('default', limit);

        return NextResponse.json({ history });

    } catch (error: any) {
        console.error('Error fetching tuning history:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch history' },
            { status: 500 }
        );
    }
}
