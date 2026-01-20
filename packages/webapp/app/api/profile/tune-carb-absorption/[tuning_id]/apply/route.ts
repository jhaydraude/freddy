import { NextRequest, NextResponse } from 'next/server';
import { carbAbsorptionTuningService } from '../../../../../../lib/services/carb-absorption-tuning';
import { connectToDatabase } from '../../../../../../lib/db/connection';

/**
 * POST /api/profile/tune-carb-absorption/[tuning_id]/apply
 * Applies the results of a carb absorption tuning run
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
        await carbAbsorptionTuningService.applyTuning(tuning_id, options);

        return NextResponse.json({
            success: true,
            applied_at: new Date(),
            message: 'Carb absorption parameters updated successfully'
        });
    } catch (error: any) {
        console.error(`Error applying carb tuning ${tuning_id}:`, error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
