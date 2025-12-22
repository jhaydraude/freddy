import { Entry, DeviceStatus, Treatment } from '../db/models.js';
import { resolveActiveProfile, getProfileStore } from './profile-logic.js';
import { getBasalRate } from './basal-logic.js';
import { getIOB } from './iob-logic.js';
import type { IIOBResult } from './iob-logic.js';
import { getCOB } from './cob-logic.js';

export interface IGlucoseResult {
    sgv: number;
    timestamp: string;
    direction?: string;
    trend?: number;
    delta5m: number | null;
    delta10m: number | null;
    units: string;
    sensorAge?: number | null;
    device?: string;
}

export interface IStatusResult {
    pump: {
        basal: any;
        pumpAge: number | null;
        reservoir: number | undefined;
        clock: string | undefined;
        status: any;
    };
    iob: {
        calculated: any;
        reported: any;
        timestamp: string;
    };
    cob: {
        cob: number;
        timestamp: string;
    };
    glucose: any;
    profile: any;
    uploader: {
        battery: number | undefined;
        device: string;
    };
    meta: {
        reported_date: string | undefined;
        status_date: string;
        created_date: string;
        app: string;
    };
}

/**
 * Fetches the latest glucose readings and calculates 5m/10m deltas.
 */
/**
 * Fetches glucose readings. 
 * If timestamp is given, finds the most recent entry at or before that time.
 * If count is given, returns multiple recent entries.
 */
export async function getGlucose(options: { timestamp?: string | Date, count?: number } = {}): Promise<IGlucoseResult[]> {
    const { timestamp, count = 1 } = options;
    const dateObj = timestamp ? new Date(timestamp) : new Date();
    const tsNumber = dateObj.getTime();

    const fetchCount = Math.max(count, 3);
    const [entries, profileInfo, lastSensorChange] = await Promise.all([
        Entry.find({ date: { $lte: tsNumber } }).sort({ date: -1 }).limit(fetchCount),
        resolveActiveProfile(dateObj),
        Treatment.findOne({ eventType: "Sensor Change" }).sort({ created_at: -1 })
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

    let sensorAge: number | null = null;
    if (lastSensorChange) {
        const diffMs = dateObj.getTime() - new Date(lastSensorChange.created_at).getTime();
        sensorAge = Math.floor(diffMs / (60 * 60 * 1000)); // hours
    }

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
            if (delta5m !== null) delta5m = Math.round(delta5m * 10) / 10;
            if (delta10m !== null) delta10m = Math.round(delta10m * 10) / 10;
        }

        return {
            sgv,
            timestamp: new Date(entry.date).toISOString(),
            direction: entry.direction,
            trend: entry.trend,
            delta5m,
            delta10m,
            units,
            sensorAge,
            device: entry.device
        };
    });
}

// Alias for backward compatibility if needed within the file, but we will update getStatus.
export const getLatestGlucose = (count: number = 1) => getGlucose({ count });

/**
 * Aggregates current system status into a single report.
 * Uses DeviceStatus (Pump) as the source of truth if available and fresh.
 */
export async function getStatus(timestamp: string | Date): Promise<IStatusResult> {
    const ts = typeof timestamp === 'string' ? timestamp : timestamp.toISOString();
    const dateObj = new Date(ts);

    // Fetch necessary data
    const [profileInfo, cob, latestDeviceStatus, glucoseEntries, calcIOB, basalResult, lastSiteChange] = await Promise.all([
        resolveActiveProfile(ts),
        getCOB(ts),
        DeviceStatus.findOne({ created_at: { $lte: ts } }).sort({ created_at: -1 }),
        getGlucose({ timestamp: ts, count: 1 }),
        getIOB(ts),
        getBasalRate(ts),
        Treatment.findOne({ eventType: "Site Change", created_at: { $lte: ts } }).sort({ created_at: -1 })
    ]);

    if (!profileInfo) throw new Error("No profile found.");

    // --- Pump Info ---
    let pumpAge: number | null = null;
    if (lastSiteChange) {
        const diffMs = dateObj.getTime() - new Date(lastSiteChange.created_at).getTime();
        pumpAge = Math.floor(diffMs / (60 * 60 * 1000)); // hours
    }

    // --- IOB Reported ---
    let pumpIOB: any = null;
    if (latestDeviceStatus?.pump?.extended?.IOB !== undefined) {
        pumpIOB = { iob: latestDeviceStatus.pump.extended.IOB, source: "pump.extended.IOB" };
    } else if (latestDeviceStatus?.openaps?.iob) {
        pumpIOB = { ...latestDeviceStatus.openaps.iob, source: "openaps.iob" };
    }

    // --- Profile Clean ---
    const { doc, ...cleanProfile } = profileInfo;

    return {
        pump: {
            basal: basalResult,
            pumpAge,
            reservoir: latestDeviceStatus?.pump?.reservoir,
            clock: latestDeviceStatus?.pump?.clock,
            status: latestDeviceStatus?.pump?.status || {}
        },
        iob: {
            calculated: calcIOB,
            reported: pumpIOB,
            timestamp: ts
        },
        cob: {
            cob: cob,
            timestamp: ts
        },
        glucose: glucoseEntries[0] || null,
        profile: cleanProfile,
        uploader: {
            battery: latestDeviceStatus?.uploaderBattery,
            device: "phone"
        },
        meta: {
            reported_date: latestDeviceStatus?.created_at,
            status_date: ts,
            created_date: new Date().toISOString(),
            app: "NightManage"
        }
    };
}
