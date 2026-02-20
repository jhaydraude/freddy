import { SituationTag, Entry, Treatment } from '../db/models';
import { IStatusResult } from './types';
import { getStatusHistory } from './history-logic';
import { detectActivityBouts } from './activity-impact';
import { getBaseline, calculateHRR, IUserBaseline } from './baseline-logic';
import { IActivityPoint } from './activity-logic';

export interface ISituationFeatures {
    // === Temporal ===
    hour_sin: number;
    hour_cos: number;
    is_weekend: number;

    // === Glucose Pattern ===
    glucose_mean: number;
    glucose_std: number;
    glucose_trend_slope: number;
    glucose_volatility: number;
    glucose_delta_30m: number;

    // === Metabolic Trajectory ===
    iob: number;
    cob: number;
    unexplained_mean_30m: number;

    // === Meal & Insulin Context ===
    minutes_since_last_carbs: number;
    last_meal_cob: number;
    minutes_since_last_bolus: number;
    active_insulin_3h: number; // Total units in last 3h
    bolus_count_3h: number;

    // === Delayed Activity Impact ===
    activity_impact_1h: number;
    activity_impact_3h: number;
    activity_impact_6h: number;
    activity_impact_12h: number;
    activity_impact_24h: number;         // NEW: next-day insulin sensitivity

    // === Enhanced Activity Signals ===
    days_since_last_exercise: number;    // NEW: regularity/training effect (0-7)
    exercise_type: number;               // NEW: -1=aerobic, 0=none/mixed, 1=anaerobic
    elevated_hr_no_steps: number;        // NEW: stress signal (0 or 1)
    post_meal_exercise: number;          // NEW: 1 if exercising 30-90min post-meal

    // === Sensor Health & Data Context ===
    sensor_age_hours: number;
    glucose_density: number; // 0-1.0
    hr_density: number;      // 0-1.0
    steps_density: number;   // 0-1.0
}

/**
 * Tunable Activity Decay Function
 * peakDelayHours: How many hours until exercise hits maximum effect on glucose.
 * decayHalfLife: How many hours until the effect is halved.
 */
export function calculateActivityImpact(
    currentTime: Date,
    activities: any[],
    lookbackHours: number,
    peakDelayHours: number = 2.0,
    decayHalfLife: number = 3.0
): number {
    let impact = 0;

    for (const activity of activities) {
        const activityTime = new Date(activity.date || activity.startTime || activity.timestamp);
        const hoursAgo = (currentTime.getTime() - activityTime.getTime()) / (1000 * 60 * 60);

        if (hoursAgo < 0 || hoursAgo > lookbackHours) continue;

        // Impact curve
        const timeSincePeak = hoursAgo - peakDelayHours;
        const decayFactor = timeSincePeak > 0
            ? Math.exp(-0.693 * timeSincePeak / decayHalfLife)
            : Math.exp(0.5 * timeSincePeak); // Ramp up before peak

        let intensity = 0;

        if (activity.steps != null) {
            intensity = (activity.steps || 0) / 100;
        } else if (activity.heartrate != null) {
            intensity = (activity.heartrate - 70) / 20;
        } else if (activity.type === 'exercise') {
            // Support legacy or other types if they exist
            const data = activity.data || {};
            intensity = (data.intensity || 5) * 5;
        }

        impact += Math.max(0, intensity) * decayFactor;
    }

    return impact;
}

export class SituationFeatureExtractor {
    static async extractFeaturesForWindow(
        windowEnd: Date,
        history: IStatusResult[]
    ): Promise<ISituationFeatures> {
        if (!history || history.length === 0) {
            throw new Error("Cannot extract features for empty history");
        }

        const latestStatus = history[history.length - 1]!;
        const glucoseValues = history.map(h => h.glucose?.current.sgv).filter(g => g !== undefined) as number[];

        // Temporal
        const hours = windowEnd.getHours() + windowEnd.getMinutes() / 60;
        const hour_sin = Math.sin(2 * Math.PI * hours / 24);
        const hour_cos = Math.cos(2 * Math.PI * hours / 24);
        const is_weekend = (windowEnd.getDay() === 0 || windowEnd.getDay() === 6) ? 1 : 0;

        // Glucose Patterns (using the provided history slice)
        const glucose_mean = glucoseValues.reduce((a, b) => a + b, 0) / glucoseValues.length;
        const glucose_std = Math.sqrt(glucoseValues.map(x => Math.pow(x - glucose_mean, 2)).reduce((a, b) => a + b, 0) / glucoseValues.length);

        // Simple slope (end - start) / hours
        const firstSgv = glucoseValues[0]!;
        const lastSgv = glucoseValues[glucoseValues.length - 1]!;
        const glucose_trend_slope = (lastSgv - firstSgv); // Simple delta for the window

        // Volatility (std of deltas)
        const deltas = [];
        for (let i = 1; i < glucoseValues.length; i++) {
            deltas.push(glucoseValues[i]! - glucoseValues[i - 1]!);
        }
        const deltaMean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        const glucose_volatility = deltas.length > 0
            ? Math.sqrt(deltas.map(x => Math.pow(x - deltaMean, 2)).reduce((a, b) => a + b, 0) / deltas.length)
            : 0;

        // IOB/COB
        const iob = latestStatus.iob?.calculated?.totalIOB || 0;
        const cob = latestStatus.cob?.calculated?.cob || 0;

        // Unexplained drift (30m average)
        const unexplainedValues = history.map(h => {
            const attr = h.attribution?.timeframes?.find((tf: any) => tf.minutes === 30);
            return attr?.components?.unexplained || 0;
        });
        const unexplained_mean_30m = unexplainedValues.reduce((a, b) => a + b, 0) / unexplainedValues.length;

        // Fetch Treatments (Meals & Insulin) - Lookback 6h
        const treatmentLookbackStart = new Date(windowEnd.getTime() - 6 * 60 * 60 * 1000);
        const treatments = await Treatment.find({
            created_at: { $gte: treatmentLookbackStart.toISOString(), $lte: windowEnd.toISOString() }
        }).sort({ created_at: 1 }); // Sorted oldest to newest

        // Meal Context
        const carbTreatments = treatments.filter(t => t.carbs && t.carbs > 0);
        const lastCarbTreatment = carbTreatments.length > 0 ? carbTreatments[carbTreatments.length - 1] : null;
        let minutes_since_last_carbs = 360; // Default to max lookback if none found
        let last_meal_cob = 0;

        if (lastCarbTreatment) {
            minutes_since_last_carbs = (windowEnd.getTime() - new Date(lastCarbTreatment.created_at).getTime()) / (1000 * 60);
            last_meal_cob = lastCarbTreatment.carbs || 0;
        }

        // Insulin Context (Last 3h)
        const insulinLookbackStart = new Date(windowEnd.getTime() - 3 * 60 * 60 * 1000);
        const recentTreatments = treatments.filter(t => new Date(t.created_at) >= insulinLookbackStart);

        const insulinTreatments = recentTreatments.filter(t => t.insulin && t.insulin > 0);
        const lastBolusTreatment = insulinTreatments.length > 0 ? insulinTreatments[insulinTreatments.length - 1] : null;

        let minutes_since_last_bolus = 180; // Default to max lookback if none found
        if (lastBolusTreatment) {
            minutes_since_last_bolus = (windowEnd.getTime() - new Date(lastBolusTreatment.created_at).getTime()) / (1000 * 60);
        }

        const active_insulin_3h = insulinTreatments.reduce((sum, t) => sum + (t.insulin || 0), 0);
        const bolus_count_3h = insulinTreatments.length;

        // Activity (Need to fetch from DB for longer lookback - extended to 24h)
        const lookbackStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
        const activities = await Entry.find({
            type: 'activity',
            stale: { $ne: true },
            date: { $gte: lookbackStart.getTime(), $lte: windowEnd.getTime() }
        }).lean();

        const activity_impact_1h = calculateActivityImpact(windowEnd, activities, 1);
        const activity_impact_3h = calculateActivityImpact(windowEnd, activities, 3);
        const activity_impact_6h = calculateActivityImpact(windowEnd, activities, 6);
        // 12h lookback with longer half-life (6h) to capture extended insulin sensitivity
        const activity_impact_12h = calculateActivityImpact(windowEnd, activities, 12, 2.0, 6.0);
        // 24h lookback with very long half-life (12h) for next-day effects
        const activity_impact_24h = calculateActivityImpact(windowEnd, activities, 24, 2.0, 12.0);

        // === Enhanced Activity Signals ===
        let userBaseline: IUserBaseline | undefined;
        try {
            userBaseline = await getBaseline();
        } catch (e) {
            // Baseline not available, use defaults
        }

        // Days since last exercise (find last bout of ≥15 min)
        const activityPoints: IActivityPoint[] = activities.map((a: any) => ({
            timestamp: new Date(a.date).toISOString(),
            steps: a.steps != null ? { count: a.steps } : undefined,
            heartRate: a.heartrate != null ? { bpm: a.heartrate, bpm_avg: a.heartrate } : undefined
        }));
        const bouts = detectActivityBouts(activityPoints, userBaseline);
        let days_since_last_exercise = 7; // Default: no recent exercise
        if (bouts.length > 0) {
            const lastBoutEnd = new Date(bouts[bouts.length - 1].endTime);
            days_since_last_exercise = Math.min(7, (windowEnd.getTime() - lastBoutEnd.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Exercise type: classify from recent bouts (within 3h)
        const recentBouts = bouts.filter(b => {
            const hoursAgo = (windowEnd.getTime() - new Date(b.endTime).getTime()) / (1000 * 60 * 60);
            return hoursAgo <= 3;
        });
        let exercise_type = 0; // 0 = none/mixed
        if (recentBouts.length > 0) {
            const aerobicCount = recentBouts.filter(b => b.isAerobic).length;
            const anaerobicCount = recentBouts.filter(b => b.isAnaerobic).length;
            if (aerobicCount > anaerobicCount) exercise_type = -1;
            else if (anaerobicCount > aerobicCount) exercise_type = 1;
        }

        // Elevated HR without steps (stress signal)
        // Check the most recent 15 min of data
        const recentWindow = 15 * 60 * 1000;
        const recentActivities = activities.filter((a: any) =>
            windowEnd.getTime() - a.date <= recentWindow
        );
        const recentHRRecords = recentActivities.filter((a: any) => a.heartrate != null);
        const recentStepRecords = recentActivities.filter((a: any) => a.steps != null && a.steps > 0);
        let elevated_hr_no_steps = 0;
        if (recentHRRecords.length > 0 && recentStepRecords.length === 0) {
            // HR is present (device collecting) but no steps — check if HR is elevated
            const avgRecentHR = recentHRRecords.reduce((sum: number, a: any) => sum + a.heartrate, 0) / recentHRRecords.length;
            const restingHR = userBaseline?.restingHR || 70;
            const maxHR = userBaseline?.maxHR || 185;
            const hrr = calculateHRR(avgRecentHR, restingHR, maxHR);
            if (hrr > 0.30) elevated_hr_no_steps = 1;
        }

        // Post-meal exercise: check if there's exercise 30-90 min after last meal
        let post_meal_exercise = 0;
        if (recentBouts.length > 0 && minutes_since_last_carbs >= 30 && minutes_since_last_carbs <= 90) {
            post_meal_exercise = 1;
        }

        // Density Calculations
        const windowSizeMin = 45;
        const totalMinutes = windowSizeMin;

        // Glucose Density (expected 5m interval)
        const expectedGlucosePoints = Math.ceil(windowSizeMin / 5);
        const glucose_density = Math.min(1.0, glucoseValues.length / expectedGlucosePoints);

        const hrRecords = activities.filter(a => a.heartrate != null);
        const hrMinutesWithData = new Set(hrRecords.map(r => {
            const d = new Date(r.date);
            return d.getMinutes() + 60 * d.getHours();
        })).size;
        const hr_density = Math.min(1.0, hrMinutesWithData / totalMinutes);

        const stepRecords = activities.filter(a => a.steps != null);
        const stepsMinutesWithData = new Set(stepRecords.map(r => {
            const d = new Date(r.date);
            return d.getMinutes() + 60 * d.getHours();
        })).size;
        const steps_density = Math.min(1.0, stepsMinutesWithData / totalMinutes);

        const features: ISituationFeatures = {
            hour_sin,
            hour_cos,
            is_weekend,
            glucose_mean,
            glucose_std,
            glucose_trend_slope,
            glucose_volatility,
            glucose_delta_30m: glucose_trend_slope, // approximated
            iob,
            cob,
            unexplained_mean_30m,
            minutes_since_last_carbs,
            last_meal_cob,
            minutes_since_last_bolus,
            active_insulin_3h,
            bolus_count_3h,
            activity_impact_1h,
            activity_impact_3h,
            activity_impact_6h,
            activity_impact_12h,
            activity_impact_24h,
            days_since_last_exercise,
            exercise_type,
            elevated_hr_no_steps,
            post_meal_exercise,
            sensor_age_hours: latestStatus.glucose?.sensor.age || 0,
            glucose_density,
            hr_density,
            steps_density
        };

        // Sanitize NaN values to 0
        for (const key in features) {
            if (isNaN((features as any)[key])) {
                (features as any)[key] = 0;
            }
        }

        return features;
    }
}
