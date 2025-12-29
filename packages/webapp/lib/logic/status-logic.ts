import { Entry, DeviceStatus, Treatment } from '../db/models.js';
import { resolveActiveProfile, getProfileStore } from './profile-logic.js';
import { getBasalRate } from './basal-logic.js';
import { getIOB, type IIOBResult } from './iob-logic.js';
import { getCOB, type ICOBResult } from './cob-logic.js';
import { attributeGlucoseChange, type IAttributionResult } from './attribution-logic.js';

export interface IGlucoseResult {
    timestamp: string;
    units: string;

    current: {
        sgv: number;
        direction: string;
        trend: number;
        delta5m: number | null;
        delta10m: number | null;
        delta15m: number | null;
        delta30m: number | null;
        history30m: number[]; // Historical SGVs over last 30m
        rateOfChange: number | null;  // mg/dL per minute
    };

    sensor: {
        age: number | null;  // Hours since sensor change
        device: string;
        noise?: number;      // Signal quality (1=Clean, 4=Very Noisy)
        rssi?: number;       // Signal strength
        calibration?: {
            mbg: number;     // Meter blood glucose
            timeSince: number;  // Minutes since calibration
        };
    };
}

export interface IStatusResult {
    pump: {
        basal: any;
        pumpAge: number | null;
        reservoir: number | undefined;
        clock: string | undefined;
        status: any;
    };
    iob: IIOBResult;
    cob: ICOBResult;
    glucose: any;
    profile: any;
    attribution?: IAttributionResult;
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

    // Fetch entries for delta calculations
    // 30 mins = 6 entries, + buffer for gaps = 10 entries
    const fetchCount = Math.max(count + 9, 12);
    const [entries, profileInfo, lastSensorChange, lastCalibration] = await Promise.all([
        Entry.find({ date: { $lte: tsNumber } }).sort({ date: -1 }).limit(fetchCount).lean(),
        resolveActiveProfile(dateObj),
        Treatment.findOne({ eventType: "Sensor Change" }).sort({ created_at: -1 }).lean(),
        Treatment.findOne({ eventType: "BG Check", mbg: { $exists: true }, created_at: { $lte: dateObj.toISOString() } }).sort({ created_at: -1 }).lean()
    ]);

    if (entries.length === 0) return [];

    // Get units and profile targets
    let units = "mg/dL";
    let lowTarget = 70;
    let highTarget = 180;

    if (profileInfo) {
        const store = getProfileStore(profileInfo.doc || undefined, profileInfo.activeProfileName, profileInfo.profileData || undefined);
        if (store) {
            units = store.units;
            // Get target range from profile (first target in array)
            if (store.target_low?.[0]?.value) {
                lowTarget = store.target_low[0].value;
            }
            if (store.target_high?.[0]?.value) {
                highTarget = store.target_high[0].value;
            }
        }
    }

    const isMmol = units.toLowerCase().includes("mmol");

    // Sensor age
    let sensorAge: number | null = null;
    if (lastSensorChange) {
        const diffMs = dateObj.getTime() - new Date(lastSensorChange.created_at).getTime();
        sensorAge = Math.floor(diffMs / (60 * 60 * 1000));
    }

    // Calibration data
    let calibrationData: { mbg: number; timeSince: number } | undefined;
    if (lastCalibration && (lastCalibration as any).mbg) {
        const timeSince = Math.floor((dateObj.getTime() - new Date(lastCalibration.created_at).getTime()) / (60 * 1000));
        calibrationData = {
            mbg: (lastCalibration as any).mbg,
            timeSince
        };
    }



    return entries.slice(0, count).map((entry: any, index) => {
        const entryIdx = index;
        const prev5m = entries[entryIdx + 1];
        const prev10m = entries[entryIdx + 2];
        const prev15m = entries[entryIdx + 3];

        // Calculate deltas
        let delta5m: number | null = null;
        let delta10m: number | null = null;
        let delta15m: number | null = null;
        let delta30m: number | null = null;
        let rateOfChange: number | null = null;

        let sgv = entry.sgv;

        if (prev5m && Math.abs(entry.date - prev5m.date) <= 7 * 60 * 1000) {
            delta5m = entry.sgv - prev5m.sgv;
            const timeDiffMin = (entry.date - prev5m.date) / (60 * 1000);
            if (timeDiffMin > 0) {
                rateOfChange = delta5m / timeDiffMin;
            }
        }
        if (prev10m && Math.abs(entry.date - prev10m.date) <= 12 * 60 * 1000) {
            delta10m = entry.sgv - prev10m.sgv;
        }
        if (prev15m && Math.abs(entry.date - prev15m.date) <= 17 * 60 * 1000) {
            delta15m = entry.sgv - prev15m.sgv;
        }

        // Find entry near 30m ago for delta30m
        const target30m = entry.date - (30 * 60 * 1000);
        const prev30m = entries.find((e: any) => e.date <= target30m + (2 * 60 * 1000) && e.date >= target30m - (5 * 60 * 1000));
        if (prev30m) {
            delta30m = entry.sgv - prev30m.sgv;
        }

        // Calculate 30-min statistics
        // NOTE: Performance optimization opportunity - consider caching or moving to separate tool
        const thirtyMinAgo = entry.date - (30 * 60 * 1000);
        const recent30m = entries.filter((e: any) => e.date >= thirtyMinAgo && e.date <= entry.date);

        let mean30m: number | null = null;
        let std30m: number | null = null;
        let cv30m: number | null = null;
        let timeInRangeLow = 0;
        let timeInRangeTarget = 0;
        let timeInRangeHigh = 0;

        if (recent30m.length > 1) {
            const values = recent30m.map((e: any) => e.sgv);
            mean30m = values.reduce((a: number, b: number) => a + b, 0) / values.length;

            const variance = values.reduce((sum: number, val: number) => sum + Math.pow(val - mean30m!, 2), 0) / values.length;
            std30m = Math.sqrt(variance);
            cv30m = mean30m > 0 ? (std30m / mean30m) * 100 : null;

            // Time in range
            const totalReadings = values.length;
            const lowCount = values.filter((v: number) => v < lowTarget).length;
            const highCount = values.filter((v: number) => v > highTarget).length;
            const targetCount = totalReadings - lowCount - highCount;

            timeInRangeLow = Math.round((lowCount / totalReadings) * 100);
            timeInRangeTarget = Math.round((targetCount / totalReadings) * 100);
            timeInRangeHigh = Math.round((highCount / totalReadings) * 100);
        }

        const history30m = recent30m.map((e: any) => e.sgv).reverse(); // Oldest to newest

        // Convert to user units
        if (isMmol) {
            sgv = Math.round((sgv / 18.018) * 10) / 10;
            if (delta5m !== null) delta5m = Math.round((delta5m / 18.018) * 10) / 10;
            if (delta10m !== null) delta10m = Math.round((delta10m / 18.018) * 10) / 10;
            if (delta15m !== null) delta15m = Math.round((delta15m / 18.018) * 10) / 10;
            if (delta30m !== null) delta30m = Math.round((delta30m / 18.018) * 10) / 10;
            if (rateOfChange !== null) rateOfChange = Math.round((rateOfChange / 18.018) * 100) / 100;
            // history30m remains in original values or should be converted? 
            // Let's convert history30m to user units too.
            for (let i = 0; i < history30m.length; i++) {
                history30m[i] = Math.round((history30m[i] / 18.018) * 10) / 10;
            }
        } else {
            if (delta5m !== null) delta5m = Math.round(delta5m * 10) / 10;
            if (delta10m !== null) delta10m = Math.round(delta10m * 10) / 10;
            if (delta15m !== null) delta15m = Math.round(delta15m * 10) / 10;
            if (delta30m !== null) delta30m = Math.round(delta30m * 10) / 10;
            if (rateOfChange !== null) rateOfChange = Math.round(rateOfChange * 100) / 100;
            for (let i = 0; i < history30m.length; i++) {
                history30m[i] = Math.round(history30m[i] * 10) / 10;
            }
        }

        return {
            timestamp: new Date(entry.date).toISOString(),
            units,

            current: {
                sgv,
                direction: entry.direction || 'NONE',
                trend: entry.trend || 0,
                delta5m,
                delta10m,
                delta15m,
                delta30m,
                history30m,
                rateOfChange
            },

            sensor: {
                age: sensorAge,
                device: entry.device || 'unknown',
                noise: entry.noise,
                rssi: entry.rssi,
                calibration: calibrationData
            }
        };
    });
}

// Alias for backward compatibility if needed within the file, but we will update getStatus.
export const getLatestGlucose = (count: number = 1) => getGlucose({ count });

/**
 * Aggregates current system status into a single report.
 * Uses DeviceStatus (Pump) as the source of truth if available and fresh.
 */
export async function getStatus(timestamp: string | Date, includeTimeseries: boolean = true, includeAttribution: boolean = true): Promise<IStatusResult> {
    const ts = typeof timestamp === 'string' ? timestamp : timestamp.toISOString();
    const dateObj = new Date(ts);

    // Fetch necessary data
    const [profileInfo, cob, latestDeviceStatus, glucoseEntries, calcIOB, basalResult, lastSiteChange] = await Promise.all([
        resolveActiveProfile(ts),
        getCOB(ts, includeTimeseries),
        DeviceStatus.findOne({ created_at: { $lte: ts } }).sort({ created_at: -1 }),
        getGlucose({ timestamp: ts, count: 1 }),
        getIOB(ts, includeTimeseries),
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

    const statusResult: IStatusResult = {
        pump: {
            basal: basalResult,
            pumpAge,
            reservoir: latestDeviceStatus?.pump?.reservoir,
            clock: latestDeviceStatus?.pump?.clock,
            status: latestDeviceStatus?.pump?.status || {}
        },
        iob: calcIOB,
        cob,
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

    // Calculate attribution if requested
    if (includeAttribution) {
        try {
            statusResult.attribution = await attributeGlucoseChange(statusResult);
        } catch (error) {
            console.warn('Failed to calculate glucose attribution:', error);
        }
    }

    return statusResult;
}
