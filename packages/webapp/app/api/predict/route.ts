import { NextResponse } from 'next/server';
import { getGlucosePrediction } from '@/lib/server-actions';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const timestamp = searchParams.get('timestamp') || new Date().toISOString();
    const durationMinutes = parseInt(searchParams.get('durationMinutes') || '120', 10);

    // Validate durationMinutes
    if (isNaN(durationMinutes) || durationMinutes < 0) {
        return NextResponse.json(
            { error: 'Invalid durationMinutes parameter' },
            { status: 400 }
        );
    }

    // Validate timestamp
    const timestampDate = new Date(timestamp);
    if (isNaN(timestampDate.getTime())) {
        return NextResponse.json(
            { error: 'Invalid timestamp parameter' },
            { status: 400 }
        );
    }

    try {
        const prediction = await getGlucosePrediction(timestamp, durationMinutes);

        return NextResponse.json({
            timestamp,
            prediction
        });
    } catch (error) {
        console.error('Error generating prediction:', error);
        return NextResponse.json(
            { error: 'Failed to generate prediction' },
            { status: 500 }
        );
    }
}
