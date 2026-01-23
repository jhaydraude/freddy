import { decayIOB, activityInsulin } from './insulin-math';

export interface IInsulinEventCurve {
    eventTime: Date;           // When the insulin event occurred
    eventType: string;         // 'Bolus', 'Basal Bucket', etc.
    initialInsulin: number;    // Original insulin amount
    iobAtInterval: number[];   // IOB at each 5-min interval
    activityAtInterval: number[]; // Activity (units/5min) at each interval
    nowIndex: number;          // Index in array that represents "target time" (NOW)
}

/** Constants for IOB calculation */
export const INTERVAL_MINUTES = 5;

/**
 * Calculates the IOB curve for a single insulin event.
 * Creates an array indexed at 5-minute intervals with IOB and Activity.
 * 
 * @param initialInsulin - The initial insulin amount in units
 * @param eventTime - When the insulin event occurred
 * @param targetTime - The time to calculate from (this becomes the "now" point)
 * @param dia - Duration of insulin action in hours
 * @param peak - Peak activity time in minutes
 * @param eventType - Label for this event
 * @param includeFuture - If true, also calculate DIA hours into the future
 * @returns Curve with IOB and activity at each 5-min interval
 */
export function calculateInsulinEventCurve(
    initialInsulin: number,
    eventTime: Date,
    targetTime: Date,
    dia: number,
    peak: number = 55,
    eventType: string = 'Bolus',
    includeFuture: boolean = false
): IInsulinEventCurve {
    const targetMs = targetTime.getTime();
    const eventMs = eventTime.getTime();

    // Calculate number of intervals needed (full DIA duration)
    const diaMinutes = dia * 60;
    const numIntervalsPast = Math.ceil(diaMinutes / INTERVAL_MINUTES) + 1;
    const numIntervalsFuture = includeFuture ? Math.ceil(diaMinutes / INTERVAL_MINUTES) : 0;

    const iobAtInterval: number[] = [];
    const activityAtInterval: number[] = [];

    // Build array from oldest (past) to newest (future)
    // Negative offset = past, positive offset = future
    for (let offset = -(numIntervalsPast - 1); offset <= numIntervalsFuture; offset++) {
        const intervalTargetMs = targetMs + (offset * INTERVAL_MINUTES * 60 * 1000);
        const ageMinutes = (intervalTargetMs - eventMs) / (1000 * 60);

        if (ageMinutes < 0 || ageMinutes >= diaMinutes) {
            iobAtInterval.push(0);
            activityAtInterval.push(0);
        } else {
            // Calculate IOB using decay function
            const iob = initialInsulin * decayIOB(ageMinutes, dia, peak);
            // DO NOT ROUND HERE - we need precision when summing many small buckets (like basal)
            iobAtInterval.push(iob);

            // Calculate Activity (analytic derivative)
            // Multiply units/min by INTERVAL_MINUTES to get units/5min
            const activity = initialInsulin * activityInsulin(ageMinutes, dia, peak) * INTERVAL_MINUTES;
            activityAtInterval.push(activity);
        }
    }

    // The "now" index is where offset=0, which is at position (numIntervalsPast - 1)
    const nowIndex = numIntervalsPast - 1;

    return {
        eventTime,
        eventType,
        initialInsulin,
        iobAtInterval,
        activityAtInterval,
        nowIndex
    };
}
