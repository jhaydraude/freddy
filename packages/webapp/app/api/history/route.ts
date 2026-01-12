import { NextResponse } from 'next/server';
import { getMcpHistory } from '@/lib/server-actions';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const startTime = searchParams.get('startTime') || new Date().toISOString();
    const windowSize = parseInt(searchParams.get('windowSize') || '60', 10);
    const bucketSize = parseInt(searchParams.get('bucketSize') || '5', 10);

    try {
        const data = await getMcpHistory({
            startTime,
            windowSize,
            bucketSize
        });

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching history:', error);
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }
}
