import { NextResponse } from 'next/server';
import { runProfileAnalysis } from '@/lib/mcp';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { endDate, daysBack, windowHours } = body;

        const result = await runProfileAnalysis({
            endDate,
            daysBack: daysBack || 30,
            windowHours: windowHours || 2
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error running profile analysis:', error);
        return NextResponse.json({ error: 'Failed to run analysis' }, { status: 500 });
    }
}
