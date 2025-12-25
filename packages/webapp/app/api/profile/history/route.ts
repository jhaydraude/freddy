import { NextResponse } from 'next/server';
import { getProfileAnalysisHistory } from '@/lib/mcp';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    try {
        const history = await getProfileAnalysisHistory(limit);
        return NextResponse.json(history);
    } catch (error) {
        console.error('Error fetching profile analysis history:', error);
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }
}
