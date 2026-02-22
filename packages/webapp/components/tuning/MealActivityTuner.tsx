'use client';

import React, { useState, useEffect } from 'react';
import { denormalizeGlucose } from '@/lib/logic/unit-conversion';
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
    XAxis,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar
} from 'recharts';
import { ConfirmDialog } from './ConfirmDialog';
import { ApplySettingsDialog, ApplyOptions } from './ApplySettingsDialog';
import ProfileComparisonPanel from '../profile/ProfileComparisonPanel';

interface Props {
    onBack: () => void;
    initialTuningId?: string;
    mode: 'meal' | 'activity' | 'combined';
}

export const MealActivityTuner: React.FC<Props> = ({ onBack, initialTuningId, mode }) => {
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
    const [tuningId, setTuningId] = useState<string | null>(initialTuningId ?? null);
    const [result, setResult] = useState<any>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [analysisPeriod, setAnalysisPeriod] = useState(30);
    const [foundationRuns, setFoundationRuns] = useState<any[]>([]);
    const [selectedBaseline, setSelectedBaseline] = useState<string>('profile');
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
        const fetchBaselines = async () => {
            try {
                const runs: any[] = [];

                // Fetch Insulin runs
                const fRes = await fetch('/api/profile/tune-unified-foundation');
                if (fRes.ok) {
                    const data = await fRes.json();
                    const list = Array.isArray(data) ? data : (data.history || []);
                    const completed = list.filter((d: any) => d.status === 'completed' || d.status === 'applied');
                    runs.push(...completed.map((r: any) => ({ ...r, source_type: 'insulin' })));
                }

                // If activity or combined, additionally fetch meal runs
                if (mode === 'activity' || mode === 'combined') {
                    const mRes = await fetch('/api/profile/tune-meal');
                    if (mRes.ok) {
                        const data = await mRes.json();
                        const list = Array.isArray(data) ? data : (data.history || []);
                        const completed = list.filter((d: any) => d.status === 'completed' || d.status === 'applied');
                        runs.push(...completed.map((r: any) => ({ ...r, source_type: 'meal' })));
                    }
                }

                runs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setFoundationRuns(runs);
            } catch (err) {
                console.error('Failed to fetch baseline runs:', err);
                setFoundationRuns([]);
            }
        };

        fetchBaselines();
    }, [mode]);

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
            let apiUrl = '/api/profile/tune-meal';
            if (mode === 'activity') apiUrl = '/api/profile/tune-activity';
            if (mode === 'combined') apiUrl = '/api/profile/tune-combined';

            const res = await fetch(apiUrl, {
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
            let apiUrl = '/api/profile/tune-meal';
            if (mode === 'activity') apiUrl = '/api/profile/tune-activity';
            if (mode === 'combined') apiUrl = '/api/profile/tune-combined';
            await fetch(`${apiUrl}/${tuningId}`, { method: 'DELETE' });
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
                        {mode === 'activity' ? <Activity className="text-emerald-400" size={18} /> : mode === 'combined' ? <ChevronRight className="text-blue-400" size={18} /> : <Utensils className="text-orange-400" size={18} />}
                        <h1 className="text-2xl font-bold text-white tracking-tight">
                            {mode === 'meal' ? 'Meal Tuner' : mode === 'activity' ? 'Activity Tuner' : 'Combined Tuner'}
                        </h1>
                    </div>
                    <p className="text-zinc-500 text-sm max-w-lg">
                        {mode === 'meal'
                            ? 'Fine-tune Carb Ratios using a fixed baseline.'
                            : mode === 'activity'
                                ? 'Fine-tune Activity Coefficients using a fixed baseline.'
                                : 'Run all three tuning stages sequentially.'}
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
                                <option value="profile" className="bg-zinc-900 text-white">ACTIVE PROFILE</option>
                                {foundationRuns.map(run => (
                                    <option key={run.tuning_id} value={run.tuning_id} className="bg-zinc-900 text-white">
                                        {run.source_type === 'meal' ? 'MEAL TUNER' : 'INSULIN TUNER'} ({new Date(run.created_at).toLocaleDateString()})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <select
                            value={analysisPeriod}
                            onChange={(e) => setAnalysisPeriod(Number(e.target.value))}
                            className="bg-transparent text-sm text-zinc-300 font-bold px-3 py-1 outline-none appearance-none cursor-pointer"
                        >
                            <option value={14} className="bg-zinc-900 text-white">14 DAYS</option>
                            <option value={30} className="bg-zinc-900 text-white">30 DAYS</option>
                            <option value={60} className="bg-zinc-900 text-white">60 DAYS</option>
                            <option value={90} className="bg-zinc-900 text-white">90 DAYS</option>
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
                <h3 className="text-xl font-bold text-white mb-2">
                    {mode === 'meal' ? 'Refine Meal Logic' : mode === 'activity' ? 'Refine Activity Logic' : 'Refine Meal & Activity Logic'}
                </h3>
                <p className="text-zinc-500 max-w-sm">
                    {mode === 'meal'
                        ? 'Stage 2 isolates your Carb Ratio using fixed baseline metrics.'
                        : mode === 'activity'
                            ? 'Stage 3 isolates your Activity impact using a fixed baseline.'
                            : 'This tunes your entire set of Meal and Activity variables using a sequential pipeline.'}
                </p>
            </div>
        );

        if (status === 'running') return (
            <div className="py-10 flex flex-col items-center w-full max-w-4xl mx-auto">
                <div className="relative mb-6">
                    <div className="w-20 h-20 rounded-full border-4 border-zinc-800 border-t-orange-500 animate-spin" />
                    {mode === 'activity' ? (
                        <Activity className="absolute inset-0 m-auto text-orange-500 animate-pulse" size={28} />
                    ) : mode === 'combined' ? (
                        <ChevronRight className="absolute inset-0 m-auto text-orange-500 animate-pulse" size={28} />
                    ) : (
                        <Utensils className="absolute inset-0 m-auto text-orange-500 animate-pulse" size={28} />
                    )}
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">
                    {mode === 'meal' ? 'Optimizing Meal Parameters' : mode === 'activity' ? 'Optimizing Activity Parameters' : 'Running Combined Optimization'}
                </h3>
                <p className="text-zinc-500 text-sm max-w-lg text-center mb-8">
                    {mode === 'meal'
                        ? 'Isolating meal events and correlating carbohydrate intake with glucose deviations...'
                        : mode === 'activity'
                            ? 'Isolating physical activity events and measuring their impact on glucose...'
                            : 'Running a full-stack optimization of meal and activity impacts on glucose...'}
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
                                    {mode === 'meal' ? (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                <span>Meals &gt; 20g carbs</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                <span>Stable pre-meal glucose</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                <span>No stacked interventions</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                <span>High sensor confidence</span>
                                            </div>
                                        </>
                                    ) : mode === 'activity' ? (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                <span>High Heart Rate / Step events</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                <span>Valid sensor coverage</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                <span>Isolated from strong meal drivers</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                <span>Valid Meals & Activities</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                                <span>Full sensor coverage</span>
                                            </div>
                                        </>
                                    )}
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
                                            <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="text-xs text-orange-400 font-bold text-center mt-3 bg-orange-500/10 py-2 rounded-lg border border-orange-500/20">
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
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                            </span>
                            <span className="text-[10px] font-sans font-bold text-orange-400 uppercase tracking-widest">Running</span>
                        </div>
                    </div>
                    <div className="h-48 overflow-y-auto pr-2 space-y-1.5 custom-scrollbar">
                        {result?.logs?.map((log: string, i: number) => {
                            let colorClass = 'text-zinc-400';
                            if (log.includes('WARN')) colorClass = 'text-amber-400';
                            else if (log.includes('ERR')) colorClass = 'text-red-400';
                            else if (log.includes('INFO') || log.includes('Step')) colorClass = 'text-orange-200';
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
        if (status !== 'completed' || !result?.optimized_values) return null;

        const opt = result.optimized_values;
        const cur = result.current_values;

        const primaryProfile = {
            name: "Active Parameters",
            description: "Your current profile settings",
            dia: cur.dia,
            peak: cur.peak,
            units: cur.units || 'mg/dL',
            icr: cur.cr?.map((v: number, i: number) => ({ time: `${(i * 4).toString().padStart(2, '0')}:00`, value: v })) || [],
            isf: cur.isf?.map((v: number, i: number) => ({ time: `${(i * 4).toString().padStart(2, '0')}:00`, value: v })) || [],
            basal: cur.basal?.map((v: number, i: number) => ({ time: `${(i * 2).toString().padStart(2, '0')}:00`, value: v })) || [],
            activityCoefficients: {
                steps: cur.activity_coefficients?.steps,
                heartRate: cur.activity_coefficients?.heartRate
            }
        };

        const secondaryProfile = {
            name: "Tuned Recommendation",
            description: "Optimized meal & activity parameters",
            dia: cur.dia, // Not tuned in level 2
            peak: cur.peak, // Not tuned in level 2
            units: cur.units || 'mg/dL',
            icr: opt.cr?.map((v: number, i: number) => ({ time: `${(i * 4).toString().padStart(2, '0')}:00`, value: v })) || [],
            isf: opt.isf?.map((v: number, i: number) => ({ time: `${(i * 4).toString().padStart(2, '0')}:00`, value: v })) || [],
            basal: opt.basal?.map((v: number, i: number) => ({ time: `${(i * 2).toString().padStart(2, '0')}:00`, value: v })) || [],
            activityCoefficients: {
                steps: opt.activity_coefficients?.steps,
                heartRate: opt.activity_coefficients?.heartRate
            }
        };

        return (
            <div className="space-y-8 py-8 animate-in fade-in duration-500">
                {/* Optimization Metadata Tile */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 text-orange-500/5 rotate-12">
                        {mode === 'activity' ? <Activity size={120} /> : mode === 'combined' ? <ChevronRight size={120} /> : <Utensils size={120} />}
                    </div>
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Optimization Run Details</h3>
                        <div className="px-3 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full text-[10px] font-bold uppercase tracking-widest">
                            {mode === 'meal' ? 'Meal Tuner' : mode === 'activity' ? 'Activity Tuner' : 'Combined Tuner'}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
                        <div className="space-y-4 col-span-1">
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
                            <div className="pt-2 border-t border-zinc-800">
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
                                    Based on {opt.windows_analyzed} isolated windows.
                                </p>
                            </div>
                        </div>

                        {result.analysis_summary?.window_distribution && (
                            <div className="col-span-1 md:col-span-2">
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
                                            <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-4 border-t border-zinc-800">
                    <ProfileComparisonPanel
                        primaryProfile={primaryProfile}
                        secondaryProfile={secondaryProfile}
                        primaryLabel="Active"
                        secondaryLabel="Tuned"
                        isEditing={false}
                    />
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
