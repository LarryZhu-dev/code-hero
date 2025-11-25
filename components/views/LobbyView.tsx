
import React, { useState } from 'react';
import { CharacterConfig } from '../../types';
import HeroAvatar from '../HeroAvatar';
import { IconCheck, IconRefresh, IconPlay, IconBack } from '../PixelIcons';
import { Copy, Check, Eye, Loader2 } from 'lucide-react';

interface Props {
    roomId: string;
    battleOrigin: 'PRIVATE' | 'PUBLIC';
    myRole: 'HOST' | 'CHALLENGER' | 'SPECTATOR' | 'NONE';
    myChar: CharacterConfig | null;
    opponentChar: CharacterConfig | null;
    spectatorChallengerChar: CharacterConfig | null;
    spectators: {id: string, name: string}[];
    opponentReady: boolean;
    amIReady: boolean;
    lobbyLog: string[];
    onStartGame: () => void;
    onToggleReady: () => void;
    onLeave: () => void;
    onShowHeroSelect: () => void;
}

const LobbyView: React.FC<Props> = ({
    roomId, battleOrigin, myRole, myChar, opponentChar, spectatorChallengerChar, spectators,
    opponentReady, amIReady, lobbyLog, onStartGame, onToggleReady, onLeave, onShowHeroSelect
}) => {
    const [copiedRoomId, setCopiedRoomId] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(roomId);
        setCopiedRoomId(true);
        setTimeout(() => setCopiedRoomId(false), 2000);
    };

    return (
        <div className="flex flex-col items-center justify-start md:justify-center h-full gap-4 md:gap-8 p-4 md:p-12 relative overflow-y-auto">
            <div className="w-full md:absolute md:top-12 flex flex-col md:items-center gap-2 mb-4 md:mb-0">
                <div className="text-slate-400 text-xs md:text-sm font-bold uppercase tracking-widest font-mono text-center md:text-left">
                    {battleOrigin === 'PUBLIC' ? 'Match Room' : 'Private Room ID'}
                </div>
                <div className="flex items-center justify-center gap-4">
                    <div className="text-2xl md:text-4xl font-mono font-bold text-white bg-slate-800 px-4 md:px-6 py-2 border-4 border-slate-700 shadow-xl">
                        {battleOrigin === 'PUBLIC' ? '---' : roomId}
                    </div>
                    {battleOrigin === 'PRIVATE' && (
                        <button 
                            onClick={handleCopy}
                            className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 transition-all border-4 border-slate-700 active:border-b-2 active:border-r-2"
                            title="复制房间号"
                        >
                            {copiedRoomId ? <Check size={20} /> : <Copy size={20} />}
                        </button>
                    )}
                </div>
            </div>

            <div className="md:absolute md:top-8 md:right-8 flex items-center gap-2 text-slate-400 text-sm justify-center w-full md:w-auto mb-4 md:mb-0">
                <Eye size={16}/> 观战: {spectators.length}
            </div>
            
            <h2 className="text-2xl md:text-3xl font-bold retro-font text-white mb-4 md:mb-8 mt-4 md:mt-16 drop-shadow-md text-center">
                {battleOrigin === 'PUBLIC' ? '比赛准备' : '房间大厅'}
            </h2>

            <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center w-full justify-center">
                {/* Host Card */}
                <div className="flex flex-col items-center gap-4">
                    <div className={`relative w-40 h-56 md:w-48 md:h-64 bg-slate-800 border-4 flex flex-col items-center justify-center p-4 transition-all ${myRole === 'HOST' ? 'border-yellow-500' : 'border-slate-600'}`}>
                        <div className="mb-4 border-2 border-slate-600">
                            <HeroAvatar 
                                appearance={(myRole === 'HOST' ? myChar : opponentChar)?.appearance!} 
                                size={64} 
                                bgColor={(myRole === 'HOST' ? myChar : opponentChar)?.avatarColor || '#333'} 
                                className="md:w-20 md:h-20"
                            />
                        </div>
                        <h3 className="font-bold text-base md:text-lg retro-font truncate max-w-full">{(myRole === 'HOST' ? myChar : opponentChar)?.name || '等待中...'}</h3>
                        <span className="text-xs text-yellow-500 mb-4 font-bold uppercase">HOST</span>
                        
                        {myRole === 'HOST' && (
                            <div className="mt-auto px-3 py-1 text-xs font-bold bg-yellow-900/50 text-yellow-400 border border-yellow-700 flex items-center gap-2">
                                <IconCheck size={12}/> <span className="hidden md:inline">已就绪</span>
                            </div>
                        )}
                        {myRole === 'HOST' && (
                            <button 
                                onClick={onShowHeroSelect} 
                                className="absolute top-2 right-2 p-1 bg-slate-700 hover:bg-white hover:text-slate-900 text-slate-400 border border-slate-600"
                                title="更换英雄"
                            >
                                <IconRefresh size={12} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="text-4xl font-black text-slate-700 italic retro-font rotate-90 md:rotate-0">VS</div>

                {/* Challenger Card */}
                <div className="flex flex-col items-center gap-4 w-40 md:w-48">
                    {(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : (myRole === 'SPECTATOR' ? spectatorChallengerChar : null))) ? (
                        <div className={`relative w-40 h-56 md:w-48 md:h-64 bg-slate-800 border-4 flex flex-col items-center justify-center p-4 transition-all ${(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'border-slate-600'}`}>
                            <div className="mb-4 border-2 border-slate-600">
                                <HeroAvatar 
                                    appearance={(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : spectatorChallengerChar))?.appearance!} 
                                    size={64} 
                                    bgColor={(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : spectatorChallengerChar))?.avatarColor} 
                                    className="md:w-20 md:h-20"
                                />
                            </div>
                            <h3 className="font-bold text-base md:text-lg retro-font truncate max-w-full">{(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : spectatorChallengerChar))?.name}</h3>
                            <span className="text-xs text-blue-400 mb-4 font-bold uppercase">CHALLENGER</span>
                            
                            <div className={`mt-auto flex items-center gap-2 px-3 py-1 text-xs font-bold border ${(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? 'bg-green-900/50 text-green-400 border-green-600' : 'bg-slate-900/50 text-slate-500 border-slate-700'}`}>
                                {(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? <IconCheck size={12} /> : <div className="w-3 h-3 border border-slate-500"></div>}
                                {(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? '已准备' : '未准备'}
                            </div>

                            {myRole === 'CHALLENGER' && (
                                <button 
                                    onClick={onShowHeroSelect} 
                                    disabled={amIReady}
                                    className={`absolute top-2 right-2 p-1 border ${amIReady ? 'bg-transparent text-slate-600 border-slate-700' : 'bg-slate-700 hover:bg-white hover:text-slate-900 text-slate-400 border-slate-600'}`}
                                    title="更换英雄"
                                >
                                    <IconRefresh size={12} />
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="w-40 h-56 md:w-48 md:h-64 bg-slate-900/50 border-4 border-dashed border-slate-700 flex flex-col items-center justify-center p-4 text-slate-600 gap-4 animate-pulse">
                            <Loader2 size={32} className="animate-spin" />
                            <span className="text-sm font-mono">Waiting...</span>
                        </div>
                    )}
                    
                    {/* Controls */}
                    {myRole === 'HOST' && (
                        <button 
                            onClick={onStartGame}
                            disabled={!opponentChar || !opponentReady}
                            className={`pixel-btn w-full ${opponentChar && opponentReady ? 'pixel-btn-primary' : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'} flex items-center justify-center gap-2 text-xs md:text-sm`}
                        >
                            <IconPlay size={16} /> {battleOrigin === 'PUBLIC' ? '即将开始...' : '开始对战'}
                        </button>
                    )}

                    {myRole === 'CHALLENGER' && (
                        <button 
                            onClick={onToggleReady}
                            disabled={battleOrigin === 'PUBLIC' && amIReady} // Public matches auto-lock
                            className={`pixel-btn w-full ${amIReady ? 'pixel-btn-secondary' : 'pixel-btn-success'} flex items-center justify-center gap-2 text-xs md:text-sm`}
                        >
                            <IconCheck size={16} /> {amIReady ? (battleOrigin === 'PUBLIC' ? '等待房主...' : '取消准备') : '准备就绪'}
                        </button>
                    )}
                </div>
            </div>

            {/* Log Window */}
            <div className="w-full md:w-[500px] h-32 bg-slate-900 border-4 border-slate-800 p-4 overflow-y-auto custom-scrollbar font-mono text-xs text-slate-400 mb-8 md:mb-0">
                {lobbyLog.map((log, i) => (
                    <div key={i} className="mb-1">{log}</div>
                ))}
            </div>

                <button 
                onClick={onLeave} 
                className="text-sm text-red-400 hover:text-red-300 border border-red-900/50 px-4 py-2 hover:bg-red-900/20 pixel-btn pixel-btn-danger flex items-center justify-center gap-2 mb-8 md:mb-0"
            >
                <IconBack size={14} /> 离开房间
            </button>
        </div>
    );
};

export default LobbyView;
