import { getStatusHistory } from './history-logic';
import { SituationFeatureExtractor } from './situation-features';
import { SituationWindow } from '../db/models';
import crypto from 'crypto';

/**
 * Scans historical data to identify windows for user classification.
 * Uses a mix of anomaly detection and random sampling.
 */
export async function populateClassificationQueue(daysBack: number = 14) {
    const now = new Date();
    // Round to nearest 5m
    const nowRounded = new Date(Math.floor(now.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000));
    const startTime = new Date(nowRounded.getTime() - daysBack * 24 * 60 * 60 * 1000);

    // Window configuration
    const windowSizeMin = 45;

    // Dynamic step size: if we are looking at a wide span (e.g. 30+ days), 
    // we increase the "stride" to explore the history more sparsely.
    // This allows us to get a wider variety of data without generating 10,000 windows.
    let stepSizeMin = 15;
    if (daysBack > 30) stepSizeMin = 120; // 2h stride for deep history
    else if (daysBack > 7) stepSizeMin = 60;  // 1h stride for medium history

    const stepMs = stepSizeMin * 60 * 1000;

    console.log(`Scanning history from ${startTime.toISOString()} to ${nowRounded.toISOString()}...`);

    let processedCount = 0;
    let addedCount = 0;

    for (let t = startTime.getTime() + (windowSizeMin * 60 * 1000); t <= nowRounded.getTime(); t += stepMs) {
        const windowEnd = new Date(t);
        const windowStart = new Date(t - windowSizeMin * 60 * 1000);

        processedCount++;

        // Skip if already in database (any status)
        const existing = await SituationWindow.findOne({
            window_start: windowStart,
            window_end: windowEnd
        });
        if (existing) continue;

        try {
            // Fetch history for this window (plus 60m context for features if needed)
            const history = await getStatusHistory({
                startTime: windowEnd,
                windowSize: windowSizeMin,
                bucketSize: 5
            });

            if (history.length < 5) continue; // Not enough data points

            const features = await SituationFeatureExtractor.extractFeaturesForWindow(windowEnd, history);

            // Basic anomaly detection logic
            let anomalyScore = 0;
            const reasons: string[] = [];

            if (Math.abs(features.unexplained_mean_30m) > 15) {
                anomalyScore += 0.6;
                reasons.push('high_unexplained');
            }
            if (features.glucose_volatility > 12) {
                anomalyScore += 0.4;
                reasons.push('high_volatility');
            }
            if (features.glucose_mean > 250 || features.glucose_mean < 60) {
                anomalyScore += 0.3;
                reasons.push('extreme_glucose');
            }
            if (features.glucose_density < 0.6) {
                anomalyScore += 0.7; // High priority for missing data
                reasons.push('sensor_gap');
            }
            if (features.sensor_age_hours < 4) {
                anomalyScore += 0.5;
                reasons.push('sensor_startup');
            }

            const isAnomaly = anomalyScore >= 0.5;
            const isRandom = Math.random() < 0.02; // 2% random sampling for baseline

            if (isAnomaly || isRandom) {
                await SituationWindow.create({
                    window_id: crypto.randomUUID(),
                    window_start: windowStart,
                    window_end: windowEnd,
                    duration_minutes: windowSizeMin,
                    features: features,
                    anomaly_score: anomalyScore,
                    selection_reason: isAnomaly ? 'anomaly' : 'random',
                    status: 'pending'
                });
                addedCount++;
                if (addedCount % 10 === 0) console.log(`Added ${addedCount} windows to queue...`);
            }
        } catch (error) {
            console.error(`Error processing window ending ${windowEnd.toISOString()}:`, error);
        }
    }

    console.log(`Scan complete. Processed ${processedCount} potential windows, added ${addedCount} to queue.`);
    return addedCount;
}

/**
 * Retrieves the pending queue for the UI.
 */
export async function getPendingQueue(limit: number = 50) {
    return SituationWindow.find({ status: 'pending' })
        .sort({ anomaly_score: -1, created_at: -1 }) // Prioritize high anomalies
        .limit(limit);
}
/**
 * Retrieves labeled samples for training.
 */
export async function getLabeledSamples(limit: number = 200) {
    return SituationWindow.find({ status: 'labeled' })
        .sort({ labeled_at: -1 })
        .limit(limit);
}
