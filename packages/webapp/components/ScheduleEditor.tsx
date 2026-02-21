'use client';

import { useState } from 'react';
import { Plus, Trash2, Clock } from 'lucide-react';

interface ScheduleEntry {
    time: string;
    value: number;
}

interface ScheduleEditorProps {
    title: string;
    entries: ScheduleEntry[];
    onChange: (entries: ScheduleEntry[]) => void;
    unit?: string;
}

export default function ScheduleEditor({ title, entries, onChange, unit }: ScheduleEditorProps) {
    const sortedEntries = [...entries].sort((a, b) => a.time.localeCompare(b.time));

    const addEntry = () => {
        const lastTime = sortedEntries.length > 0 ? sortedEntries[sortedEntries.length - 1].time : '00:00';
        const [h, m] = lastTime.split(':').map(Number);
        let nextH = h + 1;
        if (nextH >= 24) nextH = 23;
        const newTime = `${nextH.toString().padStart(2, '0')}:00`;

        onChange([...entries, { time: newTime, value: entries.length > 0 ? entries[entries.length - 1].value : 0 }]);
    };

    const removeEntry = (index: number) => {
        if (entries.length <= 1) return;
        const newEntries = [...entries];
        newEntries.splice(index, 1);
        onChange(newEntries);
    };

    const updateEntry = (index: number, field: keyof ScheduleEntry, val: string | number) => {
        const newEntries = [...entries];
        newEntries[index] = { ...newEntries[index], [field]: val };
        onChange(newEntries);
    };

    return (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-4 space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">{title}</h3>
                <button
                    onClick={addEntry}
                    className="p-1 hover:bg-zinc-800 rounded-lg text-indigo-400 transition-colors"
                >
                    <Plus size={16} />
                </button>
            </div>

            <div className="space-y-3">
                {sortedEntries.map((entry) => {
                    const originalIdx = entries.indexOf(entry);
                    return (
                        <div key={originalIdx} className="flex gap-4 items-center group bg-black/20 p-2 rounded-2xl border border-transparent hover:border-zinc-800 transition-all">
                            <div className="relative w-32 shrink-0">
                                <Clock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                                <input
                                    type="time"
                                    value={entry.time}
                                    onChange={(e) => updateEntry(originalIdx, 'time', e.target.value)}
                                    className="w-full bg-black border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none transition-colors"
                                />
                            </div>
                            <div className="relative flex-1">
                                <input
                                    type="number"
                                    step="any"
                                    value={entry.value}
                                    onChange={(e) => updateEntry(originalIdx, 'value', parseFloat(e.target.value))}
                                    className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm text-zinc-300 focus:border-indigo-500 outline-none transition-colors font-mono font-bold"
                                />
                                {unit && (
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-bold uppercase tracking-wider bg-zinc-900/50 px-2 py-0.5 rounded border border-zinc-800/50">
                                        {unit}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => removeEntry(originalIdx)}
                                disabled={entries.length <= 1}
                                className="p-2 text-zinc-600 hover:text-rose-400 disabled:opacity-0 transition-all"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
