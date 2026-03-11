'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import InlineChart from '@/components/InlineChart';
import type { InlineChartData } from '@/components/InlineChart';
import {
    Send, Loader2, AlertTriangle,
    Database, ChevronDown, ChevronUp, Sparkles, Activity,
    BarChart2, Droplet, Clock
} from 'lucide-react';
import type { UIMessage } from 'ai';

// ---------------------------------------------------------------------------
// Starter questions
// ---------------------------------------------------------------------------

const STARTER_QUESTIONS = [
    { icon: Sparkles, text: 'Summarize my current status (glucose, IOB, COB)', color: 'text-emerald-400' },
    { icon: Clock, text: 'Show my glucose, iob and cob history for the last 12 hours', color: 'text-blue-400' },
    { icon: Activity, text: 'Identify glucose patterns from the past week', color: 'text-violet-400' },
    { icon: Droplet, text: 'What is my average Total Daily Dose? (SMB included)', color: 'text-amber-400' },
];

// ---------------------------------------------------------------------------
// Tool call badge (shown while tool is being called)
// ---------------------------------------------------------------------------

function ToolCallBadge({ toolName }: { toolName: string }) {
    const labels: Record<string, string> = {
        analyze_glucose: '🩸 Querying glucose data',
        analyze_treatments: '💉 Querying treatment data',
        analyze_activities: '🏃 Querying activity data',
        query_data: '🗄️ Running database query',
        render_chart: '📊 Rendering chart',
    };
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const start = Date.now();
        const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
        return () => clearInterval(id);
    }, []);
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-full text-xs text-zinc-300 w-fit">
            <Loader2 size={11} className="animate-spin text-emerald-400" />
            <span>{labels[toolName] ?? `Calling ${toolName}…`}</span>
            <span className="font-mono text-emerald-500 font-bold">{elapsed}s</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Collapsible reasoning block
// ---------------------------------------------------------------------------

function ReasoningBlock({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="flex flex-col gap-1">
            <button
                onClick={() => setExpanded(e => !e)}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950/50 border border-zinc-800/40 rounded-full text-[10px] uppercase tracking-wider font-semibold text-zinc-500 hover:text-zinc-300 transition-colors w-fit"
            >
                <Sparkles size={10} className={expanded ? "text-emerald-500" : ""} />
                <span>Thinking</span>
                {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {expanded && (
                <div className="px-4 py-3 bg-zinc-950/30 border border-zinc-800/30 rounded-2xl rounded-tl-sm text-xs text-zinc-500 italic leading-relaxed whitespace-pre-wrap shrink-0">
                    {text}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Collapsible tool result
// ---------------------------------------------------------------------------

function ToolResultBadge({ toolName, result, durationMs }: { toolName: string; result: unknown; durationMs?: number }) {
    const [expanded, setExpanded] = useState(false);
    const isError = result && typeof result === 'object' && 'error' in result;
    const durationLabel = durationMs != null
        ? durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`
        : null;

    return (
        <div className="flex flex-col gap-1">
            <button
                onClick={() => setExpanded(e => !e)}
                className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-xs transition-colors w-fit ${
                    isError 
                    ? 'bg-red-900/20 border-red-800/40 text-red-400 hover:bg-red-900/30' 
                    : 'bg-zinc-900/60 border-zinc-700/50 text-zinc-500 hover:text-zinc-300'
                }`}
            >
                {isError ? <AlertTriangle size={11} /> : <Database size={11} />}
                <span>{isError ? 'Error: ' : 'Result: '}{toolName}</span>
                {durationLabel && (
                    <span className={`flex items-center gap-1 font-mono font-bold ${isError ? 'text-red-500/60' : 'text-emerald-500'}`}>
                        <Clock size={9} />{durationLabel}
                    </span>
                )}
                {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {expanded && (
                <pre className={`text-xs border rounded-xl p-3 overflow-x-auto max-h-48 ${
                    isError ? 'bg-red-950/20 border-red-900/30 text-red-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}>
                    {JSON.stringify(result, null, 2)}
                </pre>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: UIMessage }) {
    const isUser = message.role === 'user';

    if (isUser) {
        // Simple user message rendering
        const content = message.content || (message.parts as any[])
            ?.filter(p => p.type === 'text')
            ?.map((p: any) => p.text)
            ?.join('') || '';
        
        return (
            <div className="flex justify-end">
                <div className="max-w-[80%] px-4 py-3 bg-emerald-900/40 border border-emerald-700/30 rounded-2xl rounded-tr-sm text-sm text-white leading-relaxed">
                    {content}
                </div>
            </div>
        );
    }

    // Assistant messages: we want to render reasoning, tools, and text in order.
    const callStartTimes = useRef<Map<string, number>>(new Map());
    
    // DEBUG: Log the message structure to see where tools are hiding
    useEffect(() => {
        console.warn('[MessageBubble] Assistant Message:', {
            id: message.id,
            partsCount: message.parts?.length,
            toolInvocationsCount: message.toolInvocations?.length,
            parts: message.parts,
            invocations: message.toolInvocations
        });
    }, [message]);

    const parts = (message.parts as any[]) || [];
    const toolInvocations = (message.toolInvocations as any[]) || [];
    
    // We'll track which tool calls we've rendered to avoid duplicates
    const renderedToolCallIds = new Set<string>();

    const renderTool = (inv: any, key: string) => {
        if (!inv) return null;
        
        const callId = inv.toolCallId || inv.id; // Support both naming conventions
        if (callId) renderedToolCallIds.add(callId);

        console.warn(`[MessageBubble] Rendering tool: ${inv.toolName}, state: ${inv.state}, id: ${callId}`);

        // 1. Loading/Calling states
        if (inv.state === 'call' || inv.state === 'partial-call' || inv.state === 'loading') {
            if (callId && !callStartTimes.current.has(callId)) {
                callStartTimes.current.set(callId, Date.now());
            }
            return <ToolCallBadge key={key} toolName={inv.toolName} />;
        }

        // 2. Result states
        if (inv.state === 'result' || inv.result) {
            const startTime = callId ? callStartTimes.current.get(callId) : undefined;
            const durationMs = startTime != null ? Date.now() - startTime : undefined;
            
            // Special handling for render_chart
            if (inv.toolName === 'render_chart' && inv.result?.chartType) {
                return (
                    <div key={key} className="flex flex-col gap-2">
                        <ToolResultBadge toolName={inv.toolName} result={{ status: 'Chart Rendered' }} durationMs={durationMs} />
                        <InlineChart data={inv.result as InlineChartData} />
                    </div>
                );
            }
            
            return <ToolResultBadge key={key} toolName={inv.toolName} result={inv.result} durationMs={durationMs} />;
        }

        return null;
    };

    return (
        <div className="flex flex-col gap-2 max-w-[95%] w-full">
            {/* 1. Render all parts in order */}
            {parts.map((part, i) => {
                if (part.type === 'reasoning' && part.text) {
                    return <ReasoningBlock key={`reason-${i}`} text={part.text} />;
                }

                if (part.type === 'text' && part.text) {
                    return (
                        <div key={`text-${i}`} className="px-4 py-3 bg-zinc-900/80 border border-zinc-800/60 rounded-2xl rounded-tl-sm text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">
                            {part.text}
                        </div>
                    );
                }

                // AI SDK can have dynamic tool part types like "tool-analyze_glucose"
                const isDynamicToolType = part.type?.startsWith('tool-');
                if (part.type === 'tool-invocation' || part.type === 'tool_invocation' || part.type === 'tool-call' || isDynamicToolType) {
                    const invObj = part.toolInvocation || part.tool_invocation || part.tool_call || part;
                    const callId = invObj?.toolCallId || invObj?.id;
                    const toolName = invObj?.toolName || (isDynamicToolType ? part.type.replace('tool-', '') : 'tool');
                    const state = invObj?.state || (invObj?.output ? 'result' : (invObj?.input ? 'call' : 'unknown'));
                    const result = invObj?.result || invObj?.output;

                    // Construct a normalized invocation object
                    const normalizedInv = {
                        toolCallId: callId,
                        toolName: toolName,
                        state: state === 'output-available' ? 'result' : state,
                        result: result,
                        input: invObj?.input
                    };
                    
                    // Always try to find the LATEST state in the top-level toolInvocations array if available
                    const latestInv = toolInvocations.find(ti => (ti.toolCallId || ti.id) === callId) || normalizedInv;
                    return renderTool(latestInv, `tool-part-${i}`);
                }

                return null;
            })}

            {/* 2. Fallback: if parts are missing, render content and all toolInvocations */}
            {parts.length === 0 && message.content && (
                <div className="px-4 py-3 bg-zinc-900/80 border border-zinc-800/60 rounded-2xl rounded-tl-sm text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">
                    {message.content}
                </div>
            )}

            {/* 3. Catch any tool invocations that weren't in parts (essential for SDK v3/v4 consistency) */}
            {toolInvocations
                .filter(inv => {
                    const id = inv.toolCallId || inv.id;
                    return id && !renderedToolCallIds.has(id);
                })
                .map((inv, i) => {
                    const id = inv.toolCallId || inv.id;
                    return renderTool(inv, `tool-extra-${id || i}`);
                })
            }
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main chat page
// ---------------------------------------------------------------------------

export default function ChatPage() {
    // AI SDK v6: useChat requires a transport for the API endpoint
    const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), []);

    const { messages, sendMessage, status, error } = useChat({ transport });

    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isLoading = status === 'streaming' || status === 'submitted';

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const submit = () => {
        const text = input.trim();
        if (!text || isLoading) return;
        sendMessage({ text });
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
            <Header title="Freddy" />

            <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 pb-4">

                {/* Empty state */}
                {messages.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-8 py-16">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center">
                                <Sparkles size={28} className="text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-semibold text-white">Data Explorer</h2>
                            <p className="text-sm text-zinc-500 text-center max-w-md">
                                Ask anything about your glucose, insulin, carb, or activity data. I'll query your local database and answer with real numbers.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                            {STARTER_QUESTIONS.map(({ icon: Icon, text, color }) => (
                                <button
                                    key={text}
                                    onClick={() => sendMessage({ text })}
                                    className="flex items-start gap-3 p-3.5 bg-zinc-900/50 hover:bg-zinc-800/60 border border-zinc-800/60 hover:border-zinc-700/60 rounded-xl text-left transition-all group"
                                >
                                    <Icon size={16} className={`${color} mt-0.5 shrink-0`} />
                                    <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors leading-relaxed">{text}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Messages */}
                {messages.length > 0 && (
                    <div className="flex-1 flex flex-col gap-6 py-6">
                        {messages.map((message) => (
                            <MessageBubble key={message.id} message={message} />
                        ))}

                        {isLoading && (
                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500">
                                <Loader2 size={12} className="animate-spin text-emerald-400" />
                                <span>Thinking…</span>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-red-950/40 border border-red-900/40 rounded-xl text-sm text-red-400">
                                <AlertTriangle size={14} />
                                <span>{error.message}</span>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}

                {/* Input */}
                <div className="sticky bottom-0 pt-4 pb-2 bg-zinc-950/90 backdrop-blur-md">
                    <div className="flex items-end gap-2 bg-zinc-900/80 border border-zinc-800/60 rounded-2xl p-3 focus-within:border-emerald-700/50 transition-colors">
                        <textarea
                            ref={textareaRef}
                            id="chat-input"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask about your glucose, insulin, or activity data…"
                            rows={1}
                            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 resize-none outline-none leading-relaxed py-1 max-h-32"
                            onInput={(e) => {
                                const t = e.currentTarget;
                                t.style.height = 'auto';
                                t.style.height = Math.min(t.scrollHeight, 128) + 'px';
                            }}
                        />
                        <button
                            type="button"
                            id="chat-send-btn"
                            onClick={submit}
                            disabled={isLoading || !input.trim()}
                            className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl transition-colors shrink-0"
                        >
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        </button>
                    </div>
                    <p className="text-center text-xs text-zinc-700 mt-2">
                        Data stays local — only tool results are sent to the Gemini API.&nbsp;
                        <Link href="/settings" className="text-zinc-500 hover:text-zinc-300 underline underline-offset-2">
                            Manage in Settings
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
