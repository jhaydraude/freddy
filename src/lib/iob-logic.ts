import { Treatment, DeviceStatus } from '../db/models.js';
import { resolveActiveProfile, getProfileStore, getValueAtTime } from './profile-logic.js';
import { calculateInsulinEventCurve, INTERVAL_MINUTES, type IInsulinEventCurve } from './iob-curves.js';
import { getBasalIOB, createBasalCurvesForTimeseries } from './iob-basal.js';

/** Extended IOB result with detailed metrics */
export interface IIOBResult {
    timestamp: string;
    units: string;
    lookbackMinutes: number;

    settings: {
        isf: number;
        dia: number;
        autosensRatio: number;
        effectiveISF: number;
    };

    calculated: {
        totalIOB: number;     // Net IOB (Delivered - Scheduled Basal)
        bolusIOB: number;
        basalIOB: number;     // Net Basal IOB (Delivered - Scheduled)
        glucoseImpact: number;
        bolusCount: number;
    };

    reported: {
        totalIOB: number;
        bolusIOB: number;
        basalIOB: number;
        timestamp: string;
    };

    // Optional timeseries data
    timeseries?: {
        intervalMinutes: 5;
        startTime: string;          // DIA hours ago
        endTime: string;            // Current timestamp
        length: number;             // Array length

        timestamps: string[];       // ISO timestamps [oldest → newest]
        totalIOB: number[];         // Total IOB at each interval
        bolusIOB: number[];         // Bolus IOB at each interval
        basalIOB: number[];         // Net basal IOB at each interval
        activity: number[];         // Insulin absorbed in NEXT 5 min
        glucoseImpact: number[];    // Expected BG drop (activity × ISF)
    };
}

/**
 * Service to get detailed IOB at a specific time.
 * Calculates IOB from boluses and basal, with glucose impact.
 * 
 * @param timestamp - ISO timestamp or Date
 * @param includeTimeseries - If true, include historical timeseries arrays
 * @returns Detailed IOB result with glucose impact and optional timeseries
 */
export async function getIOB(timestamp: string | Date, includeTimeseries: boolean = false): Promise<IIOBResult> {
    const endWindow = new Date(timestamp);
    const profileInfo = await resolveActiveProfile(endWindow);

    // Default values
    let isf = 50;
    let units = 'mg/dL';
    let dia = 5; // Default DIA in hours
    let autosensRatio = 1.0;

    // 1. Get Autosens Ratio from latest DeviceStatus
    const statusDoc = await DeviceStatus.findOne({
        "openaps.suggested.sensitivityRatio": { $exists: true }
    }).sort({ created_at: -1 });

    if (statusDoc?.openaps?.suggested?.sensitivityRatio) {
        autosensRatio = statusDoc.openaps.suggested.sensitivityRatio;
    }

    if (!profileInfo) {
        return {
            timestamp: endWindow.toISOString(),
            units,
            lookbackMinutes: dia * 60,
            settings: { isf, dia, autosensRatio, effectiveISF: isf },
            calculated: { totalIOB: 0, bolusIOB: 0, basalIOB: 0, glucoseImpact: 0, bolusCount: 0 },
            reported: { totalIOB: 0, bolusIOB: 0, basalIOB: 0, timestamp: '' }
        };
    }

    const store = getProfileStore(
        profileInfo.doc || undefined,
        profileInfo.activeProfileName,
        profileInfo.profileData || undefined
    );

    if (store) {
        dia = store.dia;
        isf = getValueAtTime(store.sens, endWindow);
        units = store.units || 'mg/dL';
    }

    const diaMs = dia * 60 * 60 * 1000;
    const startWindow = new Date(endWindow.getTime() - diaMs);

    // 2. Fetch Boluses and calculate IOB curves
    const boluses = await Treatment.find({
        eventType: { $in: ["Meal Bolus", "Correction Bolus"] },
        created_at: { $lte: endWindow.toISOString(), $gte: startWindow.toISOString() }
    });

    const bolusCurves: IInsulinEventCurve[] = [];
    let bolusIOB = 0;
    let bolusCount = 0;

    for (const b of boluses) {
        const insulin = b.insulin || 0;
        if (insulin <= 0) continue;

        const eventTime = new Date(b.created_at);
        const curve = calculateInsulinEventCurve(insulin, eventTime, endWindow, dia, 'Bolus');
        bolusCurves.push(curve);

        bolusIOB += curve.iobAtInterval[0] || 0;
        if ((curve.iobAtInterval[0] || 0) > 0) {
            bolusCount++;
        }
    }

    // 3. Basal IOB (Delivered & Scheduled)
    const basalRes = await getBasalIOB(startWindow, endWindow, dia);

    // 4. Calculate totals
    const deliveredIOB = bolusIOB + basalRes.deliveredIOB;
    const scheduledBasalIOB = basalRes.scheduledIOB;
    const netIOB = deliveredIOB - scheduledBasalIOB;

    // 5. Calculate glucose impact
    const impactISF = isf / autosensRatio;
    const insulinActivityRate = await calculateInsulinActivityRate(endWindow, dia);
    const glucoseImpact = insulinActivityRate * impactISF;

    // 6. Construct result
    const reported = {
        totalIOB: statusDoc?.openaps?.iob?.iob || 0,
        bolusIOB: statusDoc?.openaps?.iob?.bolusiob || 0,
        basalIOB: statusDoc?.openaps?.iob?.basaliob || 0,
        timestamp: statusDoc?.openaps?.iob?.timestamp || statusDoc?.openaps?.iob?.time || ''
    };

    const result: IIOBResult = {
        timestamp: endWindow.toISOString(),
        units,
        lookbackMinutes: Math.round(dia * 60),

        settings: {
            isf: Math.round(isf * 100) / 100,
            dia,
            autosensRatio: Math.round(autosensRatio * 100) / 100,
            effectiveISF: Math.round(impactISF * 100) / 100
        },

        calculated: {
            totalIOB: Math.round(netIOB * 1000) / 1000,
            bolusIOB: Math.round(bolusIOB * 1000) / 1000,
            basalIOB: Math.round((deliveredIOB - bolusIOB - scheduledBasalIOB) * 1000) / 1000,
            glucoseImpact: Math.round(glucoseImpact * 100) / 100,
            bolusCount
        },

        reported
    };

    // 7. Build timeseries if requested (OPTIMIZED!)
    if (includeTimeseries) {
        const numIntervals = Math.ceil((dia * 60) / INTERVAL_MINUTES) + 1;
        const timestamps: string[] = [];
        const totalIOBArray: number[] = [];
        const bolusIOBArray: number[] = [];
        const basalIOBArray: number[] = [];
        const activityArray: number[] = [];
        const glucoseImpactArray: number[] = [];

        // Pre-calculate basal curves ONCE (fast!)
        const { deliveredCurves, scheduledCurves } = await createBasalCurvesForTimeseries(
            startWindow,
            endWindow,
            dia,
            profileInfo
        );

        // Build arrays from oldest to newest
        for (let i = numIntervals - 1; i >= 0; i--) {
            const intervalTime = new Date(endWindow.getTime() - (i * INTERVAL_MINUTES * 60 * 1000));
            timestamps.push(intervalTime.toISOString());

            // Sum bolus IOB at this interval
            let bolusIOBAtInterval = 0;
            for (const curve of bolusCurves) {
                if (curve.iobAtInterval[i] !== undefined) {
                    bolusIOBAtInterval += curve.iobAtInterval[i]!;
                }
            }

            // Sum delivered basal IOB at this interval
            let deliveredBasalIOBAtInterval = 0;
            for (const curve of deliveredCurves) {
                if (curve.iobAtInterval[i] !== undefined) {
                    deliveredBasalIOBAtInterval += curve.iobAtInterval[i]!;
                }
            }

            // Sum scheduled basal IOB at this interval
            let scheduledBasalIOBAtInterval = 0;
            for (const curve of scheduledCurves) {
                if (curve.iobAtInterval[i] !== undefined) {
                    scheduledBasalIOBAtInterval += curve.iobAtInterval[i]!;
                }
            }

            // Calculate totals
            const totalDelivered = bolusIOBAtInterval + deliveredBasalIOBAtInterval;
            const netIOBAtInterval = totalDelivered - scheduledBasalIOBAtInterval;
            const netBasalIOBAtInterval = deliveredBasalIOBAtInterval - scheduledBasalIOBAtInterval;

            totalIOBArray.push(Math.round(netIOBAtInterval * 1000) / 1000);
            bolusIOBArray.push(Math.round(bolusIOBAtInterval * 1000) / 1000);
            basalIOBArray.push(Math.round(netBasalIOBAtInterval * 1000) / 1000);

            // Calculate activity as difference between consecutive IOB values
            let activityAtInterval = 0;
            if (totalIOBArray.length >= 2) {
                const iobCurrent = totalIOBArray[totalIOBArray.length - 1];
                const iobPrevious = totalIOBArray[totalIOBArray.length - 2];
                activityAtInterval = Math.max(0, iobPrevious - iobCurrent);
            }
            activityArray.push(Math.round(activityAtInterval * 1000) / 1000);

            const impactAtInterval = activityAtInterval * impactISF;
            glucoseImpactArray.push(Math.round(impactAtInterval * 100) / 100);
        }

        result.timeseries = {
            intervalMinutes: 5,
            startTime: timestamps[0] || endWindow.toISOString(),
            endTime: timestamps[timestamps.length - 1] || endWindow.toISOString(),
            length: timestamps.length,
            timestamps,
            totalIOB: totalIOBArray,
            bolusIOB: bolusIOBArray,
            basalIOB: basalIOBArray,
            activity: activityArray,
            glucoseImpact: glucoseImpactArray
        };
    }

    return result;
}

/**
 * Calculates insulin activity rate (units being absorbed in the next 5 minutes).
 * This calculates directly from treatments to avoid recursive calls to getIOB.
 */
export async function calculateInsulinActivityRate(
    timestamp: Date,
    dia: number
): Promise<number> {
    const now = timestamp;
    const nowPlus5 = new Date(now.getTime() + 5 * 60 * 1000);
    const diaMs = dia * 60 * 60 * 1000;
    const startWindow = new Date(now.getTime() - diaMs);

    // Fetch boluses in DIA window
    const boluses = await Treatment.find({
        eventType: { $in: ["Meal Bolus", "Correction Bolus"] },
        created_at: { $lte: now.toISOString(), $gte: startWindow.toISOString() }
    });

    // Calculate IOB at now and now+5min for each bolus
    let iobNow = 0;
    let iobFuture = 0;

    for (const b of boluses) {
        const insulin = b.insulin || 0;
        if (insulin <= 0) continue;

        const eventTime = new Date(b.created_at);

        // IOB at now
        const curveNow = calculateInsulinEventCurve(insulin, eventTime, now, dia, 'Bolus');
        iobNow += curveNow.iobAtInterval[0] || 0;

        // IOB at now+5min
        const curveFuture = calculateInsulinEventCurve(insulin, eventTime, nowPlus5, dia, 'Bolus');
        iobFuture += curveFuture.iobAtInterval[0] || 0;
    }

    // Add basal contribution (simplified - uses current rates)
    const basalNow = await getBasalIOB(startWindow, now, dia);
    const basalFuture = await getBasalIOB(new Date(startWindow.getTime() + 5 * 60 * 1000), nowPlus5, dia);

    const totalIOBNow = iobNow + basalNow.deliveredIOB - basalNow.scheduledIOB;
    const totalIOBFuture = iobFuture + basalFuture.deliveredIOB - basalFuture.scheduledIOB;

    const activity = Math.max(0, totalIOBNow - totalIOBFuture);
    return Math.round(activity * 1000) / 1000;
}
