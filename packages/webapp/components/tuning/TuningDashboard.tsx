'use client';

import React, { useState, useEffect } from 'react';
import {
    Zap,
    Flame,
    GitBranch,
    ChevronRight,
    History,
    Timer,
    CheckCircle2
} from 'lucide-react';
import { TuningCategoryCard } from './TuningCategoryCard';
import { DeprecationBanner } from './DeprecationBanner';
import { InsulinResponseTuner } from './InsulinResponseTuner';
import { CarbAbsorptionTuner } from './CarbAbsorptionTuner';

interface TuningRun {
    tuning_id: string;
    category: string;
    status: string;
    created_at: string;
    optimized_values?: any;
}

export const TuningDashboard: React.FC = () => {
    const [view, setView] = useState<'categories' | 'insulin-response' | 'carb-absorption'>('categories');
    const [history, setHistory] = useState<TuningRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [mismatchDetected, setMismatchDetected] = useState(false);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/profile/tune-insulin-response');
            if (res.ok) {
                const data = await res.json();
                setHistory(data.history || []);
            }
        } catch (err) {
            console.error('Failed to fetch tuning history:', err);
        } finally {
            setLoading(false);
        }
    };

    const categories: ({
        id: string;
        title: string;
        description: string;
        icon: React.ReactElement;
        status: 'optimized' | 'needs_update' | 'locked';
        colorClass: string;
        improvement?: string;
        lastOptimized?: string;
    })[] = [
            {
                id: 'insulin-response',
                title: 'Insulin Response',
                description: 'Optimize DIA, Peak Time, and ISF based on your actual glucose response to insulin.',
                icon: <Zap className="text-amber-400" />,
                status: (history.length > 0 ? 'optimized' : 'needs_update') as 'optimized' | 'needs_update',
                colorClass: 'bg-amber-500',
                improvement: history.length > 0 ? '12% precision increase' : undefined,
                lastOptimized: history.length > 0 ? new Date(history[0].created_at).toLocaleDateString() : undefined
            },
            {
                id: 'carb-absorption',
                title: 'Carb Absorption',
                description: 'Tune your Carb Ratios (ICR) and absorption profiles for different times of day.',
                icon: <Flame className="text-orange-500" />,
                status: (history.some(h => h.category === 'carb-absorption') ? 'optimized' : 'needs_update') as 'optimized' | 'needs_update',
                colorClass: 'bg-orange-500'
            },
            {
                id: 'basal-tuning',
                title: 'Basal Rates',
                description: 'Analyze fasting periods to find the perfect basal rates for a flat glucose profile.',
                icon: <GitBranch className="text-blue-500" />,
                status: 'locked' as const,
                colorClass: 'bg-blue-500'
            },
            {
                id: 'activity-impact',
                title: 'Activity Impact',
                description: 'Calibrate how exercise and steps affect your insulin sensitivity in real-time.',
                icon: <Timer className="text-emerald-500" />,
                status: 'locked' as const,
                colorClass: 'bg-emerald-500'
            }
        ];

    const renderCategories = () => (
        <>
            {/* Hero Section */}
            <div className="relative overflow-hidden rounded-3xl bg-zinc-900 border border-zinc-800 p-8 md:p-12 mb-12">
                <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-emerald-500/10 to-transparent blur-3xl pointer-events-none" />

                <div className="relative z-10 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-6">
                        <CheckCircle2 size={12} />
                        AI-Powered Optimization
                    </div>

                    <h1 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">
                        Perfecting your <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">Diabetes Profile</span>
                    </h1>

                    <p className="text-zinc-400 text-lg leading-relaxed mb-8">
                        Freddy analyzes thousands of data points from your continuous glucose monitor and insulin pump to find the optimal settings for your body.
                    </p>

                    <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-3 bg-zinc-800/50 backdrop-blur px-4 py-3 rounded-2xl border border-zinc-700">
                            <span className="text-2xl font-bold text-white">1.2k</span>
                            <span className="text-xs text-zinc-500 uppercase font-bold tracking-tighter leading-none">Windows<br />Analyzed</span>
                        </div>
                        <div className="flex items-center gap-3 bg-zinc-800/50 backdrop-blur px-4 py-3 rounded-2xl border border-zinc-700">
                            <span className="text-2xl font-bold text-emerald-400">94%</span>
                            <span className="text-xs text-zinc-500 uppercase font-bold tracking-tighter leading-none">Model<br />Accuracy</span>
                        </div>
                    </div>
                </div>
            </div>

            {mismatchDetected && (
                <DeprecationBanner
                    type="mismatch"
                    category="Insulin Response"
                    onFix={() => console.log('Syncing...')}
                />
            )}

            {/* Categories Grid */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        Tuning Categories
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">4 TOTAL</span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {categories.map((cat) => (
                        <TuningCategoryCard
                            key={cat.id}
                            {...cat}
                            onClick={() => {
                                if (cat.id === 'insulin-response') {
                                    setView('insulin-response');
                                } else if (cat.id === 'carb-absorption') {
                                    setView('carb-absorption');
                                }
                            }}
                        />
                    ))}
                </div>
            </section>

            {/* Recent History */}
            {history.length > 0 && (
                <section className="pt-8">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <History className="text-zinc-500" size={24} />
                            Optimization History
                        </h2>
                    </div>

                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-800">
                        {history.slice(0, 5).map((run) => (
                            <div key={run.tuning_id} className="p-4 hover:bg-zinc-800/30 transition-colors flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                                        <Zap size={18} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white">{run.category} Optimization</div>
                                        <div className="text-xs text-zinc-500">{new Date(run.created_at).toLocaleString()}</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="hidden sm:block text-right">
                                        <div className="text-xs font-bold text-zinc-400">R² = {run.optimized_values?.r_squared?.toFixed(3) || '0.000'}</div>
                                        <div className="text-[10px] text-zinc-600 uppercase tracking-tighter">Model Fit</div>
                                    </div>
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${run.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                        }`}>
                                        {run.status}
                                    </div>
                                    <ChevronRight className="text-zinc-700 group-hover:text-white transition-colors" size={20} />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {view === 'categories' ? renderCategories() :
                view === 'insulin-response' ? (
                    <InsulinResponseTuner onBack={() => {
                        setView('categories');
                        fetchHistory();
                    }} />
                ) : (
                    <CarbAbsorptionTuner onBack={() => {
                        setView('categories');
                        fetchHistory();
                    }} />
                )}
        </div>
    );
};
