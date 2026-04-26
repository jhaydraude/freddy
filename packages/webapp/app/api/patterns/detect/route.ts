import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { detectRecurringPatterns } from '@/lib/logic/pattern-detector';

export async function POST(req: NextRequest) {
    try {
        await connectToDatabase();

        const url = new URL(req.url);
        const lookback = parseInt(url.searchParams.get('lookback_days') || '14', 10);

        if (isNaN(lookback) || lookback <= 0 || lookback > 90) {
            return NextResponse.json({ error: 'Invalid lookback_days parameter (must be 1-90)' }, { status: 400 });
        }

        console.error(`[api/patterns/detect] Triggering pattern scan for last ${lookback} days...`);
        const result = await detectRecurringPatterns(lookback);

        return NextResponse.json(result);

    } catch (err: any) {
        console.error('[api/patterns/detect] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
