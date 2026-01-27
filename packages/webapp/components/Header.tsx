'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Settings, LayoutDashboard, BookOpen, Tags, Activity, RefreshCw, BarChart } from 'lucide-react';

export default function Header({
    title = "Freddy",
    action
}: {
    title?: string;
    action?: React.ReactNode;
}) {
    const pathname = usePathname();

    const isActive = (path: string) => pathname === path;

    return (
        <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-zinc-900">
            <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-6">
                    {/* Logo / Brand */}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-black shadow-[0_0_15px_-3px_rgba(16,185,129,0.5)]">
                            <Moon size={20} className="fill-current" />
                        </div>
                        <h1 className="font-bold text-lg tracking-tight hidden sm:block">{title}</h1>
                    </div>

                    {/* Navigation */}
                    <nav className="flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50">
                        <Link
                            href="/"
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${isActive('/')
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                        >
                            <LayoutDashboard size={14} />
                            <span className="hidden sm:inline">Dashboard</span>
                        </Link>
                        <Link
                            href="/modeller"
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${isActive('/modeller')
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                        >
                            <Tags size={14} />
                            <span className="hidden sm:inline">Situation Modeller</span>
                        </Link>
                        <Link
                            href="/tuning"
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${isActive('/tuning')
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                        >
                            <RefreshCw size={14} />
                            <span className="hidden sm:inline">Tuning</span>
                        </Link>
                        <Link
                            href="/statistics"
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${isActive('/statistics')
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                        >
                            <BarChart size={14} />
                            <span className="hidden sm:inline">Statistics</span>
                        </Link>
                        <Link
                            href="/profile"
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${isActive('/profile')
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                        >
                            <Activity size={14} />
                            <span className="hidden sm:inline">Profile</span>
                        </Link>
                        <Link
                            href="/settings"
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${isActive('/settings')
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                        >
                            <Settings size={14} />
                            <span className="hidden sm:inline">Settings</span>
                        </Link>
                        <Link
                            href="/apidocs"
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${isActive('/apidocs')
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                        >
                            <BookOpen size={14} />
                            <span className="hidden sm:inline">API Docs</span>
                        </Link>
                    </nav>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-3">
                    {action}
                </div>
            </div>
        </div>
    );
}
