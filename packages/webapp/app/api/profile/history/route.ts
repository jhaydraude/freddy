import { NextResponse } from 'next/server';
import { getProfileAnalysisHistory } from '@/lib/server-actions';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    try {
        const history = await getProfileAnalysisHistory(limit);
        return NextResponse.json(history);
    } catch (error: any) {
        console.error('Error in /api/profile/history:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
