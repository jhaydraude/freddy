import { getStatus } from './status-logic';
import { calculateInsulinEventCurve, INTERVAL_MINUTES } from './iob-curves';
import { getProfileStore, resolveActiveProfile } from './profile-logic';
import { getIOB } from './iob-logic';

import { getGlucose } from './status-logic';
import { getCOB } from './cob-logic';

import { getStatusHistory } from './history-logic';
import { getBasalFromSchedule } from './basal-logic';


/**
 * Generates a glucose prediction array by projecting glucose into the future
 * until current IOB and COB impacts are zero, or a specified duration is reached.
 * 
 * @param timestamp - The point in time to start the prediction from
 * @param durationMinutes - Optional: specify how many minutes to project (default: based on DIA and active impacts)
 * @returns Array of { timestamp: string, sgv: number, iob: number, cob: number }
 */
export interface IPredictionPoint {
    timestamp: string;
    sgv: number;
    components?: {
        insulin: number;
        carbs: number;
        unexplained: number;
        basal: number;
    };
}

export async function getGlucosePrediction(timestamp: string | Date, durationMinutes?: number): Promise<Array<{ timestamp: string, sgv: number, iob: number, cob: number, pendingCOB: number, activeCOB: number }>> {

    const now = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    const nowIso = now.toISOString();

    // 1. Get current status with timeseries
    const status = await getStatus(timestamp, true);
    if (!status.glucose || !status.iob?.timeseries || !status.cob?.timeseries) {
        return [];
    }

    const currentSgv = status.glucose.current.sgv;
    const iobTs = status.iob.timeseries;
    const cobTs = (status.cob as any).timeseries;

    // Use explicit nowIndex if available, otherwise find it
    const iobNowIdx = (iobTs as any).nowIndex ?? (iobTs.data && iobTs.data.findIndex((d: any) => new Date(d.timestamp).getTime() >= now.getTime()));
    const cobNowIdx = (cobTs as any).nowIndex ?? (cobTs.data && cobTs.data.findIndex((d: any) => new Date(d.timestamp).getTime() >= now.getTime()));

    const safeIobNowIdx = iobNowIdx === -1 ? (iobTs.data?.length || 1) - 1 : iobNowIdx;
    const safeCobNowIdx = cobNowIdx === -1 ? (cobTs.data?.length || 1) - 1 : cobNowIdx;

    // 2. Prepare future basal deviations
    const basalDeviations: { time: Date, amount: number }[] = [];
    const basalSchedule = status.profile?.profileData?.basal;
    const tempBasal = status.pump.basal;

    if (basalSchedule) {
        const expirationDate = tempBasal.expiration ? new Date(tempBasal.expiration) : null;
        const baselineRate = tempBasal.scheduledRate; // The scheduled rate at 'now'

        // Project for the expected duration of the prediction
        const diaMinutes = status.iob.settings.dia * 60;
        const projectionLimit = durationMinutes !== undefined ? durationMinutes : diaMinutes;
        let t = new Date(now.getTime());
        const end = new Date(now.getTime() + projectionLimit * 60 * 1000);

        while (t < end) {
            // Determine active rate at this future time
            let activeRate: number;
            if (tempBasal.isTemp && expirationDate && t < expirationDate) {
                activeRate = tempBasal.activeRate;
            } else {
                activeRate = getBasalFromSchedule(basalSchedule, t);
            }

            // Deviation relative to the 'now' baseline
            const deviationPerHour = activeRate - baselineRate;
            const amountPerInterval = (deviationPerHour * INTERVAL_MINUTES) / 60;

            if (Math.abs(amountPerInterval) > 0.0001) {
                basalDeviations.push({ time: new Date(t.getTime()), amount: amountPerInterval });
            }
            t = new Date(t.getTime() + INTERVAL_MINUTES * 60 * 1000);
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
    let unexplainedTrendPerInterval = 0;
    let momentumFactor = 1.0;

    if (status.attribution?.timeframes) {
        const attr30m = status.attribution.timeframes.find(tf => tf.minutes === 30);
        if (attr30m) {
            unexplainedTrendPerInterval = attr30m.components.unexplained / (30 / INTERVAL_MINUTES);

            // Constrain trend to physiologically plausible limits to prevent runaway projections
            const isMmol = (status.glucose?.units || '').toLowerCase().includes('mmol') || currentSgv < 25;
            const cap = isMmol ? 0.4 : 8.0; // 0.4 mmol/L or 8 mg/dL per 5-min interval
            unexplainedTrendPerInterval = Math.max(-cap, Math.min(cap, unexplainedTrendPerInterval));
        }
    }

    // Analyze momentum
    if (status.attribution?.history && status.attribution.history.length >= 3) {
        const history = status.attribution.history;
        const latest = history[history.length - 1];
        const earlier = history[Math.max(0, history.length - 4)];

        if (latest && earlier) {
            const trendChange = latest.unexplained - earlier.unexplained;
            if (Math.sign(trendChange) === Math.sign(latest.unexplained) && Math.abs(trendChange) > 0.5) {
                momentumFactor = 1.02;
            } else if (Math.sign(trendChange) !== Math.sign(latest.unexplained)) {
                momentumFactor = 0.95;
            }
        }
    }

    // 4. Project into the future
    const prediction: Array<{ timestamp: string, sgv: number, iob: number, cob: number, pendingCOB: number, activeCOB: number }> = [];
    let runningSgv = currentSgv;


    // Add current point (no impacts applied yet)
    prediction.push({
        timestamp: nowIso,
        sgv: Math.round(runningSgv * 10) / 10,
        iob: iobTs.data && iobTs.data[safeIobNowIdx] ? iobTs.data[safeIobNowIdx].totalIOB : 0,
        cob: cobTs.data && cobTs.data[safeCobNowIdx] ? cobTs.data[safeCobNowIdx].cob : 0,
        pendingCOB: cobTs.data && cobTs.data[safeCobNowIdx] ? cobTs.data[safeCobNowIdx].pendingCOB : 0,
        activeCOB: cobTs.data && cobTs.data[safeCobNowIdx] ? cobTs.data[safeCobNowIdx].activeCOB : 0
    });




    // Iterate future intervals
    const diaMinutes = dia * 60;
    const targetDurationMin = durationMinutes !== undefined ? durationMinutes : diaMinutes;
    const targetIntervals = Math.ceil(targetDurationMin / INTERVAL_MINUTES);

    // We iterate by offset from "now" to keep IOB and COB aligned correctly
    for (let offset = 1; offset <= targetIntervals; offset++) {
        const intervalTime = new Date(now.getTime() + offset * INTERVAL_MINUTES * 60 * 1000);

        const iobIdx = safeIobNowIdx + offset;
        const cobIdx = safeCobNowIdx + offset;

        // IOB Impact
        const iobImpact = (iobTs.data && iobIdx < iobTs.data.length) ? iobTs.data[iobIdx].glucoseImpact : 0;

        // COB Impact
        const cobImpact = (cobTs.data && cobIdx < cobTs.data.length) ? cobTs.data[cobIdx].glucoseImpact : 0;


        // Future Basal Impact
        let futureBasalImpact = 0;
        if (futureBasalCurves.length > 0) {
            for (const curve of futureBasalCurves) {
                if (offset > 0 && curve.iobAtInterval[offset - 1] !== undefined && curve.iobAtInterval[offset] !== undefined) {
                    const activity = Math.max(0, curve.iobAtInterval[offset - 1]! - curve.iobAtInterval[offset]!);
                    futureBasalImpact += activity * isf;
                }
            }
        }

        // Apply unexplained trend, decaying it over time
        const intervalsSinceNow = offset;
        const baseDecay = 0.85; // Faster decay for "unexplained" noise (was 0.95)
        const adjustedDecay = Math.max(0.8, Math.min(0.99, baseDecay * momentumFactor));
        const decayFactor = Math.pow(adjustedDecay, intervalsSinceNow - 1);
        const currentUnexplainedImpact = unexplainedTrendPerInterval * decayFactor;

        // Apply phantom carb impact (decays linearly over 3 hours)


        runningSgv = runningSgv - iobImpact + cobImpact - futureBasalImpact + currentUnexplainedImpact;

        if (runningSgv < 0) runningSgv = 0;

        prediction.push({
            timestamp: intervalTime.toISOString(),
            sgv: Math.round(runningSgv * 10) / 10,
            iob: (iobTs.data && iobIdx < iobTs.data.length) ? iobTs.data[iobIdx].totalIOB : 0,
            cob: (cobTs.data && cobIdx < cobTs.data.length) ? cobTs.data[cobIdx].cob : 0,
            pendingCOB: (cobTs.data && cobIdx < cobTs.data.length) ? cobTs.data[cobIdx].pendingCOB : 0,
            activeCOB: (cobTs.data && cobIdx < cobTs.data.length) ? cobTs.data[cobIdx].activeCOB : 0
        });


        // Loop breaker
        const minutesSinceNow = offset * INTERVAL_MINUTES;
        if (durationMinutes !== undefined) {
            if (minutesSinceNow >= durationMinutes) break;
        } else {
            if (minutesSinceNow >= dia * 60) {
                const totalRemainingImpact = Math.abs(iobImpact) + Math.abs(cobImpact) + Math.abs(futureBasalImpact);
                if (totalRemainingImpact < 0.1) break;
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
    const activeISF = isf;
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
