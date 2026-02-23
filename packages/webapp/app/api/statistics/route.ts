import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { Entry, UserPreference, Treatment } from '@/lib/db/models';
import { calculateStatistics } from '@/lib/logic/statistics-logic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    if (!startDateStr || !endDateStr) {
        return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    try {
        await connectToDatabase();

        // Fetch user preferences directly from DB
        const userPrefs = await UserPreference.find({ userId: 'default' }).lean();
        const preferences: Record<string, any> = {};
        userPrefs.forEach((p: any) => {
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
        const readings = entries.map((e: any) => ({
            timestamp: e.date,
            sgv: e.sgv,
            dateString: e.dateString
        }));

        const stats = calculateStatistics(readings, lowThreshold, highThreshold, units);

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
                { type: "SMB" }
            ]
        }).lean();

        // Separate boluses. For basals we should ideally calculate the area under the curve 
        // using basal logic. For simplicity, we can get the getBasalIOB for daily chunks 
        // or rely on a daily basal approximate using getBasalIOB or just treat it as boluses are enough?
        // Wait, TDD requires basal. The calculation here is easier if we calculate basal delivery 
        // for each day. We can use createBasalCurvesForTimeseries to get delivered curves and sum them up?
        // Or we can just calculate scheduled basal if there is no temp basal history.
        // Let's import createBasalCurvesForTimeseries
        const { createBasalCurvesForTimeseries } = await import('@/lib/logic/iob-basal');
        const { resolveActiveProfile } = await import('@/lib/logic/profile-logic');

        const profileInfo = await resolveActiveProfile(endDateStr);
        // Let's just create curves and sum the delivered basal for the whole period to get total and hourly?
        // Wait, creating curves for potentially 90 days is 90 * 24 * 12 = 25000 intervals. That's fast enough 
        // and we can sum them up per day.

        const { deliveredCurves } = await createBasalCurvesForTimeseries(
            startDate,
            endDate,
            4, // default dia
            45, // default peak
            profileInfo
        );

        // Convert delivered Curves to simple basal records to pass to calculateTDDStatistics
        const basals = deliveredCurves.map((c: any) => ({
            timestamp: new Date(c.time).getTime(),
            insulin: c.amount
        }));

        const { calculateTDDStatistics } = await import('@/lib/logic/statistics-logic');
        const tddStats = calculateTDDStatistics(treatments, basals);

        return NextResponse.json({
            ...stats,
            tdd: tddStats,
            meta: {
                startDate: startDateStr,
                endDate: endDateStr,
                units
            }
        });
    } catch (error: any) {

        console.error('Error in /api/statistics:', error);
        return NextResponse.json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}
