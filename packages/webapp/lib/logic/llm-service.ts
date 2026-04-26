/**
 * llm-service.ts
 *
 * Thin wrapper around the unified LLM provider factory.
 * Consumed by explain-logic.ts and profile-explain-logic.ts.
 *
 * Previously hardcoded to gemini-2.5-flash-lite.
 * Now delegates to the configured provider via getProvider().
 */

import { getProvider } from './llm';

export interface IExplainPrompt {
    system: string;
    user: string;
}

/**
 * Calls the configured LLM provider to generate an explanation.
 *
 * Provider and model are determined by SystemConfig + env vars.
 * See lib/logic/llm/config.ts for the resolution chain.
 */
export async function generateExplanation(prompt: IExplainPrompt): Promise<string> {
    try {
        const provider = await getProvider();
        return await provider.complete(prompt.system, prompt.user);
    } catch (error: any) {
        console.error('LLM Call Failed:', error);
        return `Error generating explanation: ${error.message}`;
    }
}
