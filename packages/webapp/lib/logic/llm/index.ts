/**
 * index.ts
 *
 * Public API for the unified LLM provider layer.
 */

export { getProvider, getChatModel, invalidateProviderCache } from './factory';
export { resolveConfig } from './config';
export { buildAttributionContext, buildTuningContext, buildExplainContext, serializeExplainContext } from './context-builders';
export type { LLMProvider, LLMProviderType, LLMOptions, ResolvedLLMConfig } from './types';
export type {
    AttributionContext,
    TuningContext,
    ExplainContext,
    TuningBlockDiff,
    ModelQualityContext,
} from './context-types';
