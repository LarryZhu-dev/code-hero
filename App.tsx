import React, { useState, useEffect, useCallback } from 'react';
import CharacterEditor from './components/CharacterEditor';
import BattleScene from './components/BattleScene';
import { CharacterConfig, BattleState, BattleEntity, StatType } from './types';
import { processSkill, checkConditions, getTotalStat } from './utils/gameEngine';
import { Swords, Edit, Upload } from 'lucide-react';

const App: React.FC = () => {
    const [mode, setMode] = useState<'MENU' | 'EDITOR' | 'BATTLE' | 'LOBBY'>('MENU');
    const [myChar, setMyChar] = useState<CharacterConfig | null>(null);
    const [battleState, setBattleState] = useState<BattleState | null>(null);
    const [playerId] = useState(crypto.randomUUID());
    
    // -- Editor Handling --
    const handleSaveChar = (char: CharacterConfig) => {
        setMyChar(char);
        setMode('MENU');
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const text = await file.text();
                try {
                    const json = atob(text);
                    const char = JSON.parse(json);
                    setMyChar(char);
                } catch (err) {
                    alert('无效的配置文件');
                }
            }
        };
        input.click();
    };

    // -- Battle Logic --
    
    const initBattle = (enemyConfig: CharacterConfig) => {
        if (!myChar) return;

        // Speed check for turn order
        const mySpeed = getTotalStat({ config: myChar } as any, StatType.SPEED);
        const enemySpeed = getTotalStat({ config: enemyConfig } as any, StatType.SPEED);
        const p1First = mySpeed >= enemySpeed;

        const p1Entity: BattleEntity = { 
            id: playerId, 
            config: myChar, 
            currentHp: getTotalStat({ config: myChar } as any, StatType.HP),
            currentMana: getTotalStat({ config: myChar } as any, StatType.MANA),
            buffs: [] 
        };
        const p2Entity: BattleEntity = { 
            id: 'enemy', 
            config: enemyConfig, 
            currentHp: getTotalStat({ config: enemyConfig } as any, StatType.HP),
            currentMana: getTotalStat({ config: enemyConfig } as any, StatType.MANA),
            buffs: [] 
        };

        setBattleState({
            turn: 1,
            log: ['战斗开始！'],
            p1: p1First ? p1Entity : p2Entity,
            p2: p1First ? p2Entity : p1Entity,
            activePlayerId: p1First ? p1Entity.id : p2Entity.id,
            phase: 'ACTION_SELECTION',
            timeLeft: 60
        });
        setMode('BATTLE');
    };

    const executeTurn = useCallback((skillId: string) => {
        if (!battleState) return;

        const newState = { ...battleState };
        const isP1Active = newState.activePlayerId === newState.p1.id;
        const active = isP1Active ? newState.p1 : newState.p2;
        const passive = isP1Active ? newState.p2 : newState.p1;

        // 1. Process Selected Skill
        const skill = active.config.skills.find(s => s.id === skillId);
        if (skill) {
            processSkill(skill, active, passive, (msg) => newState.log.push(msg));
        } else {
            // Default Attack if no skill found (fallback)
            passive.currentHp -= getTotalStat(active, StatType.AD);
            newState.log.push(`${active.config.name} 进行了普通攻击。`);
        }

        // 2. Check Death
        if (passive.currentHp <= 0) {
            newState.winnerId = active.id;
            newState.phase = 'FINISHED';
            newState.log.push(`${active.config.name} 获胜！`);
            setBattleState(newState);
            return;
        }

        // 3. End Turn cleanup
        newState.turn += 1;
        newState.activePlayerId = passive.id; // Swap turn
        
        // 4. Start Turn Trigger (Mana Regen)
        const nextActive = newState.activePlayerId === newState.p1.id ? newState.p1 : newState.p2;
        const nextPassive = newState.activePlayerId === newState.p1.id ? newState.p2 : newState.p1;

        const manaRegen = getTotalStat(nextActive, StatType.MANA_REGEN);
        nextActive.currentMana = Math.min(getTotalStat(nextActive, StatType.MANA), nextActive.currentMana + manaRegen);

        // 5. Process Passives (simplified: check all passives for the NEW active player)
        nextActive.config.skills.filter(s => s.isPassive).forEach(s => {
            if (checkConditions(s, nextActive, nextPassive, newState.turn)) {
                newState.log.push(`被动触发: ${s.name}`);
                processSkill(s, nextActive, nextPassive, (msg) => newState.log.push(msg));
            }
        });

        // Check death after passives
        if (nextPassive.currentHp <= 0) {
             newState.winnerId = nextActive.id;
             newState.phase = 'FINISHED';
             setBattleState(newState);
             return;
        }

        newState.phase = 'ACTION_SELECTION';
        newState.timeLeft = 60;
        setBattleState(newState);
    }, [battleState]);

    // Battle Timer
    useEffect(() => {
        if (mode !== 'BATTLE' || !battleState || battleState.phase !== 'ACTION_SELECTION') return;
        const timer = setInterval(() => {
            setBattleState(prev => {
                if (!prev || prev.phase !== 'ACTION_SELECTION') return prev;
                if (prev.timeLeft <= 1) {
                    // Timeout: Perform basic attack
                    return { ...prev, timeLeft: 0 };
                }
                return { ...prev, timeLeft: prev.timeLeft - 1 };
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [mode, battleState?.phase]);

    // Bot Logic (Self-Play for testing)
    useEffect(() => {
        if (battleState && battleState.phase === 'ACTION_SELECTION' && battleState.activePlayerId === 'enemy') {
            const enemy = battleState.p1.id === 'enemy' ? battleState.p1 : battleState.p2;
            // Random move
            setTimeout(() => {
                const skills = enemy.config.skills.filter(s => !s.isPassive);
                const chosen = skills.length > 0 ? skills[Math.floor(Math.random() * skills.length)] : null;
                executeTurn(chosen ? chosen.id : 'default');
            }, 1000);
        }
    }, [battleState, executeTurn]);

    // -- Render --

    return (
        <div className="h-screen w-screen bg-slate-950 text-slate-200 flex flex-col">
            {mode === 'MENU' && (
                <div className="flex flex-col items-center justify-center h-full gap-8">
                    <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600 retro-font mb-8">
                        CODE WARRIORS
                    </h1>
                    
                    <div className="grid grid-cols-2 gap-4 w-96">
                        <button onClick={() => setMode('EDITOR')} className="flex flex-col items-center p-6 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-all">
                            <Edit size={48} className="mb-2 text-blue-400" />
                            <span className="font-bold">编辑角色</span>
                            <span className="text-xs text-slate-500 mt-1">{myChar ? myChar.name : '未选择'}</span>
                        </button>

                        <button onClick={handleImport} className="flex flex-col items-center p-6 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-all">
                            <Upload size={48} className="mb-2 text-green-400" />
                            <span className="font-bold">导入配置</span>
                        </button>
                    </div>

                    {myChar && (
                        <button 
                            onClick={() => {
                                // Dummy Enemy for Quick Play
                                const dummy = JSON.parse(JSON.stringify(myChar));
                                dummy.name = "训练机器人";
                                dummy.id = "enemy";
                                initBattle(dummy);
                            }}
                            className="flex items-center gap-4 px-12 py-4 bg-red-600 hover:bg-red-500 rounded-full font-bold text-xl shadow-lg shadow-red-900/20"
                        >
                            <Swords size={24} /> 进入战斗
                        </button>
                    )}
                </div>
            )}

            {mode === 'EDITOR' && (
                <CharacterEditor onSave={handleSaveChar} existing={myChar || undefined} />
            )}

            {mode === 'BATTLE' && battleState && (
                <div className="flex h-full">
                    {/* Battle Scene */}
                    <div className="flex-1 relative bg-slate-900 flex flex-col items-center justify-center p-8">
                        <div className="absolute top-4 text-2xl font-bold retro-font text-yellow-400">
                            第 {battleState.turn} 回合
                        </div>
                        <BattleScene gameState={battleState} />
                        
                        <div className="w-[800px] mt-4 flex justify-between items-center">
                            <div className={`flex gap-2 ${battleState.activePlayerId === battleState.p1.id ? 'opacity-100' : 'opacity-50'}`}>
                                <div className="w-12 h-12 rounded bg-blue-500"></div>
                                <div>
                                    <div className="font-bold">{battleState.p1.config.name}</div>
                                    <div className="text-xs">HP: {Math.floor(battleState.p1.currentHp)} / {getTotalStat(battleState.p1, StatType.HP)}</div>
                                </div>
                            </div>
                            
                            <div className="text-xl font-mono font-bold text-white bg-slate-800 px-4 py-2 rounded">
                                {battleState.phase === 'ACTION_SELECTION' ? `${battleState.timeLeft}s` : battleState.phase}
                            </div>

                            <div className={`flex gap-2 text-right ${battleState.activePlayerId === battleState.p2.id ? 'opacity-100' : 'opacity-50'}`}>
                                <div>
                                    <div className="font-bold">{battleState.p2.config.name}</div>
                                    <div className="text-xs">HP: {Math.floor(battleState.p2.currentHp)} / {getTotalStat(battleState.p2, StatType.HP)}</div>
                                </div>
                                <div className="w-12 h-12 rounded bg-red-500"></div>
                            </div>
                        </div>

                        {/* Controls */}
                        {battleState.activePlayerId === playerId && battleState.phase === 'ACTION_SELECTION' && (
                            <div className="mt-6 flex gap-4">
                                {battleState.p1.id === playerId 
                                    ? battleState.p1.config.skills.filter(s => !s.isPassive).map(skill => (
                                        <button 
                                            key={skill.id}
                                            onClick={() => executeTurn(skill.id)}
                                            className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded shadow-lg font-bold flex flex-col items-center min-w-[120px]"
                                        >
                                            <span>{skill.name}</span>
                                            <span className="text-xs font-normal text-blue-200">
                                                {skill.effects.reduce((a,b) => a + b.manaCost, 0)} Mana
                                            </span>
                                        </button>
                                    ))
                                    : <div className="text-slate-400">等待对手...</div>
                                }
                            </div>
                        )}
                        
                        {battleState.winnerId && (
                            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
                                <div className="text-center">
                                    <h2 className="text-4xl font-bold text-yellow-400 mb-4">
                                        {battleState.winnerId === playerId ? '胜利' : '失败'}
                                    </h2>
                                    <button onClick={() => setMode('MENU')} className="bg-white text-black px-6 py-2 rounded font-bold">
                                        返回菜单
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Battle Log */}
                    <div className="w-80 bg-slate-950 border-l border-slate-800 p-4 overflow-y-auto font-mono text-xs">
                        <h3 className="text-slate-500 font-bold mb-4 uppercase tracking-widest">战斗日志</h3>
                        <div className="space-y-2">
                            {battleState.log.map((entry, i) => (
                                <div key={i} className="border-b border-slate-800 pb-1">
                                    <span className="text-slate-400">[{i+1}]</span> {entry}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;