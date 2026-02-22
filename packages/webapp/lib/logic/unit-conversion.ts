/**
 * Utility for glucose unit conversions
 */

export const MG_DL_TO_MMOL_L = 1 / 18.018;
export const MMOL_L_TO_MG_DL = 18.018;

/**
 * Normalizes ISF to mg/dL/U
 */
export function normalizeISF(value: number, units?: string | null): number {
    if (units?.toLowerCase().includes('mmol')) {
        return value * MMOL_L_TO_MG_DL;
    }
    return value;
}

/**
 * Denormalizes ISF from mg/dL/U back to user units
 */
export function denormalizeISF(value: number, units?: string | null): number {
    if (units?.toLowerCase().includes('mmol')) {
        return Math.round((value * MG_DL_TO_MMOL_L) * 10) / 10;
    }
    return Math.round(value * 10) / 10;
}

/**
 * Normalizes glucose value to mg/dL
 */
export function normalizeGlucose(value: number, units?: string | null): number {
    if (units?.toLowerCase().includes('mmol')) {
        return value * MMOL_L_TO_MG_DL;
    }
    return value;
}

/**
 * Denormalizes glucose value from mg/dL back to user units
 */
export function denormalizeGlucose(value: number, units?: string | null): number {
    if (units?.toLowerCase().includes('mmol')) {
        return Math.round((value * MG_DL_TO_MMOL_L) * 10) / 10;
    }
    return Math.round(value);
}
