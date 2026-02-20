import { NextRequest, NextResponse } from 'next/server';
import { activityImpactTuningService } from '@/lib/services/activity-impact-tuning';
import { connectToDatabase } from '@/lib/db/connection';
import { ActivityImpactTuning } from '@/lib/db/models/activity-impact-tuning';

/**
 * GET /api/profile/tune-activity-impact/[tuning_id]
 * Poll the status and results of a specific tuning run
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    try {
        await connectToDatabase();
        const { tuning_id } = await params;
        const result = await activityImpactTuningService.getTuningStatus(tuning_id);
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Tuning run not found' },
            { status: 404 }
        );
    }
}

/**
 * DELETE /api/profile/tune-activity-impact/[tuning_id]
 * Deletes a single activity impact tuning run
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    try {
        await connectToDatabase();
        const { tuning_id } = await params;
        const result = await ActivityImpactTuning.deleteOne({ tuning_id });
        if (result.deletedCount === 0) {
            return NextResponse.json({ error: 'Run not found' }, { status: 404 });
        }
        return NextResponse.json({ deleted: result.deletedCount });
    } catch (error: any) {
        console.error(`Error deleting activity tuning run:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
