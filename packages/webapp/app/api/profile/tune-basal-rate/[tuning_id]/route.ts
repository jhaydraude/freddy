import { NextRequest, NextResponse } from 'next/server';
import { basalRateTuningService } from '../../../../../lib/services/basal-rate-tuning';
import { connectToDatabase } from '../../../../../lib/db/connection';
import { BasalRateTuning } from '../../../../../lib/db/models/basal-rate-tuning';

/**
 * GET /api/profile/tune-basal-rate/[tuning_id]
 * Gets the status and results of a basal rate tuning run
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    const { tuning_id } = await params;

    try {
        await connectToDatabase();
        if (!tuning_id) {
            return NextResponse.json({ error: 'Tuning ID is required' }, { status: 400 });
        }

        const status = await basalRateTuningService.getTuningStatus(tuning_id);
        return NextResponse.json(status);
    } catch (error: any) {
        console.error(`Error fetching basal tuning status for ${tuning_id}:`, error);
        return NextResponse.json(
            { error: error.message },
            { status: 404 }
        );
    }
}

/**
 * DELETE /api/profile/tune-basal-rate/[tuning_id]
 * Deletes a single basal rate tuning run
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    const { tuning_id } = await params;
    try {
        await connectToDatabase();
        const result = await BasalRateTuning.deleteOne({ tuning_id });
        if (result.deletedCount === 0) {
            return NextResponse.json({ error: 'Run not found' }, { status: 404 });
        }
        return NextResponse.json({ deleted: result.deletedCount });
    } catch (error: any) {
        console.error(`Error deleting basal tuning run ${tuning_id}:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
