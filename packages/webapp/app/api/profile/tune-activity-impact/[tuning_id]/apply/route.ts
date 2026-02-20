import { NextRequest, NextResponse } from 'next/server';
import { activityImpactTuningService } from '@/lib/services/activity-impact-tuning';
import { connectToDatabase } from '@/lib/db/connection';

/**
 * POST /api/profile/tune-activity-impact/[tuning_id]/apply
 * Apply the optimized activity coefficients to system_config
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    try {
        await connectToDatabase();
        const { tuning_id } = await params;
        await activityImpactTuningService.applyTuning(tuning_id);
        return NextResponse.json({ success: true, message: 'Activity coefficients applied successfully' });
    } catch (error: any) {
        console.error('Error applying activity tuning:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to apply tuning' },
            { status: 500 }
        );
    }
}
