import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { Entry, UserPreference } from '@/lib/db/models';
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

        return NextResponse.json({
            ...stats,
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
