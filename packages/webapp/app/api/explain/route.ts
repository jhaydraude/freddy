import { NextResponse } from 'next/server';
import { getExplanation } from '@/lib/server-actions';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const timestamp = searchParams.get('timestamp') || new Date().toISOString();

    try {
        const explanation = await getExplanation(timestamp);
        return NextResponse.json({ explanation });
    } catch (error: any) {
        console.error('Error in /api/explain:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
