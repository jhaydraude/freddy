import { NextRequest, NextResponse } from 'next/server';
import { carbAbsorptionTuningService } from '../../../../../lib/services/carb-absorption-tuning';
import { connectToDatabase } from '../../../../../lib/db/connection';

/**
 * GET /api/profile/tune-carb-absorption/[tuning_id]
 * Gets the status and results of a carb absorption tuning run
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

        const status = await carbAbsorptionTuningService.getTuningStatus(tuning_id);
        return NextResponse.json(status);
    } catch (error: any) {
        console.error(`Error fetching carb tuning status for ${tuning_id}:`, error);
        return NextResponse.json(
            { error: error.message },
            { status: 404 }
        );
    }
}
