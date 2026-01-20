import { NextRequest, NextResponse } from 'next/server';
import { insulinResponseTuningService } from '@/lib/services/insulin-response-tuning';
import { connectToDatabase } from '@/lib/db/connection';

/**
 * POST /api/profile/tune-insulin-response/[tuning_id]/apply
 * Apply tuning results to profile and/or system
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    try {
        await connectToDatabase();
        const { tuning_id } = await params;
        const body = await request.json();

        const options = {
            apply_to_profile: body.apply_to_profile || false,
            apply_to_system: body.apply_to_system || false,
            selection: body.selection
        };

        await insulinResponseTuningService.applyTuning(tuning_id, options);

        return NextResponse.json({
            success: true,
            applied_at: new Date().toISOString(),
            message: 'Insulin response parameters updated successfully'
        });

    } catch (error: any) {
        console.error('Error applying tuning:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to apply tuning' },
            { status: 500 }
        );
    }
}
