import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { Activity } from '@/lib/db/models';

export async function POST(request: Request) {
    try {
        await connectToDatabase();
        const body = await request.json();

        // Handle array or single object
        const activities = Array.isArray(body) ? body : [body];

        if (activities.length === 0) {
            return NextResponse.json({ error: 'No data provided' }, { status: 400 });
        }

        // Basic validation
        for (const act of activities) {
            if (!act.type || !act.timeStamp || !act.created_at) {
                return NextResponse.json({
                    error: 'Missing required fields: type, timeStamp, created_at'
                }, { status: 400 });
            }
        }

        const result = await Activity.insertMany(activities);
        return NextResponse.json({
            success: true,
            count: result.length,
            message: `Inserted ${result.length} activity documents`
        });

    } catch (error: any) {
        console.error('Error in POST /api/activity:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
