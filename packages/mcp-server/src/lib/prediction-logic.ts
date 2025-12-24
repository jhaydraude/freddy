import { getIOB } from './iob-logic.js';
import { getCOB } from './cob-logic.js';
import { resolveActiveProfile, getProfileStore } from './profile-logic.js';
import { getGlucose } from './status-logic.js';
import { getStatusHistory } from './history-logic.js';

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
