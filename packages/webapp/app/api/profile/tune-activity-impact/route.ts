import { NextRequest, NextResponse } from 'next/server';
import { activityImpactTuningService } from '@/lib/services/activity-impact-tuning';
import { connectToDatabase } from '@/lib/db/connection';
import { ActivityImpactTuning } from '@/lib/db/models/activity-impact-tuning';

/**
 * POST /api/profile/tune-activity-impact
 * Start a new activity impact tuning run
 */
export async function POST(request: NextRequest) {
    try {
        await connectToDatabase();
        const body = await request.json();

        const tuning_id = await activityImpactTuningService.startTuning({
            analysis_period_days: body.analysis_period_days,
            window_hours: body.window_hours
        });

        return NextResponse.json({
            tuning_id,
            status: 'running',
            estimated_duration_seconds: 45
        });
    } catch (error: any) {
        console.error('Error starting activity impact tuning:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to start tuning' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/profile/tune-activity-impact
 * Get activity tuning history
 */
export async function GET(request: NextRequest) {
    try {
        await connectToDatabase();
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '10');

        const history = await activityImpactTuningService.getTuningHistory('default', limit);
        return NextResponse.json({ history });
    } catch (error: any) {
        console.error('Error fetching activity tuning history:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch history' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/profile/tune-activity-impact
 * Deletes all activity impact tuning records
 */
export async function DELETE() {
    try {
        await connectToDatabase();
        const result = await ActivityImpactTuning.deleteMany({});
        return NextResponse.json({ deleted: result.deletedCount });
    } catch (error: any) {
        console.error('Error deleting activity impact tuning history:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
