import { NextResponse, NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { Entry, UserPreference, Treatment } from '@/lib/db/models';
import { calculateStatistics } from '@/lib/logic/statistics-logic';

export async function GET(request: NextRequest) {
    const startDateStr = request.nextUrl.searchParams.get('startDate');
    const endDateStr = request.nextUrl.searchParams.get('endDate');
    const timeZone = request.nextUrl.searchParams.get('timeZone') || 'UTC';

    if (!startDateStr || !endDateStr) {
        return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    try {
        await connectToDatabase();

        // Fetch user preferences directly from DB
        const userPrefs = await UserPreference.find({ userId: 'default' }).lean();
        const preferences: Record<string, string | number> = {};
        userPrefs.forEach((p: { key: string; value: string | number }) => {
            preferences[p.key] = p.value;
        });

        const lowThreshold = preferences.low_threshold || 70;
        const highThreshold = preferences.high_threshold || 180;
        const units = preferences.units || 'mg/dL';

        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        // Fetch glucose entries within range
        const entries = await Entry.find({
            date: {
                $gte: startDate.getTime(),
                $lte: endDate.getTime()
            },
            type: 'sgv'
        }).sort({ date: 1 }).lean();

        // Map to common format
        const readings = entries.map((e: { date: number; sgv: number; dateString: string }) => ({
            timestamp: e.date,
            sgv: e.sgv,
            dateString: e.dateString
        }));

        const stats = calculateStatistics(readings, lowThreshold, highThreshold, units, timeZone);

        // Fetch treatments for TDD
        const treatments = await Treatment.find({
            created_at: {
                $gte: startDate.toISOString(),
                $lte: endDate.toISOString()
            },
            $or: [
                { insulin: { $exists: true, $gt: 0 } },
                { eventType: "Correction Bolus" },
                { eventType: "Meal Bolus" },
                { type: "SMB" },
                { carbs: { $exists: true, $gt: 0 } }
            ]
        }).lean();

        // Separate boluses. For basals we should ideally calculate the area under the curve 
        // using basal logic. For simplicity, we can get the getBasalIOB for daily chunks 
        // or rely on a daily basal approximate using getBasalIOB or just treat it as boluses are enough?
        // Wait, TDD requires basal. The calculation here is easier if we calculate basal delivery 
        // for each day. We can use createBasalCurvesForTimeseries to get delivered curves and sum them up?
        // Or we can just calculate scheduled basal if there is no temp basal history.
        // Let's just create curves and sum the delivered basal for the whole period to get total and hourly?
        // Wait, creating curves for potentially 90 days is 90 * 24 * 12 = 25000 intervals. That's fast enough 
        // and we can sum them up per day.

        const { calculateBasalSummary } = await import('@/lib/logic/iob-basal');
        const basals = await calculateBasalSummary(startDate, endDate);

        const { calculateTDDStatistics, calculateActivityStatistics, calculateCarbStatistics } = await import('@/lib/logic/statistics-logic');
        const tddStats = calculateTDDStatistics(treatments, basals, timeZone);

        // Fetch activity data
        const activityEntries = await Entry.find({
            date: {
                $gte: startDate.getTime(),
                $lte: endDate.getTime()
            },
            type: 'activity',
            stale: { $ne: true }
        }).select('date timestamp created_at steps heartrate').lean();

        const rangeDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
        const activityStats = calculateActivityStatistics(activityEntries, rangeDays, timeZone);
        const carbStats = calculateCarbStatistics(treatments, rangeDays, timeZone);

        return NextResponse.json({
            ...stats,
            tdd: tddStats,
            activity: activityStats,
            carbs: carbStats,
            meta: {
                startDate: startDateStr,
                endDate: endDateStr,
                units
            }
        });
    } catch (error: unknown) {

        console.error('Error in /api/statistics:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : String(error),
            stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
        }, { status: 500 });
    }
}
