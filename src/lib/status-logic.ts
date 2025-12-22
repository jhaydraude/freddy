import { Entry } from '../db/models.js';
import { resolveActiveProfile, getProfileStore } from './profile-logic.js';
import { getBasalRate } from './basal-logic.js';
import { getIOB } from './iob-logic.js';
import type { IIOBResult } from './iob-logic.js';
import { getCOB } from './cob-logic.js';

export interface IGlucoseResult {
    sgv: number;
    date: number;
    dateString: string;
    direction?: string;
    trend?: number;
    delta5m: number | null;
    delta10m: number | null;
    units: string;
}

export interface IStatusResult {
    timestamp: string;
    basal: number;
    basalDetail: any;
    iob: number;
    iobDetail: IIOBResult;
    cob: number;
    activeProfile: string;
    expiration?: string | undefined;
    units: string;
}

/**
 * Fetches the latest glucose readings and calculates 5m/10m deltas.
 */
export async function getLatestGlucose(count: number = 1): Promise<IGlucoseResult[]> {
    const fetchCount = Math.max(count, 3);
    const [entries, profileInfo] = await Promise.all([
        Entry.find().sort({ date: -1 }).limit(fetchCount),
        resolveActiveProfile(new Date())
    ]);

    if (entries.length === 0) return [];

    let units = "mg/dL";
    if (profileInfo) {
        const store = getProfileStore(profileInfo.doc || undefined, profileInfo.activeProfileName, profileInfo.profileData || undefined);
        if (store) {
            units = store.units;
        }
    }

    const isMmol = units.toLowerCase().includes("mmol");

    return entries.slice(0, count).map((entry, index) => {
        const entryIdx = index;
        const prev5m = entries[entryIdx + 1];
        const prev10m = entries[entryIdx + 2];

        let delta5m: number | null = null;
        let delta10m: number | null = null;

        let sgv = entry.sgv;

        if (prev5m && Math.abs(entry.date - prev5m.date) <= 7 * 60 * 1000) {
            delta5m = entry.sgv - prev5m.sgv;
        }
        if (prev10m && Math.abs(entry.date - prev10m.date) <= 12 * 60 * 1000) {
            delta10m = entry.sgv - prev10m.sgv;
        }

        if (isMmol) {
            sgv = Math.round((sgv / 18.018) * 10) / 10;
            if (delta5m !== null) delta5m = Math.round((delta5m / 18.018) * 10) / 10;
            if (delta10m !== null) delta10m = Math.round((delta10m / 18.018) * 10) / 10;
        } else {
            // Keep as mg/dL, but ensure deltas are rounded to 1 decimal place if we had logic for that
            // Previous logic did: delta5m = Math.round((entry.sgv - prev5m.sgv) * 10) / 10;
            if (delta5m !== null) delta5m = Math.round(delta5m * 10) / 10;
            if (delta10m !== null) delta10m = Math.round(delta10m * 10) / 10;
        }

        return {
            sgv,
            date: entry.date,
            dateString: entry.dateString,
            direction: entry.direction,
            trend: entry.trend,
            delta5m,
            delta10m,
            units
        };
    });
}

/**
 * Aggregates current system status into a single report.
 */
export async function getStatus(timestamp: string | Date): Promise<IStatusResult> {
    const ts = typeof timestamp === 'string' ? timestamp : timestamp.toISOString();

    const [profileInfo, iob, cob, basalResult] = await Promise.all([
        resolveActiveProfile(ts),
        getIOB(ts),
        getCOB(ts),
        getBasalRate(ts)
    ]);

    if (!profileInfo) throw new Error("No profile found.");

    const store = getProfileStore(profileInfo.doc || undefined, profileInfo.activeProfileName, profileInfo.profileData || undefined);
    if (!store) throw new Error(`Profile store '${profileInfo.activeProfileName}' not found.`);

    return {
        timestamp: ts,
        basal: basalResult.activeRate,
        basalDetail: basalResult,
        iob: iob.deliveredIOB,
        iobDetail: iob,
        cob: cob,
        activeProfile: profileInfo.activeProfileName,
        expiration: profileInfo.expiration,
        units: store.units
    };
}
