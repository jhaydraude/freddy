import { Treatment } from '../db/models.js';
import { resolveActiveProfile, getProfileStore } from './profile-logic.js';
import { getBasalRate, getBasalFromSchedule } from './basal-logic.js';
import { decayIOB } from './insulin-math.js';

export interface IIOBResult {
    deliveredIOB: number;
    scheduledBasalIOB: number;
    netIOB: number;
}

/**
 * Service to get IOB at a specific time.
 * Calculates both Bolus IOB and Delivered/Scheduled Basal IOB.
 */
export async function getIOB(timestamp: string | Date): Promise<IIOBResult> {
    const endWindow = new Date(timestamp);
    const profileInfo = await resolveActiveProfile(endWindow);
    if (!profileInfo) return { deliveredIOB: 0, scheduledBasalIOB: 0, netIOB: 0 };

    const store = getProfileStore(profileInfo.doc || undefined, profileInfo.activeProfileName, profileInfo.profileData || undefined);
    if (!store) return { deliveredIOB: 0, scheduledBasalIOB: 0, netIOB: 0 };

    const dia = store.dia; // hours
    const diaMs = dia * 60 * 60 * 1000;
    const startWindow = new Date(endWindow.getTime() - diaMs);

    // 1. Bolus IOB (Meal Bolus, Correction Bolus)
    const boluses = await Treatment.find({
        eventType: { $in: ["Meal Bolus", "Correction Bolus"] },
        created_at: { $lte: endWindow.toISOString(), $gte: startWindow.toISOString() }
    });

    let bolusIOB = 0;
    for (const b of boluses) {
        const insulin = b.insulin || 0;
        if (insulin <= 0) continue;

        const ageMinutes = (endWindow.getTime() - new Date(b.created_at).getTime()) / (1000 * 60);
        bolusIOB += insulin * decayIOB(ageMinutes, dia);
    }

    // 2. Basal IOB (Delivered & Scheduled)
    const basalRes = await getBasalIOB(startWindow, endWindow);

    // Delivered IOB = Bolus IOB + Delivered Basal IOB
    const deliveredIOB = bolusIOB + basalRes.deliveredIOB;
    const scheduledBasalIOB = basalRes.scheduledIOB;
    const netIOB = deliveredIOB - scheduledBasalIOB;

    return {
        deliveredIOB: Math.round(deliveredIOB * 1000) / 1000,
        scheduledBasalIOB: Math.round(scheduledBasalIOB * 1000) / 1000,
        netIOB: Math.round(netIOB * 1000) / 1000
    };
}

/**
 * Calculates both Scheduled and Delivered Basal IOB for a given time window.
 * Returns { scheduledIOB: number, deliveredIOB: number }
 */
export async function getBasalIOB(startTime: Date, endTime: Date): Promise<{ scheduledIOB: number, deliveredIOB: number }> {
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();

    // 1. Initial Resolution for DIA
    const initialRes = await resolveActiveProfile(startTime);
    if (!initialRes) return { scheduledIOB: 0, deliveredIOB: 0 };

    const initialStore = getProfileStore(initialRes.doc || undefined, initialRes.activeProfileName, initialRes.profileData || undefined);
    if (!initialStore) return { scheduledIOB: 0, deliveredIOB: 0 };

    const diaMs = initialStore.dia * 60 * 60 * 1000;
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

    // 3. Process Segments
    let scheduledIOB = 0;
    let deliveredIOB = 0;
    const stepMin = 5;
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
                break; // Found the active temp for this segment
            }
        }

        // c. Iterate sub-windows
        for (let tMs = segStart; tMs < segEnd; tMs += stepMs) {
            const ageMin = (endMs - (tMs + stepMs / 2)) / 60000;
            const decayFactor = decayIOB(ageMin, currentDia);

            scheduledIOB += (scheduledRate * (stepMin / 60)) * decayFactor;
            deliveredIOB += (deliveredRate * (stepMin / 60)) * decayFactor;
        }
    }

    return {
        scheduledIOB: Math.round(scheduledIOB * 1000) / 1000,
        deliveredIOB: Math.round(deliveredIOB * 1000) / 1000
    };
}
