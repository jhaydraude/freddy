import { NextResponse } from 'next/server';
import { runProfileAnalysis } from '@/lib/server-actions';

export async function POST(request: Request) {
    try {
        const options = await request.json();
        const result = await runProfileAnalysis(options);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error in /api/profile/analyze:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
