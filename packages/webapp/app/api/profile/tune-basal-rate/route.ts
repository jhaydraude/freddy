import { NextRequest, NextResponse } from 'next/server';
import { basalRateTuningService } from '../../../../lib/services/basal-rate-tuning';
import { connectToDatabase } from '../../../../lib/db/connection';
import { BasalRateTuning } from '../../../../lib/db/models/basal-rate-tuning';

/**
 * POST /api/profile/tune-basal-rate
 * Starts a new basal rate tuning run
 */
export async function POST(req: NextRequest) {
    try {
        await connectToDatabase();
        const config = await req.json();

        const tuningId = await basalRateTuningService.startTuning(config);

        return NextResponse.json({
            tuning_id: tuningId,
            status: 'running',
            estimated_duration_seconds: 45
        });
    } catch (error: any) {
        console.error('Error starting basal rate tuning:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

/**
 * GET /api/profile/tune-basal-rate
 * Fetches basal rate tuning history
 */
export async function GET(req: NextRequest) {
    try {
        await connectToDatabase();
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '10');

        const history = await BasalRateTuning.find({})
            .sort({ created_at: -1 })
            .limit(limit)
            .select('tuning_id created_at status optimized_values applied_at');

        return NextResponse.json({ history });
    } catch (error: any) {
        console.error('Error fetching basal rate tuning history:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/profile/tune-basal-rate
 * Deletes all basal rate tuning records
 */
export async function DELETE() {
    try {
        await connectToDatabase();
        const result = await BasalRateTuning.deleteMany({});
        return NextResponse.json({ deleted: result.deletedCount });
    } catch (error: any) {
        console.error('Error deleting basal rate tuning history:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
