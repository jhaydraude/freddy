import { SituationFeatureExtractor } from './situation-features';
import { getStatusHistory } from './history-logic';
import { SituationSegment, SituationTag } from '../db/models';

const PREDICTION_SERVICE_URL = process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000';

export interface IActiveSituation {
    tagId: string;
    confidence: number;
    source: 'manual' | 'model_confirmed' | 'auto_rule';
}

/**
 * Identifies currently active situations by checking manual overrides
 * first, then falling back to ML model inference.
 */
export async function getCurrentSituations(timestamp: Date = new Date()): Promise<IActiveSituation[]> {
    try {
        // 1. Check for manual segments active at this time
        const manualSegments = await SituationSegment.find({
            startTime: { $lte: timestamp },
            endTime: { $gte: timestamp },
            source: 'manual'
        });

        if (manualSegments.length > 0) {
            return manualSegments.map(s => ({
                tagId: s.tagId,
                confidence: s.confidence,
                source: 'manual'
            }));
        }

        // 2. Try ML Model Inference as fallback
        const history = await getStatusHistory({
            startTime: timestamp,
            windowSize: 45,
            bucketSize: 5
        });

        if (history.length < 5) return [];

        const features = await SituationFeatureExtractor.extractFeaturesForWindow(timestamp, history);

        const response = await fetch(`${PREDICTION_SERVICE_URL}/api/v1/classify/situation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                features,
                threshold: 0.6 // Slightly higher threshold for real-time action
            })
        });

        if (response.ok) {
            const data = await response.json();
            return data.tags
                .filter((t: any) => t.above_threshold)
                .map((t: any) => ({
                    tagId: t.tag_id,
                    confidence: t.probability,
                    source: 'model_confirmed'
                }));
        }

    } catch (error) {
        console.warn('Real-time situation inference failed:', error);
    }

    return [];
}

/**
 * Gets aggregated prediction adjustments for all active situations.
 */
export async function getSituationAdjustments(timestamp: Date = new Date()) {
    const active = await getCurrentSituations(timestamp);
    const adjustments = {
        isf_multiplier: 1.0,
        cob_adjustment: 0,
        confidence_penalty: 1.0
    };

    for (const sit of active) {
        const tag = await SituationTag.findOne({ tag_id: sit.tagId });
        if (tag?.prediction_adjustments) {
            const adj = tag.prediction_adjustments;
            const weight = sit.confidence || 1.0; // Default to 100% if no confidence set

            // Weighted ISF Multiplier:
            // If factor is 1.3 (30% increase) and confidence is 0.5, we want 1.15 (15% increase)
            // Formula: 1 + (factor - 1) * weight
            if (adj.isf_multiplier) {
                const weightedFactor = 1 + (adj.isf_multiplier - 1) * weight;
                adjustments.isf_multiplier *= weightedFactor;
            }

            // Weighted COB Adjustment:
            // Simple multiplication
            if (adj.cob_adjustment) {
                adjustments.cob_adjustment += (adj.cob_adjustment * weight);
            }

            // Weighted Confidence Penalty:
            // If penalty is 0.8 (20% reduction) and confidence is 0.5, we want 0.9 (10% reduction)
            // Formula: 1 - (1 - penalty) * weight
            if (adj.confidence_penalty) {
                const weightedPenalty = 1 - (1 - adj.confidence_penalty) * weight;
                adjustments.confidence_penalty *= weightedPenalty;
            }
        }
    }

    return { active, adjustments };
}
