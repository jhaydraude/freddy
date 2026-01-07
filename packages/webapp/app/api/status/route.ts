import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { getStatus } from '@/lib/logic/status-logic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp') || new Date().toISOString();
    const includeTimeseries = searchParams.get('includeTimeseries') !== 'false';
    const bypassCache = searchParams.get('bypassCache') === 'true';

    try {
        await connectToDatabase();
        const data = await getStatus(timestamp, includeTimeseries, true, bypassCache);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in /api/status:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
