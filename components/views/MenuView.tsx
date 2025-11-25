
import React from 'react';
import { GameLogo } from '../GameLogo';
import { IconStaff, IconSword } from '../PixelIcons';

interface Props {
    onNavigate: (view: any) => void;
    hasHero: boolean;
}

const MenuView: React.FC<Props> = ({ onNavigate, hasHero }) => {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-8 md:gap-12 animate-in fade-in zoom-in duration-500 p-4">
            <div className="scale-75 md:scale-100"><GameLogo /></div>
            
            <div className="flex flex-col md:flex-row gap-6 mt-4 md:mt-12 w-full max-w-md md:max-w-none items-center justify-center">
                <button 
                    onClick={() => onNavigate('HERO_MANAGE')} 
                    className="group relative w-full md:w-64 h-24 md:h-40 bg-slate-800 pixel-border hover:border-blue-500 transition-all overflow-hidden flex flex-row md:flex-col items-center justify-center gap-4 hover:-translate-y-2 px-6"
                >
                    <IconStaff size={32} className="text-blue-400 relative z-10 md:w-12 md:h-12" />
                    <div className="flex flex-col items-start md:items-center">
                        <span className="text-lg md:text-xl font-bold retro-font relative z-10">英雄名册</span>
                        <span className="text-xs text-slate-500 relative z-10 font-mono">Manage & Create</span>
                    </div>
                </button>

                <button 
                    onClick={() => onNavigate(hasHero ? 'BATTLE_SETUP' : 'HERO_MANAGE')} 
                    className="group relative w-full md:w-64 h-24 md:h-40 bg-slate-800 pixel-border hover:border-red-500 transition-all overflow-hidden flex flex-row md:flex-col items-center justify-center gap-4 hover:-translate-y-2 px-6"
                >
                    <IconSword size={32} className="text-red-400 relative z-10 md:w-12 md:h-12" />
                    <div className="flex flex-col items-start md:items-center">
                        <span className="text-lg md:text-xl font-bold retro-font relative z-10">开始战斗</span>
                        <span className="text-xs text-slate-500 relative z-10 font-mono">Single / Multi</span>
                    </div>
                </button>
            </div>
        </div>
    );
};

export default MenuView;
