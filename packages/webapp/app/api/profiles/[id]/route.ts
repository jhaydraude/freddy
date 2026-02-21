import { NextRequest, NextResponse } from 'next/server';
import { FreddyProfile } from '../../../../lib/db/models/freddy-profile';
import { freddyProfileService } from '../../../../lib/services/freddy-profile-service';
import { connectToDatabase } from '../../../../lib/db/connection';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connectToDatabase();
        const { id } = await params;
        if (!id) throw new Error('ID required');
        const profile = await FreddyProfile.findById(id);
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }
        return NextResponse.json(profile);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connectToDatabase();
        const { id } = await params;
        const body = await req.json();
        // Remove fields that shouldn't be updated manually or cause Mongoose issues
        const { _id, __v, createdAt, updatedAt, ...updateData } = body;

        const profile = await FreddyProfile.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
        if (!profile) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }
        return NextResponse.json(profile);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await freddyProfileService.deleteProfile(id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Custom POST for activation and applying results
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        if (body.action === 'activate') {
            await freddyProfileService.activateProfile(id);
            return NextResponse.json({ success: true });
        }
        if (body.action === 'apply') {
            const profile = await freddyProfileService.applyAnalysis(id, body.analysis, {
                mode: body.mode,
                newName: body.newName,
                selection: body.selection
            });
            return NextResponse.json(profile);
        }
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
