
import React from 'react';
import { TOWER_LEVELS } from '../../utils/towerData';
import { IconCheck, IconBack } from '../PixelIcons';
import { Lock } from 'lucide-react';

interface Props {
    progress: number;
    onStartLevel: (level: number) => void;
    onBack: () => void;
}

const TowerSelectView: React.FC<Props> = ({ progress, onStartLevel, onBack }) => {
    return (
        <div className="flex flex-col items-center h-full p-4 md:p-8 bg-slate-950 overflow-y-auto">
            <header className="mb-8 text-center mt-4">
                <h2 className="text-3xl md:text-4xl font-bold retro-font text-yellow-400 mb-2 drop-shadow-md">爬塔挑战</h2>
                <p className="text-slate-500 font-mono text-sm">挑战层层强敌，突破极限 (Max: 20F)</p>
            </header>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4 max-w-4xl w-full mb-8">
                {TOWER_LEVELS.map((levelConfig, index) => {
                    const level = index + 1;
                    const isUnlocked = level <= progress;
                    const isCleared = level < progress;
                    const isBoss = level % 5 === 0;
                    
                    return (
                        <button
                            key={level}
                            onClick={() => isUnlocked && onStartLevel(level)}
                            disabled={!isUnlocked}
                            className={`
                                relative h-20 md:h-24 border-4 flex flex-col items-center justify-center transition-all
                                ${isUnlocked 
                                    ? (isBoss ? 'bg-red-950/40 border-red-600 hover:bg-red-900/60 hover:-translate-y-1' : 'bg-slate-800 border-slate-600 hover:border-yellow-500 hover:bg-slate-700 hover:-translate-y-1') 
                                    : 'bg-slate-900 border-slate-800 opacity-50 cursor-not-allowed grayscale'
                                }
                            `}
                        >
                            <span className={`text-xl md:text-2xl font-bold retro-font ${isUnlocked ? 'text-white' : 'text-slate-700'}`}>
                                {level}F
                            </span>
                            {isCleared && (
                                <div className="absolute top-1 right-1 text-green-500">
                                    <IconCheck size={16} />
                                </div>
                            )}
                            {isBoss && (
                                <div className="absolute bottom-1 md:bottom-2 text-[8px] md:text-[10px] text-red-400 font-bold uppercase tracking-wider">BOSS</div>
                            )}
                            {!isUnlocked && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                    <Lock size={20} className="text-slate-600" />
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
            
            <div className="flex gap-4 mb-8">
                    <button onClick={onBack} className="pixel-btn pixel-btn-secondary border-2 flex items-center gap-2">
                    <IconBack size={16}/> 返回
                </button>
            </div>
        </div>
    );
};

export default TowerSelectView;
