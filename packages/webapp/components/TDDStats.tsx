'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine, CartesianGrid, AreaChart, Area } from 'recharts';
import { format } from 'date-fns';

interface TDDStatsProps {
    tdd: {
        stats: {
            overall: { median: number; p95: number };
            weekdays: { median: number; p95: number };
            weekends: { median: number; p95: number };
        };
        dailySeries: Array<{
            date: string;
            total: number;
            basal: number;
            bolus: number;
        }>;
        hourlyStats: Array<{
            hour: number;
            median: number;
            p95: number;
            basalMedian: number;
            bolusMedian: number;
        }>;
    };
    units: string;
}

export default function TDDStats({ tdd, units }: TDDStatsProps) {
    if (!tdd) return null;

    const cards = [
        { label: 'Overall Median', value: tdd.stats.overall.median.toFixed(1) },
        { label: 'Overall P95', value: tdd.stats.overall.p95.toFixed(1) },
        { label: 'Weekday Median', value: tdd.stats.weekdays.median.toFixed(1) },
        { label: 'Weekend Median', value: tdd.stats.weekends.median.toFixed(1) }
    ];

    const formattedDaily = tdd.dailySeries.map(d => ({
        ...d,
        label: format(new Date(d.date), 'MMM d')
    }));

    const formattedHourly = tdd.hourlyStats.map(h => ({
        ...h,
        label: `${h.hour.toString().padStart(2, '0')}:00`
    }));

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
            <h3 className="text-xl font-black text-zinc-100 uppercase tracking-tighter flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Total Daily Dose (TDD)
            </h3>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((card, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 space-y-2 backdrop-blur-sm transition-transform hover:scale-[1.02]">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{card.label}</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-indigo-400 tracking-tight">{card.value}</span>
                            <span className="text-[10px] text-zinc-600 font-bold uppercase">U</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Daily Chart */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-sm space-y-6">
                <div>
                    <h4 className="text-sm font-bold text-zinc-300">Daily TDD Breakdown</h4>
                    <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">Total delivery per day</p>
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
                                tickFormatter={(val) => `${val}U`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#18181b',
                                    border: '1px solid #27272a',
                                    borderRadius: '12px',
                                    padding: '12px'
                                }}
                                itemStyle={{ color: '#e4e4e7', fontSize: '12px', fontWeight: 'bold' }}
                                labelStyle={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                            <Bar dataKey="total" fill="#8b5cf6" name="Total Insulin" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Hourly Profile Chart */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-sm space-y-6">
                <div>
                    <h4 className="text-sm font-bold text-zinc-300">Hourly Delivery Profile</h4>
                    <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">Median and 95th Percentile per hour of day</p>
                </div>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={formattedHourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                            <XAxis
                                dataKey="label"
                                stroke="#52525b"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                interval={3}
                            />
                            <YAxis
                                stroke="#52525b"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => `${val}U`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#18181b',
                                    border: '1px solid #27272a',
                                    borderRadius: '12px',
                                    padding: '12px'
                                }}
                                itemStyle={{ color: '#e4e4e7', fontSize: '12px', fontWeight: 'bold' }}
                                labelStyle={{ color: '#a1a1aa', fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                            <Area type="monotone" dataKey="p95" stroke="transparent" fill="#8b5cf6" fillOpacity={0.1} name="95th Percentile" />
                            <Area type="monotone" dataKey="median" stroke="#8b5cf6" strokeWidth={3} fill="#8b5cf6" fillOpacity={0.3} name="Median Total" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
