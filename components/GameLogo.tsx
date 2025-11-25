
import React from 'react';

export const GameLogo: React.FC = () => {
    return (
        <div className="relative w-64 h-64 flex items-center justify-center">
            {/* Staff (Left) */}
            <div className="absolute left-8 top-12 transform -rotate-12 hover:rotate-0 transition-transform duration-500">
                <svg width="64" height="128" viewBox="0 0 16 32" className="drop-shadow-lg">
                     <path fill="#8b4513" d="M6 4h4v24H6z" />
                     <path fill="#a855f7" d="M5 1h6v6H5z" /> {/* Gem */}
                     <path fill="#e9d5ff" d="M6 2h2v2H6z" /> {/* Shine */}
                </svg>
            </div>

            {/* Sword (Right) */}
            <div className="absolute right-8 top-12 transform rotate-12 hover:rotate-0 transition-transform duration-500">
                <svg width="64" height="128" viewBox="0 0 16 32" className="drop-shadow-lg">
                    <path fill="#94a3b8" d="M6 2h4v20H6z" /> {/* Blade */}
                    <path fill="#cbd5e1" d="M7 2h1v20H7z" /> {/* Shine */}
                    <path fill="#475569" d="M3 22h10v2H3z" /> {/* Guard */}
                    <path fill="#8b4513" d="M6 24h4v6H6z" /> {/* Hilt */}
                    <path fill="#fcd34d" d="M7 29h2v1H7z" /> {/* Pommel */}
                </svg>
            </div>

            {/* Shield (Center) */}
            <div className="absolute z-10 hover:scale-110 transition-transform duration-300">
                <svg width="128" height="128" viewBox="0 0 32 32" className="drop-shadow-2xl">
                    <path fill="#1e293b" d="M2 2h28v10c0 10-6 18-14 18S2 22 2 12V2z" />
                    <path fill="#3b82f6" d="M4 4h24v8c0 8-5 15-12 15S4 20 4 12V4z" />
                    {/* Cross */}
                    <path fill="#fbbf24" d="M14 6h4v20h-4z" />
                    <path fill="#fbbf24" d="M6 12h20v4H6z" />
                    {/* Bolts */}
                    <path fill="#ffffff" d="M6 6h2v2H6zM24 6h2v2h-2zM15 25h2v2h-2z" />
                </svg>
            </div>

            {/* Text Banner */}
            <div className="absolute -bottom-8 bg-slate-900 border-4 border-slate-700 px-6 py-2 rounded-none shadow-[4px_4px_0_0_rgba(0,0,0,0.5)] whitespace-nowrap z-20">
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 retro-font tracking-widest drop-shadow-md">
                    CODE HERO
                </h1>
            </div>
        </div>
    );
};
