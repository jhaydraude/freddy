import { Treatment } from '../db/models.js';
import { resolveActiveProfile, getProfileStore } from './profile-logic.js';
import { getBasalFromSchedule } from './basal-logic.js';
import { decayIOB } from './insulin-math.js';
import { calculateInsulinEventCurve, INTERVAL_MINUTES, type IInsulinEventCurve } from './iob-curves.js';

/**
 * Calculates both Scheduled and Delivered Basal IOB for a given time window.
 * Creates IOB curves for each 5-minute bucket of basal delivery.
 */
export async function getBasalIOB(
    startTime: Date,
    endTime: Date,
    profileDia?: number,
    peak: number = 45,
): Promise<{ scheduledIOB: number, deliveredIOB: number, deliveredRate: number }> {
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();

    // 1. Initial Resolution for DIA
    const initialRes = await resolveActiveProfile(startTime);
    if (!initialRes) return { scheduledIOB: 0, deliveredIOB: 0, deliveredRate: 0 };

    const initialStore = getProfileStore(
        initialRes.doc || undefined,
        initialRes.activeProfileName,
        initialRes.profileData || undefined
    );
    if (!initialStore) return { scheduledIOB: 0, deliveredIOB: 0, deliveredRate: 0 };

    const dia = profileDia ?? initialStore.dia;
    const diaMs = dia * 60 * 60 * 1000;
    const windowStartMs = Math.max(startMs, endMs - diaMs);

    // 2. Build Unified Timeline Events
    const eventTimes = new Set<number>();
    eventTimes.add(windowStartMs);
    eventTimes.add(endMs);

    // Timeline Source A: Profile Events (Switches & Expirations)
    if (initialRes.expiration) {
        const expMs = new Date(initialRes.expiration).getTime();
        if (expMs > windowStartMs && expMs < endMs) eventTimes.add(expMs);
    }

    const lookbackMs = 48 * 60 * 60 * 1000;
    const switches = await Treatment.find({
        eventType: "Profile Switch",
        created_at: { $gte: new Date(windowStartMs - lookbackMs).toISOString(), $lte: endTime.toISOString() }
    });

    for (const s of switches) {
        const createdMs = new Date(s.created_at).getTime();
        let shiftMs = s.timeshift || 0;
        if (shiftMs <= 10000) shiftMs *= 60000;
        const sStart = createdMs + shiftMs;
        let durMs = s.duration || s.originalDuration || 0;
        if (durMs > 0 && durMs <= 100000) durMs *= 60000;
        const sEnd = durMs > 0 ? sStart + durMs : Infinity;
        if (sStart > windowStartMs && sStart < endMs) eventTimes.add(sStart);
        if (sEnd > windowStartMs && sEnd < endMs) eventTimes.add(sEnd);
    }

    // Timeline Source B: Temp Basals
    const temps = await Treatment.find({
        eventType: "Temp Basal",
        created_at: { $gte: new Date(windowStartMs - 24 * 60 * 60 * 1000).toISOString(), $lte: endTime.toISOString() }
    });

    for (const t of temps) {
        const tStart = new Date(t.created_at).getTime();
        const tEnd = tStart + (t.duration || 0) * 60000;
        if (tStart > windowStartMs && tStart < endMs) eventTimes.add(tStart);
        if (tEnd > windowStartMs && tEnd < endMs) eventTimes.add(tEnd);
    }

    const sortedEvents = Array.from(eventTimes).sort((a, b) => a - b);

    // 3. Process Segments and build IOB curves for each bucket
    let scheduledIOB = 0;
    let deliveredIOB = 0;
    let currentDeliveredRate = 0;
    const stepMin = INTERVAL_MINUTES;
    const stepMs = stepMin * 60 * 1000;

    for (let i = 0; i < sortedEvents.length - 1; i++) {
        const segStart = sortedEvents[i]!;
        const segEnd = sortedEvents[i + 1]!;
        const midPoint = new Date(segStart + (segEnd - segStart) / 2);

        // a. Resolve Profile State for this segment
        const res = await resolveActiveProfile(midPoint);
        if (!res) continue;
        const store = getProfileStore(res.doc || undefined, res.activeProfileName, res.profileData || undefined);
        if (!store) continue;

        const scheduledRate = getBasalFromSchedule(store.basal, midPoint);
        const currentDia = store.dia;

        // b. Resolve Delivered State for this segment (overlay any active temp basal)
        let deliveredRate = scheduledRate;
        for (const t of temps) {
            const tStart = new Date(t.created_at).getTime();
            const tEnd = tStart + (t.duration || 0) * 60000;
            if (midPoint.getTime() >= tStart && midPoint.getTime() < tEnd) {
                if (t.rate !== undefined) {
                    deliveredRate = t.rate;
                } else if (t.percent !== undefined) {
                    deliveredRate = Math.round(scheduledRate * (1 + t.percent / 100) * 1000) / 1000;
                }
                break;
            }
        }

        // Track current delivered rate for the most recent segment
        if (segEnd === endMs || (i === sortedEvents.length - 2)) {
            currentDeliveredRate = deliveredRate;
        }

        // c. Iterate sub-windows and calculate IOB for each bucket
        for (let tMs = segStart; tMs < segEnd; tMs += stepMs) {
            const bucketMidpoint = tMs + stepMs / 2;
            const ageMin = (endMs - bucketMidpoint) / 60000;
            const decayFactor = decayIOB(ageMin, currentDia);

            // Insulin delivered in this 5-min bucket
            const scheduledInsulin = scheduledRate * (stepMin / 60);
            const deliveredInsulin = deliveredRate * (stepMin / 60);

            // IOB contribution from this bucket
            scheduledIOB += scheduledInsulin * decayFactor;
            deliveredIOB += deliveredInsulin * decayFactor;
        }
    }

    return {
        scheduledIOB: Math.round(scheduledIOB * 1000) / 1000,
        deliveredIOB: Math.round(deliveredIOB * 1000) / 1000,
        deliveredRate: currentDeliveredRate
    };
}

/**
 * Creates basal IOB curves for timeseries by treating each 5-minute basal delivery as a mini-bolus.
 * This is much faster than recalculating getBasalIOB for each interval.
 * 
 * @returns Delivered and scheduled basal curves for all intervals
 */
export async function createBasalCurvesForTimeseries(
    startWindow: Date,
    endWindow: Date,
    dia: number,
    peak: number,
    profileInfo: any,
    includeFuture: boolean = false
): Promise<{ deliveredCurves: IInsulinEventCurve[], scheduledCurves: IInsulinEventCurve[] }> {
    const deliveredCurves: IInsulinEventCurve[] = [];
    const scheduledCurves: IInsulinEventCurve[] = [];

    // Fetch all basal-affecting events ONCE
    const [profileSwitches, tempBasals] = await Promise.all([
        Treatment.find({
            eventType: "Profile Switch",
            created_at: {
                $gte: new Date(startWindow.getTime() - 48 * 60 * 60 * 1000).toISOString(),
                $lte: endWindow.toISOString()
            }
        }),
        Treatment.find({
            eventType: "Temp Basal",
            created_at: {
                $gte: new Date(startWindow.getTime() - 24 * 60 * 60 * 1000).toISOString(),
                $lte: endWindow.toISOString()
            }
        })
    ]);

    // Build timeline of basal rate changes
    const eventTimes = new Set<number>();
    eventTimes.add(startWindow.getTime());
    eventTimes.add(endWindow.getTime());

    // Add profile switch events
    for (const s of profileSwitches) {
        const createdMs = new Date(s.created_at).getTime();
        let shiftMs = s.timeshift || 0;
        if (shiftMs <= 10000) shiftMs *= 60000;
        const sStart = createdMs + shiftMs;
        let durMs = s.duration || s.originalDuration || 0;
        if (durMs > 0 && durMs <= 100000) durMs *= 60000;
        const sEnd = durMs > 0 ? sStart + durMs : Infinity;

        if (sStart > startWindow.getTime() && sStart < endWindow.getTime()) eventTimes.add(sStart);
        if (sEnd > startWindow.getTime() && sEnd < endWindow.getTime()) eventTimes.add(sEnd);
    }

    // Add temp basal events  
    for (const t of tempBasals) {
        const tStart = new Date(t.created_at).getTime();
        const tEnd = tStart + (t.duration || 0) * 60000;
        if (tStart > startWindow.getTime() && tStart < endWindow.getTime()) eventTimes.add(tStart);
        if (tEnd > startWindow.getTime() && tEnd < endWindow.getTime()) eventTimes.add(tEnd);
    }

    const sortedEvents = Array.from(eventTimes).sort((a, b) => a - b);
    const INTERVAL_MS = 5 * 60 * 1000;

    for (let i = 0; i < sortedEvents.length - 1; i++) {
        const segStart = sortedEvents[i]!;
        const segEnd = sortedEvents[i + 1]!;
        const midPoint = new Date(segStart + (segEnd - segStart) / 2);

        // Resolve profile for this segment
        const res = await resolveActiveProfile(midPoint);
        if (!res) continue;
        const store = getProfileStore(res.doc || undefined, res.activeProfileName, res.profileData || undefined);
        if (!store) continue;

        const scheduledRate = getBasalFromSchedule(store.basal, midPoint);
        let deliveredRate = scheduledRate;

        // Check for temp basal overlay
        for (const t of tempBasals) {
            const tStart = new Date(t.created_at).getTime();
            const tEnd = tStart + (t.duration || 0) * 60000;
            if (midPoint.getTime() >= tStart && midPoint.getTime() < tEnd) {
                if (t.rate !== undefined) {
                    deliveredRate = t.rate;
                } else if (t.percent !== undefined) {
                    deliveredRate = Math.round(scheduledRate * (1 + t.percent / 100) * 1000) / 1000;
                }
                break;
            }
        }

        // Create 5-min buckets for this segment
        for (let tMs = segStart; tMs < segEnd; tMs += INTERVAL_MS) {
            const bucketTime = new Date(tMs);
            const scheduledInsulin = scheduledRate * (5 / 60);
            const deliveredInsulin = deliveredRate * (5 / 60);

            if (scheduledInsulin > 0) {
                scheduledCurves.push(calculateInsulinEventCurve(scheduledInsulin, bucketTime, endWindow, dia, peak, 'Basal', includeFuture));
            }
            if (deliveredInsulin > 0) {
                deliveredCurves.push(calculateInsulinEventCurve(deliveredInsulin, bucketTime, endWindow, dia, peak, 'Basal', includeFuture));
            }
        }
    }

    return { deliveredCurves, scheduledCurves };
}
