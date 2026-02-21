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
    const [selection, setSelection] = useState({
        dia: true,
        peak: true,
        isf: [true, true, true, true, true, true],
        rates: new Array(12).fill(true)
    });
    const [confirmDeleteRun, setConfirmDeleteRun] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

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

    const handleApply = async () => {
        // Implementation for later - multi-apply
        setIsApplying(true);
        setTimeout(() => setIsApplying(false), 2000);
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
                        <h1 className="text-2xl font-bold text-white tracking-tight">Foundation Tuner (DIA & Basal)</h1>
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
                        onClick={handleApply}
                        disabled={isApplying}
                        className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 disabled:opacity-50 transition-all active:scale-95"
                    >
                        {isApplying ? (
                            <Loader2 className="animate-spin" size={18} />
                        ) : (
                            <Save size={18} />
                        )}
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
                <h3 className="text-xl font-bold text-white mb-2">Ready for Foundation Tuning</h3>
                <p className="text-zinc-500 max-w-sm">
                    This analysis looks for the optimal combination of basal rates, ISF, and DIA to explain your glucose trends.
                </p>
            </div>
        );

        if (status === 'running') return (
            <div className="py-20 flex flex-col items-center">
                <div className="relative mb-8">
                    <div className="w-24 h-24 rounded-full border-4 border-zinc-800 border-t-indigo-500 animate-spin" />
                    <Activity className="absolute inset-0 m-auto text-indigo-500 animate-pulse" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Analyzing Foundation Parameters</h3>
                <p className="text-zinc-500 text-sm max-w-md text-center">
                    Generating synthetic basal windows and solving the weighted L-BFGS-B objective function...
                </p>

                <div className="mt-8 w-full max-w-lg bg-zinc-900 rounded-2xl border border-zinc-800 p-4 max-h-40 overflow-y-auto font-mono text-[10px] text-zinc-500 space-y-1">
                    {result?.logs?.map((log: string, i: number) => (
                        <div key={i}>{log}</div>
                    ))}
                    {!result?.logs?.length && <div>Initializing logs...</div>}
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
        if (status !== 'completed' || !result?.optimized_values) return null;

        const opt = result.optimized_values;
        const cur = result.current_values;

        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 py-8 animate-in fade-in duration-500">
                {/* Global Insulin Parameters */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-8 text-indigo-500/5 rotate-12">
                            <Zap size={120} />
                        </div>
                        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Insulin Action (Foundation)</h3>

                        <div className="space-y-8 relative">
                            <div>
                                <div className="text-xs text-zinc-500 font-bold uppercase mb-2 flex items-center justify-between">
                                    DIA (Duration)
                                    <span className="text-indigo-400">95% CI: {opt.dia_confidence[0].toFixed(1)}-{opt.dia_confidence[1].toFixed(1)}h</span>
                                </div>
                                <div className="flex items-baseline gap-3">
                                    <div className="text-4xl font-bold text-white font-mono">{opt.dia.toFixed(2)}h</div>
                                    <div className={`text-sm font-bold ${opt.dia > cur.dia ? 'text-blue-400' : 'text-orange-400'}`}>
                                        {opt.dia > cur.dia ? '↑' : '↓'} {Math.abs(opt.dia - cur.dia).toFixed(2)}h
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="text-xs text-zinc-500 font-bold uppercase mb-2 flex items-center justify-between">
                                    Peak Time
                                    <span className="text-indigo-400">95% CI: {opt.peak_confidence[0].toFixed(0)}-{opt.peak_confidence[1].toFixed(0)}m</span>
                                </div>
                                <div className="flex items-baseline gap-3">
                                    <div className="text-4xl font-bold text-white font-mono">{opt.peak.toFixed(0)}m</div>
                                    <div className={`text-sm font-bold ${opt.peak > cur.peak ? 'text-emerald-400' : 'text-orange-400'}`}>
                                        {opt.peak > cur.peak ? '↑' : '↓'} {Math.abs(opt.peak - cur.peak).toFixed(0)}m
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-zinc-800">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-zinc-500 font-bold uppercase">Model Fit (R²)</span>
                                    <span className="text-emerald-400 text-sm font-bold font-mono">{(opt.r_squared * 100).toFixed(1)}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-emerald-500 rounded-full"
                                        style={{ width: `${Math.max(0, opt.r_squared * 100)}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-zinc-600 mt-2 italic">
                                    R² score of {opt.r_squared.toFixed(3)} based on {opt.windows_analyzed} isolated windows.
                                </p>
                            </div>

                            {result.analysis_summary?.window_distribution && (
                                <div className="pt-6 border-t border-zinc-800">
                                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Window Distribution (Time of Day)</h4>
                                    <div className="h-24 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={result.analysis_summary.window_distribution.map((count, i) => ({
                                                time: `${i * 2}h`,
                                                count
                                            }))}>
                                                <XAxis dataKey="time" hide />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', fontSize: '10px' }}
                                                    labelStyle={{ color: '#71717a' }}
                                                />
                                                <Bar dataKey="count" fill="#4f46e5" radius={[2, 2, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <p className="text-[9px] text-zinc-500 mt-2">
                                        Optimization weighted toward times with higher window counts.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Basal Rate & ISF Profiles */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Basal Schedule (U/hr)</h3>
                            <div className="flex items-center gap-4 text-[10px] uppercase font-bold tracking-wider">
                                <div className="flex items-center gap-1.5 text-zinc-600"><div className="w-2 h-2 rounded-full border border-zinc-600" /> Current</div>
                                <div className="flex items-center gap-1.5 text-indigo-400"><div className="w-2 h-2 rounded-full bg-indigo-400" /> Optimized</div>
                            </div>
                        </div>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={opt.basal.map((val: number, i: number) => ({
                                    time: `${i * 2}:00`,
                                    optimized: val,
                                    current: cur.basal[i]
                                }))}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                                        itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                                    />
                                    <Bar dataKey="optimized" fill="#818cf8" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="current" fill="transparent" stroke="#52525b" strokeWidth={1} strokeDasharray="4 4" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">ISF Sensitivity Schedule ({cur.units || 'mg/dL'}/U)</h3>
                        <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={opt.isf.map((val: number, i: number) => ({
                                    time: `${i * 4}:00`,
                                    val: val,
                                    cur: cur.isf[i]
                                }))}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} reversed />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                                    />
                                    <Line type="monotone" dataKey="val" stroke="#818cf8" strokeWidth={3} dot={{ fill: '#818cf8', r: 4 }} />
                                    <Line type="monotone" dataKey="cur" stroke="#52525b" strokeWidth={1} dot={false} strokeDasharray="4 4" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        );
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
        </div>
    );
};
