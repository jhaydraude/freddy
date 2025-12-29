import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { getGlucose } from '@/lib/logic/status-logic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const count = parseInt(searchParams.get('count') || '1');

    try {
        await connectToDatabase();
        const data = await getGlucose({ count });
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error in /api/glucose:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
