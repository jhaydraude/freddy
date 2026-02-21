import { IActivityPoint } from './activity-logic';
import { IUserBaseline, calculateHRR } from './baseline-logic';

/**
 * Data collection state — determines whether the device is actively
 * collecting data based on HR presence.
 * 
 * Key principle: If HR data exists, the device is collecting, and step
 * data is trustworthy (even if 0). If HR is absent, device is not
 * collecting and step counts are unknown.
 */
export interface IDataCollectionState {
    isCollecting: boolean;        // HR data present = device is on
    hasStepData: boolean;         // Step records exist in this window
    hasHeartRateData: boolean;    // HR records exist in this window
    stepDataConfidence: 'known' | 'unknown';
    // 'known' = HR present, so step count is trustworthy (even if 0)
    // 'unknown' = HR absent, device not collecting, step count unreliable
}

/**
 * Activity impact on glucose
 */
export interface IActivityImpact {
    totalImpact: number;
    components: {
        steps: number;
        heartRate: number;
        stressHeartRate: number;  // Elevated HR without movement (glucose-raising)
    };
    intensity: 'unknown' | 'low' | 'moderate' | 'high' | 'very_high';
    dataAvailable: boolean;
    collectionState: IDataCollectionState;
    bouts: IActivityBout[];
}

/**
 * A continuous activity bout (≥3 consecutive active 5-min buckets)
 */
export interface IActivityBout {
    startTime: string;
    endTime: string;
    durationMinutes: number;
    totalSteps: number;
    avgHR: number;
    maxHR: number;
    isAerobic: boolean;           // Sustained moderate HR
    isAnaerobic: boolean;         // HR spikes > 70% HRR
    boutMultiplier: number;       // 1.0 for short, up to 2.0 for sustained
}

/**
 * Literature-based default coefficients for activity impact
 */
export const DEFAULT_ACTIVITY_COEFFICIENTS = {
    STEPS_PER_MINUTE: -1.0,       // mg/dL per step/min above baseline
    HR_SPIKE: +15.0,               // mg/dL for anaerobic HR elevation
    STRESS_HR: +8.0,               // mg/dL per 10% HRR elevation without steps
    POST_MEAL_MULTIPLIER: 1.5,     // Multiplier for exercise 30-90 min post-meal
};

export type ActivityCoefficients = typeof DEFAULT_ACTIVITY_COEFFICIENTS;

// ============================================================================
// Data Collection State
// ============================================================================

/**
 * Determine data collection state for a set of activity points.
 * HR presence = device collecting = step data is trustworthy.
 */
function determineCollectionState(activityData: IActivityPoint[]): IDataCollectionState {
    const hasHR = activityData.some(p => (p.heartRate?.bpm_avg || p.heartRate?.bpm || 0) > 0);
    const hasSteps = activityData.some(p => (p.steps?.count || 0) > 0);

    return {
        isCollecting: hasHR,
        hasStepData: hasSteps,
        hasHeartRateData: hasHR,
        stepDataConfidence: hasHR ? 'known' : 'unknown'
    };
}

// ============================================================================
// Individual Impact Calculations
// ============================================================================

/**
 * Calculate glucose impact from steps (aerobic activity).
 * Uses HRR-based intensity when baseline is available.
 */
function calculateStepsImpact(
    totalSteps: number,
    intervalMinutes: number,
    coefficients: ActivityCoefficients,
    baseline?: IUserBaseline,
    boutMultiplier: number = 1.0
): number {
    if (totalSteps === 0 || intervalMinutes === 0) return 0;

    const stepsPerMinute = totalSteps / intervalMinutes;

    // Calculate intensity relative to baseline
    let intensity = 0;
    if (baseline?.avgStepsPerMin) {
        intensity = (stepsPerMinute - baseline.avgStepsPerMin) / baseline.avgStepsPerMin;
    } else {
        // Fallback: relative to light movement (20 steps/min)
        // This ensures light activity is captured instead of requiring >100 steps/min
        intensity = (stepsPerMinute - 20) / 20;
    }

    // Only apply impact if above baseline
    if (intensity <= 0) return 0;

    return intensity * coefficients.STEPS_PER_MINUTE * intervalMinutes * boutMultiplier;
}



/**
 * Calculate glucose impact from heart rate elevation using HRR.
 * High HRR (>70%) indicates anaerobic activity (glucose spike).
 */
function calculateHRImpact(
    avgHeartRate: number,
    coefficients: ActivityCoefficients,
    baseline?: IUserBaseline
): number {
    if (avgHeartRate === 0) return 0;

    const restingHR = baseline?.restingHR || 70;
    const maxHR = baseline?.maxHR || 185;

    const hrr = calculateHRR(avgHeartRate, restingHR, maxHR);

    // Only apply anaerobic HR spike impact at high intensity (>70% HRR)
    if (hrr < 0.70) return 0;

    return hrr * coefficients.HR_SPIKE;
}

/**
 * Calculate stress heart rate impact — elevated HR without movement.
 * This is a glucose-RAISING signal (cortisol/adrenaline).
 * Only fires when step data confidence is 'known' (device collecting).
 */
function calculateStressHRImpact(
    avgHeartRate: number,
    totalSteps: number,
    collectionState: IDataCollectionState,
    coefficients: ActivityCoefficients,
    baseline?: IUserBaseline
): number {
    // Can only detect stress when device is collecting (steps are trustworthy)
    if (!collectionState.isCollecting) return 0;
    // If there are steps, it's exercise not stress
    if (totalSteps > 0) return 0;
    if (avgHeartRate === 0) return 0;

    const restingHR = baseline?.restingHR || 70;
    const maxHR = baseline?.maxHR || 185;

    const hrr = calculateHRR(avgHeartRate, restingHR, maxHR);

    // Only flag stress when HR is elevated >30% HRR
    if (hrr < 0.30) return 0;

    // Scale by how elevated the HR is (per 10% HRR)
    return (hrr / 0.10) * coefficients.STRESS_HR;
}

// ============================================================================
// Post-Meal Exercise Multiplier
// ============================================================================

/**
 * Calculate post-meal exercise multiplier.
 * Post-prandial exercise (30-90 min after meal) has amplified glucose-lowering.
 * 
 * @param minutesSinceLastCarbs Minutes since last carb intake (null if unknown)
 * @returns Multiplier for glucose-lowering activity impact
 */
export function getPostMealMultiplier(minutesSinceLastCarbs: number | null): number {
    if (minutesSinceLastCarbs == null) return 1.0;
    if (minutesSinceLastCarbs < 30) return 0.8;     // Too early
    if (minutesSinceLastCarbs <= 90) return 1.5;     // Optimal window
    if (minutesSinceLastCarbs <= 180) return 1.2;    // Still beneficial
    return 1.0;                                       // Fasted / >3h post-meal
}

// ============================================================================
// Continuous Activity Bout Detection
// ============================================================================

/**
 * Detect continuous activity bouts from bucketed activity data.
 * A bout is ≥3 consecutive 5-min buckets with either:
 *   - Steps > threshold (30 steps/5min), or
 *   - HR elevated above 30% HRR
 * 
 * @param activityData Bucketed activity points (sorted chronologically)
 * @param baseline User baseline for HRR calculation
 * @returns Detected activity bouts
 */
export function detectActivityBouts(
    activityData: IActivityPoint[],
    baseline?: IUserBaseline
): IActivityBout[] {
    if (activityData.length < 3) return [];

    const STEP_THRESHOLD = 30;    // Minimum steps per 5-min bucket to count as active
    const HRR_THRESHOLD = 0.30;   // Minimum HRR to count as HR-elevated
    const MIN_BOUT_BUCKETS = 3;   // Minimum consecutive active buckets (15 min)

    const restingHR = baseline?.restingHR || 70;
    const maxHR = baseline?.maxHR || 185;

    // Mark each bucket as active or not
    const bucketActive: boolean[] = activityData.map(p => {
        const steps = p.steps?.count || 0;
        const hr = p.heartRate?.bpm_avg || p.heartRate?.bpm || 0;
        const hrr = hr > 0 ? calculateHRR(hr, restingHR, maxHR) : 0;

        return steps > STEP_THRESHOLD || hrr > HRR_THRESHOLD;
    });

    // Find consecutive active runs
    const bouts: IActivityBout[] = [];
    let boutStart = -1;

    for (let i = 0; i <= bucketActive.length; i++) {
        if (i < bucketActive.length && bucketActive[i]) {
            if (boutStart === -1) boutStart = i;
        } else {
            if (boutStart !== -1 && (i - boutStart) >= MIN_BOUT_BUCKETS) {
                const boutPoints = activityData.slice(boutStart, i);
                const durationMin = boutPoints.length * 5;

                let totalSteps = 0;
                let hrSum = 0;
                let hrCount = 0;
                let peakHR = 0;
                let anaerobicBuckets = 0;

                for (const p of boutPoints) {
                    totalSteps += p.steps?.count || 0;
                    const hr = p.heartRate?.bpm_avg || p.heartRate?.bpm || 0;
                    if (hr > 0) {
                        hrSum += hr;
                        hrCount++;
                        peakHR = Math.max(peakHR, p.heartRate?.bpm_max || hr);
                        if (calculateHRR(hr, restingHR, maxHR) > 0.70) {
                            anaerobicBuckets++;
                        }
                    }
                }

                const avgHR = hrCount > 0 ? hrSum / hrCount : 0;
                const avgHRR = avgHR > 0 ? calculateHRR(avgHR, restingHR, maxHR) : 0;

                // Bout multiplier: scales from 1.0 (15 min) to 2.0 (60+ min)
                const boutMultiplier = Math.min(2.0, 1.0 + (durationMin - 15) / 45);

                bouts.push({
                    startTime: boutPoints[0].timestamp,
                    endTime: boutPoints[boutPoints.length - 1].timestamp,
                    durationMinutes: durationMin,
                    totalSteps,
                    avgHR: Math.round(avgHR),
                    maxHR: peakHR,
                    isAerobic: avgHRR >= 0.30 && avgHRR < 0.70,
                    isAnaerobic: anaerobicBuckets > boutPoints.length * 0.3,
                    boutMultiplier: Math.round(boutMultiplier * 100) / 100
                });
            }
            boutStart = -1;
        }
    }

    return bouts;
}

// ============================================================================
// Activity Intensity Classification
// ============================================================================

/**
 * Determine activity intensity based on combined metrics using HRR.
 */
function determineIntensity(
    totalSteps: number,
    intervalMinutes: number,
    avgHeartRate: number,
    baseline?: IUserBaseline
): 'low' | 'moderate' | 'high' | 'very_high' {
    const stepsPerMin = intervalMinutes > 0 ? totalSteps / intervalMinutes : 0;
    const restingHR = baseline?.restingHR || 70;
    const maxHR = baseline?.maxHR || 185;

    const hrr = avgHeartRate > 0 ? calculateHRR(avgHeartRate, restingHR, maxHR) : 0;

    // Combined intensity score
    let score = 0;

    // Steps contribution
    if (stepsPerMin > 120) score += 3;
    else if (stepsPerMin > 100) score += 2;
    else if (stepsPerMin > 60) score += 1;

    // Heart rate contribution (using HRR thresholds)
    if (hrr > 0.70) score += 3;
    else if (hrr > 0.50) score += 2;
    else if (hrr > 0.30) score += 1;

    // Classify intensity
    if (score >= 5) return 'very_high';
    if (score >= 3) return 'high';
    if (score >= 2) return 'moderate';
    return 'low';
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Calculate total activity impact on glucose for a given time interval.
 * 
 * @param activityData - Array of activity data points
 * @param intervalMinutes - Duration of the interval
 * @param userBaseline - Optional user baseline metrics for personalization
 * @param coefficients - Activity impact coefficients
 * @param minutesSinceLastCarbs - Minutes since last carb intake (for post-meal multiplier)
 * @returns Activity impact breakdown
 */
export function calculateActivityImpact(
    activityData: IActivityPoint[],
    intervalMinutes: number,
    userBaseline?: IUserBaseline,
    coefficients: ActivityCoefficients = DEFAULT_ACTIVITY_COEFFICIENTS,
    minutesSinceLastCarbs: number | null = null
): IActivityImpact {
    // Determine data collection state
    const collectionState = determineCollectionState(activityData);

    // If device is not collecting (no HR data), we can't trust any data
    if (!collectionState.isCollecting) {
        return {
            totalImpact: 0,
            components: { steps: 0, calories: 0, stairs: 0, heartRate: 0, stressHeartRate: 0 },
            intensity: 'unknown',
            dataAvailable: false,
            collectionState,
            bouts: []
        };
    }

    // Aggregate activity metrics
    let totalSteps = 0;
    let totalCalories = 0;
    let totalFloors = 0;
    let avgHeartRate = 0;
    let maxHeartRate = 0;
    let hrCount = 0;

    for (const point of activityData) {
        totalSteps += point.steps?.count || 0;
        totalCalories += point.steps?.calories || 0;
        totalFloors += point.steps?.floors || 0;

        if (point.heartRate?.bpm_avg) {
            avgHeartRate += point.heartRate.bpm_avg;
            hrCount++;
        }
        if (point.heartRate?.bpm_max) {
            maxHeartRate = Math.max(maxHeartRate, point.heartRate.bpm_max);
        }
    }

    // Calculate average heart rate
    if (hrCount > 0) {
        avgHeartRate = avgHeartRate / hrCount;
    }

    // Detect continuous activity bouts
    const bouts = detectActivityBouts(activityData, userBaseline);

    // Use the best bout multiplier (if any bouts detected)
    const bestBoutMultiplier = bouts.length > 0
        ? Math.max(...bouts.map(b => b.boutMultiplier))
        : 1.0;

    // Post-meal exercise multiplier (only applies to glucose-lowering components)
    const mealMultiplier = getPostMealMultiplier(minutesSinceLastCarbs);

    // Calculate individual impacts
    const stepsImpact = calculateStepsImpact(totalSteps, intervalMinutes, coefficients, userBaseline, bestBoutMultiplier) * mealMultiplier;
    const hrImpact = calculateHRImpact(avgHeartRate, coefficients, userBaseline);
    const stressHRImpact = calculateStressHRImpact(avgHeartRate, totalSteps, collectionState, coefficients, userBaseline);

    // Total impact
    const totalImpact = stepsImpact + hrImpact + stressHRImpact;

    // Determine intensity
    const intensity = determineIntensity(
        totalSteps,
        intervalMinutes,
        avgHeartRate,
        userBaseline
    );

    return {
        totalImpact: Math.round(totalImpact * 10) / 10,
        components: {
            steps: Math.round(stepsImpact * 10) / 10,
            heartRate: Math.round(hrImpact * 10) / 10,
            stressHeartRate: Math.round(stressHRImpact * 10) / 10
        },
        intensity,
        dataAvailable: true,
        collectionState,
        bouts
    };
}

/**
 * @deprecated Use getBaseline() from baseline-logic.ts instead.
 * Kept for backward compatibility.
 */
export async function calculateUserBaseline(
    historicalActivity: IActivityPoint[]
): Promise<IUserBaseline> {
    let totalSteps = 0;
    let totalMinutes = 0;
    let totalHR = 0;
    let hrCount = 0;

    for (const point of historicalActivity) {
        if (point.steps?.count) {
            totalSteps += point.steps.count;
            totalMinutes += 5;
        }
        if (point.heartRate?.bpm_avg) {
            totalHR += point.heartRate.bpm_avg;
            hrCount++;
        }
    }

    const avgStepsPerMin = totalMinutes > 0 ? totalSteps / totalMinutes : 50;
    const restingHR = hrCount > 0 ? totalHR / hrCount : 70;

    return {
        avgStepsPerMin: Math.round(avgStepsPerMin * 10) / 10,
        restingHR: Math.round(restingHR),
        maxHR: 185,
        overnightHR_p10: Math.round(restingHR),
        lastUpdated: new Date().toISOString()
    };
}
