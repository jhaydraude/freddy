import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { getLabeledSamples } from '@/lib/logic/classification-queue';

const PREDICTION_SERVICE_URL = process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000';

export async function POST() {
    try {
        await connectToDatabase();

        // 1. Get all labeled samples
        const samples = await getLabeledSamples(500); // Get up to 500 samples for training

        if (samples.length < 10) {
            return NextResponse.json({ error: 'Need at least 10 samples to train' }, { status: 400 });
        }

        // 2. Format for training service
        const trainData = {
            model_name: 'default',
            samples: samples.map((s: any) => ({
                features: s.features,
                labels: s.tags.map((t: any) => t.tag_id)
            }))
        };

        // 3. Call Python service
        const res = await fetch(`${PREDICTION_SERVICE_URL}/api/v1/train/situation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(trainData)
        });

        if (res.ok) {
            const result = await res.json();
            return NextResponse.json(result);
        } else {
            const error = await res.text();
            return NextResponse.json({ error: `Training service failed: ${error}` }, { status: 500 });
        }
    } catch (error) {
        console.error('Failed to trigger training:', error);
        return NextResponse.json({ error: 'Failed to trigger training' }, { status: 500 });
    }
}
