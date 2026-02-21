import { IFreddyProfile, IScheduleEntry } from '../db/models/freddy-profile';
import { IProfileStore } from '../db/models';

/**
 * Converts a Nightscout profile store to a Freddy profile.
 */
export function nsToFreddy(nsStore: IProfileStore, name: string): Partial<IFreddyProfile> {
    const mapSchedule = (nsSchedule: any[]): IScheduleEntry[] => {
        if (!nsSchedule) return [];
        return nsSchedule.map(item => ({
            time: item.time || '00:00',
            value: item.value
        }));
    };

    // Heuristic for peak time based on curve
    const curve = (nsStore as any).curve || 'rapid-acting';
    const peak = curve === 'ultra-rapid' ? 45 : 55;

    return {
        name,
        dia: nsStore.dia || 5,
        peak: peak,
        units: (nsStore.units || 'mg/dL').toLowerCase().includes('mmol') ? 'mmol/L' : 'mg/dL',
        isf: mapSchedule(nsStore.sens),
        basal: mapSchedule(nsStore.basal),
        icr: mapSchedule(nsStore.carbratio),
        activityCoefficients: {
            steps: nsStore.activity_coefficients?.steps_per_minute || -0.1,
            heartRate: nsStore.activity_coefficients?.hr_spike || 1.0
        }
    };
}

/**
 * Converts a Freddy profile back to a Nightscout-compatible profile store.
 */
export function freddyToNS(freddy: IFreddyProfile): IProfileStore {
    const mapToNS = (schedule: IScheduleEntry[]) => {
        return schedule.map(item => {
            const [h, m] = item.time.split(':').map(Number);
            return {
                time: item.time,
                value: item.value,
                timeAsSeconds: h * 3600 + m * 60
            };
        });
    };

    return {
        dia: freddy.dia,
        sens: mapToNS(freddy.isf),
        basal: mapToNS(freddy.basal),
        carbratio: mapToNS(freddy.icr),
        target_low: [], // Freddy doesn't use target yet, or we can add it later
        target_high: [],
        units: freddy.units,
        activity_coefficients: {
            steps_per_minute: freddy.activityCoefficients.steps,
            calories: 0,
            stairs: 0,
            hr_spike: freddy.activityCoefficients.heartRate,
            stress_hr: 0,
            post_meal_multiplier: 1.0
        }
    } as any;
}
