/**
 * gemini-provider.ts
 *
 * LLMProvider implementation for Google Gemini.
 * Used by explain endpoints (dashboard, profile, tuning).
 *
 * Uses @google/generative-ai SDK directly (not Vercel AI SDK).
 * The chat agent has its own Vercel AI SDK integration in chat-provider.ts.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMProvider, LLMOptions } from './types';

export class GeminiProvider implements LLMProvider {
    readonly providerType = 'gemini' as const;
    readonly supportsTools = true;
    readonly supportsThinking = true;

    private genAI: GoogleGenerativeAI;
    private modelId: string;

    constructor(modelId: string) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('Missing GEMINI_API_KEY in environment variables.');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.modelId = modelId;
    }

    async complete(system: string, user: string, options?: LLMOptions): Promise<string> {
        try {
            const model = this.genAI.getGenerativeModel({
                model: this.modelId,
                generationConfig: {
                    ...(options?.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
                    ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
                },
            });

            // Gemini supports systemInstruction for cleaner separation
            const result = await model.generateContent({
                systemInstruction: system,
                contents: [{ role: 'user', parts: [{ text: user }] }],
            });

            const response = await result.response;
            return response.text() || 'Could not generate response.';
        } catch (error: any) {
            console.error('[GeminiProvider] completion failed:', error);
            throw new Error(`Gemini completion failed: ${error.message}`);
        }
    }

    async *stream(system: string, user: string, options?: LLMOptions): AsyncIterable<string> {
        try {
            const model = this.genAI.getGenerativeModel({
                model: this.modelId,
                generationConfig: {
                    ...(options?.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
                    ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
                },
            });

            const result = await model.generateContentStream({
                systemInstruction: system,
                contents: [{ role: 'user', parts: [{ text: user }] }],
            });

            for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) yield text;
            }
        } catch (error: any) {
            console.error('[GeminiProvider] stream failed:', error);
            throw new Error(`Gemini stream failed: ${error.message}`);
        }
    }
}
