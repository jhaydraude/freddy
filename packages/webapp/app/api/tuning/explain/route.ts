/**
 * /api/tuning/explain/route.ts
 *
 * Explains a completed MealActivityTuning run in plain language.
 *
 * Loads the tuning document, builds structured context via buildTuningContext(),
 * optionally enriches with attribution evidence from the analysis period,
 * then calls the configured LLM provider with the 5-section TUNING_EXPLAIN_SYSTEM_PROMPT.
 *
 * Usage: GET /api/tuning/explain?tuning_id=<id>
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { MealActivityTuning, ComputedStatus, SurfacedPattern } from '@/lib/db/models';
import type { IMealActivityTuning } from '@/lib/db/models/meal-activity-tuning';
import { buildTuningContext, buildExplainContext, serializeExplainContext } from '@/lib/logic/llm';
import { generateExplanation } from '@/lib/logic/llm-service';
import { TUNING_EXPLAIN_SYSTEM_PROMPT, generateTuningExplainPrompt } from '@/lib/logic/prompts';

export async function GET(req: NextRequest) {
    const tuningId = req.nextUrl.searchParams.get('tuning_id');
    if (!tuningId) {
        return NextResponse.json({ error: 'tuning_id is required' }, { status: 400 });
    }

    try {
        await connectToDatabase();

        // 1. Load the tuning document
        const tuning: IMealActivityTuning | null = await MealActivityTuning
            .findOne({ tuning_id: tuningId })
            .lean();

        if (!tuning) {
            return NextResponse.json({ error: `Tuning run '${tuningId}' not found` }, { status: 404 });
        }

        if (tuning.status !== 'completed' && tuning.status !== 'applied') {
            return NextResponse.json(
                { error: `Tuning run is in status '${tuning.status}' — explain is only available for completed runs` },
                { status: 422 }
            );
        }

        if (!tuning.optimized_values) {
            return NextResponse.json(
                { error: 'Tuning run completed but has no optimized_values' },
                { status: 422 }
            );
        }


        // 2. Build structured tuning context
        const tuningCtx = buildTuningContext(tuning);

        // 3. Optionally enrich with attribution evidence from the analysis period
        //    Query ComputedStatus for the tuning period and compute avg unexplained by 4-hour block
        const analysisMs = tuning.config.analysis_period_days * 24 * 60 * 60 * 1000;
        const periodEnd = new Date(tuning.created_at);
        const periodStart = new Date(periodEnd.getTime() - analysisMs);

        try {
            const blockData = await ComputedStatus.aggregate([
                    {
                        $match: {
                            timestamp: { $gte: periodStart, $lte: periodEnd },
                            'attribution': { $exists: true }
                        }
                    },
                    {
                        $addFields: {
                            hourOfDay: { $hour: '$timestamp' },
                            // Unexplained delta from the 30m timeframe if available
                            unexplained30m: {
                                $let: {
                                    vars: {
                                        tf30: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: { $ifNull: ['$attribution.timeframes', []] },
                                                        as: 'tf',
                                                        cond: { $eq: ['$$tf.minutes', 30] }
                                                    }
                                                },
                                                0
                                            ]
                                        }
                                    },
                                    in: { $ifNull: ['$$tf30.components.unexplained', null] }
                                }
                            }
                        }
                    },
                    {
                        $match: { unexplained30m: { $ne: null } }
                    },
                    {
                        $addFields: {
                            // 4-hour block (0-5)
                            block: { $floor: { $divide: ['$hourOfDay', 4] } }
                        }
                    },
                    {
                        $group: {
                            _id: '$block',
                            avg_unexplained: { $avg: '$unexplained30m' },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { '_id': 1 } }
            ]);

            const BLOCK_LABELS = [
                '00:00–04:00', '04:00–08:00', '08:00–12:00',
                '12:00–16:00', '16:00–20:00', '20:00–24:00',
            ];

            if (blockData.length > 0) {
                tuningCtx.attribution_evidence = {
                    period_start: periodStart.toISOString(),
                    period_end: periodEnd.toISOString(),
                    avg_unexplained_by_block: blockData.map((b: any) => ({
                        time_block: BLOCK_LABELS[b._id] ?? `Block ${b._id + 1}`,
                        avg_unexplained: Math.round(b.avg_unexplained * 10) / 10,
                        nights: b.count,
                    }))
                };
            }
        } catch (evidenceErr) {
            // Attribution evidence enrichment is best-effort — don't fail the whole request
            console.warn('[tuning/explain] Could not fetch attribution evidence:', evidenceErr);
        }

        // 3.5 Fetch active longitudinal patterns for additional context
        let activePatterns = [];
        try {
            activePatterns = await SurfacedPattern.find({ status: 'active' }).lean();
        } catch (err) {
            console.warn('[tuning/explain] Could not fetch active patterns:', err);
        }

        // 4. Serialize and call LLM
        const explainCtx = buildExplainContext('tuning', undefined, tuningCtx, activePatterns);
        const structuredContext = serializeExplainContext(explainCtx);

        const explanation = await generateExplanation({
            system: TUNING_EXPLAIN_SYSTEM_PROMPT,
            user: generateTuningExplainPrompt(structuredContext),
        });

        return NextResponse.json({
            tuning_id: tuningId,
            explanation,
            context_summary: {
                mode: tuning.mode,
                analysis_period_days: tuning.config.analysis_period_days,
                model_quality: tuningCtx.model_quality.quality_label,
                changes_detected: {
                    isf: tuningCtx.isf_diffs.length,
                    cr: tuningCtx.cr_diffs.length,
                    basal: tuningCtx.basal_diffs.length,
                },
                attribution_evidence_available: !!tuningCtx.attribution_evidence,
            }
        });

    } catch (err: any) {
        console.error('[tuning/explain] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
