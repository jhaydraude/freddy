'use client';

import React, { useState, useEffect } from 'react';
import {
    GitBranch,
    Play,
    CheckCircle2,
    AlertCircle,
    ArrowLeft,
    TrendingUp,
    Scale,
    Timer,
    Save,
    Loader2,
    ChevronRight,
    MousePointer2,
    BarChart3,
    Trash2,
    X
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
    onBack: () => void;
    initialTuningId?: string;
}

export const BasalRateTuner: React.FC<Props> = ({ onBack, initialTuningId }) => {
    const [status, setStatus] = useState<'idle' | 'syncing' | 'running' | 'completed' | 'failed'>('idle');
    const [tuningId, setTuningId] = useState<string | null>(initialTuningId ?? null);
    const [result, setResult] = useState<any>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);
    const [analysisPeriod, setAnalysisPeriod] = useState(14);
    const [selection, setSelection] = useState({
        rates: Array(12).fill(true)
    });
    const [confirmDeleteRun, setConfirmDeleteRun] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // If opened from history, immediately load the result
    useEffect(() => {
        if (initialTuningId) {
            fetch(`/api/profile/tune-basal-rate/${initialTuningId}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data) {
                        setResult(data);
                        setStatus(data.status === 'completed' || data.status === 'applied' ? 'completed' : data.status);
                    }
                })
                .catch(console.error);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        let interval: any;
        if ((status === 'running' || status === 'syncing') && tuningId) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/profile/tune-basal-rate/${tuningId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.status === 'completed') {
                            setResult(data);
                            setStatus('completed');
                            clearInterval(interval);
                        } else if (data.status === 'failed') {
                            setStatus('failed');
                            clearInterval(interval);
                        } else if (data.status === 'syncing') {
                            setStatus('syncing');
                            setSyncProgress(data.sync_progress || 0);
                        } else if (data.status === 'running') {
                            setStatus('running');
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
            const res = await fetch('/api/profile/tune-basal-rate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    analysis_period_days: analysisPeriod,
                    window_hours: 2,
                    min_basal_events: 10
                })
            });

            if (res.ok) {
                const data = await res.json();
                setTuningId(data.tuning_id);
            } else {
                setStatus('failed');
            }
        } catch (err) {
            setStatus('failed');
        }
    };

    const applyResults = async () => {
        if (!tuningId) return;
        try {
            setIsApplying(true);
            const res = await fetch(`/api/profile/tune-basal-rate/${tuningId}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apply_to_profile: true,
                    apply_to_system: true,
                    selection
                })
            });

            if (res.ok) {
                alert('Basal settings applied successfully!');
                onBack();
            } else {
                alert('Failed to apply optimization.');
            }
        } catch (err) {
            alert('Failed to apply optimization.');
        } finally {
            setIsApplying(false);
        }
    };

    const deleteRun = async () => {
        if (!tuningId) return;
        setIsDeleting(true);
        try {
            await fetch(`/api/profile/tune-basal-rate/${tuningId}`, { method: 'DELETE' });
            onBack();
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            setIsDeleting(false);
            setConfirmDeleteRun(false);
        }
    };

    const getReliability = (confidence: [number, number], value: number, windowCount: number) => {
        if (windowCount < 2 || !confidence) return { label: 'Low', class: 'text-red-400 bg-red-400/10' };
        const range = confidence[1] - confidence[0];
        const percent = (range / value) * 100;
        if (percent < 15 && windowCount >= 5) return { label: 'High', class: 'text-emerald-400 bg-emerald-400/10' };
        if (percent < 35 && windowCount >= 3) return { label: 'Medium', class: 'text-amber-400 bg-amber-400/10' };
        return { label: 'Low', class: 'text-red-400 bg-red-400/10' };
    };

    const toggleBasalSelection = (index: number) => {
        const newSelection = [...selection.rates];
        newSelection[index] = !newSelection[index];
        setSelection({ rates: newSelection });
    };

    const renderStatus = () => {
        if (status === 'syncing') {
            return (
                <div className="flex flex-col items-center justify-center p-20 bg-zinc-900/50 rounded-3xl border border-zinc-800 animate-in fade-in zoom-in duration-500">
                    <div className="relative mb-8">
                        <div className="absolute inset-0 bg-blue-500/20 blur-2xl animate-pulse" />
                        <Loader2 className="w-16 h-16 text-blue-500 animate-spin relative z-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Syncing History...</h2>
                    <p className="text-zinc-500 text-center max-w-sm mb-6">
                        Fetching historical data from Nightscout. This is required for your requested {analysisPeriod} day analysis.
                    </p>
                    <div className="w-full max-w-xs bg-zinc-800 h-2 rounded-full overflow-hidden mb-2">
                        <div
                            className="bg-blue-500 h-full transition-all duration-500"
                            style={{ width: `${syncProgress}%` }}
                        />
                    </div>
                    <div className="text-blue-500 font-bold text-sm tracking-widest uppercase">
                        {syncProgress}% Complete
                    </div>
                </div>
            );
        }

        if (status === 'running') {
            return (
                <div className="flex flex-col items-center justify-center p-20 bg-zinc-900/50 rounded-3xl border border-zinc-800 animate-in fade-in zoom-in duration-500">
                    <div className="relative mb-8">
                        <div className="absolute inset-0 bg-blue-500/20 blur-2xl animate-pulse" />
                        <Loader2 className="w-16 h-16 text-blue-500 animate-spin relative z-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Analyzing Fasting Data...</h2>
                    <p className="text-zinc-500 text-center max-w-sm">
                        Freddy is analyzing your glucose drift during pure basal periods over the last {analysisPeriod} days.
                    </p>
                    <div className="w-full max-w-xs bg-zinc-800 h-1.5 rounded-full mt-8 overflow-hidden">
                        <div className="bg-blue-500 h-full animate-[progress_10s_ease-in-out_infinite]" style={{ width: '60%' }} />
                    </div>
                </div>
            );
        }

        if (status === 'completed' && result) {
            const chartData = result.optimized_values.rates.map((val: number, i: number) => ({
                time: `${i * 2}:00`,
                optimized: val,
                current: result.current_values.rates[i],
                drift: result.optimized_values.drift_per_block[i]
            }));

            return (
                <div className="space-y-8 animate-in slide-in-from-right-8 fade-in duration-700">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-white">Basal Optimization Results</h2>
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
                            <CheckCircle2 size={12} />
                            R² = {result.optimized_values.r_squared.toFixed(3)}
                        </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                <BarChart3 className="text-blue-500" size={24} />
                                Basal Rate Schedule
                            </h3>
                            <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-md bg-blue-500" /> Optimized</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-md bg-zinc-700" /> Current</div>
                            </div>
                        </div>

                        <div className="h-[300px] w-full mb-8">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                    <XAxis dataKey="time" stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} unit=" U/hr" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                                        formatter={(value: number) => [`${value.toFixed(2)} U/hr`]}
                                    />
                                    <Bar dataKey="current" fill="#3f3f46" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="optimized" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                            {result.optimized_values.rates.map((val: number, i: number) => {
                                const rel = getReliability(result.optimized_values.rates_confidence[i], val, result.optimized_values.windows_per_block[i]);
                                const windowCount = result.optimized_values.windows_per_block[i];
                                return (
                                    <div
                                        key={i}
                                        onClick={() => toggleBasalSelection(i)}
                                        className={`p-3 rounded-xl border transition-all cursor-pointer text-center ${selection.rates[i] ? 'bg-zinc-800 border-blue-500/30' : 'bg-zinc-900 border-zinc-800 opacity-40'}`}
                                    >
                                        <div className="text-[10px] font-bold text-zinc-500 uppercase mb-2">{i * 2}:00 - {i * 2 + 2}:00</div>
                                        <div className="text-lg font-black text-white mb-1">{val.toFixed(2)}</div>
                                        <div className="text-[9px] text-zinc-500 line-through mb-2">{result.current_values.rates[i].toFixed(2)}</div>

                                        <div className="flex items-center justify-between mt-2">
                                            <div className={`text-[8px] font-bold uppercase py-0.5 px-1.5 rounded ${rel.class}`}>
                                                {rel.label}
                                            </div>
                                            <div className="text-[9px] text-zinc-500">{windowCount}w</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-4">
                        <button
                            onClick={applyResults}
                            disabled={isApplying}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-white text-zinc-950 font-bold rounded-2xl hover:bg-blue-400 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 text-sm"
                        >
                            {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                        </button>
                        <button
                            onClick={onBack}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-zinc-900 text-zinc-400 font-bold rounded-2xl border border-zinc-800 hover:text-white hover:border-zinc-700 transition-all duration-200 active:scale-[0.98] text-sm"
                        >
                            <X className="w-4 h-4" />
                            Discard
                        </button>
                        <button
                            onClick={() => setConfirmDeleteRun(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-zinc-900 text-red-400 font-bold rounded-2xl border border-red-500/20 hover:bg-red-500/10 hover:border-red-500/40 transition-all duration-200 active:scale-[0.98] text-sm"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 md:p-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="max-w-xl">
                    <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mb-8 border border-blue-500/20">
                        <GitBranch size={32} />
                    </div>

                    <h2 className="text-3xl font-black text-white mb-2">Basal Rate Optimization</h2>
                    <p className="text-zinc-400 text-lg mb-8 leading-relaxed">
                        Refine your foundation. Freddy looks at pure fasting periods and SMB activity to suggest perfectly flat basal rates across the day.
                    </p>

                    <div className="mb-10 space-y-6">
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Analysis Period (Days)</label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="number"
                                    min="7"
                                    max="180"
                                    value={analysisPeriod}
                                    onChange={(e) => setAnalysisPeriod(parseInt(e.target.value) || 0)}
                                    className="w-24 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xl font-black text-white focus:outline-none focus:border-blue-500 transition-colors"
                                />
                                <div className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Days</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex items-start gap-3">
                                <CheckCircle2 className="text-emerald-500 mt-1" size={18} />
                                <div className="text-sm">
                                    <span className="font-bold text-white block">SMB Included</span>
                                    <span className="text-zinc-500">Super Micro Boluses are correctly treated as basal logic.</span>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <CheckCircle2 className="text-emerald-500 mt-1" size={18} />
                                <div className="text-sm">
                                    <span className="font-bold text-white block">Constraints & Limits</span>
                                    <span className="text-zinc-500">Limits jumps between periods to ensure smooth transitions.</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={startTuning}
                        className="group w-full flex items-center justify-center gap-3 px-8 py-5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-black rounded-2xl hover:from-blue-400 hover:to-indigo-500 transition-all duration-300 shadow-xl shadow-blue-500/10"
                    >
                        <Play className="w-5 h-5 fill-current" />
                        Run Basal Analyzer ({analysisPeriod} Days)
                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <p className="mt-6 text-xs text-zinc-600 flex items-center gap-2 justify-center">
                        <MousePointer2 size={12} />
                        Requires at least 10 pure fasting events of 2 hours or more.
                    </p>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-4xl mx-auto">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-zinc-500 hover:text-white mb-8 transition-colors group"
            >
                <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                Back to Dashboard
            </button>

            {renderStatus()}

            {status === 'failed' && (
                <div className="mt-8 p-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-400">
                    <AlertCircle size={24} />
                    <div>
                        <div className="font-bold">Analysis Failed</div>
                        <div className="text-sm opacity-80">Insufficient fasting data or service error. You need 2-hour stretches without carbs or real corrections. Make sure that you properly setup the SMB threshold.</div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirmDeleteRun}
                title="Delete This Run"
                message="This will permanently delete this optimization run. This cannot be undone."
                confirmLabel={isDeleting ? 'Deleting…' : 'Delete'}
                onConfirm={deleteRun}
                onCancel={() => setConfirmDeleteRun(false)}
            />
        </div>
    );
};
