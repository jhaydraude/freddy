import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { getIOB } from '@/lib/logic/iob-logic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp') || new Date().toISOString();
    const includeTimeseries = searchParams.get('includeTimeseries') !== 'false';

    try {
        await connectToDatabase();
        const data = await getIOB(timestamp, includeTimeseries);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in /api/iob:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
