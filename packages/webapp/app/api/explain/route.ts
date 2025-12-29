import { NextResponse } from 'next/server';
import { getExplanation } from '@/lib/mcp';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp') || new Date().toISOString();

    try {
        const explanation = await getExplanation(timestamp);
        return NextResponse.json({ explanation });
    } catch (error) {
        console.error('Error fetching explanation:', error);
        return NextResponse.json({ error: 'Failed to fetch explanation' }, { status: 500 });
    }
}
