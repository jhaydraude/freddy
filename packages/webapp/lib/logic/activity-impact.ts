import { IActivityPoint } from './activity-logic';

/**
 * Activity impact on glucose
 */
export interface IActivityImpact {
    totalImpact: number;
    components: {
        steps: number;
        calories: number;
        stairs: number;
        heartRate: number;
    };
    intensity: 'unknown' | 'low' | 'moderate' | 'high' | 'very_high';
    dataAvailable: boolean;
}

/**
 * User baseline activity metrics for relative intensity calculation
 */
export interface IUserBaseline {
    avgStepsPerMin: number;
    restingHR: number;
}

/**
 * Literature-based default coefficients for activity impact
 */
export const DEFAULT_ACTIVITY_COEFFICIENTS = {
    STEPS_PER_MINUTE: -1.0,      // mg/dL per step/min above baseline
    CALORIES: -0.4,               // mg/dL per kcal
    STAIRS: +10.0,                // mg/dL per floor (initial spike)
    HR_SPIKE: +15.0,              // mg/dL for 50% HR elevation
};

export type ActivityCoefficients = typeof DEFAULT_ACTIVITY_COEFFICIENTS;

/**
 * Calculate glucose impact from steps (aerobic activity)
 */
function calculateStepsImpact(
    totalSteps: number,
    intervalMinutes: number,
    coefficients: ActivityCoefficients,
    baseline?: IUserBaseline
): number {
    if (totalSteps === 0 || intervalMinutes === 0) return 0;

    const stepsPerMinute = totalSteps / intervalMinutes;

    // Calculate intensity relative to baseline (if available)
    let intensity = 0;
    if (baseline?.avgStepsPerMin) {
        // Relative to user's typical activity
        intensity = (stepsPerMinute - baseline.avgStepsPerMin) / baseline.avgStepsPerMin;
    } else {
        // Fallback: relative to moderate activity (100 steps/min)
        intensity = (stepsPerMinute - 100) / 100;
    }

    // Only apply impact if above baseline
    if (intensity <= 0) return 0;

    return intensity * coefficients.STEPS_PER_MINUTE * intervalMinutes;
}

/**
 * Calculate glucose impact from calories burned
 */
function calculateCaloriesImpact(totalCalories: number, coefficients: ActivityCoefficients): number {
    if (totalCalories === 0) return 0;
    return totalCalories * coefficients.CALORIES;
}

/**
 * Calculate glucose impact from stairs (anaerobic spike)
 */
function calculateStairsImpact(totalFloors: number, coefficients: ActivityCoefficients): number {
    if (totalFloors === 0) return 0;
    // Stairs cause an initial spike due to anaerobic stress
    return totalFloors * coefficients.STAIRS;
}

/**
 * Calculate glucose impact from heart rate elevation
 */
function calculateHRImpact(
    avgHeartRate: number,
    maxHeartRate: number,
    coefficients: ActivityCoefficients,
    baseline?: IUserBaseline
): number {
    if (avgHeartRate === 0) return 0;

    const restingHR = baseline?.restingHR || 70; // Default resting HR
    const hrElevation = (avgHeartRate - restingHR) / restingHR;

    // Only apply impact if HR is significantly elevated (>30%)
    if (hrElevation < 0.3) return 0;

    // High HR elevation indicates anaerobic activity (causes glucose spike)
    return hrElevation * coefficients.HR_SPIKE;
}

/**
 * Determine activity intensity based on combined metrics
 */
function determineIntensity(
    totalSteps: number,
    intervalMinutes: number,
    avgHeartRate: number,
    totalFloors: number,
    baseline?: IUserBaseline
): 'low' | 'moderate' | 'high' | 'very_high' {
    const stepsPerMin = intervalMinutes > 0 ? totalSteps / intervalMinutes : 0;
    const restingHR = baseline?.restingHR || 70;
    const hrElevation = avgHeartRate > 0 ? (avgHeartRate - restingHR) / restingHR : 0;

    // Combined intensity score
    let score = 0;

    // Steps contribution
    if (stepsPerMin > 120) score += 3;
    else if (stepsPerMin > 100) score += 2;
    else if (stepsPerMin > 60) score += 1;

    // Heart rate contribution
    if (hrElevation > 0.6) score += 3;
    else if (hrElevation > 0.4) score += 2;
    else if (hrElevation > 0.2) score += 1;

    // Stairs contribution (high intensity indicator)
    if (totalFloors > 5) score += 2;
    else if (totalFloors > 2) score += 1;

    // Classify intensity
    if (score >= 6) return 'very_high';
    if (score >= 4) return 'high';
    if (score >= 2) return 'moderate';
    return 'low';
}

/**
 * Calculate total activity impact on glucose for a given time interval
 * 
 * @param activityData - Array of activity data points
 * @param intervalMinutes - Duration of the interval
 * @param userBaseline - Optional user baseline metrics for personalization
 * @returns Activity impact breakdown
 */
export function calculateActivityImpact(
    activityData: IActivityPoint[],
    intervalMinutes: number,
    userBaseline?: IUserBaseline,
    coefficients: ActivityCoefficients = DEFAULT_ACTIVITY_COEFFICIENTS
): IActivityImpact {
    // Check for missing data
    const hasData = activityData.some(p =>
        (p.steps?.count || 0) > 0 ||
        (p.heartRate?.bpm_avg || 0) > 0
    );

    if (!hasData) {
        // No activity data available - return zero impact
        return {
            totalImpact: 0,
            components: { steps: 0, calories: 0, stairs: 0, heartRate: 0 },
            intensity: 'unknown',
            dataAvailable: false
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

    // Calculate individual impacts
    const stepsImpact = calculateStepsImpact(totalSteps, intervalMinutes, coefficients, userBaseline);
    const caloriesImpact = calculateCaloriesImpact(totalCalories, coefficients);
    const stairsImpact = calculateStairsImpact(totalFloors, coefficients);
    const hrImpact = calculateHRImpact(avgHeartRate, maxHeartRate, coefficients, userBaseline);

    // Total impact (aerobic effects are negative, anaerobic are positive)
    const totalImpact = stepsImpact + caloriesImpact + stairsImpact + hrImpact;

    // Determine intensity
    const intensity = determineIntensity(
        totalSteps,
        intervalMinutes,
        avgHeartRate,
        totalFloors,
        userBaseline
    );

    return {
        totalImpact: Math.round(totalImpact * 10) / 10,
        components: {
            steps: Math.round(stepsImpact * 10) / 10,
            calories: Math.round(caloriesImpact * 10) / 10,
            stairs: Math.round(stairsImpact * 10) / 10,
            heartRate: Math.round(hrImpact * 10) / 10
        },
        intensity,
        dataAvailable: true
    };
}

/**
 * Calculate user baseline activity metrics from historical data
 * This should be called periodically to update the user's typical activity levels
 * 
 * @param historicalActivity - 7 days of activity data
 * @returns User baseline metrics
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
            totalMinutes += 5; // Each point is 5 minutes
        }

        if (point.heartRate?.bpm_avg) {
            totalHR += point.heartRate.bpm_avg;
            hrCount++;
        }
    }

    const avgStepsPerMin = totalMinutes > 0 ? totalSteps / totalMinutes : 50; // Default 50 steps/min
    const restingHR = hrCount > 0 ? totalHR / hrCount : 70; // Default 70 bpm

    return {
        avgStepsPerMin: Math.round(avgStepsPerMin * 10) / 10,
        restingHR: Math.round(restingHR)
    };
}
