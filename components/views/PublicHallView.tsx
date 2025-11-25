
import React from 'react';
import { CharacterConfig } from '../../types';
import HeroAvatar from '../HeroAvatar';
import { IconBack } from '../PixelIcons';
import { Users, Loader2 } from 'lucide-react';

interface PublicPlayer {
    id: string;
    name: string;
    char: CharacterConfig;
    status: 'IDLE' | 'BUSY';
    lastSeen: number;
}

interface Props {
    players: PublicPlayer[];
    myChar: CharacterConfig;
    challengeSentTo: string | null;
    challengeStatus: 'IDLE' | 'SENDING' | 'WAITING' | 'TIMEOUT' | 'REJECTED';
    onChallenge: (id: string, name: string) => void;
    onDisconnect: () => void;
    onShowHeroSelect: () => void;
}

const PublicHallView: React.FC<Props> = ({ 
    players, myChar, challengeSentTo, challengeStatus, onChallenge, onDisconnect, onShowHeroSelect 
}) => {
    return (
        <div className="flex flex-col h-full bg-slate-950 p-4 md:p-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b-4 border-slate-800 gap-4">
                    <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-white retro-font flex items-center gap-3">
                        <Users size={24} className="md:w-8 md:h-8 text-purple-400"/> 对战大厅
                    </h2>
                    <p className="text-slate-500 text-xs font-mono mt-1">Global Public Hall • {players.length + 1} Online</p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <div className="flex flex-1 md:flex-none items-center gap-2 md:gap-3 bg-slate-900 px-3 py-2 border-2 border-slate-700">
                        <span className="text-[10px] md:text-xs text-slate-400 uppercase font-bold hidden sm:inline">Current Hero</span>
                        <div className="font-bold text-white retro-font text-sm">{myChar?.name}</div>
                        <button onClick={onShowHeroSelect} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2 py-1 text-slate-300 ml-auto md:ml-0">
                            Change
                        </button>
                    </div>
                    <button onClick={onDisconnect} className="pixel-btn pixel-btn-danger text-xs border-2 flex items-center gap-2">
                        <IconBack size={14}/> 离开
                    </button>
                    </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {players.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-slate-600 gap-4">
                        <Loader2 size={48} className="animate-spin opacity-20"/>
                        <p className="font-mono text-sm">正在寻找其他玩家...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {players.map(player => {
                            const isTarget = challengeSentTo === player.id;
                            
                            let btnText = '挑战';
                            let btnClass = 'bg-blue-600 border-blue-800 text-white hover:bg-blue-500';
                            let disabled = player.status !== 'IDLE' || (!!challengeSentTo && !isTarget);

                            if (isTarget) {
                                if (challengeStatus === 'WAITING') {
                                    btnText = '等待中...';
                                    btnClass = 'bg-yellow-900/50 border-yellow-600 text-yellow-400';
                                } else if (challengeStatus === 'TIMEOUT') {
                                    btnText = '超时';
                                    btnClass = 'bg-slate-700 border-slate-500 text-slate-300';
                                    disabled = true;
                                } else if (challengeStatus === 'REJECTED') {
                                    btnText = '对方拒绝';
                                    btnClass = 'bg-red-900/50 border-red-600 text-red-400';
                                    disabled = true;
                                }
                            }

                            return (
                            <div key={player.id} className="bg-slate-900 border-4 border-slate-800 p-4 flex items-center gap-4 hover:border-slate-600 transition-colors">
                                <div className="border-2 border-slate-700 bg-slate-950 relative">
                                    <HeroAvatar appearance={player.char.appearance!} size={64} bgColor={player.char.avatarColor} />
                                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 border-2 border-slate-900 ${player.status === 'IDLE' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-white retro-font truncate">
                                        {player.name} <span className="text-xs text-slate-600 font-mono">#{player.id.slice(0, 6)}</span>
                                    </div>
                                    <div className="text-xs text-slate-500 font-mono truncate">{player.char.role || 'Warrior'}</div>
                                </div>
                                <button 
                                    onClick={() => onChallenge(player.id, player.name)}
                                    disabled={disabled}
                                    className={`px-3 py-1 text-xs font-bold border-2 ${btnClass} ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {btnText}
                                </button>
                            </div>
                        )})}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PublicHallView;
