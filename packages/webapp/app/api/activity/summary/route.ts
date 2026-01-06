import { NextResponse } from 'next/server';
import { getActivitySummary } from '@/lib/logic/activity-logic';
import { connectToDatabase } from '@/lib/db/connection';

export async function GET() {
    try {
        await connectToDatabase();
        const summary = await getActivitySummary();
        return NextResponse.json(JSON.parse(JSON.stringify(summary)));
    } catch (error) {
        console.error('Error fetching activity summary:', error);
        return NextResponse.json({ error: 'Failed to fetch activity summary' }, { status: 500 });
    }
}
