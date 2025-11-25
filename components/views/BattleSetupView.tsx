
import React from 'react';
import { CharacterConfig } from '../../types';
import HeroAvatar from '../HeroAvatar';
import { IconRefresh, IconShield, IconBolt, IconPlay, IconBack } from '../PixelIcons';
import { Castle, Users } from 'lucide-react';

interface Props {
    myChar: CharacterConfig;
    onNavigate: (view: any) => void;
    onShowHeroSelect: () => void;
    onStartBot: () => void;
    onStartTower: () => void;
    onEnterPublic: () => void;
    onJoinPrivate: (id?: string) => void;
    roomId: string;
    setRoomId: (id: string) => void;
}

const BattleSetupView: React.FC<Props> = ({ 
    myChar, onNavigate, onShowHeroSelect, onStartBot, onStartTower, onEnterPublic, onJoinPrivate, roomId, setRoomId 
}) => {
    return (
        <div className="flex flex-col items-center h-full gap-4 md:gap-8 animate-in fade-in slide-in-from-right duration-300 p-4 md:p-8 overflow-y-auto">
            <h2 className="text-2xl md:text-3xl font-bold retro-font drop-shadow-md text-white mt-4">战斗准备</h2>
            
            {/* CURRENT HERO CARD */}
            <div className="flex items-center gap-4 md:gap-6 bg-slate-800 p-4 md:p-6 border-4 border-slate-700 mb-4 shadow-xl relative w-full max-w-md md:max-w-none mx-auto justify-between">
                    <div className="flex items-center gap-4">
                    <div className="border-4 border-slate-900 bg-slate-950 shrink-0">
                        <HeroAvatar appearance={myChar.appearance!} size={64} bgColor={myChar.avatarColor} className="md:w-20 md:h-20" />
                    </div>
                    <div className="flex flex-col gap-1 min-w-0">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">出战英雄</div>
                        <div className="font-bold text-xl md:text-2xl retro-font text-white truncate">{myChar.name}</div>
                        <div className="flex gap-2 text-xs text-slate-500 font-mono">
                            <span>{myChar.role}</span>
                            <span>•</span>
                            <span>{myChar.skills.length} Skills</span>
                        </div>
                    </div>
                    </div>
                <button 
                    onClick={onShowHeroSelect} 
                    className="px-3 py-2 bg-slate-700 border-2 border-slate-600 hover:bg-slate-600 hover:border-slate-500 transition-colors text-xs md:text-sm font-bold flex items-center gap-2"
                >
                    <IconRefresh size={16}/> <span className="hidden md:inline">更换</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 w-full max-w-5xl">
                {/* LOCAL BOT */}
                <button onClick={onStartBot} className="group relative bg-slate-800 hover:bg-emerald-900/30 border-4 border-slate-700 hover:border-emerald-500 flex flex-row md:flex-col items-center gap-4 p-4 md:p-8 transition-all hover:-translate-y-1">
                    <div className="p-3 md:p-4 bg-slate-900 rounded-full border-2 border-slate-700 group-hover:border-emerald-500 group-hover:text-emerald-400 text-slate-500 transition-colors">
                            <IconShield size={24} className="md:w-8 md:h-8" />
                    </div>
                    <div className="text-left md:text-center flex-1">
                        <span className="font-bold text-lg retro-font block mb-1">人机训练</span>
                        <span className="text-xs text-slate-500 font-mono">VS AI BOT</span>
                    </div>
                </button>
                
                {/* TOWER MODE */}
                <button onClick={onStartTower} className="group relative bg-slate-800 hover:bg-yellow-900/30 border-4 border-slate-700 hover:border-yellow-500 flex flex-row md:flex-col items-center gap-4 p-4 md:p-8 transition-all hover:-translate-y-1">
                    <div className="p-3 md:p-4 bg-slate-900 rounded-full border-2 border-slate-700 group-hover:border-yellow-500 group-hover:text-yellow-400 text-slate-500 transition-colors">
                            <Castle size={24} className="md:w-8 md:h-8" />
                    </div>
                    <div className="text-left md:text-center flex-1">
                        <span className="font-bold text-lg retro-font block mb-1">爬塔模式</span>
                        <span className="text-xs text-slate-500 font-mono">20 Levels PVE</span>
                    </div>
                </button>

                {/* PUBLIC HALL */}
                <button onClick={onEnterPublic} className="group relative bg-slate-800 hover:bg-purple-900/30 border-4 border-slate-700 hover:border-purple-500 flex flex-row md:flex-col items-center gap-4 p-4 md:p-8 transition-all hover:-translate-y-1">
                    <div className="p-3 md:p-4 bg-slate-900 rounded-full border-2 border-slate-700 group-hover:border-purple-500 group-hover:text-purple-400 text-slate-500 transition-colors">
                            <Users size={24} className="md:w-8 md:h-8" />
                    </div>
                    <div className="text-left md:text-center flex-1">
                        <span className="font-bold text-lg retro-font block mb-1">对战大厅</span>
                        <span className="text-xs text-slate-500 font-mono">Public Matchmaking</span>
                    </div>
                </button>

                {/* PRIVATE ROOM */}
                <div className="bg-slate-800 border-4 border-slate-700 flex flex-col md:items-center gap-4 p-4 md:p-8 relative">
                    <div className="hidden md:block p-4 bg-slate-900 rounded-full border-2 border-slate-700 text-blue-400">
                            <IconBolt size={32} />
                    </div>
                    <div className="text-left md:text-center w-full">
                        <span className="font-bold text-lg retro-font block mb-2 md:mb-4">私有房间</span>
                        <div className="flex gap-2 w-full">
                            <input 
                                className="pixel-input w-full text-center text-sm"
                                placeholder="输入房间号"
                                value={roomId}
                                onChange={e => setRoomId(e.target.value)}
                            />
                            <button 
                                onClick={() => onJoinPrivate()}
                                className="pixel-btn pixel-btn-primary px-3"
                            >
                                <IconPlay size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <button onClick={() => onNavigate('MENU')} className="mt-auto md:mt-4 text-slate-500 hover:text-white pixel-btn pixel-btn-secondary border-2 flex items-center gap-2 mb-8">
                    <IconBack size={16}/> 返回主菜单
            </button>
        </div>
    );
};

export default BattleSetupView;
