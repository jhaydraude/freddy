import dotenv from 'dotenv';
dotenv.config({ quiet: true } as any);

export interface SystemConfig {
    nightscout_url?: string;
    nightscout_api_key?: string;
    gemini_api_key?: string;
    prediction_service_url?: string;
    sync_frequency_ms: number;
}

export interface UserPreferences {
    units: 'mg/dL' | 'mmol/L';
    theme: 'light' | 'dark' | 'system';
    high_threshold: number;
    low_threshold: number;
}

/**
 * Handles configuration retrieval from environment or database.
 * Database overrides environment values.
 */
class ConfigManager {
    private static instance: ConfigManager;
    private config: SystemConfig;
    private dbInitialized: boolean = false;

    private constructor() {
        this.config = {
            nightscout_url: process.env.NIGHTSCOUT_URL,
            nightscout_api_key: process.env.NIGHTSCOUT_API_KEY,
            gemini_api_key: process.env.GEMINI_API_KEY,
            prediction_service_url: process.env.PREDICTION_SERVICE_URL,
            sync_frequency_ms: parseInt(process.env.SYNC_FREQUENCY_MS || '300000', 10)
        };
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    /**
     * Returns the MongoDB URI for Freddy.
     * Host/DB calculation is no longer performed here.
     * Expects MONGO_URI to point directly to the intended Freddy database.
     */
    public getFreddyMongoUri(): string {
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error('MONGO_URI must be defined in the environment.');
        }
        return uri;
    }

    /**
     * Returns the original Nightscout MongoDB URI.
     * Used for transition phase. Expects NIGHTSCOUT_MONGO_URI.
     */
    public getNightscoutMongoUri(): string {
        return process.env.NIGHTSCOUT_MONGO_URI || '';
    }

    public getSystemConfig(): SystemConfig {
        return this.config;
    }

    /**
     * Update runtime config (e.g. from DB).
     */
    public updateConfig(newConfig: Partial<SystemConfig>) {
        this.config = { ...this.config, ...newConfig };
    }
}

export const configManager = ConfigManager.getInstance();
