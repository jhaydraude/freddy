import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { SituationWindow, SituationSegment } from '@/lib/db/models';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { window_id, tags, status } = body;

        if (!window_id) {
            return NextResponse.json({ error: 'window_id is required' }, { status: 400 });
        }

        await connectToDatabase();

        // 1. Update the window
        const finalStatus = status || 'labeled';

        // Find the window first to check for predictions
        const existingWindow = await SituationWindow.findOne({ window_id });
        if (!existingWindow) {
            return NextResponse.json({ error: 'Window not found' }, { status: 404 });
        }

        // Determine label source based on predictions
        let labelSource: 'manual' | 'system_validated' | 'system_unvalidated' = 'manual';

        if (existingWindow.predicted_tags && existingWindow.predicted_tags.length > 0) {
            const predictedIds = existingWindow.predicted_tags.map(pt => pt.tag_id).sort();
            const submittedIds = [...tags].sort();

            // Check if user confirmed predictions unchanged
            const isUnchanged = JSON.stringify(predictedIds) === JSON.stringify(submittedIds);
            labelSource = isUnchanged ? 'system_validated' : 'system_unvalidated';
        }

        const window = await SituationWindow.findOneAndUpdate(
            { window_id },
            {
                $set: {
                    tags: tags.map((t: string) => ({
                        tag_id: t,
                        confidence: 1.0,
                        source: labelSource,
                        validated_at: new Date()
                    })),
                    status: finalStatus,
                    labeled_at: new Date()
                },
                $unset: { predicted_tags: "" } // Clear predictions after labeling
            },
            { new: true }
        );

        // 2. If status is labeled, create segments
        if (status === 'labeled' && tags.length > 0) {
            for (const tag_id of tags) {
                // Check if segment already exists for this exact window/tag to avoid duplicates
                await SituationSegment.findOneAndUpdate(
                    {
                        userId: 'main_user', // Placeholder
                        tagId: tag_id,
                        startTime: window.window_start,
                        endTime: window.window_end
                    },
                    {
                        $set: {
                            userId: 'main_user',
                            tagId: tag_id,
                            startTime: window.window_start,
                            endTime: window.window_end,
                            source: 'manual',
                            confidence: 1.0,
                            created_at: new Date()
                        }
                    },
                    { upsert: true }
                );
            }
        }

        return NextResponse.json({ success: true, window });
    } catch (error) {
        console.error('Failed to submit classification:', error);
        return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
    }
}
