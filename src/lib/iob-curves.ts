import { decayIOB } from './insulin-math.js';

/** Result for a single insulin event's IOB curve */
export interface IInsulinEventCurve {
    eventTime: Date;           // When the insulin event occurred
    eventType: string;         // 'Bolus', 'Basal Bucket', etc.
    initialInsulin: number;    // Original insulin amount
    iobAtInterval: number[];   // IOB at each 5-min interval (index 0 = target time)
}

/** Constants for IOB calculation */
export const INTERVAL_MINUTES = 5;

/**
 * Calculates the IOB curve for a single insulin event.
 * Creates an array indexed at 5-minute intervals with IOB.
 * 
 * @param initialInsulin - The initial insulin amount in units
 * @param eventTime - When the insulin event occurred
 * @param targetTime - The time to calculate from (index 0 = target time)
 * @param dia - Duration of insulin action in hours
 * @returns Curve with IOB at each 5-min interval
 */
export function calculateInsulinEventCurve(
    initialInsulin: number,
    eventTime: Date,
    targetTime: Date,
    dia: number,
    eventType: string = 'Bolus'
): IInsulinEventCurve {
    const targetMs = targetTime.getTime();
    const eventMs = eventTime.getTime();

    // Calculate number of intervals needed (full DIA duration)
    const diaMinutes = dia * 60;
    const numIntervals = Math.ceil(diaMinutes / INTERVAL_MINUTES) + 1;

    const iobAtInterval: number[] = [];

    // Build arrays from target time backwards
    for (let i = 0; i < numIntervals; i++) {
        // Age at this interval (going backwards from target)
        const intervalTargetMs = targetMs - (i * INTERVAL_MINUTES * 60 * 1000);
        const ageMinutes = (intervalTargetMs - eventMs) / (1000 * 60);

        if (ageMinutes < 0) {
            // Insulin event hasn't occurred yet at this interval
            iobAtInterval.push(0);
        } else {
            // Calculate IOB using decay function
            const iob = initialInsulin * decayIOB(ageMinutes, dia);
            iobAtInterval.push(Math.round(iob * 1000) / 1000);
        }
    }

    return {
        eventTime,
        eventType,
        initialInsulin,
        iobAtInterval
    };
}
