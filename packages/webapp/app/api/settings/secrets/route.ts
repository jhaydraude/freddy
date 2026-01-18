import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../../lib/db/connection';
import { SystemConfig } from '../../../../lib/db/models';
import { configManager } from '../../../../lib/config/config-manager';

export async function POST(req: NextRequest) {
    await connectToDatabase();
    const { key, value } = await req.json();

    try {
        if (!['nightscout_api_key', 'gemini_api_key'].includes(key)) {
            return NextResponse.json({ error: 'Invalid secret key' }, { status: 400 });
        }

        await SystemConfig.updateOne(
            { key },
            { $set: { value, updated_at: new Date() } },
            { upsert: true }
        );

        // Update in-memory configManager
        configManager.updateConfig({ [key]: value });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
