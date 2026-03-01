import { IStatusResult, IAttributionResult, IAttributionTimeframe, IAttributionHistoryPoint } from './types';
import { getActivityHistory } from './activity-logic';
import { calculateActivityImpact, DEFAULT_ACTIVITY_COEFFICIENTS, ActivityCoefficients } from './activity-impact';
import { getBaseline, IUserBaseline } from './baseline-logic';

/**
 * Calculate glucose change attribution for multiple timeframes.
 * 
 * @param currentStatus - Current status with IOB/COB timeseries
 * @param timeframes - Minutes to look back (e.g., [5, 10, 15, 30])
 * @returns Attribution breakdown for each timeframe
 */
export async function attributeGlucoseChange(
    currentStatus: IStatusResult,
    timeframes: number[] = [5, 10, 15, 30]
): Promise<IAttributionResult> {
    const attributions: IAttributionTimeframe[] = [];

    // Get current glucose and deltas
    const currentGlucose = currentStatus.glucose?.current?.sgv || 0;
    const delta5m = currentStatus.glucose?.current?.delta5m || 0;
    const delta10m = currentStatus.glucose?.current?.delta10m || 0;
    const delta15m = currentStatus.glucose?.current?.delta15m || 0;
    const delta30m = currentStatus.glucose?.current?.delta30m || 0;
    const history30m = currentStatus.glucose?.current?.history30m || [];

    // Get profile settings
    const isf = currentStatus.profile?.profileData?.sens?.[0]?.value || 50;
    const carbRatio = currentStatus.profile?.profileData?.carbratio?.[0]?.value || 10;

    // Get timeseries data (if available)
    const iobTimeseries = (currentStatus.iob as any)?.timeseries;
    const cobTimeseries = (currentStatus.cob as any)?.timeseries;

    // Resolve Activity Coefficients
    let activityCoefficients: ActivityCoefficients = DEFAULT_ACTIVITY_COEFFICIENTS;
    if (currentStatus.profile?.profileData?.activity_coefficients) {
        const ac = currentStatus.profile.profileData.activity_coefficients;
        activityCoefficients = {
            STEPS_PER_MINUTE: ac.steps_per_minute,
            HR_SPIKE: ac.hr_spike,
            STRESS_HR: ac.stress_hr ?? DEFAULT_ACTIVITY_COEFFICIENTS.STRESS_HR,
            POST_MEAL_MULTIPLIER: ac.post_meal_multiplier ?? DEFAULT_ACTIVITY_COEFFICIENTS.POST_MEAL_MULTIPLIER
        };
    }

    // Fetch activity data and user baseline for the attribution window
    const now = new Date(currentStatus.meta?.status_date || new Date());
    const lookback = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes
    let activityData: any[] = [];
    let userBaseline: IUserBaseline | undefined;
    try {
        [activityData, userBaseline] = await Promise.all([
            getActivityHistory(lookback, now, 5),
            getBaseline()
        ]);
    } catch (error) {
        console.warn('Failed to fetch activity data/baseline for attribution:', error);
    }

    // Determine minutes since last carbs for post-meal exercise multiplier
    const carbTreatments = currentStatus.treatments?.filter((t: any) => t.carbs && t.carbs > 0) || [];
    const lastCarbTreatment = carbTreatments.length > 0 ? carbTreatments[carbTreatments.length - 1] : null;
    const minutesSinceLastCarbs = lastCarbTreatment
        ? (now.getTime() - new Date(lastCarbTreatment.created_at).getTime()) / (1000 * 60)
        : null;

    for (const minutes of timeframes) {
        // Determine actual glucose change
        let actualChange = 0;
        if (minutes === 5) actualChange = delta5m;
        else if (minutes === 10) actualChange = delta10m;
        else if (minutes === 15) actualChange = delta15m;
        else if (minutes === 30) actualChange = delta30m;

        // Calculate interval count (1 interval = 5 min)
        const intervalCount = Math.round(minutes / 5);

        // Calculate insulin and basal impacts from timeseries
        let insulinImpact = 0;
        let insulinActivity = 0;
        let basalImpact = 0;
        let basalDeviation = 0;

        if (iobTimeseries && iobTimeseries.data) {
            const nowIdx = (iobTimeseries as any).nowIndex ?? (iobTimeseries.data.length - 1);
            for (let i = 0; i < intervalCount; i++) {
                const idx = nowIdx - i;
                if (idx > 0 && idx < iobTimeseries.data.length) {
                    const currentPoint = iobTimeseries.data[idx];
                    const prevPoint = iobTimeseries.data[idx - 1];

                    if (currentPoint && prevPoint) {
                        // Bolus part
                        const bolusAct = Math.max(0, (prevPoint.bolusIOB || 0) - (currentPoint.bolusIOB || 0));
                        insulinImpact -= bolusAct * isf;
                        insulinActivity += bolusAct;

                        // Basal deviation part
                        const basalAct = (prevPoint.basalIOB || 0) - (currentPoint.basalIOB || 0);
                        basalImpact -= basalAct * isf;
                        basalDeviation += basalAct;
                    }
                }
            }
        }

        // Calculate carb impact
        let carbImpact = 0;
        let carbAbsorption = 0;
        if (cobTimeseries && (cobTimeseries as any).data) {
            const nowIdx = (cobTimeseries as any).nowIndex ?? (cobTimeseries.data.length - 1);
            for (let i = 0; i < intervalCount; i++) {
                const idx = nowIdx - i;
                const point = (cobTimeseries as any).data[idx];
                if (point) {
                    carbImpact += point.glucoseImpact || 0;
                    carbAbsorption += point.absorption || 0;
                }
            }
        }

        // Calculate activity impact
        const activityImpactData = calculateActivityImpact(
            activityData.slice(-intervalCount), // Last N intervals
            minutes,
            userBaseline,
            activityCoefficients,
            minutesSinceLastCarbs
        );
        const activityImpact = activityImpactData.totalImpact;

        const predictedChange = insulinImpact + carbImpact + basalImpact + activityImpact;
        const unexplained = actualChange - predictedChange;

        const timeframeName = `${minutes}min` as '5min' | '10min' | '15min' | '30min';

        attributions.push({
            timeframe: timeframeName,
            minutes,
            glucoseChange: {
                actual: Math.round(actualChange * 10) / 10,
                predicted: Math.round(predictedChange * 10) / 10
            },
            components: {
                insulin: {
                    value: Math.round(insulinImpact * 10) / 10,
                    activity: Math.round(insulinActivity * 1000) / 1000,
                    isf: Math.round(isf * 10) / 10
                },
                carbs: {
                    value: Math.round(carbImpact * 10) / 10,
                    absorption: Math.round(carbAbsorption * 10) / 10,
                    carbRatio: Math.round(carbRatio * 10) / 10
                },
                basal: {
                    value: Math.round(basalImpact * 10) / 10,
                    deviation: Math.round(basalDeviation * 1000) / 1000
                },
                activity: {
                    value: activityImpactData.totalImpact,
                    steps: activityImpactData.components.steps,
                    calories: activityImpactData.components.calories,
                    stairs: activityImpactData.components.stairs,
                    heartRate: activityImpactData.components.heartRate,
                    stressHeartRate: activityImpactData.components.stressHeartRate,
                    intensity: activityImpactData.intensity,
                    dataAvailable: activityImpactData.dataAvailable
                },
                unexplained: Math.round(unexplained * 10) / 10
            }
        });
    }

    // Calculate historical trend for the 30-minute window
    const attributionHistory: IAttributionHistoryPoint[] = [];
    if (history30m.length > 0 && iobTimeseries?.data && cobTimeseries?.data) {
        const iobData = iobTimeseries.data;
        const cobData = cobTimeseries.data;
        const iobNowIdx = (iobTimeseries as any).nowIndex ?? (iobData.length - 1);
        const cobNowIdx = (cobTimeseries as any).nowIndex ?? (cobData.length - 1);

        const nowMs = new Date(currentStatus.meta.status_date).getTime();

        for (let i = 1; i < history30m.length; i++) {
            const pointActual = history30m[i] - history30m[i - 1];
            const intervalsAgo = (history30m.length - 1) - i;

            const iobIdx = iobNowIdx - intervalsAgo;
            const cobIdx = cobNowIdx - intervalsAgo;

            const pointInsulin = (iobIdx >= 0 && iobData[iobIdx]) ? -(iobData[iobIdx].glucoseImpact || 0) : 0;
            const pointCarbs = (cobIdx >= 0 && cobData[cobIdx]) ? (cobData[cobIdx].glucoseImpact || 0) : 0;

            // Calculate activity impact for this point
            let pointActivity = 0;
            const activityIdx = activityData.length - intervalsAgo - 1;
            if (activityIdx >= 0 && activityIdx < activityData.length) {
                const activityImpact = calculateActivityImpact([activityData[activityIdx]], 5, undefined, activityCoefficients);
                pointActivity = activityImpact.totalImpact;
            }

            const predicted = pointInsulin + pointCarbs + pointActivity;
            const unexplained = pointActual - predicted;

            const timestamp = new Date(nowMs - (intervalsAgo * 5 * 60 * 1000)).toISOString();

            attributionHistory.push({
                timestamp,
                actual: Math.round(pointActual * 10) / 10,
                predicted: Math.round(predicted * 10) / 10,
                unexplained: Math.round(unexplained * 10) / 10,
                components: {
                    insulin: Math.round(pointInsulin * 10) / 10,
                    carbs: Math.round(pointCarbs * 10) / 10,
                    basal: 0,
                    activity: Math.round(pointActivity * 10) / 10
                }
            });
        }
    }

    return {
        timestamp: currentStatus.meta?.status_date || new Date().toISOString(),
        timeframes: attributions,
        history: attributionHistory
    };
}
