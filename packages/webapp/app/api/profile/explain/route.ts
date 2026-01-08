import { NextResponse } from 'next/server';
import { ProfileAnalysis } from '@/lib/db/models';
import { explainProfileAnalysis } from '@/lib/logic/profile-explain-logic';
import { connectToDatabase } from '@/lib/db/connection';

export async function POST(request: Request) {
    try {
        const { analysisId } = await request.json();

        if (!analysisId) {
            return NextResponse.json({ error: 'Analysis ID required' }, { status: 400 });
        }

        await connectToDatabase();
        const analysis = await ProfileAnalysis.findById(analysisId);

        if (!analysis) {
            return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
        }

        // Generate explanation using LLM
        const explanation = await explainProfileAnalysis(analysis);

        // Save to database
        analysis.llm_explanation = explanation;
        analysis.explanation_generated_at = new Date();
        await analysis.save();

        return NextResponse.json({
            explanation,
            generated_at: analysis.explanation_generated_at
        });
    } catch (error: any) {
        console.error('Error generating profile explanation:', error);
        return NextResponse.json({
            error: error.message || 'Failed to generate explanation'
        }, { status: 500 });
    }
}
