/**
 * factory.ts
 *
 * Provider factory for the unified LLM layer.
 *
 * Two factory functions:
 *
 * 1. getProvider() — Returns an LLMProvider for explain endpoints.
 *    Used by llm-service.ts → explain-logic.ts, profile-explain-logic.ts.
 *
 * 2. getChatModel() — Returns a Vercel AI SDK LanguageModel for the chat agent.
 *    Used by /api/chat/route.ts. The Vercel AI SDK requires provider-specific
 *    model objects (e.g., google('gemini-2.5-flash')), so this is a separate path.
 *
 * Both read from the same resolveConfig() source.
 */

import type { LLMProvider, LLMProviderType } from './types';
import { resolveConfig } from './config';
import { GeminiProvider } from './gemini-provider';
import { OllamaProvider } from './ollama-provider';

// ---------------------------------------------------------------------------
// Provider cache — avoids re-initializing on every call
// ---------------------------------------------------------------------------
let cachedProvider: LLMProvider | null = null;
let cachedProviderKey: string | null = null;

/**
 * Get an LLMProvider instance for explain endpoints (non-streaming completions).
 *
 * Caches the provider instance. If config changes (e.g., user switches provider
 * in Settings), the next call will detect the change and re-initialize.
 */
export async function getProvider(): Promise<LLMProvider> {
    const config = await resolveConfig();
    const cacheKey = `${config.provider}:${config.model}`;

    if (cachedProvider && cachedProviderKey === cacheKey) {
        return cachedProvider;
    }

    cachedProvider = createProvider(config.provider, config.model);
    cachedProviderKey = cacheKey;
    return cachedProvider;
}

/** Construct a provider instance by type. */
function createProvider(type: LLMProviderType, model: string): LLMProvider {
    switch (type) {
        case 'gemini':
            return new GeminiProvider(model);
        case 'ollama':
            return new OllamaProvider(model);
        default:
            throw new Error(`Unknown LLM provider: ${type}. Supported: gemini, ollama.`);
    }
}

/**
 * Get a Vercel AI SDK LanguageModel for the chat agent.
 *
 * Returns { model, providerType } so the chat route can configure
 * provider-specific options (e.g., Gemini thinkingConfig).
 */
export async function getChatModel(): Promise<{
    model: any;
    modelId: string;
    providerType: LLMProviderType;
}> {
    const config = await resolveConfig();

    if (config.provider === 'gemini') {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('Missing GEMINI_API_KEY for Gemini chat provider.');
        }
        const google = createGoogleGenerativeAI({ apiKey });
        return {
            model: google(config.model),
            modelId: config.model,
            providerType: 'gemini',
        };
    }

    if (config.provider === 'ollama') {
        // For now, use Ollama via its OpenAI-compatible endpoint with the
        // generic OpenAI provider from Vercel AI SDK. This avoids adding
        // a separate dependency while keeping the door open for a dedicated
        // Ollama adapter later.
        //
        // Ollama exposes an OpenAI-compatible API at /v1 when running.
        // The @ai-sdk/openai package is not installed yet — this path will
        // fail gracefully until the hardware upgrade + dependency is added.
        throw new Error(
            'Ollama chat integration is not yet available. ' +
            'The explain endpoints work with Ollama, but the chat agent ' +
            'requires a Vercel AI SDK adapter. Install @ai-sdk/openai and ' +
            'configure Ollama\'s OpenAI-compatible endpoint, or use Gemini for chat.'
        );
    }

    throw new Error(`Unknown provider for chat: ${config.provider}`);
}

/**
 * Invalidate the cached provider.
 * Call this when the user changes AI settings to force re-initialization.
 */
export function invalidateProviderCache(): void {
    cachedProvider = null;
    cachedProviderKey = null;
}
