import { Treatment, DeviceStatus, SystemConfig } from '../db/models';
import { resolveActiveProfile, getProfileStore, getValueAtTime } from './profile-logic';
import { calculateInsulinEventCurve, INTERVAL_MINUTES, type IInsulinEventCurve } from './iob-curves';
import { getBasalIOB, createBasalCurvesForTimeseries } from './iob-basal';
import { IIOBResult, type IStatusContext } from './types';
import { activityInsulin } from './insulin-math';

/**
 * Service to get detailed IOB at a specific time.
 * Calculates IOB from boluses and basal, with glucose impact.
 * 
 * @param timestamp - ISO timestamp or Date
 * @param includeTimeseries - If true, include historical timeseries arrays
 * @returns Detailed IOB result with glucose impact and optional timeseries
 */
export async function getIOB(
    timestamp: string | Date,
    includeTimeseries: boolean = true,
    bypassCache: boolean = false,
    context?: IStatusContext
): Promise<IIOBResult> {
    const endWindow = new Date(timestamp);
    const profileInfo = context?.profileInfo || await resolveActiveProfile(endWindow, bypassCache);

    // Default values
    let isf = 50;
    let units = 'mg/dL';
    let dia = 5; // Default DIA in hours
    let peak = 45; // Default Peak in minutes (Assume Fiasp/45m if unknown as per user request)
    let autosensRatio = 1.0;

    // Autosens feature temporarily disabled per user request pending internal Freddy implementation.
    // autosensRatio will remain 1.0.

    // Get SMB testing threshold from System Config (defaults to 0.7)
    let smbThreshold = 0.7;
    if (context?.sysConfig) {
        const sysConf = context.sysConfig.find((c: any) => c.key === 'smb_threshold');
        if (sysConf?.value !== undefined) smbThreshold = Number(sysConf.value);
    } else {
        const sysConfigDoc = await SystemConfig.findOne({ key: 'smb_threshold' }).lean() as any;
        if (sysConfigDoc?.value !== undefined) smbThreshold = Number(sysConfigDoc.value);
    }

    if (!profileInfo) {
        return {
            timestamp: endWindow.toISOString(),
            units,
            lookbackMinutes: dia * 60,
            settings: { isf, dia, autosensRatio, effectiveISF: isf },
            calculated: { totalIOB: 0, bolusIOB: 0, basalIOB: 0, smbIOB: 0, glucoseImpact: 0, bolusCount: 0, smbCount: 0 },
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

        // Dynamic Peak Detection
        // @ts-ignore - 'curve' might not be in interface yet
        const curve = store.curve || 'ultra-rapid';
        if (curve === 'rapid-acting') peak = 55; // Humalog/Novolog
        else if (curve === 'ultra-rapid') peak = 45; // Fiasp/Lyumjev
        else peak = 45; // Default to Fiasp if unsure/custom
    }

    const diaMs = dia * 60 * 60 * 1000;
    const startWindow = new Date(endWindow.getTime() - diaMs);

    // Deduplicates treatment entries (e.g. from AAPS redundantly sending Bolus Wizard + Meal Bolus)
    const deduplicateTreatments = (treatments: any[]): any[] => {
        if (treatments.length <= 1) return treatments;
        
        // Sort by time
        const sorted = [...treatments].sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        const result: any[] = [];
        for (const t of sorted) {
            if (result.length === 0) {
                result.push(t);
                continue;
            }

            const prev = result[result.length - 1];
            const timeDiff = Math.abs(new Date(t.created_at).getTime() - new Date(prev.created_at).getTime());
            
            // If same insulin within 2 minutes, ignore as duplicate
            const isDuplicateInsulin = (t.insulin && prev.insulin && t.insulin === prev.insulin && timeDiff < 120000);
            
            // If same carbs within 2 minutes, ignore as duplicate
            const isDuplicateCarbs = (t.carbs && prev.carbs && t.carbs === prev.carbs && timeDiff < 120000);

            if (!isDuplicateInsulin && !isDuplicateCarbs) {
                result.push(t);
            } else {
                // Keep the one with more info if possible
                if (t.eventType === 'Bolus Wizard' && prev.eventType !== 'Bolus Wizard') {
                    result[result.length - 1] = t;
                }
            }
        }
        return result;
    };

    // 2. Fetch Boluses and calculate IOB curves
    let boluses: any[] = context?.treatments || [];
    if (context?.treatments) {
        // Filter contextual treatments
        boluses = boluses.filter(b => {
            const isBolus = ["Meal Bolus", "Correction Bolus", "Bolus", "Bolus Wizard", "bolus", "meal bolus", "correction bolus"].includes(b.eventType);
            const isInWindow = b.created_at <= endWindow.toISOString() && b.created_at >= startWindow.toISOString();
            return isBolus && isInWindow;
        });
    } else {
        boluses = await Treatment.find({
            eventType: { $in: ["Meal Bolus", "Correction Bolus", "Bolus", "Bolus Wizard", "bolus", "meal bolus", "correction bolus"] },
            created_at: { $lte: endWindow.toISOString(), $gte: startWindow.toISOString() }
        }).lean() as any[];
    }

    // Deduplicate treatments
    boluses = deduplicateTreatments(boluses);

    const bolusCurves: IInsulinEventCurve[] = [];
    let bolusIOB = 0;
    let smbIOB = 0;
    let bolusCount = 0;
    let smbCount = 0;

    for (const b of boluses) {
        const insulin = b.insulin || 0;
        if (insulin <= 0) continue;

        const eventTime = new Date(b.created_at);
        const curve = calculateInsulinEventCurve(insulin, eventTime, endWindow, dia, peak, 'Bolus');
        bolusCurves.push(curve);

        // Use nowIndex to get IOB at "now" (not index 0 which is oldest)
        const iobNow = curve.iobAtInterval[curve.nowIndex] || 0;
        bolusIOB += iobNow;
        if (iobNow > 0) {
            bolusCount++;

            // Check for SMB using user-defined threshold
            if (insulin <= smbThreshold) {
                smbIOB += iobNow;
                smbCount++;
            }
        }
    }

    // 3. Basal IOB (Delivered & Scheduled)
    const basalRes = await getBasalIOB(startWindow, endWindow, dia, peak, bypassCache, context);

    // 4. Calculate totals
    const deliveredIOB = bolusIOB + basalRes.deliveredIOB;
    const scheduledBasalIOB = basalRes.scheduledIOB;
    const netIOB = deliveredIOB - scheduledBasalIOB;

    // 5. Calculate glucose impact
    const impactISF = isf / autosensRatio;
    const insulinActivityRate = await calculateInsulinActivityRate(endWindow, dia, peak, bypassCache, context);
    const glucoseImpact = insulinActivityRate * impactISF;

    // 6. Construct result
    let statusDoc = context?.deviceStatus as any;
    if (!statusDoc || !statusDoc?.openaps?.iob) {
        statusDoc = await DeviceStatus.findOne({
            "openaps.iob": { $exists: true },
            "created_at": { $lte: endWindow.toISOString() }
        }).sort({ created_at: -1 }).lean() as any;
    }

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
            totalIOB: netIOB,
            bolusIOB: bolusIOB,
            basalIOB: (basalRes.deliveredIOB - basalRes.scheduledIOB),
            smbIOB: smbIOB,
            glucoseImpact: glucoseImpact,
            bolusCount,
            smbCount
        },

        reported
    };

    // 7. Build timeseries if requested (NOW WITH FUTURE PROJECTION!)
    if (includeTimeseries) {
        const numIntervalsPast = Math.ceil((dia * 60) / INTERVAL_MINUTES) + 1;
        const numIntervalsFuture = Math.ceil((dia * 60) / INTERVAL_MINUTES);
        const data: Array<{
            timestamp: string;
            totalIOB: number;
            bolusIOB: number;
            basalIOB: number;
            activity: number;
            glucoseImpact: number;
        }> = [];

        // Pre-calculate basal curves ONCE with future projection
        const { deliveredCurves, scheduledCurves } = await createBasalCurvesForTimeseries(
            startWindow,
            endWindow,
            dia,
            peak,
            profileInfo,
            true // includeFuture
        );

        // Recalculate bolus curves with future projection
        const bolusCurvesWithFuture: IInsulinEventCurve[] = [];
        for (const b of boluses) {
            const insulin = b.insulin || 0;
            if (insulin <= 0) continue;
            const eventTime = new Date(b.created_at);
            const curve = calculateInsulinEventCurve(insulin, eventTime, endWindow, dia, peak, 'Bolus', true);
            bolusCurvesWithFuture.push(curve);
        }

        // Get the nowIndex from any curve (they all have the same structure)
        const nowIndex = bolusCurvesWithFuture.length > 0
            ? bolusCurvesWithFuture[0].nowIndex
            : (deliveredCurves.length > 0 ? deliveredCurves[0].nowIndex : numIntervalsPast - 1);

        const totalIntervals = numIntervalsPast + numIntervalsFuture;

        // Build array from oldest (past) to newest (future)
        const previousTotalIOB = 0;
        for (let arrayIdx = 0; arrayIdx < totalIntervals; arrayIdx++) {
            // Convert arrayIdx to time offset from "now"
            const offsetFromNow = arrayIdx - nowIndex;
            const intervalTime = new Date(endWindow.getTime() + (offsetFromNow * INTERVAL_MINUTES * 60 * 1000));

            // Sum bolus IOB at this interval
            let bolusIOBAtInterval = 0;
            for (const curve of bolusCurvesWithFuture) {
                if (curve.iobAtInterval[arrayIdx] !== undefined) {
                    bolusIOBAtInterval += curve.iobAtInterval[arrayIdx]!;
                }
            }

            // Sum delivered basal IOB at this interval
            let deliveredBasalIOBAtInterval = 0;
            for (const curve of deliveredCurves) {
                if (curve.iobAtInterval[arrayIdx] !== undefined) {
                    deliveredBasalIOBAtInterval += curve.iobAtInterval[arrayIdx]!;
                }
            }

            // Sum scheduled basal IOB at this interval
            let scheduledBasalIOBAtInterval = 0;
            for (const curve of scheduledCurves) {
                if (curve.iobAtInterval[arrayIdx] !== undefined) {
                    scheduledBasalIOBAtInterval += curve.iobAtInterval[arrayIdx]!;
                }
            }

            // Calculate totals
            const totalDelivered = bolusIOBAtInterval + deliveredBasalIOBAtInterval;
            const netIOBAtInterval = totalDelivered - scheduledBasalIOBAtInterval;
            const netBasalIOBAtInterval = deliveredBasalIOBAtInterval - scheduledBasalIOBAtInterval;

            // C. Calculate activity using analytic derivates from curves
            let activityAtInterval = 0;

            // 1. Bolus Activity
            for (const curve of bolusCurvesWithFuture) {
                if (curve.activityAtInterval[arrayIdx] !== undefined) {
                    activityAtInterval += curve.activityAtInterval[arrayIdx]!;
                }
            }

            // 2. Basal Activity (Net)
            for (const curve of deliveredCurves) {
                if (curve.activityAtInterval[arrayIdx] !== undefined) {
                    activityAtInterval += curve.activityAtInterval[arrayIdx]!;
                }
            }
            for (const curve of scheduledCurves) {
                if (curve.activityAtInterval[arrayIdx] !== undefined) {
                    activityAtInterval -= curve.activityAtInterval[arrayIdx]!;
                }
            }

            const impactAtInterval = activityAtInterval * impactISF;

            data.push({
                timestamp: intervalTime.toISOString(),
                totalIOB: netIOBAtInterval,
                bolusIOB: bolusIOBAtInterval,
                basalIOB: netBasalIOBAtInterval,
                activity: activityAtInterval,
                glucoseImpact: impactAtInterval
            });
        }

        result.timeseries = {
            intervalMinutes: 5,
            startTime: data[0]?.timestamp || endWindow.toISOString(),
            endTime: data[data.length - 1]?.timestamp || endWindow.toISOString(),
            length: data.length,
            data,
            nowIndex
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
    dia: number,
    peak: number = 45,
    bypassCache: boolean = false,
    context?: IStatusContext
): Promise<number> {
    const now = timestamp;
    const nowPlus5 = new Date(now.getTime() + 5 * 60 * 1000);
    const diaMs = dia * 60 * 60 * 1000;
    const startWindow = new Date(now.getTime() - diaMs);

    // Fetch boluses in DIA window
    let boluses = context?.treatments;
    if (boluses) {
        boluses = boluses.filter(b => {
            const isBolus = ["Meal Bolus", "Correction Bolus", "Bolus", "Bolus Wizard", "bolus", "meal bolus", "correction bolus"].includes(b.eventType);
            const isInWindow = b.created_at <= now.toISOString() && b.created_at >= startWindow.toISOString();
            return isBolus && isInWindow;
        });
    } else {
        boluses = await Treatment.find({
            eventType: { $in: ["Meal Bolus", "Correction Bolus", "Bolus", "Bolus Wizard", "bolus", "meal bolus", "correction bolus"] },
            created_at: { $lte: now.toISOString(), $gte: startWindow.toISOString() }
        }).lean() as any[];
    }

    // Calculate IOB at now and now+5min for each bolus
    const iobNow = 0;
    const iobFuture = 0;

    // Simplified: Calculate analytic activity at exactly "now"
    let totalActivity = 0;

    for (const b of boluses) {
        const insulin = b.insulin || 0;
        if (insulin <= 0) continue;
        const eventTime = new Date(b.created_at);
        const ageMin = (now.getTime() - eventTime.getTime()) / 60000;

        if (ageMin >= 0 && ageMin < dia * 60) {
            totalActivity += insulin * activityInsulin(ageMin, dia, peak) * 5; // units/5min
        }
    }

    // Add basal contribution using getBasalIOB which already calculates windows
    // basalNow fields are in Units/hr (instantaneous rate). 
    // Convert to Units per 5 minutes to match bolus activity above.
    const basalNow = await getBasalIOB(startWindow, now, dia, peak, bypassCache, context);
    const netBasalActivityRate = (basalNow.deliveredActivity - basalNow.scheduledActivity);
    totalActivity += (netBasalActivityRate * 5 / 60);

    return totalActivity;
}
