/**
 * /api/chat/route.ts
 *
 * Data Explorer Agent endpoint.
 * Accepts a conversation history, runs the agent with tool calling (max 25 steps),
 * and streams the result back as Server-Sent Events using the Vercel AI SDK.
 *
 * Uses the unified LLM provider factory for model selection.
 * Provider and model are configured via SystemConfig + env vars.
 */

import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';

import { agentTools } from '@/lib/logic/agent/tools';
import { buildSystemPrompt } from '@/lib/logic/agent/prompts';
import { getUserContext } from '@/lib/logic/agent/data-catalog';
import { UserPreference } from '@/lib/db/models';
import { getChatModel } from '@/lib/logic/llm';

export const maxDuration = 120; // seconds — chart + multi-step tool chains can take longer

export async function POST(req: NextRequest) {
    // 1. Parse request
    const body = await req.json();
    const uiMessages: UIMessage[] = body.messages ?? [];

    if (!uiMessages.length) {
        return new Response(JSON.stringify({ error: 'No messages provided.' }), { status: 400 });
    }

    // 2. Check consent
    try {
        await connectToDatabase();
        const consentPref = await UserPreference.findOne({ key: 'ai_assistant_enabled' }).lean() as any;
        if (!consentPref?.value) {
            return new Response(
                JSON.stringify({ error: 'AI Assistant is not enabled. Please enable it in Settings.' }),
                { status: 403 }
            );
        }
    } catch (err) {
        console.error('[chat] DB connection failed:', err);
        return new Response(JSON.stringify({ error: 'Database connection failed.' }), { status: 500 });
    }

    // 3. Load user context and build system prompt
    const ctx = await getUserContext();
    const systemPrompt = buildSystemPrompt(ctx);

    // 4. Get model from unified provider factory
    let chatModel;
    try {
        chatModel = await getChatModel();
    } catch (err: any) {
        console.error('[chat] Provider initialization failed:', err);
        return new Response(
            JSON.stringify({ error: err.message || 'Failed to initialize LLM provider.' }),
            { status: 500 }
        );
    }

    // 5. Build provider-specific options
    const providerOptions: Record<string, any> = {};
    if (chatModel.providerType === 'gemini') {
        providerOptions.google = {
            thinkingConfig: {
                thinkingBudget: 2048,
                includeThoughts: true,
            },
        };
    }

    // 6. Convert UIMessages → ModelMessages and stream
    const modelMessages = await convertToModelMessages(uiMessages);

    const result = streamText({
        model: chatModel.model,
        system: systemPrompt,
        messages: modelMessages,
        tools: agentTools,
        stopWhen: stepCountIs(25),
        providerOptions,
        onError: ({ error }) => {
            console.error('[chat] streamText error:', error);
        },
    });

    return result.toUIMessageStreamResponse({
        sendReasoning: true,
    });
}
