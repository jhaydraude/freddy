import { IStatusResult, IAttributionResult, IAttributionTimeframe, IAttributionHistoryPoint } from './types.js';

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

        if (iobTimeseries) {
            const nowIdx = (iobTimeseries as any).nowIndex ?? (iobTimeseries.totalIOB.length - 1);
            for (let i = 0; i < intervalCount; i++) {
                const idx = nowIdx - i;
                if (idx > 0) {
                    // Bolus part
                    const bolusAct = Math.max(0, iobTimeseries.bolusIOB[idx - 1] - iobTimeseries.bolusIOB[idx]);
                    insulinImpact -= bolusAct * isf;
                    insulinActivity += bolusAct;

                    // Basal deviation part
                    const basalAct = iobTimeseries.basalIOB[idx - 1] - iobTimeseries.basalIOB[idx];
                    basalImpact -= basalAct * isf;
                    basalDeviation += basalAct;
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

        const predictedChange = insulinImpact + carbImpact + basalImpact;
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
                unexplained: Math.round(unexplained * 10) / 10
            }
        });
    }

    // Calculate historical trend for the 30-minute window
    const attributionHistory: IAttributionHistoryPoint[] = [];
    if (history30m.length > 0 && iobTimeseries && (cobTimeseries as any)?.data) {
        const iobImpacts = iobTimeseries.glucoseImpact;
        const cobData = (cobTimeseries as any).data;
        const iobNowIdx = (iobTimeseries as any).nowIndex ?? (iobImpacts.length - 1);
        const cobNowIdx = (cobTimeseries as any).nowIndex ?? (cobData.length - 1);

        const nowMs = new Date(currentStatus.meta.status_date).getTime();

        for (let i = 1; i < history30m.length; i++) {
            const pointActual = history30m[i] - history30m[i - 1];
            const intervalsAgo = (history30m.length - 1) - i;

            const iobIdx = iobNowIdx - intervalsAgo;
            const cobIdx = cobNowIdx - intervalsAgo;

            const pointInsulin = iobIdx >= 0 ? -(iobImpacts[iobIdx] || 0) : 0;
            const pointCarbs = (cobIdx >= 0 && cobData[cobIdx]) ? (cobData[cobIdx].glucoseImpact || 0) : 0;
            const predicted = pointInsulin + pointCarbs;
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
                    basal: 0
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
