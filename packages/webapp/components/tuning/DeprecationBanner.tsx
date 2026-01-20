import React from 'react';
import { AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';

interface DeprecationBannerProps {
    type: 'mismatch' | 'outdated';
    category: string;
    onFix: () => void;
}

export const DeprecationBanner: React.FC<DeprecationBannerProps> = ({
    type,
    category,
    onFix
}) => {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 md:p-6 mb-8">
            {/* Decorative Blur */}
            <div className="absolute -left-10 -top-10 h-32 w-32 bg-amber-500/10 blur-[50px] pointer-events-none" />

            <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 relative z-10">
                <div className="p-3 bg-amber-500/20 rounded-full border border-amber-500/30 animate-pulse">
                    <AlertCircle className="w-6 h-6 text-amber-400" />
                </div>

                <div className="flex-grow text-center md:text-left">
                    <h4 className="text-lg font-bold text-white mb-1">
                        {type === 'mismatch' ? 'Profile Parameter Mismatch' : 'Optimized Parameters Available'}
                    </h4>
                    <p className="text-zinc-400 text-sm max-w-2xl">
                        {type === 'mismatch'
                            ? `Your active Nightscout profile has different ${category} values than your last optimized results. Would you like to re-apply the optimizations?`
                            : `A new optimization run is recommended for ${category} based on your data from the last 14 days.`
                        }
                    </p>
                </div>

                <button
                    onClick={onFix}
                    className="group flex items-center gap-2 px-6 py-3 bg-white text-zinc-950 font-bold rounded-xl hover:bg-amber-400 transition-all duration-300 shadow-lg shadow-white/5 active:scale-95 whitespace-nowrap"
                >
                    {type === 'mismatch' ? (
                        <>
                            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                            Sync Optimized Values
                        </>
                    ) : (
                        <>
                            Run Optimizer
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
