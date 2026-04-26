/**
 * ollama-provider.ts
 *
 * LLMProvider stub for Ollama (local model inference).
 * Target model: Qwen3 14B Q4 on RTX 3060 12GB.
 *
 * This is a minimal implementation using Ollama's REST API.
 * No optimization for local model constraints yet — that comes
 * after structured context assembly (Phase 2) and hardware upgrade.
 *
 * TODO: If rules-based intent classification (Phase 5) becomes problematic,
 * consider using this provider for a cheap local classification call.
 */

import type { LLMProvider, LLMOptions } from './types';

export class OllamaProvider implements LLMProvider {
    readonly providerType = 'ollama' as const;
    readonly supportsTools = true;      // Qwen3 supports tool calling
    readonly supportsThinking = true;   // Qwen3 hybrid thinking mode

    private baseUrl: string;
    private modelId: string;

    constructor(modelId: string) {
        this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
        this.modelId = modelId;
    }

    async complete(system: string, user: string, options?: LLMOptions): Promise<string> {
        // Qwen3 thinking mode is toggled via system prompt, not API param
        const systemPrompt = options?.thinkingMode
            ? `${system}\n\n/think`
            : `${system}\n\n/no_think`;

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.modelId,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: user },
                    ],
                    stream: false,
                    options: {
                        ...(options?.maxTokens ? { num_predict: options.maxTokens } : {}),
                        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
                    },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama returned ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return data.message?.content || 'Could not generate response.';
        } catch (error: any) {
            if (error.cause?.code === 'ECONNREFUSED') {
                throw new Error(
                    `Ollama is not running at ${this.baseUrl}. Start Ollama or switch to Gemini in Settings.`
                );
            }
            console.error('[OllamaProvider] completion failed:', error);
            throw new Error(`Ollama completion failed: ${error.message}`);
        }
    }

    async *stream(system: string, user: string, options?: LLMOptions): AsyncIterable<string> {
        const systemPrompt = options?.thinkingMode
            ? `${system}\n\n/think`
            : `${system}\n\n/no_think`;

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.modelId,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: user },
                    ],
                    stream: true,
                    options: {
                        ...(options?.maxTokens ? { num_predict: options.maxTokens } : {}),
                        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
                    },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama returned ${response.status}: ${errorText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response body from Ollama');

            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                // Ollama streams newline-delimited JSON
                for (const line of chunk.split('\n')) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.message?.content) {
                            yield parsed.message.content;
                        }
                    } catch {
                        // Partial JSON line, skip
                    }
                }
            }
        } catch (error: any) {
            if (error.cause?.code === 'ECONNREFUSED') {
                throw new Error(
                    `Ollama is not running at ${this.baseUrl}. Start Ollama or switch to Gemini in Settings.`
                );
            }
            console.error('[OllamaProvider] stream failed:', error);
            throw new Error(`Ollama stream failed: ${error.message}`);
        }
    }
}
