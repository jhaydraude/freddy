'use client';

import React, { useState, useEffect } from 'react';
import {
    Activity,
    Play,
    CheckCircle2,
    AlertCircle,
    ArrowLeft,
    Zap,
    Scale,
    Timer,
    Save,
    Loader2,
    ChevronRight,
    MousePointer2,
    Trash2,
    X,
    GitBranch,
    Telescope,
    Dna
} from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell
} from 'recharts';
import { ConfirmDialog } from './ConfirmDialog';
import { ApplySettingsDialog, ApplyOptions } from './ApplySettingsDialog';
import { UnifiedFoundationResults } from './UnifiedFoundationResults';

interface Props {
    onBack: () => void;
    initialTuningId?: string;
}

export const UnifiedFoundationTuner: React.FC<Props> = ({ onBack, initialTuningId }) => {
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
    const [tuningId, setTuningId] = useState<string | null>(initialTuningId ?? null);
    const [result, setResult] = useState<any>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [analysisPeriod, setAnalysisPeriod] = useState(14);
    const [showApplyDialog, setShowApplyDialog] = useState(false);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
    const [confirmDeleteRun, setConfirmDeleteRun] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetch('/api/profile/active')
            .then(r => r.json())
            .then(data => {
                if (data?._id) setActiveProfileId(data._id);
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (initialTuningId) {
            fetch(`/api/profile/tune-unified-foundation/${initialTuningId}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data) {
                        setResult(data);
                        setStatus(data.status === 'completed' || data.status === 'applied' ? 'completed' : data.status);
                    }
                })
                .catch(console.error);
        }
    }, [initialTuningId]);

    useEffect(() => {
        let interval: any;
        if (status === 'running' && tuningId) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/profile/tune-unified-foundation/${tuningId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.status === 'completed' || data.status === 'applied') {
                            setResult(data);
                            setStatus('completed');
                            clearInterval(interval);
                        } else if (data.status === 'failed') {
                            setStatus('failed');
                            setResult(data);
                            clearInterval(interval);
                        }
                    }
                } catch (err) {
                    console.error('Polling error:', err);
                }
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [status, tuningId]);

    const startTuning = async () => {
        try {
            setStatus('running');
            setResult(null);
            const res = await fetch('/api/profile/tune-unified-foundation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    analysis_period_days: analysisPeriod,
                    min_windows_required: 15
                })
            });
            const data = await res.json();
            if (data.tuning_id) setTuningId(data.tuning_id);
            else throw new Error(data.error);
        } catch (err: any) {
            setStatus('failed');
            setResult({ error_message: err.message });
        }
    };

    const deleteRun = async () => {
        if (!tuningId) return;
        setIsDeleting(true);
        try {
            await fetch(`/api/profile/tune-unified-foundation/${tuningId}`, { method: 'DELETE' });
            onBack();
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            setIsDeleting(false);
            setConfirmDeleteRun(false);
        }
    };

    const handleApply = async (options: ApplyOptions) => {
        if (!activeProfileId || !result) return;

        setIsApplying(true);
        try {
            const res = await fetch(`/api/profiles/${activeProfileId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'apply',
                    analysis: result,
                    mode: options.mode,
                    newName: options.newName,
                    selection: options.params
                })
            });

            if (res.ok) {
                alert('Profile updated successfully');
                setShowApplyDialog(false);
            } else {
                const err = await res.json();
                alert(`Apply failed: ${err.error}`);
            }
        } catch (err) {
            console.error('Apply error:', err);
            alert('Failed to apply parameters');
        } finally {
            setIsApplying(false);
        }
    };

    const renderHeader = () => (
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between border-b border-zinc-800 pb-8">
            <div className="flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Dna className="text-indigo-400" size={18} />
                        <h1 className="text-2xl font-bold text-white tracking-tight">Insulin Tuner (DIA & Basal)</h1>
                    </div>
                    <p className="text-zinc-500 text-sm max-w-lg">
                        Unified optimization of insulin action time (DIA), peak time, ISF, and basal rates.
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {tuningId && (
                    <button
                        onClick={() => setConfirmDeleteRun(true)}
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-red-500/5 transition-all"
                    >
                        <Trash2 size={20} />
                    </button>
                )}

                {status === 'idle' || status === 'failed' ? (
                    <div className="flex items-center gap-3 bg-zinc-900 p-1.5 rounded-2xl border border-zinc-800">
                        <select
                            value={analysisPeriod}
                            onChange={(e) => setAnalysisPeriod(Number(e.target.value))}
                            className="bg-transparent text-sm text-zinc-300 font-bold px-3 py-1 outline-none appearance-none cursor-pointer"
                        >
                            <option value={7}>LAST 7 DAYS</option>
                            <option value={14}>LAST 14 DAYS</option>
                            <option value={30}>LAST 30 DAYS</option>
                            <option value={60}>LAST 60 DAYS</option>
                            <option value={90}>LAST 90 DAYS</option>
                            <option value={180}>LAST 180 DAYS</option>
                            <option value={360}>LAST 360 DAYS</option>
                        </select>
                        <button
                            onClick={startTuning}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 transition-all active:scale-95"
                        >
                            <Play size={16} fill="currentColor" />
                            START ANALYSIS
                        </button>
                    </div>
                ) : status === 'completed' ? (
                    <button
                        onClick={() => setShowApplyDialog(true)}
                        disabled={isApplying}
                        className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 disabled:opacity-50 transition-all active:scale-95"
                    >
                        <Save size={18} />
                        APPLY PARAMETERS
                    </button>
                ) : (
                    <div className="px-6 py-2.5 rounded-xl bg-zinc-800/50 border border-zinc-700 text-zinc-400 text-sm font-bold flex items-center gap-3">
                        <Loader2 className="animate-spin text-zinc-500" size={16} />
                        OPTIMIZING...
                    </div>
                )}
            </div>
        </div>
    );

    const renderMainStatus = () => {
        if (status === 'idle') return (
            <div className="py-20 flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6">
                    <Telescope className="text-indigo-400" size={36} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Ready for Insulin Tuning</h3>
                <p className="text-zinc-500 max-w-sm">
                    This analysis looks for the optimal combination of basal rates, ISF, and DIA to explain your glucose trends.
                </p>
            </div>
        );

        if (status === 'running') return (
            <div className="py-10 flex flex-col items-center w-full max-w-4xl mx-auto">
                <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-full border-4 border-zinc-800 border-t-indigo-500 animate-spin" />
                    <Activity className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={28} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Analyzing Insulin Parameters</h3>
                <p className="text-zinc-500 text-sm max-w-lg text-center mb-8">
                    Generating synthetic basal windows and solving the weighted L-BFGS-B objective function...
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 text-left">
                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Analysis Configuration</h4>
                        <div className="space-y-4">
                            <div>
                                <div className="text-xs text-zinc-500 font-bold uppercase mb-1">Timeframe Reviewed</div>
                                <div className="text-sm font-bold text-white bg-zinc-800/50 inline-block px-3 py-1 rounded-lg border border-zinc-800">
                                    {(() => {
                                        const days = result?.config?.analysis_period_days || analysisPeriod;
                                        const end = new Date(result?.created_at || Date.now());
                                        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
                                        const format = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                                        return `${format(start)} - ${format(end)} (${days} Days)`;
                                    })()}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-zinc-500 font-bold uppercase mb-1">Window Selection Criteria</div>
                                <div className="text-sm text-zinc-400 space-y-1 bg-zinc-800/20 p-3 rounded-lg border border-zinc-800/50">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        <span>Stable glucose periods</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        <span>&gt;4h post-meal</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        <span>&gt;2h post-activity</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        <span>High sensor confidence</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 text-left flex flex-col">
                        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Window Discovery Progress</h4>
                        {result?.analysis_summary?.window_distribution ? (
                            <div className="flex-1 flex flex-col justify-end">
                                <div className="h-28 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={result.analysis_summary.window_distribution.map((count: number, i: number) => ({
                                            time: `${i * 2}h`,
                                            count
                                        }))}>
                                            <XAxis dataKey="time" hide />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', fontSize: '10px' }}
                                                labelStyle={{ color: '#71717a' }}
                                            />
                                            <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="text-xs text-indigo-400 font-bold text-center mt-3 bg-indigo-500/10 py-2 rounded-lg border border-indigo-500/20">
                                    {result.analysis_summary.total_windows || result.analysis_summary.windows_analyzed || 0} valid windows found
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center">
                                <div className="w-10 h-10 rounded-full border-2 border-zinc-800 border-t-zinc-500 animate-spin mb-3" />
                                <span className="text-xs text-zinc-500 font-bold uppercase tracking-widest animate-pulse">Scanning History...</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full bg-[#0a0a0a] rounded-2xl border border-zinc-800 p-5 font-mono text-xs text-zinc-500 text-left shadow-inner flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800/80">
                        <h4 className="text-[10px] font-sans font-bold text-zinc-500 uppercase tracking-widest">Process Log</h4>
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                            </span>
                            <span className="text-[10px] font-sans font-bold text-indigo-400 uppercase tracking-widest">Running</span>
                        </div>
                    </div>
                    <div className="h-48 overflow-y-auto pr-2 space-y-1.5 custom-scrollbar">
                        {result?.logs?.map((log: string, i: number) => {
                            let colorClass = 'text-zinc-400';
                            if (log.includes('WARN')) colorClass = 'text-amber-400';
                            else if (log.includes('ERR')) colorClass = 'text-red-400';
                            else if (log.includes('INFO') || log.includes('Step')) colorClass = 'text-indigo-200';
                            else if (log.includes('SUCCESS') || log.includes('Found')) colorClass = 'text-emerald-400';

                            return (
                                <div key={i} className={`flex gap-3 ${colorClass}`}>
                                    <span className="text-zinc-600 select-none">[{new Date().toISOString().substring(11, 19)}]</span>
                                    <span>{log}</span>
                                </div>
                            );
                        })}
                        {!result?.logs?.length && (
                            <div className="flex gap-3 text-zinc-500 animate-pulse">
                                <span className="text-zinc-700 select-none">[{new Date().toISOString().substring(11, 19)}]</span>
                                <span>Initializing optimization sequence...</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );

        if (status === 'failed') return (
            <div className="py-20 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
                    <AlertCircle className="text-red-400" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Optimization Failed</h3>
                <p className="text-red-400 text-sm max-w-md">{result?.error_message || 'Unknown error'}</p>
                <button
                    onClick={startTuning}
                    className="mt-8 px-6 py-2 rounded-xl bg-zinc-800 text-white text-sm font-bold hover:bg-zinc-700 transition-all"
                >
                    TRY AGAIN
                </button>
            </div>
        );

        return null;
    };

    const renderResults = () => {
        return <UnifiedFoundationResults status={status} result={result} />;
    };

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            {renderHeader()}
            {renderMainStatus()}
            {renderResults()}

            <ConfirmDialog
                open={confirmDeleteRun}
                title="Delete Analysis Run"
                message="Are you sure you want to delete this tuning run? This will remove all history and logs for this specific analysis."
                confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
                onConfirm={deleteRun}
                onCancel={() => setConfirmDeleteRun(false)}
            />

            <ApplySettingsDialog
                open={showApplyDialog}
                onClose={() => setShowApplyDialog(false)}
                onApply={handleApply}
                isApplying={isApplying}
                analysisResult={result}
            />
        </div>
    );
};
