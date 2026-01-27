'use client';

import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

interface DateRangeSelectorProps {
    onRangeChange: (start: Date, end: Date) => void;
}

export default function DateRangeSelector({ onRangeChange }: DateRangeSelectorProps) {
    const [activePreset, setActivePreset] = useState('7d');
    const [showCustom, setShowCustom] = useState(false);

    // Default dates for custom range
    const [customStart, setCustomStart] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
    const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));

    const presets = [
        { label: 'Today', id: 'today', getRange: () => [startOfDay(new Date()), endOfDay(new Date())] },
        { label: 'Yesterday', id: 'yesterday', getRange: () => [startOfDay(subDays(new Date(), 1)), endOfDay(subDays(new Date(), 1))] },
        { label: 'Last 7 Days', id: '7d', getRange: () => [startOfDay(subDays(new Date(), 6)), endOfDay(new Date())] },
        { label: 'Last 30 Days', id: '30d', getRange: () => [startOfDay(subDays(new Date(), 29)), endOfDay(new Date())] },
        { label: 'Last 90 Days', id: '90d', getRange: () => [startOfDay(subDays(new Date(), 89)), endOfDay(new Date())] },
    ];

    const handlePresetClick = (preset: any) => {
        setActivePreset(preset.id);
        setShowCustom(false);
        const [start, end] = preset.getRange();
        onRangeChange(start, end);
    };

    const handleCustomApply = () => {
        setActivePreset('custom');
        onRangeChange(startOfDay(new Date(customStart)), endOfDay(new Date(customEnd)));
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                    <button
                        key={preset.id}
                        onClick={() => handlePresetClick(preset)}
                        className={`px-4 py-2 rounded-xl text-xs font-medium transition-all border ${activePreset === preset.id
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                            }`}
                    >
                        {preset.label}
                    </button>
                ))}
                <button
                    onClick={() => setShowCustom(!showCustom)}
                    className={`px-4 py-2 rounded-xl text-xs font-medium transition-all border flex items-center gap-2 ${activePreset === 'custom' || showCustom
                            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                >
                    <Calendar size={14} />
                    Custom Range
                    <ChevronDown size={14} className={`transition-transform ${showCustom ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {showCustom && (
                <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl flex flex-wrap items-end gap-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Start Date</label>
                        <input
                            type="date"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">End Date</label>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <button
                        onClick={handleCustomApply}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20 h-[38px]"
                    >
                        Apply Range
                    </button>
                </div>
            )}
        </div>
    );
}
