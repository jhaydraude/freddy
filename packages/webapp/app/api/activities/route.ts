import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { ActivityRecord } from '@/lib/db/models';
import { UploadRequestSchema } from '@/lib/openapi';

export async function POST(request: Request) {
    try {
        await connectToDatabase();
        const body = await request.json();

        // Validate request body
        const validation = UploadRequestSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({
                error: 'Invalid request body',
                details: validation.error.format()
            }, { status: 400 });
        }

        const { metadata, activities } = validation.data;

        if (activities.length === 0) {
            return NextResponse.json({
                success: true,
                count: 0,
                message: 'No activities to upload'
            });
        }

        // Map activities to include metadata for storage
        const recordsToSave = activities.map(activity => ({
            ...activity,
            metadata,
            created_at: new Date()
        }));

        // Use BulkWrite for efficiency and to handle idempotency (id is unique index)
        const ops = recordsToSave.map(record => ({
            updateOne: {
                filter: { id: record.id },
                update: { $set: record },
                upsert: true
            }
        }));

        const result = await ActivityRecord.bulkWrite(ops);

        return NextResponse.json({
            success: true,
            count: result.upsertedCount + result.modifiedCount,
            message: `Processed ${activities.length} activity records. Upserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`
        });

    } catch (error: any) {
        console.error('Error in POST /api/activities:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
