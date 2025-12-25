import { NextResponse } from 'next/server';
import { getActiveProfile } from '@/lib/mcp';

export async function GET() {
    try {
        const profile = await getActiveProfile();
        return NextResponse.json(profile);
    } catch (error) {
        console.error('Error fetching active profile:', error);
        return NextResponse.json({ error: 'Failed to fetch active profile' }, { status: 500 });
    }
}
