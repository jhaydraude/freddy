/**
 * types.ts
 *
 * Shared types for the unified LLM provider interface.
 * All LLM consumers (explain endpoints, chat agent) reference these types.
 */

// ---------------------------------------------------------------------------
// Provider Configuration
// ---------------------------------------------------------------------------

/** Supported LLM provider backends. */
export type LLMProviderType = 'gemini' | 'ollama';

/** Options passed to individual LLM calls. */
export interface LLMOptions {
    /** Enable thinking/reasoning mode for deeper analytical queries.
     *  Qwen3 controls this via system prompt toggle; Gemini uses thinkingConfig. */
    thinkingMode?: boolean;
    /** Max output tokens. Provider-specific defaults apply if omitted. */
    maxTokens?: number;
    /** Sampling temperature. 0 = deterministic, 1 = creative. */
    temperature?: number;
}

// ---------------------------------------------------------------------------
// Provider Interface (for explain endpoints)
// ---------------------------------------------------------------------------

/**
 * Unified LLM provider interface for non-streaming use cases
 * (dashboard explain, profile explain, tuning explain).
 *
 * The chat agent uses a separate Vercel AI SDK integration — see chat-provider.ts.
 */
export interface LLMProvider {
    /** Provider identifier. */
    readonly providerType: LLMProviderType;
    /** Whether this provider supports tool/function calling. */
    readonly supportsTools: boolean;
    /** Whether this provider supports thinking/reasoning mode. */
    readonly supportsThinking: boolean;

    /** Generate a complete response (non-streaming). */
    complete(system: string, user: string, options?: LLMOptions): Promise<string>;

    /** Stream a response as an async iterable of text chunks. */
    stream(system: string, user: string, options?: LLMOptions): AsyncIterable<string>;
}

// ---------------------------------------------------------------------------
// Resolved Configuration
// ---------------------------------------------------------------------------

/** Configuration resolved from SystemConfig + env vars. */
export interface ResolvedLLMConfig {
    provider: LLMProviderType;
    model: string;
}
