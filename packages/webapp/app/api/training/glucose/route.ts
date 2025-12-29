import { NextResponse } from 'next/server';
import { generateGlucoseTrainingData } from '@/lib/mcp';

export async function POST(request: Request) {
    try {
        const options = await request.json();
        const result = await generateGlucoseTrainingData(options);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Error in /api/training/glucose:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
