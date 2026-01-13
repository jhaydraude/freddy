'use client';

import { useState, useEffect } from 'react';
import { Target, Brain, PieChart, Activity, AlertCircle, CheckCircle2, ChevronRight, BarChart3, Sparkles } from 'lucide-react';

interface StatsData {
    trainingStatus: {
        labeledCount: number;
        pendingCount: number;
        totalSamples: number;
        percentComplete: number;
    };
    modelMetrics: {
        model_name: string;
        trained_at: string;
        tag_metrics: Record<string, {
            precision: number;
            recall: number;
            f1: number;
            support: number;
        }>;
        feature_importance: Record<string, number>;
        samples_count: number;
    } | null;
}

interface SituationStatsProps {
    hideLabelLink?: boolean;
}

export default function SituationStats({ hideLabelLink = false }: SituationStatsProps) {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [regenerating, setRegenerating] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/classify/stats');
                if (res.ok) {
                    setStats(await res.json());
                }
            } catch (e) {
                console.error('Failed to fetch stats:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (loading) return <div className="animate-pulse bg-zinc-900/40 h-32 rounded-2xl border border-zinc-800" />;
    if (!stats) return null;

    const { trainingStatus, modelMetrics } = stats;

    return (
        <div className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Brain size={14} className="text-emerald-500" />
                Situation Awareness
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Training Progress Card */}
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 space-y-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-xs text-zinc-500 block uppercase font-bold">Training Progress</span>
                            <span className="text-2xl font-bold text-white">{trainingStatus.labeledCount} <span className="text-zinc-500 text-sm font-normal">samples</span></span>
                        </div>
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <Target size={20} className="text-emerald-500" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-mono">
                            <span className="text-zinc-500">Coverage</span>
                            <span className="text-zinc-300">{trainingStatus.percentComplete.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 transition-all duration-1000"
                                style={{ width: `${trainingStatus.percentComplete}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-zinc-500 italic">
                            {regenerating ? (
                                <span className="flex items-center gap-2 text-blue-400">
                                    <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Regenerating queue...
                                </span>
                            ) : (
                                `${trainingStatus.pendingCount} windows awaiting labels in the queue.`
                            )}
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        {!hideLabelLink && (
                            <a href="/modeller" className="flex items-center justify-between p-2 px-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg text-xs font-bold transition-colors group">
                                <span>Label More Windows</span>
                                <ChevronRight size={14} className="text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                            </a>
                        )}

                        <button
                            onClick={async () => {
                                try {
                                    const res = await fetch('/api/classify/auto-label', { method: 'POST' });
                                    if (res.ok) {
                                        const data = await res.json();
                                        alert(`Auto-labeled ${data.count} windows with model predictions`);
                                        const statsRes = await fetch('/api/classify/stats');
                                        if (statsRes.ok) setStats(await statsRes.json());
                                    }
                                } catch (e) { console.error(e); }
                            }}
                            className="flex items-center justify-center gap-2 p-2 px-3 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 rounded-lg text-xs font-bold transition-colors text-blue-400"
                        >
                            <Sparkles size={14} />
                            <span>Auto-Label Queue</span>
                        </button>

                        <div className="flex gap-2">
                            <button
                                onClick={async () => {
                                    if (!confirm('Clear all pending windows in the queue?')) return;
                                    try {
                                        const res = await fetch('/api/classify/queue/clear', { method: 'POST' });
                                        if (res.ok) {
                                            const statsRes = await fetch('/api/classify/stats');
                                            if (statsRes.ok) setStats(await statsRes.json());
                                        }
                                    } catch (e) { console.error(e); }
                                }}
                                className="flex-1 py-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-[10px] text-zinc-400 font-bold rounded-lg transition-all"
                            >
                                Clear Queue
                            </button>
                            <div className="relative group flex-1">
                                <button className="w-full py-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-[10px] text-zinc-400 font-bold rounded-lg transition-all">
                                    Regenerate...
                                </button>
                                <div className="absolute bottom-full left-0 pb-1 w-full invisible group-hover:visible opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all z-20">
                                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden">
                                        {[3, 7, 30, 90].map(days => (
                                            <button
                                                key={days}
                                                onClick={async () => {
                                                    setRegenerating(true);
                                                    const initialCount = stats?.trainingStatus.pendingCount || 0;
                                                    try {
                                                        // Clear first
                                                        await fetch('/api/classify/queue/clear', { method: 'POST' });
                                                        // Then generate
                                                        await fetch(`/api/classify/generate?days=${days}`, { method: 'POST' });

                                                        // Poll for completion (check every 3 seconds)
                                                        const pollInterval = setInterval(async () => {
                                                            const statsRes = await fetch('/api/classify/stats');
                                                            if (statsRes.ok) {
                                                                const newStats = await statsRes.json();
                                                                const newCount = newStats.trainingStatus.pendingCount;

                                                                // If we have new windows, regeneration is complete
                                                                if (newCount > 0 && newCount !== initialCount) {
                                                                    setStats(newStats);
                                                                    setRegenerating(false);
                                                                    clearInterval(pollInterval);
                                                                }
                                                            }
                                                        }, 3000);

                                                        // Safety timeout after 2 minutes
                                                        setTimeout(() => {
                                                            clearInterval(pollInterval);
                                                            setRegenerating(false);
                                                            fetch('/api/classify/stats').then(async (res) => {
                                                                if (res.ok) setStats(await res.json());
                                                            });
                                                        }, 120000);
                                                    } catch (e) {
                                                        console.error(e);
                                                        setRegenerating(false);
                                                    }
                                                }}
                                                className="w-full text-left px-3 py-1.5 text-[9px] font-bold text-zinc-400 hover:text-white hover:bg-emerald-600/20 transition-all uppercase tracking-wider"
                                            >
                                                {days} Days
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Model Quality Card */}
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 space-y-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-xs text-zinc-500 block uppercase font-bold">Model Confidence</span>
                            {modelMetrics && modelMetrics.tag_metrics && Object.keys(modelMetrics.tag_metrics).length > 0 ? (
                                <span className="text-2xl font-bold text-white">
                                    {(Object.values(modelMetrics.tag_metrics).reduce((a, b) => a + (b.f1 || 0), 0) / Object.keys(modelMetrics.tag_metrics).length * 100).toFixed(0)}%
                                    <span className="text-zinc-500 text-sm font-normal ml-2">F1-Score</span>
                                </span>
                            ) : (
                                <span className="text-xl font-bold text-zinc-600 italic">Untrained</span>
                            )}
                        </div>
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <Activity size={20} className="text-blue-500" />
                        </div>
                    </div>

                    {modelMetrics && modelMetrics.tag_metrics && Object.keys(modelMetrics.tag_metrics).length > 0 ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(modelMetrics.tag_metrics).slice(0, 3).map(([tag, m]) => (
                                    <div key={tag} className="px-2 py-1 bg-zinc-800 rounded text-[9px] font-bold uppercase flex items-center gap-1.5">
                                        <div className={`w-1 h-1 rounded-full ${m.f1 > 0.8 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                        <span className="text-zinc-400">{tag.replace('_', ' ')}:</span>
                                        <span className="text-white">{(m.f1 * 100).toFixed(0)}%</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                <BarChart3 size={12} />
                                <span>Strongest feature: {Object.keys(modelMetrics.feature_importance)[0].replace('_', ' ')}</span>
                            </div>

                            <button
                                onClick={async () => {
                                    if (trainingStatus.labeledCount < 10) return;
                                    try {
                                        const res = await fetch('/api/classify/train', { method: 'POST' });
                                        if (res.ok) {
                                            alert('Model retrained!');
                                            // Refetch stats to show new metrics
                                            const statsRes = await fetch('/api/classify/stats');
                                            if (statsRes.ok) setStats(await statsRes.json());
                                        }
                                        else alert('Training failed');
                                    } catch (e) { console.error(e); }
                                }}
                                disabled={trainingStatus.labeledCount < 10}
                                className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                            >
                                <Brain size={14} /> Retrain Model
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center min-h-[5rem] p-4 text-center space-y-3 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
                            <div className="flex flex-col items-center gap-1">
                                <AlertCircle size={20} className="text-zinc-700" />
                                <p className="text-[10px] text-zinc-600 max-w-[150px]">Train the model once you've labeled enough data.</p>
                            </div>
                            <button
                                onClick={async () => {
                                    if (trainingStatus.labeledCount < 10) return;
                                    try {
                                        const res = await fetch('/api/classify/train', { method: 'POST' });
                                        if (res.ok) {
                                            alert('Model trained!');
                                            // Refetch stats to show new metrics
                                            const statsRes = await fetch('/api/classify/stats');
                                            if (statsRes.ok) setStats(await statsRes.json());
                                        }
                                        else alert('Training failed');
                                    } catch (e) { console.error(e); }
                                }}
                                disabled={trainingStatus.labeledCount < 10}
                                className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border border-zinc-700"
                            >
                                <Brain size={14} /> {trainingStatus.labeledCount < 10 ? `Need ${10 - trainingStatus.labeledCount} more labels` : 'Train Model'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
