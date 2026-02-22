import { NextRequest, NextResponse } from 'next/server';
import { mealActivityTuningService } from '../../../../lib/services/meal-activity-tuning';
import { MealActivityTuning } from '../../../../lib/db/models/meal-activity-tuning';
import { connectToDatabase } from '../../../../lib/db/connection';

/**
 * Trigger a new Meal & Activity tuning run.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            analysis_period_days,
            window_hours,
            include_activity,
            min_windows_required,
            baseline_tuning_id
        } = body;

        const tuning_id = await mealActivityTuningService.startTuning({
            analysis_period_days,
            window_hours,
            include_activity,
            min_windows_required,
            baseline_tuning_id,
            mode: 'meal'
        });

        return NextResponse.json({ tuning_id });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * List all meal and activity tuning runs.
 */
export async function GET() {
    try {
        await connectToDatabase();
        const runs = await MealActivityTuning.find({ mode: 'meal' })
            .sort({ created_at: -1 })
            .limit(20)
            .lean();

        return NextResponse.json({ history: runs });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
