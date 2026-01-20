import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../lib/db/connection';
import { SystemConfig, UserPreference } from '../../../lib/db/models';
import { configManager } from '../../../lib/config/config-manager';

export async function GET() {
    await connectToDatabase();

    try {
        const [sysConfigs, userPrefs] = await Promise.all([
            SystemConfig.find({}).lean(),
            UserPreference.find({ userId: 'default' }).lean() // 'default' for now
        ]);

        // Convert key-value array to object
        const system_config: Record<string, any> = {};
        sysConfigs.forEach((c: any) => {
            // Mask secrets
            if (['nightscout_api_key', 'gemini_api_key', 'nightscout_mongo_uri'].includes(c.key)) {
                system_config[c.key] = '********';
            } else {
                system_config[c.key] = c.value;
            }
        });

        // If DB is empty, use configManager defaults
        if (sysConfigs.length === 0) {
            const defaults = configManager.getSystemConfig();
            Object.entries(defaults).forEach(([key, value]) => {
                if (['nightscout_api_key', 'gemini_api_key', 'nightscout_mongo_uri'].includes(key)) {
                    system_config[key] = '********';
                } else {
                    system_config[key] = value;
                }
            });
        }

        const user_preferences: Record<string, any> = {};
        userPrefs.forEach((p: any) => {
            user_preferences[p.key] = p.value;
        });

        return NextResponse.json({ system_config, user_preferences });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    await connectToDatabase();
    const { key, value, type } = await req.json();

    try {
        if (type === 'preference') {
            await UserPreference.updateOne(
                { userId: 'default', key },
                { $set: { value, updated_at: new Date() } },
                { upsert: true }
            );
        } else if (type === 'config') {
            // Do not allow updating secrets through this endpoint
            if (['nightscout_api_key', 'gemini_api_key'].includes(key)) {
                return NextResponse.json({ error: 'Use /api/settings/secrets for API keys' }, { status: 400 });
            }

            await SystemConfig.updateOne(
                { key },
                { $set: { value, updated_at: new Date() } },
                { upsert: true }
            );

            // Update in-memory configManager
            configManager.updateConfig({ [key]: value });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
