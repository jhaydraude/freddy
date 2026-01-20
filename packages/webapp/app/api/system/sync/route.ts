import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/system/sync
 * DEPRECATED: Historical sync is no longer needed in Direct Connection mode.
 */
export async function POST(req: NextRequest) {
    return NextResponse.json({
        success: true,
        message: 'Direct Connection is active. Data is read directly from Nightscout MongoDB; manual sync is no longer necessary.'
    });
}
