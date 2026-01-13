import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { getPendingQueue } from '@/lib/logic/classification-queue';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const limit = parseInt(searchParams.get('limit') || '100');

    try {
        await connectToDatabase();
        let data;
        if (status === 'labeled') {
            const { getLabeledSamples } = await import('@/lib/logic/classification-queue');
            data = await getLabeledSamples(limit);
        } else {
            data = await getPendingQueue(limit);
        }
        return NextResponse.json(data);
    } catch (error) {
        console.error('Failed to fetch classification queue:', error);
        return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 });
    }
}
