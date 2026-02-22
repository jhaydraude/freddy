'use client';

import React, { useState, useEffect } from 'react';
import {
    ChevronRight,
    History,
    Filter,
    Trash2,
    Dna,
    Utensils,
    Activity
} from 'lucide-react';
import { TuningCategoryCard } from './TuningCategoryCard';
import { DeprecationBanner } from './DeprecationBanner';
import { UnifiedFoundationTuner } from './UnifiedFoundationTuner';
import { MealActivityTuner } from './MealActivityTuner';
import { ConfirmDialog } from './ConfirmDialog';

type ViewType = 'categories' | 'unified-foundation' | 'meal' | 'activity' | 'combined';
type CategoryId = 'unified-foundation' | 'meal' | 'activity' | 'combined';

interface TuningRun {
    tuning_id: string;
    category: CategoryId;
    categoryLabel: string;
    status: string;
    created_at: string;
    optimized_values?: Record<string, unknown>;
}

const CATEGORY_META: Record<CategoryId, { label: string; icon: React.ReactElement; color: string; view: ViewType; filterColor: string }> = {
    'unified-foundation': { label: 'Stage 1: Insulin', icon: <Dna size={16} className="text-indigo-400" />, color: 'text-indigo-400', view: 'unified-foundation', filterColor: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400' },
    'meal': { label: 'Stage 2: Meal', icon: <Utensils size={16} className="text-orange-400" />, color: 'text-orange-400', view: 'meal', filterColor: 'border-orange-500/40 bg-orange-500/10 text-orange-400' },
    'activity': { label: 'Stage 3: Activity', icon: <Activity size={16} className="text-emerald-400" />, color: 'text-emerald-400', view: 'activity', filterColor: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
    'combined': { label: 'Combined Tuning', icon: <ChevronRight size={16} className="text-blue-400" />, color: 'text-blue-400', view: 'combined', filterColor: 'border-blue-500/40 bg-blue-500/10 text-blue-400' },
};

/** Returns a human-friendly relative time string, e.g. "3 hours ago", "Yesterday", "Feb 18" */
function formatRelativeDate(isoStr: string): { relative: string; absolute: string } {
    const date = new Date(isoStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    let relative: string;
    if (diffMins < 2) relative = 'Just now';
    else if (diffMins < 60) relative = `${diffMins}m ago`;
    else if (diffHours < 24) relative = `${diffHours}h ago`;
    else if (diffDays === 1) relative = 'Yesterday';
    else if (diffDays < 7) relative = `${diffDays} days ago`;
    else relative = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const absolute = date.toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    return { relative, absolute };
}

export const TuningDashboard: React.FC = () => {
    const [view, setView] = useState<ViewType>('categories');
    const [history, setHistory] = useState<TuningRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [mismatchDetected] = useState(false);
    const [selectedTuningId, setSelectedTuningId] = useState<string | undefined>(undefined);
    const [historyFilter, setHistoryFilter] = useState<CategoryId | 'all'>('all');
    const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; target: CategoryId | 'all' }>({ open: false, target: 'all' });
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const endpoints: Array<{ url: string; category: CategoryId; label: string }> = [
                { url: '/api/profile/tune-unified-foundation', category: 'unified-foundation', label: 'Stage 1: Insulin' },
                { url: '/api/profile/tune-meal', category: 'meal', label: 'Stage 2: Meal' },
                { url: '/api/profile/tune-activity', category: 'activity', label: 'Stage 3: Activity' },
                { url: '/api/profile/tune-combined', category: 'combined', label: 'Combined Tuning' },
            ];

            const results = await Promise.allSettled(
                endpoints.map(e => fetch(e.url).then(r => r.ok ? r.json() : { history: [] }))
            );

            const combined: TuningRun[] = [];
            results.forEach((result, i) => {
                if (result.status === 'fulfilled') {
                    const runs = (result.value.history || []) as Record<string, unknown>[];
                    runs.forEach(run => {
                        combined.push({
                            tuning_id: run.tuning_id as string,
                            category: endpoints[i].category,
                            categoryLabel: endpoints[i].label,
                            status: run.status as string,
                            created_at: run.created_at as string,
                            optimized_values: run.optimized_values as Record<string, unknown> | undefined,
                        });
                    });
                }
            });

            // Sort descending by date (newest first)
            combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setHistory(combined);
        } catch (err) {
            console.error('Failed to fetch tuning history:', err);
        } finally {
            setLoading(false);
        }
    };

    const CATEGORY_ENDPOINTS: Record<CategoryId, string> = {
        'unified-foundation': '/api/profile/tune-unified-foundation',
        'meal': '/api/profile/tune-meal',
        'activity': '/api/profile/tune-activity',
        'combined': '/api/profile/tune-combined',
    };

    const handleDeleteAll = async () => {
        setIsDeleting(true);
        try {
            const target = confirmDelete.target;
            if (target === 'all') {
                await Promise.allSettled(
                    Object.values(CATEGORY_ENDPOINTS).map(url => fetch(url, { method: 'DELETE' }))
                );
            } else {
                await fetch(CATEGORY_ENDPOINTS[target], { method: 'DELETE' });
            }
            await fetchHistory();
            if (target !== 'all') setHistoryFilter('all');
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            setIsDeleting(false);
            setConfirmDelete({ open: false, target: 'all' });
        }
    };

    const handleBack = () => {
        setView('categories');
        setSelectedTuningId(undefined);
        fetchHistory();
    };

    const handleHistoryClick = (run: TuningRun) => {
        setSelectedTuningId(run.tuning_id);
        setView(run.category);
    };

    // Per-category last-optimized dates derived from combined history
    const lastOptimizedOf = (cat: CategoryId) => {
        const run = history.find(h => h.category === cat && (h.status === 'completed' || h.status === 'applied'));
        return run ? new Date(run.created_at).toLocaleDateString() : undefined;
    };

    const filteredHistory = historyFilter === 'all'
        ? history
        : history.filter(r => r.category === historyFilter);

    const categories: ({
        id: CategoryId;
        title: string;
        description: string;
        icon: React.ReactElement;
        status: 'optimized' | 'needs_update' | 'locked';
        colorClass: string;
        parameters: string[];
        lastOptimized?: string;
    })[] = [
            {
                id: 'unified-foundation',
                title: 'Stage 1: Insulin Tuner',
                description: 'Advanced joint optimization of DIA, Basal, and ISF for biological consistency. This establishes your baseline settings.',
                icon: <Dna className="text-indigo-400" />,
                status: lastOptimizedOf('unified-foundation') ? 'optimized' : 'needs_update',
                colorClass: 'bg-indigo-500',
                parameters: ['DIA', 'Basal Rate ×12', 'ISF ×6'],
                lastOptimized: lastOptimizedOf('unified-foundation'),
            },
            {
                id: 'meal',
                title: 'Stage 2: Meal Tuner',
                description: 'Refine your Carb Ratio (ICR) using a fixed insulin baseline. This strictly isolates post-prandial math.',
                icon: <Utensils className="text-orange-400" />,
                status: lastOptimizedOf('meal') ? 'optimized' : 'needs_update',
                colorClass: 'bg-orange-500',
                parameters: ['CR ×6', 'Refined ISF'],
                lastOptimized: lastOptimizedOf('meal'),
            },
            {
                id: 'activity',
                title: 'Stage 3: Activity Tuner',
                description: 'Refine your Activity Coefficients (Steps & HR). Takes the active profile, an insulin tuner run, or a meal tuner run as the baseline.',
                icon: <Activity className="text-emerald-400" />,
                status: lastOptimizedOf('activity') ? 'optimized' : 'needs_update',
                colorClass: 'bg-emerald-500',
                parameters: ['Activity Coeffs ×2', 'Refined ISF'],
                lastOptimized: lastOptimizedOf('activity'),
            },
            {
                id: 'combined',
                title: 'Combined Tuner',
                description: 'Run Stage 1 -> Stage 2 -> Stage 3 sequentially, fully automated.',
                icon: <ChevronRight className="text-blue-400" />,
                status: lastOptimizedOf('combined') ? 'optimized' : 'needs_update',
                colorClass: 'bg-blue-500',
                parameters: ['All Parameters'],
                lastOptimized: lastOptimizedOf('combined'),
            },
        ];

    const renderCategories = () => (
        <>
            {mismatchDetected && (
                <DeprecationBanner
                    type="mismatch"
                    category="Tuning"
                    onFix={() => console.log('Syncing...')}
                />
            )}

            {/* Categories Grid */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        Tuning Workflow
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">STAGED ISOLATION</span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {categories.map((cat) => (
                        <TuningCategoryCard
                            key={cat.id}
                            {...cat}
                            onClick={() => setView(cat.id)}
                        />
                    ))}
                </div>
            </section>

            {/* Optimization History */}
            <section className="pt-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                        <History className="text-zinc-500" size={22} />
                        Optimization History
                        {history.length > 0 && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
                                {filteredHistory.length}{historyFilter !== 'all' ? ` of ${history.length}` : ''}
                            </span>
                        )}
                    </h2>
                    <div className="flex items-center gap-3">
                        {history.length > 0 && (
                            <button
                                onClick={() => setConfirmDelete({ open: true, target: historyFilter })}
                                disabled={isDeleting}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/15 hover:border-red-500/40 transition-all disabled:opacity-40"
                            >
                                <Trash2 size={13} />
                                {historyFilter === 'all' ? 'Delete All' : `Delete ${CATEGORY_META[historyFilter]?.label}`}
                            </button>
                        )}
                        {loading && (
                            <span className="text-xs text-zinc-600 animate-pulse uppercase tracking-widest font-bold">Loading...</span>
                        )}
                    </div>
                </div>

                {/* Filter chips */}
                {history.length > 0 && (
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <div className="flex items-center gap-1.5 text-zinc-500 mr-1">
                            <Filter size={13} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Filter</span>
                        </div>
                        <button
                            onClick={() => setHistoryFilter('all')}
                            className={`px-3 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider transition-all ${historyFilter === 'all'
                                ? 'bg-white/10 border-white/20 text-white'
                                : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
                                }`}
                        >
                            All
                        </button>
                        {(Object.entries(CATEGORY_META) as [CategoryId, typeof CATEGORY_META[CategoryId]][]).map(([id, meta]) => {
                            const count = history.filter(h => h.category === id).length;
                            if (count === 0) return null;
                            return (
                                <button
                                    key={id}
                                    onClick={() => setHistoryFilter(historyFilter === id ? 'all' : id)}
                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider transition-all ${historyFilter === id
                                        ? meta.filterColor
                                        : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'
                                        }`}
                                >
                                    {meta.icon}
                                    {meta.label}
                                    <span className="ml-0.5 text-[10px] opacity-60">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {filteredHistory.length > 0 ? (
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-800">
                        {filteredHistory.map((run) => {
                            const meta = CATEGORY_META[run.category];
                            const rSquared = (run.optimized_values as any)?.r_squared;
                            const { relative, absolute } = formatRelativeDate(run.created_at);
                            return (
                                <div
                                    key={run.tuning_id}
                                    onClick={() => handleHistoryClick(run)}
                                    className="p-4 hover:bg-zinc-800/50 transition-colors flex items-center justify-between group cursor-pointer"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                                            {meta?.icon}
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-white">{meta?.label ?? run.categoryLabel} Optimization</div>
                                            <div className="text-xs text-zinc-500" title={absolute}>{relative}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        {rSquared != null && (
                                            <div className="hidden sm:block text-right">
                                                <div className="text-xs font-bold text-zinc-400">R² = {(rSquared as number).toFixed(3)}</div>
                                                <div className="text-[10px] text-zinc-600 uppercase tracking-tighter">Model Fit</div>
                                            </div>
                                        )}
                                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${run.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500'
                                            : run.status === 'applied' ? 'bg-blue-500/10 text-blue-400'
                                                : 'bg-red-500/10 text-red-500'
                                            }`}>
                                            {run.status}
                                        </div>
                                        <ChevronRight className="text-zinc-700 group-hover:text-white group-hover:translate-x-0.5 transition-all" size={18} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : !loading ? (
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-10 text-center text-zinc-600 text-sm">
                        {historyFilter === 'all'
                            ? 'No optimization runs yet. Start with Insulin Tuning.'
                            : `No ${CATEGORY_META[historyFilter]?.label} runs yet.`
                        }
                    </div>
                ) : null}
            </section>
        </>
    );

    return (
        <>
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {view === 'categories' ? renderCategories() :
                    view === 'meal' ? (
                        <MealActivityTuner onBack={handleBack} initialTuningId={selectedTuningId} mode="meal" />
                    ) : view === 'activity' ? (
                        <MealActivityTuner onBack={handleBack} initialTuningId={selectedTuningId} mode="activity" />
                    ) : view === 'combined' ? (
                        <MealActivityTuner onBack={handleBack} initialTuningId={selectedTuningId} mode="combined" />
                    ) : (
                        <UnifiedFoundationTuner onBack={handleBack} initialTuningId={selectedTuningId} />
                    )}
            </div>

            <ConfirmDialog
                open={confirmDelete.open}
                title="Delete Optimization History"
                message={
                    confirmDelete.target === 'all'
                        ? `This will permanently delete all ${history.length} optimization runs. This cannot be undone.`
                        : `This will permanently delete all ${CATEGORY_META[confirmDelete.target as CategoryId]?.label ?? ''} optimization runs. This cannot be undone.`
                }
                confirmLabel={isDeleting ? 'Deleting…' : 'Delete'}
                onConfirm={handleDeleteAll}
                onCancel={() => setConfirmDelete({ open: false, target: 'all' })}
            />
        </>
    );
};
