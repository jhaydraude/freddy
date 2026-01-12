import { NextResponse } from 'next/server';
import { runISFEstimation } from '@/lib/server-actions';

export async function POST(request: Request) {
    try {
        const options = await request.json();
        const result = await runISFEstimation(options);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error in /api/profile/estimate-isf:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
