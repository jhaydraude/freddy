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
    FolderKanban,
    Wind,
    Utensils
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

export const MealActivityTuner: React.FC<Props> = ({ onBack, initialTuningId }) => {
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
    const [tuningId, setTuningId] = useState<string | null>(initialTuningId ?? null);
    const [result, setResult] = useState<any>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [analysisPeriod, setAnalysisPeriod] = useState(30);
    const [foundationRuns, setFoundationRuns] = useState<any[]>([]);
    const [selectedBaseline, setSelectedBaseline] = useState<string>('profile');

    const [confirmDeleteRun, setConfirmDeleteRun] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        // Fetch existing foundation runs for baseline selection
        fetch('/api/profile/tune-unified-foundation')
            .then(r => r.ok ? r.json() : { history: [] })
            .then(data => {
                const list = Array.isArray(data) ? data : (data.history || []);
                const completed = list.filter((d: any) => d.status === 'completed' || d.status === 'applied');
                setFoundationRuns(completed);
            })
            .catch(err => {
                console.error('Failed to fetch foundation runs:', err);
                setFoundationRuns([]);
            });
    }, []);

    useEffect(() => {
        if (initialTuningId) {
            fetch(`/api/profile/tune-meal-activity/${initialTuningId}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data) {
                        setResult(data);
                        setTuningId(data.tuning_id);
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
                    const res = await fetch(`/api/profile/tune-meal-activity/${tuningId}`);
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
            const res = await fetch('/api/profile/tune-meal-activity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    analysis_period_days: analysisPeriod,
                    min_windows_required: 20,
                    baseline_tuning_id: selectedBaseline === 'profile' ? undefined : selectedBaseline
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
            await fetch(`/api/profile/tune-meal-activity/${tuningId}`, { method: 'DELETE' });
            onBack();
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            setIsDeleting(false);
            setConfirmDeleteRun(false);
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
                        <Utensils className="text-orange-400" size={18} />
                        <h1 className="text-2xl font-bold text-white tracking-tight">Meal & Activity Tuner</h1>
                    </div>
                    <p className="text-zinc-500 text-sm max-w-lg">
                        Fine-tune Carb Ratios and Activity Coefficients using a Foundation baseline.
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
                        <div className="flex flex-col px-3 border-r border-zinc-800">
                            <span className="text-[9px] text-zinc-500 font-bold uppercase">Baseline</span>
                            <select
                                value={selectedBaseline}
                                onChange={(e) => setSelectedBaseline(e.target.value)}
                                className="bg-transparent text-xs text-white font-bold outline-none appearance-none cursor-pointer"
                            >
                                <option value="profile">ACTIVE PROFILE</option>
                                {foundationRuns.map(run => (
                                    <option key={run.tuning_id} value={run.tuning_id}>
                                        FOUNDATION ({new Date(run.created_at).toLocaleDateString()})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <select
                            value={analysisPeriod}
                            onChange={(e) => setAnalysisPeriod(Number(e.target.value))}
                            className="bg-transparent text-sm text-zinc-300 font-bold px-3 py-1 outline-none appearance-none cursor-pointer"
                        >
                            <option value={14}>14 DAYS</option>
                            <option value={30}>30 DAYS</option>
                            <option value={60}>60 DAYS</option>
                            <option value={90}>90 DAYS</option>
                        </select>
                        <button
                            onClick={startTuning}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold shadow-lg shadow-orange-500/20 hover:bg-orange-400 transition-all active:scale-95"
                        >
                            <Play size={16} fill="currentColor" />
                            START ANALYSIS
                        </button>
                    </div>
                ) : status === 'completed' ? (
                    <button
                        className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 transition-all active:scale-95"
                    >
                        <Save size={18} />
                        APPLY PARAMETERS
                    </button>
                ) : (
                    <div className="px-6 py-2.5 rounded-xl bg-zinc-800/50 border border-zinc-700 text-zinc-400 text-sm font-bold flex items-center gap-3">
                        <Loader2 className="animate-spin text-zinc-500" size={16} />
                        TUNING MEAL MATH...
                    </div>
                )}
            </div>
        </div>
    );

    const renderMainStatus = () => {
        if (status === 'idle') return (
            <div className="py-20 flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-3xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-6">
                    <Wind className="text-orange-400" size={36} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Refine Meal & Activity Logic</h3>
                <p className="text-zinc-500 max-w-sm">
                    Level 2 tuning locks your basal rates and focuses on improving your Carb Ratio and Activity impact models.
                </p>
            </div>
        );

        if (status === 'running') return (
            <div className="py-20 flex flex-col items-center text-center">
                <div className="relative mb-8">
                    <div className="w-24 h-24 rounded-full border-4 border-zinc-800 border-t-orange-500 animate-spin" />
                    <Utensils className="absolute inset-0 m-auto text-orange-500 animate-pulse" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Optimizing Meal Parameters</h3>
                <p className="text-zinc-500 text-sm max-w-md">
                    Isolating meal events and correlating physical activity with glucose deviations...
                </p>
                <div className="mt-8 w-full max-w-lg bg-zinc-900 rounded-2xl border border-zinc-800 p-4 max-h-40 overflow-y-auto font-mono text-[10px] text-zinc-500 text-left space-y-1">
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
                {/* Comparison Card */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-8 text-orange-500/5 rotate-12">
                            <Activity size={120} />
                        </div>
                        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Activity Coefficients</h3>

                        <div className="space-y-6 relative">
                            {Object.entries(opt.activity_coefficients).map(([key, val]: [string, any]) => (
                                <div key={key}>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-zinc-500 font-bold uppercase">{key}</span>
                                        <span className="text-xs font-mono text-zinc-400">{val.toFixed(4)}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${val < 0 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                                                style={{ width: `${Math.min(100, Math.abs(val) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <div className="pt-6 border-t border-zinc-800">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-zinc-500 font-bold uppercase">Model Fit (R²)</span>
                                    <span className="text-orange-400 text-sm font-bold font-mono">{(opt.r_squared * 100).toFixed(1)}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-orange-500 rounded-full"
                                        style={{ width: `${Math.max(0, opt.r_squared * 100)}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-zinc-600 mt-2 italic">
                                    Based on {opt.windows_analyzed} meal/activity windows.
                                </p>
                            </div>

                            {result.analysis_summary?.window_distribution && (
                                <div className="pt-6 border-t border-zinc-800">
                                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Window Distribution (Time of Day)</h4>
                                    <div className="h-24 w-full">
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
                                                <Bar dataKey="count" fill="#f97316" radius={[2, 2, 0, 0]} />
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

                {/* Schedules */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Carb Ratio (g/U)</h3>
                            <div className="flex items-center gap-4 text-[10px] uppercase font-bold tracking-wider">
                                <div className="flex items-center gap-1.5 text-zinc-600"><div className="w-2 h-2 rounded-full border border-zinc-600" /> Current</div>
                                <div className="flex items-center gap-1.5 text-orange-400"><div className="w-2 h-2 rounded-full bg-orange-400" /> Optimized</div>
                            </div>
                        </div>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={opt.cr.map((val: number, i: number) => ({
                                    time: `${i * 4}:00`,
                                    optimized: val,
                                    current: cur.cr[i]
                                }))}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                                        itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                                    />
                                    <Bar dataKey="optimized" fill="#fb923c" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="current" fill="transparent" stroke="#52525b" strokeWidth={1} strokeDasharray="4 4" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Refined ISF ({cur.units || 'mg/dL'}/U)</h3>
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
                        <p className="text-[9px] text-zinc-500 mt-4 italic">
                            ISF optimization here is constrained to +/- 30% of baseline to prevent over-correction between CR and ISF.
                        </p>
                    </div>

                    {opt.basal && (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-6">Refined Basal Rates (U/hr)</h3>
                            <div className="h-48 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={opt.basal.map((val: number, i: number) => ({
                                        time: `${i * 2}:00`,
                                        val: val,
                                        cur: cur.basal[i]
                                    }))}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                                        />
                                        <Line type="monotone" dataKey="val" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} />
                                        <Line type="monotone" dataKey="cur" stroke="#52525b" strokeWidth={1} dot={false} strokeDasharray="4 4" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-[9px] text-zinc-500 mt-4 italic">
                                Basal optimization in Level 2 is constrained to +/- 20% from your Foundation baseline.
                            </p>
                        </div>
                    )}
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
                message="Are you sure you want to delete this tuning run?"
                confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
                onConfirm={deleteRun}
                onCancel={() => setConfirmDeleteRun(false)}
            />
        </div>
    );
};
