import React from 'react';

interface TuningCategoryCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    status: 'optimized' | 'needs_update' | 'locked';
    lastOptimized?: string;
    improvement?: string;
    onClick: () => void;
    colorClass: string;
}

export const TuningCategoryCard: React.FC<TuningCategoryCardProps> = ({
    title,
    description,
    icon,
    status,
    lastOptimized,
    improvement,
    onClick,
    colorClass
}) => {
    const getStatusDisplay = () => {
        switch (status) {
            case 'optimized':
                return {
                    label: 'Fully Optimized',
                    class: 'bg-green-500/10 text-green-400 border-green-500/20'
                };
            case 'needs_update':
                return {
                    label: 'Update Available',
                    class: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                };
            case 'locked':
                return {
                    label: 'Available Soon',
                    class: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                };
            default:
                return {
                    label: 'Unknown',
                    class: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                };
        }
    };

    const statusInfo = getStatusDisplay();

    return (
        <div
            onClick={status !== 'locked' ? onClick : undefined}
            className={`relative group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all duration-300 ${status !== 'locked' ? 'hover:border-zinc-700 hover:bg-zinc-900 cursor-pointer hover:scale-[1.02] active:scale-[0.98]' : 'opacity-60 grayscale cursor-not-allowed'} h-full flex flex-col`}
        >
            {/* Background Glow Effect */}
            <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full ${colorClass} blur-[80px] opacity-20 group-hover:opacity-30 transition-opacity`} />

            <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl bg-zinc-800/80 border border-zinc-700 text-2xl group-hover:scale-110 transition-transform duration-300`}>
                    {icon}
                </div>
                <div className={`px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${statusInfo.class}`}>
                    {statusInfo.label}
                </div>
            </div>

            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-zinc-400 transition-all">
                {title}
            </h3>

            <p className="text-zinc-400 text-sm leading-relaxed mb-6 flex-grow">
                {description}
            </p>

            <div className="flex flex-col gap-3">
                {improvement && (
                    <div className="flex items-center gap-2 text-xs text-green-400 font-medium bg-green-400/5 px-3 py-2 rounded-lg border border-green-400/10">
                        <span className="text-sm">↗</span>
                        {improvement}
                    </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2 border-t border-zinc-800 pt-3">
                    <span>{lastOptimized ? `Last: ${lastOptimized}` : 'Never optimized'}</span>
                    {status !== 'locked' && (
                        <span className="text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            START OPTIMIZER →
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
