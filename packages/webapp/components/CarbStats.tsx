'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { Utensils, CalendarDays } from 'lucide-react';

interface CarbStatsProps {
    carbs: {
        stats: {
            overall: { median: number; p95: number };
            weekdays: { median: number; p95: number };
            weekends: { median: number; p95: number };
            totalCarbs: number;
            avgDailyCarbs: number;
        };
        dailySeries: Array<{
            date: string;
            carbs: number;
        }>;
    };
}

export default function CarbStats({ carbs }: CarbStatsProps) {
    if (!carbs) return null;

    const cards = [
        { label: 'Avg Daily Carbs', value: carbs.stats.avgDailyCarbs.toLocaleString(), icon: Utensils },
        { label: 'Overall Median', value: carbs.stats.overall.median.toFixed(1), icon: Utensils },
        { label: 'Overall P95', value: carbs.stats.overall.p95.toFixed(1), icon: Utensils },
        { label: 'Weekday Median', value: carbs.stats.weekdays.median.toFixed(1), icon: CalendarDays },
        { label: 'Weekend Median', value: carbs.stats.weekends.median.toFixed(1), icon: CalendarDays }
    ];

    const formattedDaily = carbs.dailySeries.map(d => ({
        ...d,
        label: format(new Date(d.date), 'MMM d')
    }));

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
            <h3 className="text-xl font-black text-zinc-100 uppercase tracking-tighter flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Carbohydrates
            </h3>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {cards.map((card, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 space-y-2 backdrop-blur-sm transition-transform hover:scale-[1.02]">
                        <div className="flex items-center gap-1.5 opacity-60">
                            <card.icon size={12} className="text-zinc-400" />
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{card.label}</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-amber-400 tracking-tight">{card.value}</span>
                            <span className="text-[10px] text-zinc-600 font-bold uppercase">g</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Daily Chart */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-sm space-y-6">
                <div>
                    <h4 className="text-sm font-bold text-zinc-300">Daily Carb Breakdown</h4>
                    <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">Total carbs consumed per day</p>
                </div>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={formattedDaily} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                            <XAxis
                                dataKey="label"
                                stroke="#52525b"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#52525b"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => `${val}g`}
                            />
                            <Tooltip
                                offset={60}
                                contentStyle={{
                                    backgroundColor: '#18181b',
                                    border: '1px solid #27272a',
                                    borderRadius: '12px',
                                    padding: '12px'
                                }}
                                itemStyle={{ color: '#e4e4e7', fontSize: '12px', fontWeight: 'bold' }}
                                labelStyle={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px' }}
                                formatter={(value: number) => [value, 'Carbs']}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                            <Bar dataKey="carbs" fill="#f59e0b" name="Carbs (g)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
