import { NextRequest, NextResponse } from 'next/server';
import { UnifiedFoundationTuning } from '@/lib/db/models/unified-foundation-tuning';
import { connectToDatabase } from '@/lib/db/connection';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    const { tuning_id } = await params;
    try {
        await connectToDatabase();
        const tuning = await UnifiedFoundationTuning.findOne({ tuning_id });
        if (!tuning) {
            return NextResponse.json({ error: 'Tuning not found' }, { status: 404 });
        }
        return NextResponse.json(tuning);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ tuning_id: string }> }
) {
    const { tuning_id } = await params;
    try {
        await connectToDatabase();
        await UnifiedFoundationTuning.deleteOne({ tuning_id });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
