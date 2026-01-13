import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { SituationWindow } from '@/lib/db/models';

export async function POST() {
    try {
        await connectToDatabase();

        // Delete all windows with 'pending' status
        const result = await SituationWindow.deleteMany({ status: 'pending' });

        return NextResponse.json({
            success: true,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Failed to clear queue:', error);
        return NextResponse.json({ error: 'Failed to clear queue' }, { status: 500 });
    }
}
