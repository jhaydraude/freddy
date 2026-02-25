'use client';

import { TrendingUp, Activity, BarChart, Target, Zap } from 'lucide-react';

interface StatisticsCardsProps {
    stats: {
        hba1c?: number;
        mean?: number;
        stdDev?: number;
        cv?: number;
    };
    tir: {
        totalReadings?: number;
        low?: number;
        inRange?: number;
        high?: number;
    };
    units: string;
}

export default function StatisticsCards({ stats, tir, units }: StatisticsCardsProps) {
    const cards = [
        {
            label: 'Estimated HbA1c',
            value: stats.hba1c?.toFixed(1) + '%',
            icon: Target,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/20'
        },
        {
            label: 'Mean Glucose',
            value: stats.mean?.toFixed(units === 'mmol/L' ? 1 : 0),
            unit: units,
            icon: Activity,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/20'
        },
        {
            label: 'Standard Deviation',
            value: stats.stdDev?.toFixed(units === 'mmol/L' ? 1 : 0),
            unit: units,
            icon: BarChart,
            color: 'text-violet-400',
            bg: 'bg-violet-500/10',
            border: 'border-violet-500/20'
        },
        {
            label: 'Coeff. of Variation',
            value: stats.cv?.toFixed(1) + '%',
            icon: TrendingUp,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/20'
        },
        {
            label: 'Total Readings',
            value: tir.totalReadings?.toLocaleString(),
            icon: Zap,
            color: 'text-zinc-400',
            bg: 'bg-zinc-500/10',
            border: 'border-zinc-500/20'
        }
    ];

    const tirItems = [
        { label: 'Time Low', value: tir.low, color: 'bg-rose-500', text: 'text-rose-400' },
        { label: 'Time In Range', value: tir.inRange, color: 'bg-emerald-500', text: 'text-emerald-400' },
        { label: 'Time High', value: tir.high, color: 'bg-amber-500', text: 'text-amber-400' },
    ];

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-black text-zinc-100 uppercase tracking-tighter flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Glucose
            </h3>

            {/* TIR Progress Bar */}
            <div className="p-6 bg-zinc-900/40 rounded-2xl border border-zinc-800/50 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Time In Range</h3>
                    <div className="flex gap-4">
                        {tirItems.map(item => (
                            <div key={item.label} className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${item.color}`}></div>
                                <span className={`text-[10px] font-bold ${item.text} uppercase tracking-tight`}>
                                    {item.label}: {item.value?.toFixed(0)}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="h-6 w-full bg-zinc-950 rounded-full overflow-hidden flex shadow-inner">
                    <div style={{ width: `${tir.low}%` }} className="h-full bg-rose-500 transition-all duration-1000"></div>
                    <div style={{ width: `${tir.inRange}%` }} className="h-full bg-emerald-500 transition-all duration-1000"></div>
                    <div style={{ width: `${tir.high}%` }} className="h-full bg-amber-500 transition-all duration-1000"></div>
                </div>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {cards.map((card, i) => (
                    <div
                        key={i}
                        className={`p-4 rounded-2xl border ${card.bg} ${card.border} backdrop-blur-sm space-y-3 transition-all hover:scale-[1.02]`}
                    >
                        <div className="flex items-center gap-2">
                            <card.icon size={14} className={card.color} />
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{card.label}</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-zinc-100 tracking-tight">{card.value}</span>
                            {card.unit && <span className="text-[10px] text-zinc-600 font-bold uppercase">{card.unit}</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
