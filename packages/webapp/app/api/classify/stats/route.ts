import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { SituationWindow } from '@/lib/db/models';

const PREDICTION_SERVICE_URL = process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000';

export async function GET() {
    try {
        await connectToDatabase();

        // 1. Get training status (local DB)
        const [labeledCount, pendingCount] = await Promise.all([
            SituationWindow.countDocuments({ status: 'labeled' }),
            SituationWindow.countDocuments({ status: 'pending' })
        ]);

        // 2. Get model quality (Python Service)
        let modelMetrics = null;
        try {
            const res = await fetch(`${PREDICTION_SERVICE_URL}/api/v1/metrics/situation/default`);
            if (res.ok) {
                modelMetrics = await res.json();
            }
        } catch (e) {
            console.warn('Could not fetch model metrics:', e);
        }

        return NextResponse.json({
            trainingStatus: {
                labeledCount,
                pendingCount,
                totalSamples: labeledCount + pendingCount,
                percentComplete: labeledCount > 0 ? (labeledCount / (labeledCount + pendingCount)) * 100 : 0
            },
            modelMetrics
        });
    } catch (error) {
        console.error('Failed to fetch situation stats:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
