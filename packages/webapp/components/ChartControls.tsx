'use client';

import React from 'react';
import { RefreshCw, ArrowLeft, ArrowRight, Plus, Minus } from 'lucide-react';

const TIME_RANGES = [
    { label: '3h', value: 3 * 60 },
    { label: '6h', value: 6 * 60 },
    { label: '12h', value: 12 * 60 },
    { label: '24h', value: 24 * 60 },
];

interface ChartControlsProps {
    windowSize: number;
    viewOffsetMinutes: number;
    setWindowSize: (size: number | ((prev: number) => number)) => void;
    setViewOffsetMinutes: (offset: number | ((prev: number) => number)) => void;
    fetchData: (force?: boolean) => void;
    loading: boolean;
}

export default function ChartControls({
    windowSize,
    viewOffsetMinutes,
    setWindowSize,
    setViewOffsetMinutes,
    fetchData,
    loading
}: ChartControlsProps) {
    const [isRecalculating, setIsRecalculating] = React.useState(false);

    const handleRecalculate = async () => {
        setIsRecalculating(true);
        try {
            // First trigger the background rebuild for the current window
            const end = new Date(Date.now() - (viewOffsetMinutes * 60 * 1000));
            const start = new Date(end.getTime() - (windowSize * 60 * 1000));

            await fetch('/api/cache/recalculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startTime: start.toISOString(),
                    endTime: end.toISOString()
                })
            });
            // Then fetch the fresh data (bypassing cache to ensure latest if rebuild hasn't finished, 
            // though the API call above waits for it to finish)
            await fetchData(true);
        } catch (error) {
            console.error('Failed to recalculate:', error);
        } finally {
            setIsRecalculating(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Historical Analysis</h4>
                <button
                    onClick={handleRecalculate}
                    disabled={loading || isRecalculating}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all shadow-sm backdrop-blur-sm"
                    title="Recalculate all statuses for current window"
                >
                    <RefreshCw size={14} className={(loading || isRecalculating) ? "animate-spin" : ""} />
                    Recalculate
                </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                    <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800 shrink-0">
                        {TIME_RANGES.map((range) => (
                            <button
                                key={range.label}
                                onClick={() => {
                                    setWindowSize(range.value);
                                    setViewOffsetMinutes(0);
                                }}
                                className={`px-3 py-1 rounded-md text-sm font-medium transition-all whitespace-nowrap ${windowSize === range.value && viewOffsetMinutes === 0
                                    ? 'bg-zinc-800 text-white shadow-sm'
                                    : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                {range.label}
                            </button>
                        ))}
                    </div>

                    {/* Pan & Zoom Controls */}
                    <div className="flex items-center gap-0.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800 shrink-0">
                        <button
                            onClick={() => setViewOffsetMinutes((prev: number) => prev + 60)}
                            className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                            title="Pan Back 1h"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <button
                            onClick={() => setViewOffsetMinutes(0)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${viewOffsetMinutes === 0 ? 'bg-emerald-500/10 text-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Live
                        </button>
                        <button
                            onClick={() => setViewOffsetMinutes((prev: number) => Math.max(0, prev - 60))}
                            disabled={viewOffsetMinutes === 0}
                            className="p-1.5 text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
                            title="Pan Forward 1h"
                        >
                            <ArrowRight size={16} />
                        </button>
                        <div className="w-[1px] h-4 bg-zinc-800 mx-1" />
                        <button
                            onClick={() => setWindowSize((prev: number) => Math.max(60, prev - 60))}
                            className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                            title="Zoom In"
                        >
                            <Plus size={16} />
                        </button>
                        <button
                            onClick={() => setWindowSize((prev: number) => Math.min(1440, prev + 60))}
                            className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                            title="Zoom Out"
                        >
                            <Minus size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
