import { NextResponse } from 'next/server';
import { generateProfileTrainingData } from '@/lib/server-actions';

export async function POST(request: Request) {
    try {
        const options = await request.json();
        const result = await generateProfileTrainingData(options);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error in /api/training/profile:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
