import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { populateClassificationQueue } from '@/lib/logic/classification-queue';

export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '3');

        await connectToDatabase();
        const addedCount = await populateClassificationQueue(days);

        return NextResponse.json({ success: true, addedCount });
    } catch (error) {
        console.error('Failed to generate queue:', error);
        return NextResponse.json({ error: 'Failed to generate queue' }, { status: 500 });
    }
}
