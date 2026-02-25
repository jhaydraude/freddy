import { Profile, Treatment, FreddyProfile } from '../db/models';
import type { IProfile, IProfileStore } from '../db/models';
import { freddyToNS } from './profile-conversion';

const profileCache = new Map<string, any>();

/**
 * Synchronously resolves the active profile from pre-fetched arrays of profiles and treatments.
 * Crucial for avoiding N+1 queries when processing long time series.
 */
export function resolveProfileFromData(
    timestamp: string | Date,
    baseProfiles: IProfile[],
    profileSwitches: any[],
    activeFreddy: any | null
): { doc: IProfile | null, activeProfileName: string, profileData: IProfileStore | null, expiration?: string | undefined, isFreddy?: boolean } | null {
    const targetDate = new Date(timestamp);
    const targetIso = targetDate.toISOString();

    if (activeFreddy) {
        const profileData = freddyToNS(activeFreddy as any);
        return {
            activeProfileName: activeFreddy.name,
            profileData,
            doc: null,
            isFreddy: true
        };
    }

    const sortedBase = [...baseProfiles].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    const baseDoc = sortedBase.find(p => p.startDate <= targetIso);

    const sortedSwitches = [...profileSwitches].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const activeSwitch = sortedSwitches.find(s => s.created_at <= targetIso);

    let result: any = null;

    if (activeSwitch) {
        const createdMs = new Date(activeSwitch.created_at).getTime();
        let shiftMs = (activeSwitch.timeshift || 0);
        if (shiftMs < 10000) shiftMs *= 60000;
        const startMs = createdMs + shiftMs;

        let durMs = (activeSwitch.duration || activeSwitch.originalDuration || 0);
        if (durMs > 0 && durMs < 100000) durMs *= 60000;
        const endMs = durMs > 0 ? startMs + durMs : Infinity;

        // Check if the switch is still active at our target time
        if (targetDate.getTime() >= startMs && targetDate.getTime() < endMs) {
            let profileData: IProfileStore | undefined;

            if (activeSwitch.profileJson) {
                try {
                    profileData = JSON.parse(activeSwitch.profileJson);
                } catch (e) {
                    console.error("Failed to parse profileJson", e);
                }
            } else if (baseDoc) {
                const name = activeSwitch.profile || baseDoc.defaultProfile;
                const store = baseDoc.store instanceof Map ? baseDoc.store.get(name) : (baseDoc.store as any)[name];
                if (store) {
                    profileData = JSON.parse(JSON.stringify(store));
                }
            }

            // Apply Percentage Adjustments
            const percentage = activeSwitch.percentage;
            if (profileData && percentage !== undefined && percentage !== 100 && percentage > 0) {
                const factor = percentage / 100;
                if (profileData.basal) {
                    profileData.basal = profileData.basal.map(b => ({ ...b, value: Math.round(b.value * factor * 1000) / 1000 }));
                }
                if (profileData.sens) {
                    profileData.sens = profileData.sens.map(s => ({ ...s, value: Math.round((s.value / factor) * 100) / 100 }));
                }
                if (profileData.carbratio) {
                    profileData.carbratio = profileData.carbratio.map(c => ({ ...c, value: Math.round((c.value / factor) * 100) / 100 }));
                }
            }

            if (profileData || baseDoc) {
                result = {
                    activeProfileName: activeSwitch.profile || "Overridden",
                    profileData: profileData || null,
                    doc: baseDoc || null,
                    expiration: endMs !== Infinity ? new Date(endMs).toISOString() : undefined
                };
            }
        }
    }

    if (!result) {
        // Fallback to base document if no active switch found
        const doc = baseDoc || sortedBase[0];
        if (doc) {
            result = {
                doc,
                activeProfileName: doc.defaultProfile,
                profileData: null
            };
        }
    }

    return result;
}

/**
 * Resolves the active profile information at a specific timestamp.
 * Correctly handles historical profile switches (overrides) and base documents.
 */
export async function resolveActiveProfile(timestamp: string | Date, bypassCache: boolean = false): Promise<{ doc: IProfile | null, activeProfileName: string, profileData: IProfileStore | null, expiration?: string | undefined, isFreddy?: boolean } | null> {
    const targetDate = new Date(timestamp);
    const targetIso = targetDate.toISOString();

    const cacheKey = targetIso.substring(0, 16); // YYYY-MM-DDTHH:mm
    if (!bypassCache && profileCache.has(cacheKey)) {
        return profileCache.get(cacheKey);
    }

    const activeFreddy = await FreddyProfile.findOne({ isActive: true });

    // We fetch a couple of base documents just in case (e.g. recent profile)
    const baseDocs = await Profile.find({
        startDate: { $lte: targetIso }
    }).sort({ startDate: -1 }).limit(2);

    // If none found before, grab the very first one regardless of time
    if (baseDocs.length === 0) {
        const oldest = await Profile.findOne({}).sort({ startDate: 1 });
        if (oldest) baseDocs.push(oldest);
    }

    const activeSwitches = await Treatment.find({
        eventType: "Profile Switch",
        created_at: { $lte: targetIso }
    }).sort({ created_at: -1 }).limit(10); // Grab last 10 switches to be safe

    const result = resolveProfileFromData(targetDate, baseDocs, activeSwitches, activeFreddy);

    if (result) {
        profileCache.set(cacheKey, result);
    }
    return result;
}

export function clearProfileCache(): void {
    profileCache.clear();
}

export async function getProfileAtTime(timestamp: string | Date): Promise<IProfile | null> {
    const result = await resolveActiveProfile(timestamp);
    return result?.doc || null;
}

export function getProfileStore(profileDoc?: IProfile, profileName?: string, providedData?: IProfileStore): IProfileStore | null {
    if (providedData) return providedData;
    if (!profileDoc) return null;

    const name = profileName || profileDoc.defaultProfile;
    let store = profileDoc.store instanceof Map ? profileDoc.store.get(name) : (profileDoc.store as any)[name];

    if (!store && profileName && profileName !== profileDoc.defaultProfile) {
        const defaultName = profileDoc.defaultProfile;
        store = profileDoc.store instanceof Map ? profileDoc.store.get(defaultName) : (profileDoc.store as any)[defaultName];
    }

    return store || null;
}

export function getValueAtTime(schedule: Array<{ time: string, value: number }>, date: Date): number {
    if (!schedule || schedule.length === 0) return 0;
    const minutes = date.getHours() * 60 + date.getMinutes();
    const sorted = [...schedule].sort((a, b) => {
        const [aH, aM] = (a.time || "0:0").split(':').map(Number);
        const [bH, bM] = (b.time || "0:0").split(':').map(Number);
        return ((aH || 0) * 60 + (aM || 0)) - ((bH || 0) * 60 + (bM || 0));
    });
    let activeValue = sorted[0]?.value || 0;
    for (const entry of sorted) {
        const [h, m] = (entry.time || "0:0").split(':').map(Number);
        const entryMinutes = (h || 0) * 60 + (m || 0);
        if (entryMinutes <= minutes) {
            activeValue = entry.value;
        } else {
            break;
        }
    }
    return activeValue;
}
