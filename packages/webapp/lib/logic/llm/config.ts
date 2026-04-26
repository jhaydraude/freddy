/**
 * config.ts
 *
 * Resolves LLM provider configuration from SystemConfig (MongoDB) and env vars.
 * Priority: env var LLM_PROVIDER > SystemConfig.ai_provider > default 'gemini'.
 *
 * This is the single source of truth for which provider and model to use.
 */

import type { LLMProviderType, ResolvedLLMConfig } from './types';

/** Default models per provider. */
const DEFAULT_MODELS: Record<LLMProviderType, string> = {
    gemini: 'gemini-2.5-flash',
    ollama: 'qwen3:14b',
};

/**
 * Resolve the active LLM configuration.
 *
 * Reads from SystemConfig (key-value collection) with env var overrides.
 * Lazy-imports the DB model to avoid circular dependencies.
 */
export async function resolveConfig(): Promise<ResolvedLLMConfig> {
    // 1. Env var override takes highest priority
    const envProvider = process.env.LLM_PROVIDER as LLMProviderType | undefined;

    // 2. Read from SystemConfig (key-value store in Freddy DB)
    let dbProvider: LLMProviderType | undefined;
    let dbModel: string | undefined;

    try {
        const { SystemConfig } = await import('../../db/models');
        const [providerDoc, modelDoc] = await Promise.all([
            SystemConfig.findOne({ key: 'ai_provider' }).lean(),
            SystemConfig.findOne({ key: 'ai_model' }).lean(),
        ]);
        dbProvider = (providerDoc as any)?.value as LLMProviderType | undefined;
        dbModel = (modelDoc as any)?.value as string | undefined;
    } catch (err) {
        // DB may not be connected yet (e.g., during startup). Fall through to defaults.
        console.warn('[llm/config] Could not read SystemConfig, using defaults:', (err as Error).message);
    }

    // 3. Resolve with priority chain
    const provider = envProvider ?? dbProvider ?? 'gemini';

    // For model: env-specific override > DB > provider default
    let model: string;
    if (provider === 'ollama') {
        model = process.env.OLLAMA_MODEL ?? dbModel ?? DEFAULT_MODELS.ollama;
    } else {
        model = dbModel ?? DEFAULT_MODELS.gemini;
    }

    return { provider, model };
}
