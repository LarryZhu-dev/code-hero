
import React, { useState, useEffect, useCallback, useRef } from 'react';
import CharacterEditor from './components/CharacterEditor';
import CharacterList from './components/CharacterList';
import BattleScene from './components/BattleScene';
import { CharacterConfig, BattleState, BattleEntity, StatType, Skill, BattleMode, BattleEvent } from './types';
import { processSkill, checkConditions, getTotalStat, calculateManaCost, processBasicAttack } from './utils/gameEngine';
import { StorageService } from './services/storage';
import { net } from './services/mqtt';
import { Swords, Edit, Users, ArrowLeft, ArrowRight, CornerDownLeft, Flag, Zap, Cpu, Globe, CheckCircle2, PlayCircle, Loader2 } from 'lucide-react';

type AppView = 'MENU' | 'HERO_LIST' | 'EDITOR' | 'BATTLE_SETUP' | 'LOBBY' | 'BATTLE';

const App: React.FC = () => {
    const [view, setView] = useState<AppView>('MENU');
    const [myChar, setMyChar] = useState<CharacterConfig | null>(null);
    const [battleState, setBattleState] = useState<BattleState | null>(null);
    const [playerId] = useState(net.playerId); 
    const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
    
    // Lobby State
    const [roomId, setRoomId] = useState('');
    const [lobbyLog, setLobbyLog] = useState<string[]>([]);
    const [isHost, setIsHost] = useState(false);
    const [opponentChar, setOpponentChar] = useState<CharacterConfig | null>(null);
    const [opponentReady, setOpponentReady] = useState(false);
    const [amIReady, setAmIReady] = useState(false);
    
    const joinTimeRef = useRef<number>(0);

    // -- Character Management --
    
    const handleSaveChar = (char: CharacterConfig) => {
        StorageService.save(char);
        setMyChar(char);
        setView('HERO_LIST');
    };

    const startBattleSetup = (char: CharacterConfig) => {
        setMyChar(char);
        setView('BATTLE_SETUP');
    };

    // -- Battle Initialization --

    const startLocalBotBattle = () => {
        if (!myChar) return;
        const dummy: CharacterConfig = JSON.parse(JSON.stringify(myChar));
        dummy.id = 'bot_enemy';
        dummy.name = "训练机器人";
        dummy.avatarColor = '#64748b';
        // Give bot some basic AI stats
        dummy.stats.base[StatType.SPEED] = 100;
        
        initBattle(myChar, dummy, 'LOCAL_BOT', true);
    };

    const startOnlineLobby = () => {
        if (!roomId) {
            alert("请输入房间号");
            return;
        }
        
        // Reset Lobby State
        setLobbyLog(['正在连接服务器...', '等待其他玩家加入...']);
        setIsHost(false);
        setOpponentChar(null);
        setOpponentReady(false);
        setAmIReady(false);
        joinTimeRef.current = Date.now();
        setView('LOBBY');
        
        net.connect(roomId, (action, data) => {
            const timeInLobby = Date.now() - joinTimeRef.current;

            if (action === 'join') {
                setLobbyLog(prev => [...prev, `玩家 ${data.id.slice(0,4)} 连接了`]);
                
                // Determine Host: 
                // If I have been here > 1s, I am Host.
                // If distinct arrival time is small (race condition), use ID comparison.
                let iAmHost = false;
                if (timeInLobby > 1000) {
                    iAmHost = true;
                } else {
                    // Tie-breaker
                    iAmHost = playerId < data.id;
                }

                if (iAmHost) {
                    setIsHost(true);
                    setLobbyLog(prev => [...prev, '我是房主，正在发送握手信息...']);
                    if (myChar) net.sendHandshake(myChar, true);
                }
            } 
            else if (action === 'handshake') {
                const enemyChar = data.char;
                const enemyIsHost = data.isHost;
                
                setOpponentChar(enemyChar);
                setLobbyLog(prev => [...prev, `对手 [${enemyChar.name}] 已加入!`]);

                // If I received a handshake marked from Host, I am Guest.
                // If I am Guest, I must send my info back if I haven't already.
                if (enemyIsHost) {
                    setIsHost(false);
                    if (myChar) net.sendHandshake(myChar, false);
                }
            }
            else if (action === 'ready') {
                setOpponentReady(data.ready);
                setLobbyLog(prev => [...prev, `对手 ${data.ready ? '已准备' : '取消准备'}`]);
            }
            else if (action === 'leave') {
                setOpponentChar(null);
                setOpponentReady(false);
                setLobbyLog(prev => [...prev, '对手断开了连接']);
                // If opponent leaves, I become host by default if someone else joins? 
                // For now just keep current state but reset opponent.
                setIsHost(true); 
            }
            else if (action === 'sync_state') {
                setBattleState(data.state);
                if (view !== 'BATTLE') setView('BATTLE');
            }
        });
    };

    const handleToggleReady = () => {
        const newState = !amIReady;
        setAmIReady(newState);
        net.sendReady(newState);
    };

    const handleHostStartGame = () => {
        if (!myChar || !opponentChar) return;
        initBattle(myChar, opponentChar, 'ONLINE_PVP', true);
    };

    const initBattle = (p1Config: CharacterConfig, p2Config: CharacterConfig, mode: BattleMode, isP1Me: boolean) => {
        const p1Speed = getTotalStat({ config: p1Config } as any, StatType.SPEED);
        const p2Speed = getTotalStat({ config: p2Config } as any, StatType.SPEED);
        const p1First = p1Speed >= p2Speed;

        const entity1: BattleEntity = { 
            id: isP1Me ? playerId : 'enemy',
            config: p1Config, 
            currentHp: getTotalStat({ config: p1Config } as any, StatType.HP),
            currentMana: getTotalStat({ config: p1Config } as any, StatType.MANA),
            buffs: [] 
        };
        const entity2: BattleEntity = { 
            id: isP1Me ? (mode === 'LOCAL_BOT' ? 'bot_enemy' : 'enemy') : playerId,
            config: p2Config, 
            currentHp: getTotalStat({ config: p2Config } as any, StatType.HP),
            currentMana: getTotalStat({ config: p2Config } as any, StatType.MANA),
            buffs: [] 
        };
        
        let realP1 = entity1;
        let realP2 = entity2;
        
        if (mode === 'ONLINE_PVP') {
            // If I am Host, I am Entity1 (assuming p1Config is mine)
            // But wait, p1Config is passed as myChar, p2Config as opponentChar.
            // ID Assignment:
            // If isHost: I am ID 'host_id' (playerId). Opponent is 'opponent_id'.
            // The BattleState needs consistent IDs.
            // Let's use real player IDs if possible, or simplified ones.
            // Since `net.playerId` is consistent for me.
            
            if (isHost) {
                realP1 = { ...entity1, id: playerId };
                realP2 = { ...entity2, id: 'opponent' }; // Map opponent to generic ID for state, or use logic
                // Actually better to use valid IDs so 'join' logic works? 
                // For simplicity in sync, let's keep it simple.
                // NOTE: The `executeTurn` checks `activePlayerId === playerId`.
                // So my entity MUST have `id === playerId`.
                
                // Host P1 (Me) vs Guest P2.
                // If I am Host: P1 ID = my ID. P2 ID = Opponent ID (I don't know it? I do from handshake join data but I didn't store it in `opponentChar`).
                // Let's just use 'opponent' for the remote player in state. 
                // The remote player will map 'opponent' to themselves? No, they need to know their ID.
                
                // Let's just use the logic:
                // State contains P1 and P2.
                // P1 is Host. P2 is Guest.
                // If I am Host: My ID matches P1.id.
                // If I am Guest: My ID matches P2.id.
                
                // Re-setup for Online:
                realP1 = { ...entity1, id: playerId }; // Host ID
                realP2 = { ...entity2, id: 'guest_player' }; // Guest ID placeholder
            } else {
                // This initBattle is only called by Host in ONLINE_PVP
                // So this branch is only for Host.
            }
        }

        const initialState: BattleState = {
            turn: 1,
            log: ['战斗开始！', `${p1First ? p1Config.name : p2Config.name} 速度更快，获得先手！`],
            p1: p1First ? realP1 : realP2,
            p2: p1First ? realP2 : realP1,
            activePlayerId: p1First ? realP1.id : realP2.id,
            phase: 'ACTION_SELECTION',
            timeLeft: 60,
            mode: mode,
            roomId: roomId,
            events: []
        };

        setBattleState(initialState);
        setView('BATTLE');
        setSelectedSkillIndex(0);
        
        if (mode === 'ONLINE_PVP' && isHost) {
            net.sendState(initialState);
        }
    };

    // -- Core Turn Execution --

    const executeTurn = useCallback((skillId: string) => {
        if (!battleState) return;
        
        // ONLINE PVP ID MAPPING FIX
        // In Local, IDs are 'playerID' and 'bot_enemy'.
        // In Online, Host creates state: HostID vs 'guest_player'.
        // Guest receives state. Guest sees HostID vs 'guest_player'.
        // Guest needs to know they are 'guest_player'.
        // BUT `playerId` is random string.
        
        // Fix: In `startOnlineLobby`, Guest receives `sync_state`.
        // Guest checks which entity is NOT Host. That is them.
        // OR simpler: Host uses 'host' and 'guest' as IDs?
        // No, local `playerId` check is used for controls.
        
        // Let's patch `activePlayerId` check:
        // If Online:
        //   If Host: I am P1 (usually). My ID is `playerId`. Opponent is 'guest_player'.
        //   If Guest: I am 'guest_player'. Opponent is HostID.
        //   Wait, Guest needs to identify as 'guest_player'.
        //   Guest `playerId` variable is distinct.
        
        // WORKAROUND: When Host starts game, they send state with IDs.
        // Guest receives state. Guest must map 'guest_player' to their `playerId` locally?
        // Or simpler: Host uses `opponentId` from MQTT `join` message.
        // I didn't store opponentId in `opponentChar`.
        
        // QUICK FIX for MVP: 
        // When Online, we don't check `activePlayerId === playerId` strictly.
        // We check `activePlayerId === myEntityId`.
        // How do I know my Entity ID? 
        // If I created the game (Host), I set P1.id = myId, P2.id = 'guest_player'.
        // Guest receives state. Guest logic: "I am the one that is NOT the host ID?"
        // OR: Host just uses a fixed ID 'host' and 'guest' for online?
        
        let isMyTurn = false;
        if (battleState.mode === 'ONLINE_PVP') {
             // Basic ID check
             if (battleState.activePlayerId === playerId) isMyTurn = true;
             // If I am guest and the active ID is 'guest_player', it is my turn
             if (!isHost && battleState.activePlayerId === 'guest_player') isMyTurn = true;
        } else {
             isMyTurn = battleState.activePlayerId === playerId;
        }

        if (battleState.mode === 'ONLINE_PVP' && !isMyTurn) return;

        const newState = { ...battleState };
        const isP1Active = newState.activePlayerId === newState.p1.id;
        const active = isP1Active ? newState.p1 : newState.p2;
        const opponent = isP1Active ? newState.p2 : newState.p1;
        
        // Reset events queue for this turn
        newState.events = [];
        const pushEvent = (evt: BattleEvent) => newState.events.push(evt);

        // 1. MANA CHECK
        if (skillId !== 'basic_attack') {
            const skill = active.config.skills.find(s => s.id === skillId);
            if (skill) {
                const cost = calculateManaCost(skill, active.config.stats);
                if (active.currentMana < cost) {
                    if (isMyTurn) alert("法力值不足！");
                    return; 
                }
            }
        }

        newState.log.push(`\n--- 第 ${newState.turn} 回合 ---`);

        // 2. MAIN ACTION PROCESSING
        if (skillId === 'basic_attack') {
            processBasicAttack(active, opponent, pushEvent);
        } else {
            const skill = active.config.skills.find(s => s.id === skillId);
            if (skill) {
                const success = processSkill(skill, active, opponent, pushEvent);
                if (!success) return; 
            } else {
                processBasicAttack(active, opponent, pushEvent);
            }
        }

        // 3. PASSIVE & REACTION PHASE
        const entities = [active, opponent];
        let passiveTriggered = true;
        let loops = 0;

        while (passiveTriggered && loops < 5) {
            passiveTriggered = false;
            entities.forEach(entity => {
                const enemyOfEntity = entity.id === active.id ? opponent : active;
                entity.config.skills.filter(s => s.isPassive).forEach(s => {
                    if (checkConditions(s, entity, enemyOfEntity, newState.turn)) {
                        const cost = calculateManaCost(s, entity.config.stats);
                        if (entity.currentMana >= cost) {
                             // Use a wrapper to capture events from passives
                             const success = processSkill(s, entity, enemyOfEntity, pushEvent);
                             if (success) {
                                 passiveTriggered = true;
                                 pushEvent({ type: 'TEXT', text: `[被动] ${entity.config.name} 触发 ${s.name}`});
                             }
                        }
                    }
                });
            });
            loops++;
        }

        // Set Phase to Executing so BattleScene plays animations
        newState.phase = 'EXECUTING';
        
        // Convert events to log strings for history
        newState.events.forEach(evt => {
            if (evt.text) newState.log.push(evt.text);
        });

        setBattleState(newState);
        if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
        
        setSelectedSkillIndex(0); 

    }, [battleState, playerId, isHost]);

    // Called by BattleScene when animations finish
    const handleAnimationComplete = useCallback(() => {
        if (!battleState) return;
        
        // Only Host calculates state transitions to avoid desync
        // Guests just wait for sync_state
        if (battleState.mode === 'ONLINE_PVP' && !isHost) return;

        const newState = { ...battleState };
        const isP1Active = newState.activePlayerId === newState.p1.id;
        const active = isP1Active ? newState.p1 : newState.p2;
        const opponent = isP1Active ? newState.p2 : newState.p1;

        // 4. CHECK DEATH
        if (opponent.currentHp <= 0) {
            newState.winnerId = active.id;
            newState.phase = 'FINISHED';
            newState.log.push(`${active.config.name} 获胜！`);
            setBattleState(newState);
            if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
            return;
        }
        if (active.currentHp <= 0) {
            newState.winnerId = opponent.id;
            newState.phase = 'FINISHED';
            newState.log.push(`${opponent.config.name} 获胜！`);
            setBattleState(newState);
            if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
            return;
        }

        // 5. PREPARE NEXT TURN
        newState.turn += 1;
        newState.activePlayerId = opponent.id; 
        
        // Mana Regen
        const nextActive = newState.activePlayerId === newState.p1.id ? newState.p1 : newState.p2;
        const manaRegen = getTotalStat(nextActive, StatType.MANA_REGEN);
        if (manaRegen > 0) {
            nextActive.currentMana = Math.min(getTotalStat(nextActive, StatType.MANA), nextActive.currentMana + (getTotalStat(nextActive, StatType.MANA) * manaRegen / 100));
        }

        newState.phase = 'ACTION_SELECTION';
        newState.timeLeft = 60;
        newState.events = []; // Clear executed events
        
        setBattleState(newState);
        if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
        
    }, [battleState, isHost]);

    // -- Side Effects --

    const handleSurrender = () => {
        if (!battleState) return;
        const newState = { ...battleState };
        // Surrender Logic: If I am P1, winner is P2.
        // Need to correctly identify myself.
        let myEntityId = playerId;
        if (battleState.mode === 'ONLINE_PVP' && !isHost) myEntityId = 'guest_player';

        const isP1Me = newState.p1.id === myEntityId;
        const enemyId = isP1Me ? newState.p2.id : newState.p1.id;
        
        newState.winnerId = enemyId;
        newState.phase = 'FINISHED';
        newState.log.push(`${myChar?.name || '玩家'} 认输了。`);
        setBattleState(newState);
        if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
    };

    // Timer
    useEffect(() => {
        if (view !== 'BATTLE' || !battleState || battleState.phase !== 'ACTION_SELECTION' || battleState.winnerId) return;
        
        // Only Host runs timer in Online
        if (battleState.mode === 'ONLINE_PVP' && !isHost) return;

        const timer = setInterval(() => {
            setBattleState(prev => {
                if (!prev || prev.phase !== 'ACTION_SELECTION') return prev;
                if (prev.timeLeft <= 1) return { ...prev, timeLeft: 0 };
                const updated = { ...prev, timeLeft: prev.timeLeft - 1 };
                // Optimization: Host doesn't need to sync every second, 
                // but for a smooth timer on Guest, we might want to? 
                // Or just let Guest timer drift and sync on turn change.
                // For this MVP, let's sync occasionally or rely on local decrement if needed.
                // Actually, if we don't sync, Guest timer won't move unless we impl local timer.
                return updated;
            });
        }, 1000);

        // Sync timer every 5s if Host
        const syncTimer = setInterval(() => {
             if (battleState.mode === 'ONLINE_PVP' && isHost) {
                 net.sendState(battleState);
             }
        }, 2000);

        return () => {
            clearInterval(timer);
            clearInterval(syncTimer);
        };
    }, [view, battleState?.phase, battleState?.winnerId, isHost, battleState?.mode]);

    // Timeout Action
    useEffect(() => {
        if (battleState && battleState.timeLeft === 0 && battleState.phase === 'ACTION_SELECTION' && !battleState.winnerId) {
            // Only Host enforces timeout actions for simplicity
            if (battleState.mode === 'ONLINE_PVP' && !isHost) return;
            executeTurn('basic_attack');
        }
    }, [battleState?.timeLeft, executeTurn, battleState?.phase, battleState?.winnerId, battleState?.mode, isHost]);

    // Bot Logic
    useEffect(() => {
        if (!battleState) return;
        
        const { mode, phase, activePlayerId, winnerId } = battleState;

        if (mode === 'LOCAL_BOT' && phase === 'ACTION_SELECTION' && activePlayerId === 'bot_enemy' && !winnerId) {
            
            const enemy = battleState.p1.id === 'bot_enemy' ? battleState.p1 : battleState.p2;
            
            // Bot needs delay to simulate thinking, BUT executes in ACTION_SELECTION
            const timer = setTimeout(() => {
                const skills = enemy.config.skills.filter(s => !s.isPassive);
                const affordable = skills.filter(s => calculateManaCost(s, enemy.config.stats) <= enemy.currentMana);
                
                const useSkill = affordable.length > 0 && Math.random() < 0.7;

                if (useSkill) {
                    const chosen = affordable[Math.floor(Math.random() * affordable.length)];
                    executeTurn(chosen.id);
                } else {
                    executeTurn('basic_attack');
                }
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [battleState?.turn, battleState?.phase, battleState?.activePlayerId, battleState?.mode, battleState?.winnerId, executeTurn]);

    // Keyboard Input
    useEffect(() => {
        if (view !== 'BATTLE' || !battleState || battleState.phase !== 'ACTION_SELECTION') return;
        
        let isMyTurn = false;
        if (battleState.mode === 'ONLINE_PVP') {
             if (battleState.activePlayerId === playerId) isMyTurn = true;
             if (!isHost && battleState.activePlayerId === 'guest_player') isMyTurn = true;
        } else {
             isMyTurn = battleState.activePlayerId === playerId;
        }
        
        if (!isMyTurn) return;

        const activeEntity = battleState.p1.id === battleState.activePlayerId ? battleState.p1 : battleState.p2;
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
    }, [view, battleState, playerId, selectedSkillIndex, executeTurn, isHost]);

    // Helper for Description
    const getSkillDescription = (skill: Skill, stats?: CharacterConfig['stats']) => {
        if (skill.id === 'basic_attack') {
            return "【基础动作】造成等于当前攻击力的物理伤害。计算护甲穿透与吸血。无消耗。";
        }
        const cost = stats ? calculateManaCost(skill, stats) : 0;
        let desc = `【消耗 ${cost} MP】`;
        if (skill.effects.length === 0) return desc + " 该模块为空，无任何效果。";
        
        const effectsDesc = skill.effects.map(e => {
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
        return desc + effectsDesc;
    };

    return (
        <div className="h-screen w-screen bg-slate-950 text-slate-200 flex flex-col overflow-hidden">
            {/* Top Bar */}
            <div className="h-12 border-b border-slate-800 bg-slate-900/50 flex items-center px-6 justify-between select-none z-50">
                <span className="retro-font text-blue-400 text-sm cursor-pointer" onClick={() => setView('MENU')}>CODE WARRIORS</span>
                <div className="text-xs text-slate-600 font-mono">ID: {playerId.slice(0, 6)}</div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden relative">
                
                {view === 'MENU' && (
                    <div className="flex flex-col items-center justify-center h-full gap-12 animate-in fade-in zoom-in duration-500">
                        <h1 className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 retro-font drop-shadow-2xl">
                            CODE WARRIORS
                        </h1>
                        
                        <div className="flex gap-6">
                            <button 
                                onClick={() => setView('HERO_LIST')} 
                                className="group relative w-64 h-40 bg-slate-800 rounded-2xl border border-slate-700 hover:border-blue-500 transition-all overflow-hidden flex flex-col items-center justify-center gap-4 shadow-2xl hover:-translate-y-2"
                            >
                                <div className="absolute inset-0 bg-blue-900/20 scale-0 group-hover:scale-100 transition-transform rounded-full blur-3xl"></div>
                                <Users size={48} className="text-blue-400 relative z-10" />
                                <span className="text-xl font-bold relative z-10">英雄名册</span>
                                <span className="text-xs text-slate-500 relative z-10">创建 & 管理</span>
                            </button>

                            <button 
                                onClick={() => setView('HERO_LIST')} 
                                className="group relative w-64 h-40 bg-slate-800 rounded-2xl border border-slate-700 hover:border-red-500 transition-all overflow-hidden flex flex-col items-center justify-center gap-4 shadow-2xl hover:-translate-y-2"
                            >
                                <div className="absolute inset-0 bg-red-900/20 scale-0 group-hover:scale-100 transition-transform rounded-full blur-3xl"></div>
                                <Swords size={48} className="text-red-400 relative z-10" />
                                <span className="text-xl font-bold relative z-10">开始战斗</span>
                                <span className="text-xs text-slate-500 relative z-10">单机 / 联机</span>
                            </button>
                        </div>
                    </div>
                )}

                {view === 'HERO_LIST' && (
                    <CharacterList 
                        onSelect={startBattleSetup}
                        onEdit={(char) => { setMyChar(char); setView('EDITOR'); }}
                        onBack={() => setView('MENU')}
                    />
                )}

                {view === 'EDITOR' && (
                    <CharacterEditor 
                        existing={myChar!} 
                        onSave={handleSaveChar} 
                    />
                )}

                {view === 'BATTLE_SETUP' && myChar && (
                     <div className="flex flex-col items-center justify-center h-full gap-8 animate-in fade-in slide-in-from-right duration-300">
                        <h2 className="text-3xl font-bold retro-font">选择战斗模式</h2>
                        
                        <div className="flex items-center gap-4 bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4">
                            <div className="w-12 h-12 rounded bg-blue-500" style={{backgroundColor: myChar.avatarColor}}></div>
                            <div>
                                <div className="text-xs text-slate-400">当前使用</div>
                                <div className="font-bold text-xl">{myChar.name}</div>
                            </div>
                            <button onClick={() => setView('HERO_LIST')} className="ml-4 text-xs bg-slate-700 px-2 py-1 rounded hover:bg-slate-600">更换</button>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                             <button onClick={startLocalBotBattle} className="w-64 p-6 bg-slate-800 hover:bg-emerald-900/30 border border-slate-600 hover:border-emerald-500 rounded-xl flex flex-col items-center gap-3 transition-all">
                                <Cpu size={40} className="text-emerald-400"/>
                                <span className="font-bold text-lg">人机训练</span>
                                <span className="text-xs text-slate-500">VS AI BOT (本地)</span>
                            </button>

                            <div className="w-64 p-6 bg-slate-800 border border-slate-600 rounded-xl flex flex-col items-center gap-4">
                                <Globe size={40} className="text-blue-400"/>
                                <span className="font-bold text-lg">在线对战</span>
                                <input 
                                    className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-center font-mono text-sm w-full outline-none focus:border-blue-500"
                                    placeholder="输入房间号 (如: 123)"
                                    value={roomId}
                                    onChange={e => setRoomId(e.target.value)}
                                />
                                <button 
                                    onClick={startOnlineLobby}
                                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded font-bold text-sm transition-colors"
                                >
                                    连接 Lobby
                                </button>
                            </div>
                        </div>
                        
                        <button onClick={() => setView('HERO_LIST')} className="mt-8 text-slate-500 hover:text-white">取消</button>
                     </div>
                )}

                {view === 'LOBBY' && myChar && (
                    <div className="flex flex-col items-center justify-center h-full gap-8 p-12">
                        <div className="absolute top-8 text-slate-500 font-mono text-xs">ROOM: {roomId}</div>
                        
                        <h2 className="text-3xl font-bold retro-font text-white mb-8">对战大厅</h2>

                        <div className="flex gap-12 items-center">
                            {/* My Card */}
                            <div className="flex flex-col items-center gap-4">
                                <div className={`relative w-48 h-64 bg-slate-800 rounded-xl border-2 flex flex-col items-center justify-center p-4 transition-all ${amIReady ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'border-slate-600'}`}>
                                    <div className="w-20 h-20 rounded-lg mb-4 shadow-lg" style={{backgroundColor: myChar.avatarColor}}></div>
                                    <h3 className="font-bold text-lg">{myChar.name}</h3>
                                    <span className="text-xs text-slate-400 mb-4">{isHost ? '房主' : '挑战者'}</span>
                                    
                                    <div className={`mt-auto flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${amIReady ? 'bg-green-900/50 text-green-400' : 'bg-slate-900/50 text-slate-500'}`}>
                                        {amIReady ? <CheckCircle2 size={12} /> : <div className="w-3 h-3 rounded-full border border-slate-500"></div>}
                                        {amIReady ? '已准备' : '未准备'}
                                    </div>
                                </div>
                                
                                {!isHost && (
                                    <button 
                                        onClick={handleToggleReady}
                                        className={`px-8 py-3 rounded-lg font-bold transition-all shadow-lg flex items-center gap-2 ${amIReady ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-green-600 text-white hover:bg-green-500'}`}
                                    >
                                        <CheckCircle2 size={18} /> {amIReady ? '取消准备' : '准备就绪'}
                                    </button>
                                )}
                                {isHost && (
                                    <div className="text-xs text-slate-500 italic py-3">
                                        房主默认就绪
                                    </div>
                                )}
                            </div>

                            <div className="text-4xl font-black text-slate-700 italic">VS</div>

                            {/* Opponent Card */}
                            <div className="flex flex-col items-center gap-4">
                                {opponentChar ? (
                                    <div className={`relative w-48 h-64 bg-slate-800 rounded-xl border-2 flex flex-col items-center justify-center p-4 transition-all ${opponentReady ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'border-slate-600'}`}>
                                        <div className="w-20 h-20 rounded-lg mb-4 shadow-lg" style={{backgroundColor: opponentChar.avatarColor}}></div>
                                        <h3 className="font-bold text-lg">{opponentChar.name}</h3>
                                        <span className="text-xs text-slate-400 mb-4">{!isHost ? '房主' : '挑战者'}</span>
                                        
                                        <div className={`mt-auto flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${opponentReady ? 'bg-green-900/50 text-green-400' : 'bg-slate-900/50 text-slate-500'}`}>
                                            {opponentReady ? <CheckCircle2 size={12} /> : <div className="w-3 h-3 rounded-full border border-slate-500"></div>}
                                            {opponentReady ? '已准备' : '未准备'}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-48 h-64 bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center p-4 text-slate-600 gap-4 animate-pulse">
                                        <Loader2 size={32} className="animate-spin" />
                                        <span className="text-sm">等待玩家加入...</span>
                                    </div>
                                )}
                                
                                {isHost && opponentChar ? (
                                    <button 
                                        onClick={handleHostStartGame}
                                        disabled={!opponentReady}
                                        className={`px-8 py-3 rounded-lg font-bold transition-all shadow-lg flex items-center gap-2 ${opponentReady ? 'bg-blue-600 text-white hover:bg-blue-500 hover:scale-105' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                                    >
                                        <PlayCircle size={18} /> 开始对战
                                    </button>
                                ) : (
                                    <div className="h-12"></div>
                                )}
                            </div>
                        </div>

                        {/* Log Window */}
                        <div className="w-[500px] h-32 bg-slate-900 rounded-lg border border-slate-800 p-4 overflow-y-auto custom-scrollbar font-mono text-xs text-slate-400">
                            {lobbyLog.map((log, i) => (
                                <div key={i} className="mb-1">{log}</div>
                            ))}
                        </div>

                         <button onClick={() => { net.disconnect(); setView('BATTLE_SETUP'); }} className="mt-4 text-sm text-red-400 hover:text-red-300 border border-red-900/50 px-4 py-2 rounded hover:bg-red-900/20">
                            离开大厅
                        </button>
                    </div>
                )}

                {view === 'BATTLE' && battleState && (
                    <div className="flex h-full">
                    {/* Battle Scene */}
                    <div className="flex-1 relative bg-slate-900 flex flex-col items-center justify-center p-8 overflow-hidden">
                        <div className="absolute top-4 text-2xl font-bold retro-font text-yellow-400 drop-shadow-md z-10">
                            ROUND {battleState.turn}
                        </div>
                        
                        <div className="absolute top-4 right-4 z-20">
                            <button 
                                onClick={handleSurrender}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-950/80 backdrop-blur hover:bg-red-900/50 border border-slate-700 hover:border-red-500 rounded-full text-slate-400 hover:text-red-400 transition-all text-sm font-bold"
                            >
                                <Flag size={16} /> 认输
                            </button>
                        </div>

                        <BattleScene 
                            gameState={battleState} 
                            onAnimationsComplete={handleAnimationComplete}
                        />
                        
                        {/* HUD */}
                        <div className="w-[800px] mt-6 flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm relative">
                            {/* Indicator for Active Player */}
                            <div className={`absolute top-0 bottom-0 w-1 bg-yellow-500 shadow-[0_0_10px_yellow] transition-all duration-500 ${battleState.activePlayerId === battleState.p1.id ? 'left-0 rounded-l' : 'right-0 rounded-r'}`}></div>

                            {/* P1 Status */}
                            <div className={`flex gap-3 items-center transition-opacity duration-300 ${battleState.activePlayerId === battleState.p1.id ? 'opacity-100' : 'opacity-50 grayscale'}`}>
                                <div className="w-12 h-12 rounded-lg shadow-lg border border-blue-400" style={{backgroundColor: battleState.p1.config.avatarColor}}></div>
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
                                    {battleState.phase === 'ACTION_SELECTION' && !battleState.winnerId ? battleState.timeLeft : '--'}
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
                                <div className="w-12 h-12 rounded-lg shadow-lg border border-red-400" style={{backgroundColor: battleState.p2.config.avatarColor}}></div>
                            </div>
                        </div>

                        {/* Controls */}
                        {(() => {
                            let isMyTurn = false;
                            if (battleState.mode === 'ONLINE_PVP') {
                                if (battleState.activePlayerId === playerId) isMyTurn = true;
                                if (!isHost && battleState.activePlayerId === 'guest_player') isMyTurn = true;
                            } else {
                                isMyTurn = battleState.activePlayerId === playerId;
                            }

                            if (isMyTurn && battleState.phase === 'ACTION_SELECTION' && !battleState.winnerId) {
                                return (
                                    <div className="mt-8 w-full max-w-4xl flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
                                        
                                        <div className="flex justify-center items-center gap-4">
                                            {(() => {
                                                const activeEntity = battleState.p1.id === battleState.activePlayerId ? battleState.p1 : battleState.p2;
                                                const customSkills = activeEntity.config.skills.filter(s => !s.isPassive);
                                                const allSkills = [
                                                    ...customSkills,
                                                    { id: 'basic_attack', name: '普通攻击', isPassive: false, conditions: [], effects: [] } as Skill
                                                ];
                                                
                                                return allSkills.map((skill, idx) => {
                                                    const isSelected = idx === (selectedSkillIndex % allSkills.length);
                                                    const cost = skill.id === 'basic_attack' ? 0 : calculateManaCost(skill, activeEntity.config.stats);
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
                                                            <div className={`absolute -top-2 -right-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${canAfford ? 'bg-blue-900 border-blue-500 text-blue-200' : 'bg-red-900 border-red-500 text-white'}`}>
                                                                {cost} MP
                                                            </div>

                                                            <div className={`flex-1 flex items-center justify-center ${canAfford ? (isAttack ? 'text-yellow-400' : 'text-purple-400') : 'text-red-500'}`}>
                                                                {isAttack ? <Swords size={32} /> : <Zap size={32} />}
                                                            </div>

                                                            <div className="w-full text-center text-[10px] font-bold truncate text-slate-300">
                                                                {skill.name}
                                                            </div>

                                                            {isSelected && (
                                                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-blue-400"></div>
                                                            )}
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>

                                        <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-6 flex flex-col items-center text-center shadow-2xl max-w-2xl mx-auto w-full min-h-[120px] relative">
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

                                            <div className="mt-2">
                                                {(() => {
                                                    const activeEntity = battleState.p1.id === battleState.activePlayerId ? battleState.p1 : battleState.p2;
                                                    const customSkills = activeEntity.config.skills.filter(s => !s.isPassive);
                                                    const allSkills = [...customSkills, { id: 'basic_attack', name: '普通攻击', isPassive: false, conditions: [], effects: [] } as Skill];
                                                    const selectedSkill = allSkills[selectedSkillIndex % allSkills.length];
                                                    
                                                    return (
                                                        <>
                                                            <h4 className="text-xl font-bold text-white mb-2">{selectedSkill.name}</h4>
                                                            <p className="text-slate-400 font-mono text-sm leading-relaxed max-w-lg">
                                                                {getSkillDescription(selectedSkill, activeEntity.config.stats)}
                                                            </p>
                                                        </>
                                                    )
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                )
                            }
                        })()}
                        
                        {(battleState.phase === 'EXECUTING' || 
                            (battleState.mode === 'ONLINE_PVP' && 
                             ((isHost && battleState.activePlayerId !== playerId) || 
                              (!isHost && battleState.activePlayerId !== 'guest_player')))
                        ) && !battleState.winnerId && (
                             <div className="mt-8 text-slate-500 font-mono animate-pulse flex items-center gap-2">
                                <div className="w-2 h-2 bg-slate-500 rounded-full"></div>
                                {battleState.phase === 'EXECUTING' ? '执行中...' : '等待对手行动...'}
                             </div>
                        )}

                        {battleState.winnerId && (
                            <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in duration-1000">
                                <div className="text-center transform scale-110">
                                    <h2 className={`text-6xl font-bold mb-6 retro-font ${
                                        (battleState.winnerId === playerId || (battleState.winnerId === 'guest_player' && !isHost)) ? 'text-yellow-400' : 'text-red-500'
                                    }`}>
                                        { (battleState.winnerId === playerId || (battleState.winnerId === 'guest_player' && !isHost)) ? 'VICTORY' : 'DEFEAT' }
                                    </h2>
                                    <button 
                                        onClick={() => { net.disconnect(); setView('HERO_LIST'); }} 
                                        className="bg-white text-slate-900 px-8 py-3 rounded-full font-bold hover:bg-blue-50 hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                                    >
                                        返回名册
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
        </div>
    );
};

export default App;
