import { getIOB } from './iob-logic.js';
import { getCOB } from './cob-logic.js';
import { resolveActiveProfile, getProfileStore } from './profile-logic.js';
import { getGlucose } from './status-logic.js';

export interface IProjectionResult {
    currentBg: number;
    projectedBg: number;
    minutesAhead: number;
    deltaIOB: number;
    deltaCOB: number;
    activityLines: {
        insulinDrop: number;
        carbRise: number;
    };
    factors: {
        isf: number;
        cr: number;
    };
}

/**
 * Calculates a projected glucose value X minutes into the future
 * based on the decay of currently active insulin and carbs.
 * 
 * Uses the formula: 
 * FutureBG = CurrentBG - (InsulinUsed * ISF) + (CarbsAbsorbed * ISF / CR)
 * 
 * Where InsulinUsed = Current_Net_IOB - Future_Net_IOB
 * And CarbsAbsorbed = Current_COB - Future_COB
 */
export async function calculateProjectedGlucose(minutesAhead: number = 30): Promise<IProjectionResult | null> {
    const now = new Date();
    const future = new Date(now.getTime() + minutesAhead * 60 * 1000);

    // 1. Fetch Current State & Future State in parallel
    const [
        glucoseEntries,
        profileInfo,
        currentIOB,
        futureIOB,
        currentCOB,
        futureCOB
    ] = await Promise.all([
        getGlucose({ count: 1 }),
        resolveActiveProfile(now),
        getIOB(now),
        getIOB(future),
        getCOB(now),
        getCOB(future) // "Simulate" future state by asking for COB at future time (assuming no new carbs)
    ]);

    if (!glucoseEntries.length || !profileInfo) {
        return null;
    }

    const currentBg = glucoseEntries[0]!.sgv;

    // Resolve Factors (ISF, CR)
    const store = getProfileStore(profileInfo.doc || undefined, profileInfo.activeProfileName, profileInfo.profileData || undefined);
    if (!store) return null;

    // Get simple average ISF/CR for calculation (or active at time)
    // For simplicity, we use the values active NOW. 
    // A more advanced engine would step through profile changes.
    const isf = store.sens?.[0]?.value || 50; // default 50 mg/dL/U
    const cr = store.carbratio?.[0]?.value || 10; // default 10 g/U

    // Note: If units are mmol, ISF might be small (e.g., 3.0), we should handle that.
    // However, the system seems to standardize on mg/dL internally or at least the profile stores what is entered.
    // If the profile is mmol, the user enters ~3.0.
    // If the glucose is mg/dL, we have a mismatch.
    // Typically existing logic in Nightscout/NightManager assumes consistency.
    // status-logic.ts checks units: if (isMmol) sgv = ...

    // We assume the profile values match the display units preference or are standardized to mg/dL?
    // Looking at profile-logic, it just returns values.
    // Looking at status-logic, it converts SGV based on units string. 
    // IMPORTANT: ISF and CR in the profile are usually in the User's preferred units.
    // If the profile says "units": "mmol/L", then ISF is in mmol/L/U.
    // The `currentBg` from `getGlucose` is RAW from the entry?
    // Let's check status-logic.ts:89 `let sgv = entry.sgv`. 
    // SGV in Nightscout mongo is ALWAYS mg/dL.
    // So if the profile is in mmol/L, we must convert ISF to mg/dL for math, OR convert SGV to mmol/L.

    const isMmol = glucoseEntries[0]!.units.toLowerCase().includes("mmol");

    // ISF and CR from profile
    let activeISF = isf;
    const activeCR = cr;

    // Check if Profile Units match Glucose Units
    // The profile store 'units' field tells us what the user entered.
    // getGlucose returns values converted to that preference.
    // So 'currentBg' is in 'store.units'.
    // 'isf' (sens) is in 'store.units'.
    // 'cr' is in g/U (universal).

    // So we just need to use them as is!
    // The only edge case is if data is mixed, but getGlucose handles normalization to profile units.
    // AND resolveActiveProfile returns raw profile data.
    // Does resolveActiveProfile normalize ISF? No.
    // Does getGlucose normalize SGV? Yes, to match profile units.

    // So 'currentBg' and 'activeISF' should ALREADY be in the same units (e.g. mmol/L).
    // The previous code explicitly converted ISF to mg/dL if isMmol was true. This was the bug.
    // We should trust the profile value matches the expected unit.

    // 2. Calculate Actives
    // IOB
    const insulinUsed = currentIOB.netIOB - futureIOB.netIOB;

    // COB
    const carbsAbsorbed = currentCOB - futureCOB;

    // 3. Calculate Impact
    const insulinDrop = insulinUsed * activeISF;
    const carbRise = carbsAbsorbed * (activeISF / activeCR);

    let projectedBg = currentBg - insulinDrop + carbRise;
    projectedBg = Math.round(projectedBg * 10) / 10; // Keep 1 decimal for mmol

    return {
        currentBg,
        projectedBg,
        minutesAhead,
        deltaIOB: Math.round(insulinUsed * 100) / 100,
        deltaCOB: Math.round(carbsAbsorbed * 10) / 10,
        activityLines: {
            insulinDrop: Math.round(insulinDrop * 10) / 10,
            carbRise: Math.round(carbRise * 10) / 10
        },
        factors: {
            isf: activeISF,
            cr: activeCR
        }
    };
}
