'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import DateRangeSelector from '@/components/DateRangeSelector';
import PercentileChart from '@/components/PercentileChart';
import StatisticsCards from '@/components/StatisticsCards';
import TDDStats from '@/components/TDDStats';
import ActivityStats from '@/components/ActivityStats';
import CarbStats from '@/components/CarbStats';
import { RefreshCw, Download, FileText } from 'lucide-react';
import { startOfDay, subDays, endOfDay } from 'date-fns';

export default function StatisticsPage() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [statsData, setStatsData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [userPrefs, setUserPrefs] = useState<any>(null);
    const [range, setRange] = useState({
        start: startOfDay(subDays(new Date(), 6)),
        end: endOfDay(new Date())
    });

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const res = await fetch(`/api/statistics?startDate=${range.start.toISOString()}&endDate=${range.end.toISOString()}&timeZone=${encodeURIComponent(timeZone)}`);
            if (res.ok) {
                const data = await res.json();
                setStatsData(data);
            }
        } catch (error) {
            console.error('Failed to fetch statistics:', error);
        } finally {
            setLoading(false);
        }
    }, [range]);

    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => setUserPrefs(data.user_preferences))
            .catch(err => console.error('Failed to load settings:', err));
    }, []);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    return (
        <div className="min-h-screen bg-black text-zinc-100 pb-20">
            <Header title="Statistics" />

            <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
                {/* Controls Section */}
                <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <DateRangeSelector
                        onRangeChange={(start, end) => setRange({ start, end })}
                    />

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fetchStats()}
                            disabled={loading}
                            className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-emerald-400 transition-all hover:border-emerald-500/30"
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </section>

                {/* Main Stats Content */}
                {statsData && !loading ? (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Summary Section */}
                        <StatisticsCards
                            stats={statsData.statistics}
                            tir={statsData.timeInRange}
                            units={userPrefs?.units || 'mg/dL'}
                        />

                        {/* Chart Section */}
                        <PercentileChart
                            data={statsData.percentiles}
                            units={userPrefs?.units}
                            targetLow={userPrefs?.low_threshold}
                            targetHigh={userPrefs?.high_threshold}
                        />

                        {/* TDD Section */}
                        <TDDStats
                            tdd={statsData.tdd}
                            units={userPrefs?.units || 'U'}
                        />

                        {/* Activity Section */}
                        <ActivityStats
                            activity={statsData.activity}
                        />

                        {/* Carbs Section */}
                        <CarbStats
                            carbs={statsData.carbs}
                        />

                        {/* Insights / Footer */}
                        <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800/50 backdrop-blur-sm flex items-center justify-between">
                            <div className="space-y-1">
                                <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                                    <FileText size={16} className="text-indigo-400" /> Statistical Insights
                                </h4>
                                <p className="text-xs text-zinc-500">
                                    Data analyzed from {new Date(statsData.meta.startDate).toLocaleDateString()} to {new Date(statsData.meta.endDate).toLocaleDateString()}.
                                    Total of {statsData.timeInRange.totalReadings.toLocaleString()} readings processed.
                                </p>
                            </div>
                            <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all border border-zinc-700/50 opacity-50 cursor-not-allowed">
                                <Download size={14} /> Export Report
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="h-[600px] w-full flex flex-col items-center justify-center space-y-4">
                        <RefreshCw className="animate-spin text-emerald-500" size={32} />
                        <p className="text-zinc-500 animate-pulse font-medium">Analyzing glucose data...</p>
                    </div>
                )}
            </main>
        </div>
    );
}
