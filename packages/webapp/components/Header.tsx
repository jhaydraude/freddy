'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { 
    Moon, 
    Settings, 
    LayoutDashboard, 
    BookOpen, 
    Activity, 
    RefreshCw, 
    BarChart, 
    MessageSquare, 
    CircleHelp, 
    ChevronDown, 
    Github, 
    ExternalLink,
    Book
} from 'lucide-react';

export default function Header({
    title = "Freddy",
    action
}: {
    title?: string;
    action?: React.ReactNode;
}) {
    const pathname = usePathname();
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const helpTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const isActive = (path: string) => pathname === path;

    const handleMouseEnter = () => {
        if (helpTimeoutRef.current) clearTimeout(helpTimeoutRef.current);
        setIsHelpOpen(true);
    };

    const handleMouseLeave = () => {
        helpTimeoutRef.current = setTimeout(() => {
            setIsHelpOpen(false);
        }, 300);
    };

    useEffect(() => {
        setIsHelpOpen(false);
    }, [pathname]);

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
                            href="/chat"
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${isActive('/chat')
                                ? 'bg-emerald-900/60 text-emerald-300 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                        >
                            <MessageSquare size={14} />
                            <span className="hidden sm:inline">Chat</span>
                        </Link>

                        <Link
                            href="/statistics"
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${isActive('/statistics')
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                        >
                            <BarChart size={14} />
                            <span className="hidden sm:inline">Stats</span>
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
                            href="/settings"
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${isActive('/settings')
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                }`}
                        >
                            <Settings size={14} />
                            <span className="hidden sm:inline">Settings</span>
                        </Link>

                        {/* Help Dropdown */}
                        <div 
                            className="relative"
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                        >
                            <button
                                type="button"
                                onClick={() => setIsHelpOpen(!isHelpOpen)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 outline-none ${isHelpOpen || isActive('/apidocs') || isActive('/guide')
                                    ? 'bg-zinc-800 text-white shadow-sm'
                                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                                    }`}
                            >
                                <CircleHelp size={14} />
                                <span className="hidden sm:inline">Help</span>
                                <ChevronDown size={12} className={`transition-transform duration-200 ${isHelpOpen ? 'rotate-180' : ''} opacity-50`} />
                            </button>

                            {isHelpOpen && (
                                <div className="absolute right-0 mt-1 w-52 bg-zinc-950/90 backdrop-blur-xl border border-zinc-800/50 rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden py-1 animate-enter z-50">
                                    <Link 
                                        href="/apidocs" 
                                        className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive('/apidocs') ? 'bg-zinc-800/50 text-emerald-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
                                    >
                                        <div className="w-6 flex justify-center">
                                            <BookOpen size={16} />
                                        </div>
                                        <span>API Docs</span>
                                    </Link>
                                    <Link 
                                        href="/guide" 
                                        className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive('/guide') ? 'bg-zinc-800/50 text-emerald-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
                                    >
                                        <div className="w-6 flex justify-center">
                                            <Book size={16} />
                                        </div>
                                        <span>Usage Guide</span>
                                    </Link>
                                    <div className="h-px bg-zinc-900 my-1 mx-2" />
                                    <a 
                                        href="https://github.com/jhaydraude/freddy" 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                                    >
                                        <div className="w-6 flex justify-center">
                                            <Github size={16} />
                                        </div>
                                        <span className="flex-1">Git Repo</span>
                                        <ExternalLink size={10} className="opacity-30" />
                                    </a>
                                    <a 
                                        href="https://github.com/jhaydraude/freddy/issues" 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                                    >
                                        <div className="w-6 flex justify-center">
                                            <MessageSquare size={16} />
                                        </div>
                                        <span className="flex-1">Issues</span>
                                        <ExternalLink size={10} className="opacity-30" />
                                    </a>
                                </div>
                            )}
                        </div>
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
