import { FreddyProfile, IFreddyProfile } from '../db/models/freddy-profile';
import { Profile, IProfile } from '../db/models';
import { nsToFreddy } from '../logic/profile-conversion';
import { getProfileStore } from '../logic/profile-logic';
import { denormalizeISF, denormalizeGlucose } from '../logic/unit-conversion';
import { connectToDatabase } from '../db/connection';

export class FreddyProfileService {
    /**
     * Get the currently active Freddy profile.
     */
    async getActiveProfile(): Promise<IFreddyProfile | null> {
        await connectToDatabase();
        return await FreddyProfile.findOne({ isActive: true });
    }

    /**
     * List all Freddy profiles.
     */
    async listProfiles(): Promise<IFreddyProfile[]> {
        await connectToDatabase();
        return await FreddyProfile.find().sort({ updatedAt: -1 });
    }

    /**
     * Create a new profile, optionally from a Nightscout baseline.
     */
    async createProfile(data: Partial<IFreddyProfile>): Promise<IFreddyProfile> {
        await connectToDatabase();

        // If this is the first profile, make it active
        const count = await FreddyProfile.countDocuments();
        if (count === 0) {
            data.isActive = true;
        }

        const profile = new FreddyProfile(data);
        await profile.save();
        return profile;
    }

    /**
     * Activate a specific profile by ID.
     */
    async activateProfile(id: string): Promise<void> {
        await connectToDatabase();

        // Deactivate all others
        await FreddyProfile.updateMany({ _id: { $ne: id } }, { isActive: false });

        // Activate target
        const res = await FreddyProfile.findByIdAndUpdate(id, { isActive: true });
        if (!res) throw new Error('Profile not found');
    }

    /**
     * Delete a profile.
     */
    async deleteProfile(id: string): Promise<void> {
        await connectToDatabase();
        const profile = await FreddyProfile.findById(id);
        if (!profile) return;

        if (profile.isActive) {
            throw new Error('Cannot delete the active profile');
        }

        await FreddyProfile.findByIdAndDelete(id);
    }

    /**
     * Check if there's a newer Nightscout profile than what we have in Freddy.
     */
    async getLatestNSProfile(): Promise<{ nsProfile: IProfile, name: string, data: any } | null> {
        await connectToDatabase();

        const latestNS = await Profile.findOne().sort({ startDate: -1 });
        if (!latestNS) return null;

        const name = latestNS.defaultProfile;
        const data = getProfileStore(latestNS, name);

        return { nsProfile: latestNS, name, data };
    }

    /**
     * Checks if a new Nightscout profile is available that hasn't been imported yet.
     */
    async checkNewNSProfileAvailable(): Promise<{ available: boolean, nsProfileId?: string, name?: string } | null> {
        const latest = await this.getLatestNSProfile();
        if (!latest) return { available: false };

        const nsId = latest.nsProfile._id?.toString() || latest.nsProfile.startDate;
        const existing = await FreddyProfile.findOne({ sourceNSProfileId: nsId });

        return {
            available: !existing,
            nsProfileId: nsId,
            name: latest.name
        };
    }

    /**
     * Applies analysis results to a profile.
     */
    async applyAnalysis(id: string, analysis: any, options?: { mode?: 'overwrite' | 'create', newName?: string, selection?: any }): Promise<IFreddyProfile> {
        await connectToDatabase();

        let profile: IFreddyProfile | null = null;

        if (options?.mode === 'create') {
            // Clone the profile with ID 'id' (usually the active one)
            const source = await FreddyProfile.findById(id);
            if (!source) throw new Error('Source profile not found');

            const plain = source.toObject();
            delete plain._id;
            delete plain.createdAt;
            delete plain.updatedAt;

            profile = new FreddyProfile({
                ...plain,
                name: options.newName || `${plain.name} (Tuned)`,
                isActive: false // Will activate later if needed
            });
        } else {
            profile = await FreddyProfile.findById(id);
        }

        if (!profile) throw new Error('Profile not found');

        const mapToSchedule = (values: number[], hoursPerBlock: number) => {
            return values.map((val, idx) => ({
                time: `${(idx * hoursPerBlock).toString().padStart(2, '0')}:00`,
                value: val
            }));
        };

        const sel = options?.selection || { dia: true, peak: true, basal: true, isf: true, icr: true, activity: true };
        const results = analysis.optimized_values || analysis; // Support both flat and nested results

        if (sel.isf && results.estimated_isf) {
            profile.isf = mapToSchedule(results.estimated_isf.map((v: number) => denormalizeISF(v, profile?.units)), 4);
        } else if (sel.isf && results.isf) {
            profile.isf = mapToSchedule(results.isf, 4);
        }

        if (sel.basal && results.estimated_basal_rates) {
            profile.basal = mapToSchedule(results.estimated_basal_rates, 2);
        } else if (sel.basal && results.basal) {
            profile.basal = mapToSchedule(results.basal, 2);
        }

        if (sel.icr && results.estimated_icr) {
            profile.icr = mapToSchedule(results.estimated_icr, 4);
        } else if (sel.icr && results.icr) {
            profile.icr = mapToSchedule(results.icr, 4);
        }

        if (sel.dia && results.dia) {
            profile.dia = results.dia;
        }
        if (sel.peak && results.peak) {
            profile.peak = results.peak;
        }

        if (sel.activity && results.estimated_activity_coefficients) {
            profile.activityCoefficients = {
                steps: results.estimated_activity_coefficients.steps_per_minute !== undefined
                    ? denormalizeGlucose(results.estimated_activity_coefficients.steps_per_minute, profile?.units)
                    : profile.activityCoefficients.steps,
                heartRate: results.estimated_activity_coefficients.hr_spike !== undefined
                    ? denormalizeGlucose(results.estimated_activity_coefficients.hr_spike, profile?.units)
                    : profile.activityCoefficients.heartRate
            };
        } else if (sel.activity && results.activity_coefficients) {
            profile.activityCoefficients = {
                steps: results.activity_coefficients.steps !== undefined
                    ? results.activity_coefficients.steps
                    : profile.activityCoefficients.steps,
                heartRate: results.activity_coefficients.heartRate !== undefined
                    ? results.activity_coefficients.heartRate
                    : profile.activityCoefficients.heartRate
            };
        }

        await profile.save();

        if (options?.mode === 'create') {
            await this.activateProfile(profile._id);
        }

        return profile;
    }
}

export const freddyProfileService = new FreddyProfileService();
