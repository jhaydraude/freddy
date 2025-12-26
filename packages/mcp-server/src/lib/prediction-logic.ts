import { getStatus } from './status-logic.js';
import { calculateInsulinEventCurve, INTERVAL_MINUTES } from './iob-curves.js';
import { getProfileStore } from './profile-logic.js';
import { getGlucose } from './status-logic.js';
import { getStatusHistory } from './history-logic.js';

/**
 * Generates a glucose prediction array by projecting glucose into the future
 * until current IOB and COB impacts are zero, or a specified duration is reached.
 * 
 * @param timestamp - The point in time to start the prediction from
 * @param durationMinutes - Optional: specify how many minutes to project (default: based on DIA and active impacts)
 * @returns Array of { timestamp: string, sgv: number }
 */
export async function getGlucosePrediction(timestamp: string | Date, durationMinutes?: number): Promise<Array<{ timestamp: string, sgv: number }>> {
    // 1. Get current status with timeseries
    const status = await getStatus(timestamp, true);
    if (!status.glucose || !status.iob?.timeseries || !status.cob?.timeseries) {
        return [];
    }

    const currentSgv = status.glucose.current.sgv;
    const iobTs = status.iob.timeseries;
    const cobTs = status.cob.timeseries;

    // Find "now" index in timeseries
    const now = new Date(timestamp);
    const nowIso = now.toISOString();
    let nowIdx = iobTs.timestamps.findIndex(ts => new Date(ts).getTime() >= now.getTime());
    if (nowIdx === -1) nowIdx = iobTs.length - 1;

    // 2. Prepare future basal deviations if a temp basal is active
    const basalDeviations: { time: Date, amount: number }[] = [];
    if (status.pump.basal.isTemp && status.pump.basal.expiration) {
        const expiration = new Date(status.pump.basal.expiration);
        const activeRate = status.pump.basal.activeRate;
        const scheduledRate = status.pump.basal.scheduledRate;
        const deviationPerHour = activeRate - scheduledRate;
        const amountPerInterval = (deviationPerHour * INTERVAL_MINUTES) / 60;

        if (Math.abs(amountPerInterval) > 0.001) {
            let t = new Date(now.getTime());
            while (t < expiration) {
                basalDeviations.push({ time: new Date(t.getTime()), amount: amountPerInterval });
                t = new Date(t.getTime() + INTERVAL_MINUTES * 60 * 1000);
            }
        }
    }

    // Settings for future basal impact
    const dia = status.iob.settings.dia;
    const isf = status.iob.settings.effectiveISF;
    const peak = 45; // Default peak for basal mini-boluses

    // Pre-calculate curves for each future basal bucket
    const futureBasalCurves = basalDeviations.map(d =>
        calculateInsulinEventCurve(d.amount, d.time, now, dia, peak, 'Basal', true)
    );

    // 3. Calculate "unexplained" trend from recent attribution
    // This trend represents factors like activity, stress, or inaccurate ISF/CR
    let unexplainedTrendPerInterval = 0;
    let momentumFactor = 1.0;

    if (status.attribution?.timeframes) {
        // Look at the 30min timeframe for a more stable base trend
        const attr30m = status.attribution.timeframes.find(tf => tf.minutes === 30);
        if (attr30m) {
            // unexplained units are mg/dL per 30 mins. Convert to per INTERVAL_MINUTES (5 min)
            unexplainedTrendPerInterval = attr30m.components.unexplained / (30 / INTERVAL_MINUTES);
        }
    }

    // Analyze momentum from 30m history
    if (status.attribution?.history && status.attribution.history.length >= 3) {
        const history = status.attribution.history;
        const latest = history[history.length - 1];
        const earlier = history[Math.max(0, history.length - 4)]; // ~15 mins ago

        if (latest && earlier) {
            const trendChange = latest.unexplained - earlier.unexplained;
            // If the unexplained trend is accelerating in the same direction, boost momentum
            if (Math.sign(trendChange) === Math.sign(latest.unexplained) && Math.abs(trendChange) > 0.5) {
                momentumFactor = 1.02; // Slower decay
            } else if (Math.sign(trendChange) !== Math.sign(latest.unexplained)) {
                momentumFactor = 0.95; // Faster decay
            }
        }
    }

    // 4. Project into the future
    const prediction: Array<{ timestamp: string, sgv: number }> = [];
    let runningSgv = currentSgv;

    // Add current point
    prediction.push({ timestamp: nowIso, sgv: Math.round(runningSgv * 10) / 10 });

    // Iterate future intervals
    // The health timeseries usually goes up to DIA hours into the future.
    // We iterate until we reach durationMinutes OR impacts are zero (minimum DIA).
    const diaMinutes = dia * 60;
    const targetDurationMin = durationMinutes !== undefined ? durationMinutes : diaMinutes;
    const targetIntervals = Math.ceil(targetDurationMin / INTERVAL_MINUTES);

    // We might need to go further than targetIntervals if dia is longer and impacts are still active,
    // or if the user requested a very long duration.
    // The iobTs/cobTs length is a good baseline for "physiological end".
    const maxIntervals = Math.max(nowIdx + targetIntervals, iobTs.length, cobTs.length);

    for (let i = nowIdx + 1; i < maxIntervals; i++) {
        const intervalTime = i < iobTs.length ? new Date(iobTs.timestamps[i]) : new Date(now.getTime() + (i - nowIdx) * INTERVAL_MINUTES * 60 * 1000);

        // IOB Impact (Glucose dropped in this interval)
        const iobImpact = i < iobTs.glucoseImpact.length ? iobTs.glucoseImpact[i] : 0;

        // COB Impact (Glucose raised in this interval)
        const cobImpact = i < cobTs.glucoseImpact.length ? cobTs.glucoseImpact[i] : 0;

        // Future Basal Impact (from temp basal delivery AFTER 'now')
        let futureBasalImpact = 0;
        if (futureBasalCurves.length > 0) {
            // Find index in futureBasalCurves corresponding to this interval
            // nowIdx is offset 0. i is offset i - nowIdx.
            const offset = i - nowIdx;

            for (const curve of futureBasalCurves) {
                // Calculate activity in this interval
                // curve.iobAtInterval[offset] is IOB at the START of this interval relative to 'now'
                // Wait, I need activity: iobPrevious - iobCurrent
                if (offset > 0 && curve.iobAtInterval[offset - 1] !== undefined && curve.iobAtInterval[offset] !== undefined) {
                    const activity = Math.max(0, curve.iobAtInterval[offset - 1]! - curve.iobAtInterval[offset]!);
                    futureBasalImpact += activity * isf;
                }
            }
        }

        // Apply unexplained trend, decaying it over time
        const intervalsSinceNow = i - nowIdx;
        const baseDecay = 0.95;
        const adjustedDecay = Math.max(0.8, Math.min(0.99, baseDecay * momentumFactor));
        const decayFactor = Math.pow(adjustedDecay, intervalsSinceNow - 1);
        const currentUnexplainedImpact = unexplainedTrendPerInterval * decayFactor;

        runningSgv = runningSgv - iobImpact + cobImpact - futureBasalImpact + currentUnexplainedImpact;

        // Safety: don't let glucose go negative in projection
        if (runningSgv < 0) runningSgv = 0;

        prediction.push({
            timestamp: intervalTime.toISOString(),
            sgv: Math.round(runningSgv * 10) / 10
        });

        // Loop breaker: stop if we are past the requested duration
        const minutesSinceNow = (i - nowIdx) * INTERVAL_MINUTES;
        if (durationMinutes !== undefined) {
            if (minutesSinceNow >= durationMinutes) break;
        } else {
            // Physiological breaker: stop if past DIA and impacts are negligible
            if (minutesSinceNow >= dia * 60) {
                const totalRemainingImpact = Math.abs(iobImpact) + Math.abs(cobImpact) + Math.abs(futureBasalImpact);
                if (totalRemainingImpact < 0.1) break;

                // Absolute hard cap for safety (12 hours)
                if (minutesSinceNow > 12 * 60) break;
            }
        }
    }

    return prediction;
}


// PredictiveModelsService configuration
const PREDICTION_SERVICE_URL = process.env.PREDICTION_SERVICE_URL || 'http://localhost:8000';
const PREDICTION_MODEL_NAME = process.env.PREDICTION_MODEL_NAME || 'glucose_predictor';

export interface IProjectionResult {
    currentBg: number;
    projectedBg: number;
    minutesAhead: number;
    deltaIOB: number;
    deltaCOB: number;
    activityLines: {
        insulinDrop: number;
        carbRise: number;
    };
    factors: {
        isf: number;
        cr: number;
    };
    source: 'ml_model' | 'local_calculation';
    confidence?: number;
    featuresUsed?: Record<string, number>;
}

/**
 * Response from the PredictiveModelsService /predict/glucose endpoint
 */
interface IPredictGlucoseResponse {
    model_name: string;
    predicted_glucose_60min: number;
    current_glucose: number;
    predicted_change: number;
    features_used: Record<string, number>;
    predicted_at: string;
}

/**
 * Calls the PredictiveModelsService to get an ML-based glucose prediction.
 * Returns null if the service is unavailable or returns an error.
 */
async function callPredictionService(statusHistory: any[]): Promise<IPredictGlucoseResponse | null> {
    try {
        const response = await fetch(`${PREDICTION_SERVICE_URL}/predict/glucose`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model_name: PREDICTION_MODEL_NAME,
                status_history: statusHistory
            })
        });

        if (!response.ok) {
            console.warn(`PredictiveModelsService returned ${response.status}: ${response.statusText}`);
            return null;
        }

        return await response.json() as IPredictGlucoseResponse;
    } catch (error) {
        console.warn('PredictiveModelsService unavailable, falling back to local calculation:', error);
        return null;
    }
}

/**
 * Calculates a projected glucose value X minutes into the future.
 * 
 * Primary approach: Uses the PredictiveModelsService ML model for prediction.
 * Fallback: Local calculation based on IOB/COB decay if the service is unavailable.
 * 
 * The ML model uses XGBoost trained on historical status_history data to predict
 * glucose 60 minutes ahead, considering glucose trends, IOB, COB, basal rates, etc.
 */
export async function calculateProjectedGlucose(minutesAhead: number = 30): Promise<IProjectionResult | null> {
    const now = new Date();
    const future = new Date(now.getTime() + minutesAhead * 60 * 1000);

    // 1. Try ML-based prediction first (for 60-minute prediction)
    // Note: The ML model is trained for 60-minute predictions
    if (minutesAhead === 60 || minutesAhead === 30) {
        try {
            // Fetch status history for the ML model (60 minutes, 5-minute buckets)
            const statusHistory = await getStatusHistory({
                startTime: now,
                windowSize: 60,
                bucketSize: 5
            });

            if (statusHistory.length > 0) {
                const mlResult = await callPredictionService(statusHistory);

                if (mlResult) {
                    // Get current glucose for the response
                    const currentBg = mlResult.current_glucose;
                    let projectedBg = mlResult.predicted_glucose_60min;

                    // If user requested 30 minutes, interpolate (simple linear)
                    if (minutesAhead === 30) {
                        projectedBg = currentBg + (mlResult.predicted_change / 2);
                    }

                    // Extract IOB/COB deltas from features if available
                    const features = mlResult.features_used;
                    const currentIOB = features.iob || 0;
                    const currentCOB = features.cob || 0;

                    return {
                        currentBg,
                        projectedBg: Math.round(projectedBg * 10) / 10,
                        minutesAhead,
                        deltaIOB: 0, // ML model handles this internally
                        deltaCOB: 0, // ML model handles this internally
                        activityLines: {
                            insulinDrop: 0, // Not calculated separately in ML approach
                            carbRise: 0
                        },
                        factors: {
                            isf: features.isf || 0,
                            cr: features.carb_ratio || 0
                        },
                        source: 'ml_model',
                        featuresUsed: features
                    };
                }
            }
        } catch (error) {
            console.warn('Error using ML prediction, falling back to local calculation:', error);
        }
    }

    // 2. Fallback: Local calculation based on IOB/COB decay
    const [
        glucoseEntries,
        profileInfo,
        currentIOB,
        futureIOB,
        currentCOB,
        futureCOB
    ] = await Promise.all([
        getGlucose({ count: 1 }),
        resolveActiveProfile(now),
        getIOB(now),
        getIOB(future),
        getCOB(now),
        getCOB(future)
    ]);

    if (!glucoseEntries.length || !profileInfo) {
        return null;
    }

    const currentBg = glucoseEntries[0]!.current.sgv;

    // Resolve Factors (ISF, CR)
    const store = getProfileStore(profileInfo.doc || undefined, profileInfo.activeProfileName, profileInfo.profileData || undefined);
    if (!store) return null;

    const isf = store.sens?.[0]?.value || 50;
    const cr = store.carbratio?.[0]?.value || 10;

    const isMmol = glucoseEntries[0]!.units.toLowerCase().includes("mmol");
    let activeISF = isf;
    const activeCR = cr;

    // Calculate Actives
    const insulinUsed = currentIOB.calculated.totalIOB - futureIOB.calculated.totalIOB;
    const carbsAbsorbed = currentCOB.calculated.cob - futureCOB.calculated.cob;

    // Calculate Impact
    const insulinDrop = insulinUsed * activeISF;
    const carbRise = carbsAbsorbed * (activeISF / activeCR);

    let projectedBg = currentBg - insulinDrop + carbRise;
    projectedBg = Math.round(projectedBg * 10) / 10;

    return {
        currentBg,
        projectedBg,
        minutesAhead,
        deltaIOB: Math.round(insulinUsed * 100) / 100,
        deltaCOB: Math.round(carbsAbsorbed * 10) / 10,
        activityLines: {
            insulinDrop: Math.round(insulinDrop * 10) / 10,
            carbRise: Math.round(carbRise * 10) / 10
        },
        factors: {
            isf: activeISF,
            cr: activeCR
        },
        source: 'local_calculation'
    };
}
