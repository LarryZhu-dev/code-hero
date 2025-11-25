
import React, { useState } from 'react';
import { BattleEntity, StatType, DYNAMIC_STATS } from '../types';
import { getTotalStat } from '../utils/gameEngine';
import { StatIcon } from './StatIcon';
import HeroAvatar from './HeroAvatar';
import { IconHeart, IconMana } from './PixelIcons';

export const StatList: React.FC<{ entity: BattleEntity, onHover?: (stat: StatType | null) => void }> = ({ entity, onHover }) => {
    const displayStats = Object.values(StatType).filter(s => !DYNAMIC_STATS.includes(s));
    return (
        <div className="grid grid-cols-2 gap-2">
            {displayStats.map(stat => {
                const val = getTotalStat(entity, stat);
                return (
                    <div 
                        key={stat} 
                        className="bg-slate-800 p-2 border-2 border-slate-700 flex items-center justify-between group relative hover:border-slate-500 transition-colors cursor-help"
                        onMouseEnter={() => onHover && onHover(stat)}
                        onMouseLeave={() => onHover && onHover(null)}
                    >
                        <div className="flex items-center gap-2">
                            <StatIcon stat={stat} size={14} />
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-300">
                            {Number.isInteger(val) ? val : val.toFixed(1)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export const BattleStatPanel: React.FC<{ entity: BattleEntity, isRight?: boolean, onHoverStat?: (stat: StatType | null) => void }> = ({ entity, isRight, onHoverStat }) => {
    return (
        <div className={`absolute top-20 bottom-24 w-64 ${isRight ? 'right-4' : 'left-4'} bg-slate-900 border-4 border-slate-700 p-4 flex flex-col z-20 overflow-y-auto custom-scrollbar no-scrollbar shadow-2xl`}>
            <div className="flex items-center gap-3 mb-4 border-b-4 border-slate-700 pb-2">
                <div className={`border-4 overflow-hidden ${isRight ? 'border-red-500' : 'border-blue-500'}`}>
                    <HeroAvatar appearance={entity.config.appearance!} size={48} bgColor={entity.config.avatarColor} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-white truncate retro-font">{entity.config.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono flex flex-col gap-1 mt-1">
                         <div className="flex justify-between items-center">
                             <IconHeart size={10} className="text-red-500"/>
                             <span className="text-white">{Math.floor(entity.currentHp)}/{Math.floor(getTotalStat(entity, StatType.HP))}</span>
                         </div>
                         <div className="flex justify-between items-center">
                             <IconMana size={10} className="text-blue-500"/>
                             <span className="text-white">{Math.floor(entity.currentMana)}/{Math.floor(getTotalStat(entity, StatType.MANA))}</span>
                         </div>
                    </div>
                </div>
            </div>
            
            <StatList entity={entity} onHover={onHoverStat} />
        </div>
    );
};

export const MobileStatModal: React.FC<{ p1: BattleEntity, p2: BattleEntity, onClose: () => void }> = ({ p1, p2, onClose }) => {
    const [activeEntity, setActiveEntity] = useState<'P1' | 'P2'>('P1');
    const current = activeEntity === 'P1' ? p1 : p2;

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-slate-900 border-4 border-slate-600 w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex border-b-4 border-slate-700">
                    <button 
                        className={`flex-1 p-3 font-bold retro-font ${activeEntity === 'P1' ? 'bg-blue-900 text-blue-200' : 'bg-slate-800 text-slate-500'}`}
                        onClick={() => setActiveEntity('P1')}
                    >
                        {p1.config.name}
                    </button>
                    <button 
                        className={`flex-1 p-3 font-bold retro-font ${activeEntity === 'P2' ? 'bg-red-900 text-red-200' : 'bg-slate-800 text-slate-500'}`}
                        onClick={() => setActiveEntity('P2')}
                    >
                        {p2.config.name}
                    </button>
                </div>
                <div className="p-4 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="border-4 border-slate-700 bg-slate-800">
                            <HeroAvatar appearance={current.config.appearance!} size={64} bgColor={current.config.avatarColor} />
                        </div>
                        <div className="flex-1">
                             <div className="text-xs text-slate-400 font-mono mb-1">HP</div>
                             <div className="h-2 w-full bg-slate-800 mb-2">
                                 <div className="h-full bg-red-500" style={{width: `${Math.min(100, (current.currentHp / getTotalStat(current, StatType.HP)) * 100)}%`}}></div>
                             </div>
                             <div className="text-xs text-slate-400 font-mono mb-1">MP</div>
                             <div className="h-2 w-full bg-slate-800">
                                 <div className="h-full bg-blue-500" style={{width: `${Math.min(100, (current.currentMana / getTotalStat(current, StatType.MANA)) * 100)}%`}}></div>
                             </div>
                        </div>
                    </div>
                    <StatList entity={current} />
                </div>
                <div className="p-4 border-t-4 border-slate-700 bg-slate-800">
                    <button className="w-full pixel-btn pixel-btn-secondary border-2" onClick={onClose}>
                        关闭
                    </button>
                </div>
            </div>
        </div>
    );
}
