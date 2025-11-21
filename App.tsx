import React, { useState, useEffect, useCallback, useRef } from 'react';
import CharacterEditor from './components/CharacterEditor';
import BattleScene from './components/BattleScene';
import { CharacterConfig, BattleState, BattleEntity, StatType, Skill } from './types';
import { processSkill, checkConditions, getTotalStat, calculateManaCost, processBasicAttack } from './utils/gameEngine';
import { Swords, Edit, Upload, ArrowLeft, ArrowRight, CornerDownLeft, Flag, Zap } from 'lucide-react';

const App: React.FC = () => {
    const [mode, setMode] = useState<'MENU' | 'EDITOR' | 'BATTLE' | 'LOBBY'>('MENU');
    const [myChar, setMyChar] = useState<CharacterConfig | null>(null);
    const [battleState, setBattleState] = useState<BattleState | null>(null);
    const [playerId] = useState(crypto.randomUUID());
    const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
    
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
        setSelectedSkillIndex(0);
    };

    const executeTurn = useCallback((skillId: string) => {
        if (!battleState) return;

        const newState = { ...battleState };
        const isP1Active = newState.activePlayerId === newState.p1.id;
        const active = isP1Active ? newState.p1 : newState.p2;
        const passive = isP1Active ? newState.p1 : newState.p2; // Corrected reference? No wait.
        // active is P1 -> passive is P2
        const opponent = isP1Active ? newState.p2 : newState.p1;

        if (skillId === 'basic_attack') {
            processBasicAttack(active, opponent, (msg) => newState.log.push(msg));
        } else {
            // Process Selected Skill
            const skill = active.config.skills.find(s => s.id === skillId);
            if (skill) {
                processSkill(skill, active, opponent, (msg) => newState.log.push(msg));
            } else {
                // Fallback
                processBasicAttack(active, opponent, (msg) => newState.log.push(msg));
            }
        }

        // 2. Check Death
        if (opponent.currentHp <= 0) {
            newState.winnerId = active.id;
            newState.phase = 'FINISHED';
            newState.log.push(`${active.config.name} 获胜！`);
            setBattleState(newState);
            return;
        }

        // 3. End Turn cleanup
        newState.turn += 1;
        newState.activePlayerId = opponent.id; // Swap turn
        
        // 4. Start Turn Trigger (Mana Regen) for the NEW active player
        const nextActive = newState.activePlayerId === newState.p1.id ? newState.p1 : newState.p2;
        const nextPassive = newState.activePlayerId === newState.p1.id ? newState.p2 : newState.p1;

        const manaRegen = getTotalStat(nextActive, StatType.MANA_REGEN);
        nextActive.currentMana = Math.min(getTotalStat(nextActive, StatType.MANA), nextActive.currentMana + manaRegen);

        // 5. Process Passives for the NEW active player
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
             newState.log.push(`${nextActive.config.name} 获胜！`);
             setBattleState(newState);
             return;
        }

        newState.phase = 'ACTION_SELECTION';
        newState.timeLeft = 60;
        setBattleState(newState);
        setSelectedSkillIndex(0); // Reset selection for next turn
    }, [battleState]);

    const handleSurrender = () => {
        if (!battleState) return;
        const newState = { ...battleState };
        const enemyId = newState.p1.id === playerId ? newState.p2.id : newState.p1.id;
        newState.winnerId = enemyId;
        newState.phase = 'FINISHED';
        newState.log.push(`${myChar?.name || '玩家'} 认输了。`);
        setBattleState(newState);
    };

    // Battle Timer
    useEffect(() => {
        if (mode !== 'BATTLE' || !battleState || battleState.phase !== 'ACTION_SELECTION') return;
        
        const timer = setInterval(() => {
            setBattleState(prev => {
                if (!prev || prev.phase !== 'ACTION_SELECTION') return prev;
                
                if (prev.timeLeft <= 1) {
                     return { ...prev, timeLeft: 0 };
                }
                return { ...prev, timeLeft: prev.timeLeft - 1 };
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [mode, battleState?.phase]);

    // Watch for timeout to execute turn
    useEffect(() => {
        if (battleState && battleState.timeLeft === 0 && battleState.phase === 'ACTION_SELECTION' && !battleState.winnerId) {
            executeTurn('basic_attack');
        }
    }, [battleState?.timeLeft, executeTurn, battleState?.phase, battleState?.winnerId, battleState]);

    // Bot Logic
    useEffect(() => {
        if (battleState && battleState.phase === 'ACTION_SELECTION' && battleState.activePlayerId === 'enemy' && !battleState.winnerId) {
            const enemy = battleState.p1.id === 'enemy' ? battleState.p1 : battleState.p2;
            const timer = setTimeout(() => {
                const skills = enemy.config.skills.filter(s => !s.isPassive);
                const affordable = skills.filter(s => calculateManaCost(s) <= enemy.currentMana);
                const useBasic = Math.random() < 0.2 || affordable.length === 0;

                if (useBasic) {
                    executeTurn('basic_attack');
                } else {
                    const chosen = affordable[Math.floor(Math.random() * affordable.length)];
                    executeTurn(chosen ? chosen.id : 'basic_attack');
                }
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [battleState, executeTurn]);

    // -- Keyboard Input for Battle --
    useEffect(() => {
        if (mode !== 'BATTLE' || !battleState || battleState.phase !== 'ACTION_SELECTION') return;
        if (battleState.activePlayerId !== playerId) return;

        const activeEntity = battleState.p1.id === playerId ? battleState.p1 : battleState.p2;
        const customSkills = activeEntity.config.skills.filter(s => !s.isPassive);
        const allSkills = [
            ...customSkills,
            { id: 'basic_attack', name: '普通攻击', isPassive: false, conditions: [], effects: [] } as Skill
        ];
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') {
                setSelectedSkillIndex(prev => (prev + 1) % allSkills.length);
            } else if (e.key === 'ArrowLeft') {
                setSelectedSkillIndex(prev => (prev - 1 + allSkills.length) % allSkills.length);
            } else if (e.key === 'Enter') {
                executeTurn(allSkills[selectedSkillIndex % allSkills.length].id);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mode, battleState, playerId, selectedSkillIndex, executeTurn]);

    const getSkillDescription = (skill: Skill) => {
        if (skill.id === 'basic_attack') {
            return "【基础动作】造成等于当前攻击力的物理伤害。计算护甲穿透与吸血。";
        }
        if (skill.effects.length === 0) return "该模块为空，无任何效果。";
        return skill.effects.map(e => {
            const formatTarget = (t: string) => t === 'SELF' ? '己方' : '敌方';
            const actionMap: Record<string, string> = {
                'DAMAGE_PHYSICAL': '物理伤害',
                'DAMAGE_MAGIC': '魔法伤害',
                'HEAL': '治疗',
                'GAIN_MANA': '法力回复'
            };
            const fa = e.formula.factorA;
            const fb = e.formula.factorB;
            return `对${formatTarget(e.target)}造成 ${actionMap[e.type]} = ${formatTarget(fa.target)}.${fa.stat} ${e.formula.operator} ${formatTarget(fb.target)}.${fb.stat}`;
        }).join(' | ');
    };

    // -- Render --

    return (
        <div className="h-screen w-screen bg-slate-950 text-slate-200 flex flex-col">
            {mode === 'MENU' && (
                <div className="flex flex-col items-center justify-center h-full gap-8">
                    <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600 retro-font mb-8">
                        CODE WARRIORS
                    </h1>
                    
                    <div className="grid grid-cols-2 gap-4 w-96">
                        <button onClick={() => setMode('EDITOR')} className="flex flex-col items-center p-6 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-all group">
                            <div className="w-16 h-16 rounded-full bg-blue-900/30 flex items-center justify-center mb-4 group-hover:bg-blue-900/50 transition-colors">
                                <Edit size={32} className="text-blue-400" />
                            </div>
                            <span className="font-bold text-lg">编辑角色</span>
                            <span className="text-xs text-slate-500 mt-1">{myChar ? myChar.name : '未选择'}</span>
                        </button>

                        <button onClick={handleImport} className="flex flex-col items-center p-6 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-600 transition-all group">
                            <div className="w-16 h-16 rounded-full bg-green-900/30 flex items-center justify-center mb-4 group-hover:bg-green-900/50 transition-colors">
                                <Upload size={32} className="text-green-400" />
                            </div>
                            <span className="font-bold text-lg">导入配置</span>
                        </button>
                    </div>

                    {myChar && (
                        <button 
                            onClick={() => {
                                const dummy = JSON.parse(JSON.stringify(myChar));
                                dummy.name = "训练机器人";
                                dummy.id = "enemy";
                                initBattle(dummy);
                            }}
                            className="flex items-center gap-4 px-12 py-4 bg-red-600 hover:bg-red-500 rounded-full font-bold text-xl shadow-lg shadow-red-900/20 hover:scale-105 transition-all"
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
                    <div className="flex-1 relative bg-slate-900 flex flex-col items-center justify-center p-8 overflow-hidden">
                        <div className="absolute top-4 text-2xl font-bold retro-font text-yellow-400 drop-shadow-md z-10">
                            ROUND {battleState.turn}
                        </div>
                        
                        {/* Top Right Surrender Button */}
                        <div className="absolute top-4 right-4 z-20">
                            <button 
                                onClick={handleSurrender}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-950/80 backdrop-blur hover:bg-red-900/50 border border-slate-700 hover:border-red-500 rounded-full text-slate-400 hover:text-red-400 transition-all text-sm font-bold"
                            >
                                <Flag size={16} /> 认输
                            </button>
                        </div>

                        <BattleScene gameState={battleState} />
                        
                        {/* HUD */}
                        <div className="w-[800px] mt-6 flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm">
                            {/* P1 Status */}
                            <div className={`flex gap-3 items-center transition-opacity duration-300 ${battleState.activePlayerId === battleState.p1.id ? 'opacity-100' : 'opacity-50 grayscale'}`}>
                                <div className="w-12 h-12 rounded-lg bg-blue-600 shadow-lg border border-blue-400"></div>
                                <div>
                                    <div className="font-bold text-blue-100">{battleState.p1.config.name}</div>
                                    <div className="flex gap-3 text-xs font-mono">
                                        <span className="text-red-400">HP: {Math.floor(battleState.p1.currentHp)}</span>
                                        <span className="text-blue-400">MP: {Math.floor(battleState.p1.currentMana)}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex flex-col items-center">
                                <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Timer</div>
                                <div className={`text-2xl font-mono font-bold px-4 py-1 rounded border ${battleState.timeLeft < 10 ? 'text-red-500 border-red-900 bg-red-950' : 'text-white border-slate-700 bg-slate-800'}`}>
                                    {battleState.phase === 'ACTION_SELECTION' ? battleState.timeLeft : '--'}
                                </div>
                            </div>

                            {/* P2 Status */}
                            <div className={`flex gap-3 items-center text-right transition-opacity duration-300 ${battleState.activePlayerId === battleState.p2.id ? 'opacity-100' : 'opacity-50 grayscale'}`}>
                                <div>
                                    <div className="font-bold text-red-100">{battleState.p2.config.name}</div>
                                    <div className="flex gap-3 text-xs font-mono justify-end">
                                        <span className="text-red-400">HP: {Math.floor(battleState.p2.currentHp)}</span>
                                        <span className="text-blue-400">MP: {Math.floor(battleState.p2.currentMana)}</span>
                                    </div>
                                </div>
                                <div className="w-12 h-12 rounded-lg bg-red-600 shadow-lg border border-red-400"></div>
                            </div>
                        </div>

                        {/* Controls - Separated UI */}
                        {battleState.activePlayerId === playerId && battleState.phase === 'ACTION_SELECTION' && (
                            <div className="mt-8 w-full max-w-4xl flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
                                
                                {/* Skill Bar (Icons) */}
                                <div className="flex justify-center items-center gap-4">
                                    {(() => {
                                        const activeEntity = battleState.p1.id === playerId ? battleState.p1 : battleState.p2;
                                        const customSkills = activeEntity.config.skills.filter(s => !s.isPassive);
                                        const allSkills = [
                                            ...customSkills,
                                            { id: 'basic_attack', name: '普通攻击', isPassive: false, conditions: [], effects: [] } as Skill
                                        ];
                                        
                                        return allSkills.map((skill, idx) => {
                                            const isSelected = idx === (selectedSkillIndex % allSkills.length);
                                            const cost = skill.id === 'basic_attack' ? 0 : calculateManaCost(skill);
                                            const canAfford = activeEntity.currentMana >= cost;
                                            const isAttack = skill.id === 'basic_attack';

                                            return (
                                                <div 
                                                    key={skill.id} 
                                                    className={`
                                                        relative w-24 h-24 rounded-xl border-2 flex flex-col items-center justify-between p-2 transition-all duration-200
                                                        ${isSelected ? 'scale-110 z-10 shadow-[0_0_20px_rgba(59,130,246,0.4)]' : 'scale-95 opacity-60 grayscale'}
                                                        ${isSelected ? (canAfford ? 'bg-slate-800 border-blue-400' : 'bg-red-950 border-red-500') : 'bg-slate-900 border-slate-700'}
                                                    `}
                                                >
                                                    {/* Cost Bubble */}
                                                    <div className={`absolute -top-2 -right-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${canAfford ? 'bg-blue-900 border-blue-500 text-blue-200' : 'bg-red-900 border-red-500 text-white'}`}>
                                                        {cost} MP
                                                    </div>

                                                    {/* Icon */}
                                                    <div className={`flex-1 flex items-center justify-center ${canAfford ? (isAttack ? 'text-yellow-400' : 'text-purple-400') : 'text-red-500'}`}>
                                                        {isAttack ? <Swords size={32} /> : <Zap size={32} />}
                                                    </div>

                                                    {/* Name */}
                                                    <div className="w-full text-center text-[10px] font-bold truncate text-slate-300">
                                                        {skill.name}
                                                    </div>

                                                    {/* Selection Indicator */}
                                                    {isSelected && (
                                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-blue-400"></div>
                                                    )}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>

                                {/* Description Panel */}
                                <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-6 flex flex-col items-center text-center shadow-2xl max-w-2xl mx-auto w-full min-h-[120px] relative">
                                    {/* Keyboard Hints */}
                                    <div className="absolute top-4 left-4 flex gap-1">
                                        <div className="w-6 h-6 rounded bg-slate-800 border border-slate-600 flex items-center justify-center text-xs text-slate-400"><ArrowLeft size={12}/></div>
                                        <div className="w-6 h-6 rounded bg-slate-800 border border-slate-600 flex items-center justify-center text-xs text-slate-400"><ArrowRight size={12}/></div>
                                        <span className="text-xs text-slate-600 ml-2 self-center">选择</span>
                                    </div>
                                    <div className="absolute top-4 right-4 flex gap-2 items-center">
                                        <span className="text-xs text-slate-600 self-center">确认</span>
                                        <div className="px-2 h-6 rounded bg-slate-800 border border-slate-600 flex items-center justify-center text-xs text-slate-400 font-mono">ENTER</div>
                                        <CornerDownLeft size={14} className="text-slate-500"/>
                                    </div>

                                    {/* Content */}
                                    <div className="mt-2">
                                        {(() => {
                                             const activeEntity = battleState.p1.id === playerId ? battleState.p1 : battleState.p2;
                                             const customSkills = activeEntity.config.skills.filter(s => !s.isPassive);
                                             const allSkills = [...customSkills, { id: 'basic_attack', name: '普通攻击', isPassive: false, conditions: [], effects: [] } as Skill];
                                             const selectedSkill = allSkills[selectedSkillIndex % allSkills.length];
                                             
                                             return (
                                                 <>
                                                    <h4 className="text-xl font-bold text-white mb-2">{selectedSkill.name}</h4>
                                                    <p className="text-slate-400 font-mono text-sm leading-relaxed max-w-lg">
                                                        {getSkillDescription(selectedSkill)}
                                                    </p>
                                                 </>
                                             )
                                        })()}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {battleState.winnerId && (
                            <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in duration-1000">
                                <div className="text-center transform scale-110">
                                    <h2 className={`text-6xl font-bold mb-6 retro-font ${battleState.winnerId === playerId ? 'text-yellow-400' : 'text-red-500'}`}>
                                        {battleState.winnerId === playerId ? 'VICTORY' : 'DEFEAT'}
                                    </h2>
                                    <button 
                                        onClick={() => setMode('MENU')} 
                                        className="bg-white text-slate-900 px-8 py-3 rounded-full font-bold hover:bg-blue-50 hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                                    >
                                        返回主菜单
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Battle Log */}
                    <div className="w-80 bg-slate-950 border-l border-slate-800 p-0 flex flex-col shadow-xl z-20">
                        <div className="p-4 border-b border-slate-800 bg-slate-900">
                            <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                系统日志
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs custom-scrollbar bg-slate-950">
                            {battleState.log.map((entry, i) => (
                                <div key={i} className="border-l-2 border-slate-800 pl-3 py-1 text-slate-400 hover:border-blue-500 hover:text-slate-200 transition-colors">
                                    <span className="opacity-30 mr-2">[{String(i+1).padStart(2, '0')}]</span>
                                    {entry}
                                </div>
                            ))}
                            <div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })}></div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;