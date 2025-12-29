import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { getCOB } from '@/lib/logic/cob-logic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp') || new Date().toISOString();
    const includeTimeseries = searchParams.get('includeTimeseries') !== 'false';

    try {
        await connectToDatabase();
        const data = await getCOB(timestamp, includeTimeseries);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in /api/cob:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
