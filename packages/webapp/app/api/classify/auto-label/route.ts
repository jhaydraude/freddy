import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { SituationWindow } from '@/lib/db/models';
import { SituationFeatureExtractor } from '@/lib/logic/situation-features';
import { getStatusHistory } from '@/lib/logic/history-logic';

const PREDICTION_SERVICE_URL = process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000';

export async function POST() {
    try {
        await connectToDatabase();

        // 1. Fetch all pending windows without predictions
        const pendingWindows = await SituationWindow.find({
            status: 'pending',
            predicted_tags: { $exists: false }
        }).limit(100); // Batch process 100 at a time

        if (pendingWindows.length === 0) {
            return NextResponse.json({ message: 'No windows need auto-labeling', count: 0 });
        }

        let labeledCount = 0;

        // 2. Process each window with the ML model
        for (const window of pendingWindows) {
            try {
                // Get features (already stored, but we could refetch for freshness)
                const features = window.features;

                // Call Python service for classification
                const response = await fetch(`${PREDICTION_SERVICE_URL}/api/v1/classify/situation`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        features: Object.fromEntries(features),
                        threshold: 0.5 // Lower threshold for suggestions
                    })
                });

                if (!response.ok) {
                    console.warn(`Model inference failed for window ${window.window_id}`);
                    continue;
                }

                const data = await response.json();

                // 3. Store predictions
                const predictions = data.tags
                    .filter((t: any) => t.probability >= 0.5)
                    .map((t: any) => ({
                        tag_id: t.tag_id,
                        confidence: t.probability,
                        source: 'model_suggestion' as const
                    }));

                if (predictions.length > 0) {
                    await SituationWindow.updateOne(
                        { _id: window._id },
                        { $set: { predicted_tags: predictions } }
                    );
                    labeledCount++;
                }
            } catch (error) {
                console.error(`Error processing window ${window.window_id}:`, error);
            }
        }

        return NextResponse.json({
            message: `Auto-labeled ${labeledCount} windows`,
            count: labeledCount,
            processed: pendingWindows.length
        });
    } catch (error) {
        console.error('Auto-labeling failed:', error);
        return NextResponse.json({ error: 'Auto-labeling failed' }, { status: 500 });
    }
}
