import { NextResponse } from 'next/server';
import { getAnalysisData } from '@/lib/server-actions';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp');

    if (!timestamp) {
        return NextResponse.json({ error: 'Timestamp is required' }, { status: 400 });
    }

    try {
        const data = await getAnalysisData(timestamp);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching analysis data:', error);
        return NextResponse.json({ error: 'Failed to fetch analysis data' }, { status: 500 });
    }
}
