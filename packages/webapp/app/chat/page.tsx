'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import {
    Send, Loader2, AlertTriangle,
    Database, ChevronDown, ChevronUp, Sparkles, Activity,
    BarChart2, Droplet
} from 'lucide-react';
import type { UIMessage } from 'ai';

// ---------------------------------------------------------------------------
// Starter questions
// ---------------------------------------------------------------------------

const STARTER_QUESTIONS = [
    { icon: Droplet, text: 'What is my typical morning blood glucose?', color: 'text-emerald-400' },
    { icon: BarChart2, text: 'What is my time in range for the last 30 days?', color: 'text-blue-400' },
    { icon: Activity, text: 'Are there any recurring glucose patterns I should know about?', color: 'text-violet-400' },
    { icon: Database, text: 'What is my average Total Daily Dose of insulin?', color: 'text-amber-400' },
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
    };
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/60 border border-zinc-700/50 rounded-full text-xs text-zinc-400 w-fit">
            <Loader2 size={11} className="animate-spin text-emerald-400" />
            <span>{labels[toolName] ?? `Calling ${toolName}…`}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Collapsible tool result
// ---------------------------------------------------------------------------

function ToolResultBadge({ toolName, result }: { toolName: string; result: unknown }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="flex flex-col gap-1">
            <button
                onClick={() => setExpanded(e => !e)}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/60 border border-zinc-700/50 rounded-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors w-fit"
            >
                <Database size={11} />
                <span>Result: {toolName}</span>
                {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {expanded && (
                <pre className="text-xs bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-zinc-400 overflow-x-auto max-h-48">
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
        const text = (message.parts as any[])
            .filter(p => p.type === 'text')
            .map((p: any) => p.text)
            .join('');
        return (
            <div className="flex justify-end">
                <div className="max-w-[80%] px-4 py-3 bg-emerald-900/40 border border-emerald-700/30 rounded-2xl rounded-tr-sm text-sm text-white leading-relaxed">
                    {text}
                </div>
            </div>
        );
    }

    // Assistant messages: parts include text, tool-call, tool-result parts
    return (
        <div className="flex flex-col gap-2 max-w-[90%]">
            {(message.parts as any[]).map((part, i) => {
                if (part.type === 'tool-invocation') {
                    const inv = part.toolInvocation;
                    if (inv?.state === 'call') return <ToolCallBadge key={i} toolName={inv.toolName} />;
                    if (inv?.state === 'result') return <ToolResultBadge key={i} toolName={inv.toolName} result={inv.result} />;
                    return null;
                }
                if (part.type === 'text' && part.text) {
                    return (
                        <div key={i} className="px-4 py-3 bg-zinc-900/80 border border-zinc-800/60 rounded-2xl rounded-tl-sm text-sm text-zinc-100 leading-relaxed whitespace-pre-wrap">
                            {part.text}
                        </div>
                    );
                }
                return null;
            })}
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
