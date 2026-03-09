/**
 * /api/chat/route.ts
 *
 * Data Explorer Agent endpoint.
 * Accepts a conversation history, runs the agent with tool calling (max 5 steps),
 * and streams the result back as Server-Sent Events using the Vercel AI SDK.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';

import { agentTools } from '@/lib/logic/agent/tools';
import { buildSystemPrompt } from '@/lib/logic/agent/prompts';
import { getUserContext } from '@/lib/logic/agent/data-catalog';
import { UserPreference } from '@/lib/db/models';

export const maxDuration = 60; // seconds — tool calls can take a few seconds each

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

    // 4. Initialise Gemini via Vercel AI SDK
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured.' }), { status: 500 });
    }

    const google = createGoogleGenerativeAI({ apiKey });

    // 5. Read model from system_config (fallback to 2.5 flash)
    const { SystemConfig } = await import('@/lib/db/models');
    const modelConfig = await SystemConfig.findOne({ key: 'ai_model' }).lean() as any;
    const modelId = modelConfig?.value ?? 'gemini-2.5-flash';

    // 6. Convert UIMessages → ModelMessages and stream
    const modelMessages = await convertToModelMessages(uiMessages);

    const result = streamText({
        model: google(modelId),
        system: systemPrompt,
        messages: modelMessages,
        tools: agentTools,
        stopWhen: stepCountIs(5),
        onError: ({ error }) => {
            console.error('[chat] streamText error:', error);
        },
    });

    return result.toUIMessageStreamResponse();
}
