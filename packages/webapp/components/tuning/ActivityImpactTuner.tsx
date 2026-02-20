'use client';

import React, { useState, useEffect } from 'react';
import {
    Activity,
    Play,
    CheckCircle2,
    AlertCircle,
    ArrowLeft,
    ChevronRight,
    Save,
    Loader2,
    Footprints,
    Flame,
    BarChart2,
    Heart,
    Brain,
    TrendingDown,
    TrendingUp,
    Info,
    Trash2,
    X
} from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell
} from 'recharts';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
    onBack: () => void;
    initialTuningId?: string;
}

interface Coefficient {
    key: string;
    label: string;
    unit: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    direction: 'lowers' | 'raises'; // lowers glucose or raises glucose
}

const COEFFICIENTS: Coefficient[] = [
    {
        key: 'steps_per_minute',
        label: 'Step Pace',
        unit: 'mg/dL per step/min',
        description: 'How much each step/min above baseline lowers glucose.',
        icon: <Footprints size={16} />,
        color: '#10b981',
        direction: 'lowers'
    },
    {
        key: 'calories',
        label: 'Calories',
        unit: 'mg/dL per kcal',
        description: 'How much each calorie burned lowers glucose.',
        icon: <Flame size={16} />,
        color: '#f97316',
        direction: 'lowers'
    },
    {
        key: 'stairs',
        label: 'Stairs / Floors',
        unit: 'mg/dL per floor',
        description: 'Anaerobic spike from climbing stairs.',
        icon: <BarChart2 size={16} />,
        color: '#a78bfa',
        direction: 'raises'
    },
    {
        key: 'hr_spike',
        label: 'HR Spike',
        unit: 'mg/dL per HRR unit',
        description: 'Glucose spike from anaerobic heart rate elevation (>70% HRR).',
        icon: <Heart size={16} />,
        color: '#f43f5e',
        direction: 'raises'
    },
    {
        key: 'stress_hr',
        label: 'Stress HR',
        unit: 'mg/dL per 10% HRR',
        description: 'Cortisol-driven glucose rise from elevated HR with no steps.',
        icon: <Brain size={16} />,
        color: '#fbbf24',
        direction: 'raises'
    }
];

export const ActivityImpactTuner: React.FC<Props> = ({ onBack, initialTuningId }) => {
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
    const [tuningId, setTuningId] = useState<string | null>(initialTuningId ?? null);
    const [result, setResult] = useState<any>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [analysisPeriod, setAnalysisPeriod] = useState(21);
    const [confirmDeleteRun, setConfirmDeleteRun] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // If opened from history, immediately load the result
    useEffect(() => {
        if (initialTuningId) {
            fetch(`/api/profile/tune-activity-impact/${initialTuningId}`)
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
        if (status === 'running' && tuningId) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/profile/tune-activity-impact/${tuningId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.status === 'completed') {
                            setResult(data);
                            setStatus('completed');
                            clearInterval(interval);
                        } else if (data.status === 'failed') {
                            setStatus('failed');
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
            const res = await fetch('/api/profile/tune-activity-impact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    analysis_period_days: analysisPeriod,
                    window_hours: 2
                })
            });
            if (res.ok) {
                const data = await res.json();
                setTuningId(data.tuning_id);
            } else {
                setStatus('failed');
            }
        } catch {
            setStatus('failed');
        }
    };

    const applyResults = async () => {
        if (!tuningId) return;
        try {
            setIsApplying(true);
            const res = await fetch(`/api/profile/tune-activity-impact/${tuningId}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                alert('Activity coefficients applied successfully!');
                onBack();
            } else {
                alert('Failed to apply optimization.');
            }
        } catch {
            alert('Failed to apply optimization.');
        } finally {
            setIsApplying(false);
        }
    };

    const deleteRun = async () => {
        if (!tuningId) return;
        setIsDeleting(true);
        try {
            await fetch(`/api/profile/tune-activity-impact/${tuningId}`, { method: 'DELETE' });
            onBack();
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            setIsDeleting(false);
            setConfirmDeleteRun(false);
        }
    };

    const getReliability = (confidence: [number, number], value: number) => {
        if (!confidence || value === 0) return { label: 'Unknown', class: 'text-zinc-400 bg-zinc-400/10' };
        const range = Math.abs(confidence[1] - confidence[0]);
        const percent = (range / Math.abs(value)) * 100;
        if (percent < 20) return { label: 'High', class: 'text-emerald-400 bg-emerald-400/10' };
        if (percent < 45) return { label: 'Medium', class: 'text-amber-400 bg-amber-400/10' };
        return { label: 'Low', class: 'text-red-400 bg-red-400/10' };
    };

    const formatCoeffValue = (key: string, value: number) => {
        return value.toFixed(2);
    };

    const getDeltaLabel = (current: number, optimized: number) => {
        const delta = optimized - current;
        if (Math.abs(delta) < 0.01) return null;
        return delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
    };

    const renderStatus = () => {
        if (status === 'running') {
            return (
                <div className="flex flex-col items-center justify-center p-20 bg-zinc-900/50 rounded-3xl border border-zinc-800 animate-in fade-in zoom-in duration-500">
                    <div className="relative mb-8">
                        <div className="absolute inset-0 bg-emerald-500/20 blur-2xl animate-pulse" />
                        <Loader2 className="w-16 h-16 text-emerald-500 animate-spin relative z-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Calibrating Activity Model...</h2>
                    <p className="text-zinc-500 text-center max-w-sm">
                        Freddy is analyzing your glucose response to exercise over the last {analysisPeriod} days. This usually takes 30–60 seconds.
                    </p>
                    <div className="w-full max-w-xs bg-zinc-800 h-1.5 rounded-full mt-8 overflow-hidden">
                        <div className="bg-emerald-500 h-full animate-[progress_12s_ease-in-out_infinite]" style={{ width: '55%' }} />
                    </div>
                </div>
            );
        }

        if (status === 'completed' && result) {
            const ov = result.optimized_values;
            const cv = result.current_values;

            // Build bar chart data
            const barData = COEFFICIENTS.map(c => ({
                name: c.label,
                current: Math.abs(cv[c.key]),
                optimized: Math.abs(ov[c.key]),
                direction: c.direction,
                color: c.color
            }));

            // Build radar data (normalized 0-100 scale for visibility)
            const radarData = COEFFICIENTS.map(c => ({
                subject: c.label,
                current: Math.abs(cv[c.key]) * 10,
                optimized: Math.abs(ov[c.key]) * 10
            }));

            return (
                <div className="space-y-8 animate-in slide-in-from-right-8 fade-in duration-700">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-white">Optimization Results</h2>
                        <div className="flex items-center gap-4">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                                {ov.windows_analyzed} windows · {analysisPeriod} days
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${ov.r_squared > 0.6 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                                R² = {ov.r_squared.toFixed(3)}
                            </div>
                        </div>
                    </div>

                    {/* Quality Banner */}
                    <div className={`p-4 rounded-2xl border flex items-start gap-4 ${ov.r_squared > 0.65 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                        <Info size={18} className={ov.r_squared > 0.65 ? 'text-emerald-400 mt-0.5 shrink-0' : 'text-amber-400 mt-0.5 shrink-0'} />
                        <div className="text-sm">
                            <span className={`font-bold ${ov.r_squared > 0.65 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {ov.r_squared > 0.65 ? 'Good fit — activity model explains your glucose well.' : 'Moderate fit — more activity data may improve accuracy.'}
                            </span>
                            <span className="text-zinc-500 ml-1">
                                RMSE: {ov.rmse.toFixed(1)} mg/dL · MAE: {ov.mae.toFixed(1)} mg/dL
                            </span>
                        </div>
                    </div>

                    {/* Coefficient Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {COEFFICIENTS.map(coeff => {
                            const confKey = `${coeff.key}_confidence` as any;
                            const confidence = ov[confKey] as [number, number];
                            const reliability = getReliability(confidence, ov[coeff.key]);
                            const delta = getDeltaLabel(cv[coeff.key], ov[coeff.key]);
                            const isLowering = coeff.direction === 'lowers';

                            return (
                                <div
                                    key={coeff.key}
                                    className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2.5">
                                            <div
                                                className="w-8 h-8 rounded-xl flex items-center justify-center"
                                                style={{ backgroundColor: `${coeff.color}15`, color: coeff.color }}
                                            >
                                                {coeff.icon}
                                            </div>
                                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{coeff.label}</span>
                                        </div>
                                        <div className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold uppercase ${reliability.class}`}>
                                            {reliability.label}
                                        </div>
                                    </div>

                                    <div className="flex items-end justify-between mt-2">
                                        <div>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-2xl font-black text-white">
                                                    {isLowering ? '' : '+'}{formatCoeffValue(coeff.key, ov[coeff.key])}
                                                </span>
                                                <span className="text-zinc-500 text-xs font-medium leading-tight">{coeff.unit}</span>
                                            </div>
                                            <div className="text-xs text-zinc-600 mt-1">
                                                Was: <span className="font-bold text-zinc-500">
                                                    {isLowering ? '' : '+'}{formatCoeffValue(coeff.key, cv[coeff.key])}
                                                </span>
                                            </div>
                                        </div>
                                        {delta && (
                                            <div className={`flex items-center gap-1 text-sm font-black ${isLowering ? (parseFloat(delta) < 0 ? 'text-emerald-400' : 'text-red-400') : (parseFloat(delta) > 0 ? 'text-emerald-400' : 'text-red-400')}`}>
                                                {parseFloat(delta) > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                                {delta}
                                            </div>
                                        )}
                                    </div>

                                    {confidence && (
                                        <div className="mt-3 pt-3 border-t border-zinc-800">
                                            <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">95% CI</div>
                                            <div className="text-xs font-mono text-zinc-500">
                                                [{confidence[0].toFixed(2)}, {confidence[1].toFixed(2)}]
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Comparison Chart */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-white">Coefficient Comparison</h3>
                            <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-zinc-600" />
                                    Current
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                    Optimized
                                </div>
                            </div>
                        </div>
                        <div className="h-[220px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                    <XAxis dataKey="name" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                                    <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px', fontSize: '12px' }}
                                        formatter={(val: any) => [val.toFixed(3), '']}
                                    />
                                    <Bar dataKey="current" fill="#3f3f46" radius={[4, 4, 0, 0]} maxBarSize={32} />
                                    <Bar dataKey="optimized" radius={[4, 4, 0, 0]} maxBarSize={32}>
                                        {barData.map((entry, index) => (
                                            <Cell key={index} fill={COEFFICIENTS[index].color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-3 pt-4">
                        <button
                            onClick={applyResults}
                            disabled={isApplying}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-white text-zinc-950 font-bold rounded-2xl hover:bg-emerald-400 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 text-sm"
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

        // Idle state
        return (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 md:p-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="max-w-xl">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-8 border border-emerald-500/20">
                        <Activity size={32} />
                    </div>

                    <h2 className="text-3xl font-black text-white mb-2">Activity Impact Optimization</h2>
                    <p className="text-zinc-400 text-lg mb-8 leading-relaxed">
                        Calibrate how exercise, heart rate, and movement affect your glucose — using your real data instead of population averages.
                    </p>

                    <div className="mb-10 space-y-6">
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Analysis Period (Days)</label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="number"
                                    min="7"
                                    max="90"
                                    value={analysisPeriod}
                                    onChange={(e) => setAnalysisPeriod(parseInt(e.target.value) || 21)}
                                    className="w-24 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xl font-black text-white focus:outline-none focus:border-emerald-500 transition-colors"
                                />
                                <div className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Days</div>
                            </div>
                            <p className="text-xs text-zinc-600">Longer periods provide more workout diversity and better signal.</p>
                        </div>

                        {/* What gets tuned */}
                        <div className="grid grid-cols-1 gap-3">
                            {COEFFICIENTS.map(c => (
                                <div key={c.key} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/40 border border-zinc-800">
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                        style={{ backgroundColor: `${c.color}20`, color: c.color }}>
                                        {c.icon}
                                    </div>
                                    <div className="min-w-0">
                                        <span className="font-bold text-white text-sm">{c.label}</span>
                                        <span className="text-zinc-500 text-xs ml-2">{c.description}</span>
                                    </div>
                                    <div className={`ml-auto shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase ${c.direction === 'lowers' ? 'text-emerald-500' : 'text-rose-400'}`}>
                                        {c.direction === 'lowers' ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                                        {c.direction === 'lowers' ? 'Lowers BG' : 'Raises BG'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={startTuning}
                        className="group w-full flex items-center justify-center gap-3 px-8 py-5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black rounded-2xl hover:from-emerald-400 hover:to-teal-500 transition-all duration-300 shadow-xl shadow-emerald-500/10 active:scale-[0.98]"
                    >
                        <Play className="w-5 h-5 fill-current" />
                        Run Activity Optimizer ({analysisPeriod} Days)
                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
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
                        <div className="font-bold">Optimization Failed</div>
                        <div className="text-sm opacity-80">There was an error communicating with the predictive model service. Please try again.</div>
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
