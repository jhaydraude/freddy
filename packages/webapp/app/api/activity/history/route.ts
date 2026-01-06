import { NextResponse } from 'next/server';
import { getActivityHistory } from '@/lib/logic/activity-logic';
import { connectToDatabase } from '@/lib/db/connection';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const startTimeStr = searchParams.get('startTime');
    const windowSize = parseInt(searchParams.get('windowSize') || '60', 10);

    const end = startTimeStr ? new Date(startTimeStr) : new Date();
    const start = new Date(end.getTime() - windowSize * 60 * 1000);

    try {
        await connectToDatabase();
        const history = await getActivityHistory(start, end);
        return NextResponse.json(JSON.parse(JSON.stringify(history)));
    } catch (error) {
        console.error('Error fetching activity history:', error);
        return NextResponse.json({ error: 'Failed to fetch activity history' }, { status: 500 });
    }
}
