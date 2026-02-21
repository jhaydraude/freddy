import { NextRequest, NextResponse } from 'next/server';
import { MealActivityTuning } from '../../../../../lib/db/models/meal-activity-tuning';
import { connectToDatabase } from '../../../../../lib/db/connection';

/**
 * Get the status and results of a specific meal tuning run.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    const { tuning_id } = await params;
    try {
        await connectToDatabase();
        const tuning = await MealActivityTuning.findOne({ tuning_id }).lean();

        if (!tuning) {
            return NextResponse.json({ error: 'Tuning run not found' }, { status: 404 });
        }

        return NextResponse.json(tuning);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * Delete a meal tuning run.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    const { tuning_id } = await params;
    try {
        await connectToDatabase();
        const result = await MealActivityTuning.deleteOne({ tuning_id });

        if (result.deletedCount === 0) {
            return NextResponse.json({ error: 'Tuning run not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
