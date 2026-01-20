import { NextRequest, NextResponse } from 'next/server';
import { carbAbsorptionTuningService } from '../../../../lib/services/carb-absorption-tuning';
import { connectToDatabase } from '../../../../lib/db/connection';
import { CarbAbsorptionTuning } from '../../../../lib/db/models/carb-absorption-tuning';

/**
 * POST /api/profile/tune-carb-absorption
 * Starts a new carb absorption tuning run
 */
export async function POST(req: NextRequest) {
    try {
        await connectToDatabase();
        const config = await req.json();

        const tuningId = await carbAbsorptionTuningService.startTuning(config);

        return NextResponse.json({
            tuning_id: tuningId,
            status: 'running',
            estimated_duration_seconds: 45
        });
    } catch (error: any) {
        console.error('Error starting carb absorption tuning:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

/**
 * GET /api/profile/tune-carb-absorption/history
 * Fetches carb absorption tuning history
 */
export async function GET(req: NextRequest) {
    try {
        await connectToDatabase();
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '10');

        // Use direct model query for history
        const history = await CarbAbsorptionTuning.find({})
            .sort({ created_at: -1 })
            .limit(limit)
            .select('tuning_id created_at status optimized_values applied_at');

        return NextResponse.json({ history });
    } catch (error: any) {
        console.error('Error fetching carb absorption tuning history:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
