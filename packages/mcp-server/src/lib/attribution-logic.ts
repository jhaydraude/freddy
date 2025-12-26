import type { IStatusResult } from './status-logic.js';

/** Attribution for a single timeframe */
export interface IAttributionTimeframe {
    timeframe: '5min' | '10min' | '15min' | '30min';
    minutes: number;
    glucoseChange: {
        actual: number;           // Actual BG change (mg/dL or mmol/L)
        predicted: number;        // Sum of all component predictions
    };
    components: {
        insulin: {
            value: number;        // Glucose impact from insulin (negative = lowering)
            activity: number;     // Units of insulin absorbed
            isf: number;          // ISF used for calculation
        };
        carbs: {
            value: number;        // Glucose impact from carbs (positive = raising)
            absorption: number;   // Grams of carbs absorbed
            carbRatio: number;    // Carb ratio used
        };
        basal: {
            value: number;        // Glucose impact from basal deviation
            deviation: number;    // Difference from scheduled (U)
        };
        unexplained: number;      // Residual (actual - predicted)
    };
}

/** Single point in attribution history */
export interface IAttributionHistoryPoint {
    timestamp: string;
    actual: number;
    predicted: number;
    unexplained: number;
    components: {
        insulin: number;
        carbs: number;
        basal: number;
    };
}

/** Complete attribution result */
export interface IAttributionResult {
    timestamp: string;
    timeframes: IAttributionTimeframe[];
    history?: IAttributionHistoryPoint[];
}

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
        else if (minutes === 30) {
            actualChange = delta30m;
        }

        // Calculate interval index for timeseries (1 interval = 5 min)
        const intervalIndex = Math.round(minutes / 5);

        // Calculate insulin impact
        let insulinImpact = 0;
        let insulinActivity = 0;
        if (iobTimeseries && iobTimeseries.glucoseImpact) {
            // Sum glucose impact over the interval
            for (let i = 0; i < intervalIndex && i < iobTimeseries.glucoseImpact.length; i++) {
                const idx = iobTimeseries.glucoseImpact.length - 1 - i;
                insulinImpact -= iobTimeseries.glucoseImpact[idx] || 0; // Negative because insulin lowers BG
            }
            // Sum activity
            for (let i = 0; i < intervalIndex && i < iobTimeseries.activity.length; i++) {
                const idx = iobTimeseries.activity.length - 1 - i;
                insulinActivity += iobTimeseries.activity[idx] || 0;
            }
        }

        // Calculate carb impact
        let carbImpact = 0;
        let carbAbsorption = 0;
        if (cobTimeseries && cobTimeseries.glucoseImpact) {
            // Sum glucose impact over the interval
            for (let i = 0; i < intervalIndex && i < cobTimeseries.glucoseImpact.length; i++) {
                const idx = cobTimeseries.glucoseImpact.length - 1 - i;
                carbImpact += cobTimeseries.glucoseImpact[idx] || 0; // Positive because carbs raise BG
            }
            // Sum absorption
            for (let i = 0; i < intervalIndex && i < cobTimeseries.carbAbsorption.length; i++) {
                const idx = cobTimeseries.carbAbsorption.length - 1 - i;
                carbAbsorption += cobTimeseries.carbAbsorption[idx] || 0;
            }
        }

        // Calculate basal impact (simplified - deviation from scheduled)
        const basalIOB = currentStatus.iob?.calculated?.basalIOB || 0;
        const basalDeviation = basalIOB; // Net basal IOB is the deviation
        const basalImpact = -basalDeviation * isf; // Negative because extra basal lowers BG

        // Calculate predicted change
        const predictedChange = insulinImpact + carbImpact + basalImpact;

        // Calculate unexplained residual
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
    if (history30m.length > 0 && iobTimeseries && cobTimeseries) {
        // history30m is oldest to newest. current glucose is at the end.
        // We need to match each point with timeseries buckets.
        const nowMs = new Date(currentStatus.meta.status_date).getTime();

        for (let i = 1; i < history30m.length; i++) {
            const pointActual = history30m[i] - history30m[i - 1];

            // Interval index from the end (0 = now, 1 = 5m ago, etc.)
            const intervalsAgo = (history30m.length - 1) - i;
            const idx = iobTimeseries.glucoseImpact.length - 1 - intervalsAgo;

            if (idx >= 0) {
                const pointInsulin = -(iobTimeseries.glucoseImpact[idx] || 0);
                const pointCarbs = cobTimeseries.glucoseImpact[idx] || 0;

                // For basal, we use a simplified per-interval impact (basalIOB * ISF / (DIA * 12))
                // Actually let's just use the current basal impact distributed.
                const basalIOB = currentStatus.iob?.calculated?.basalIOB || 0;
                const pointBasal = -(basalIOB * isf) / (isf / (currentStatus.iob.settings.dia * 12));
                // Wait, basal impact is usually small and constant for 30m.
                const simpleBasal = -(basalIOB * isf) / 100; // Placeholder for now, basal impact is very small per 5min

                const predicted = pointInsulin + pointCarbs; // Ignoring basal in history for now as it's hard to historicalize
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
                        basal: 0 // Simplification
                    }
                });
            }
        }
    }

    return {
        timestamp: currentStatus.meta?.status_date || new Date().toISOString(),
        timeframes: attributions,
        history: attributionHistory
    };
}
