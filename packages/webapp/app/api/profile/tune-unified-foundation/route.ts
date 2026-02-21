import { NextRequest, NextResponse } from 'next/server';
import { unifiedFoundationTuningService } from '@/lib/services/unified-foundation-tuning';
import { UnifiedFoundationTuning } from '@/lib/db/models/unified-foundation-tuning';
import { connectToDatabase } from '@/lib/db/connection';

/**
 * GET /api/profile/tune-unified-foundation
 * Gets history of unified foundation tuning runs
 */
export async function GET(req: NextRequest) {
    try {
        await connectToDatabase();
        const history = await UnifiedFoundationTuning.find({ user_id: 'default' })
            .sort({ created_at: -1 })
            .limit(20);
        return NextResponse.json({ history });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * DELETE /api/profile/tune-unified-foundation
 * Deletes all unified foundation tuning runs
 */
export async function DELETE(req: NextRequest) {
    try {
        await connectToDatabase();
        await UnifiedFoundationTuning.deleteMany({ user_id: 'default' });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
/**
 * POST /api/profile/tune-unified-foundation
 * Starts a new unified foundation tuning run
 */
export async function POST(req: NextRequest) {
    try {
        const config = await req.json();
        const tuning_id = await unifiedFoundationTuningService.startTuning(config);
        return NextResponse.json({ tuning_id });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
