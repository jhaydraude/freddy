import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { SituationTag } from '@/lib/db/models';

export async function GET() {
    try {
        await connectToDatabase();
        const tags = await SituationTag.find({ is_active: true }).sort({ category: 1, display_name: 1 });
        return NextResponse.json(tags);
    } catch (error) {
        console.error('Failed to fetch tags:', error);
        return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
    }
}
