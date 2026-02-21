import { NextRequest, NextResponse } from 'next/server';
import { freddyProfileService } from '../../../lib/services/freddy-profile-service';
import { nsToFreddy } from '../../../lib/logic/profile-conversion';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        if (searchParams.get('action') === 'check') {
            const check = await freddyProfileService.checkNewNSProfileAvailable();
            return NextResponse.json(check);
        }

        const profiles = await freddyProfileService.listProfiles();
        return NextResponse.json(profiles);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        if (body.action === 'import') {
            const latest = await freddyProfileService.getLatestNSProfile();
            if (!latest) throw new Error('No Nightscout profile found');

            const nsId = latest.nsProfile._id?.toString() || latest.nsProfile.startDate;
            const freddyData = nsToFreddy(latest.data, `${latest.name} (Imported)`);

            const profile = await freddyProfileService.createProfile({
                ...freddyData,
                sourceNSProfileId: nsId
            });

            return NextResponse.json(profile);
        }

        const profile = await freddyProfileService.createProfile(body);
        return NextResponse.json(profile);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
