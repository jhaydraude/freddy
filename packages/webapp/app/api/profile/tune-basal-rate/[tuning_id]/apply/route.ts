import { NextRequest, NextResponse } from 'next/server';
import { basalRateTuningService } from '../../../../../../lib/services/basal-rate-tuning';
import { connectToDatabase } from '../../../../../../lib/db/connection';

/**
 * POST /api/profile/tune-basal-rate/[tuning_id]/apply
 * Applies the results of a basal rate tuning run
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    const { tuning_id } = await params;

    try {
        await connectToDatabase();
        if (!tuning_id) {
            return NextResponse.json({ error: 'Tuning ID is required' }, { status: 400 });
        }

        const options = await req.json();
        await basalRateTuningService.applyTuning(tuning_id, options);

        return NextResponse.json({
            success: true,
            applied_at: new Date(),
            message: 'Basal parameters updated successfully'
        });
    } catch (error: any) {
        console.error(`Error applying basal tuning ${tuning_id}:`, error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
