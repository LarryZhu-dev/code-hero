
import React, { useState, useEffect, useCallback, useRef } from 'react';
import CharacterEditor from './components/CharacterEditor';
import CharacterList from './components/CharacterList';
import BattleScene from './components/BattleScene';
import { CharacterConfig, BattleState, BattleEntity, StatType, Skill, BattleMode, BattleEvent } from './types';
import { processSkill, checkConditions, getTotalStat, calculateManaCost, processBasicAttack } from './utils/gameEngine';
import { StorageService } from './services/storage';
import { net } from './services/mqtt';
import { Swords, Users, ArrowLeft, ArrowRight, CornerDownLeft, Flag, Zap, Cpu, Globe, CheckCircle2, PlayCircle, Loader2, Eye } from 'lucide-react';

type AppView = 'MENU' | 'HERO_LIST' | 'EDITOR' | 'BATTLE_SETUP' | 'LOBBY' | 'BATTLE';
type UserRole = 'HOST' | 'CHALLENGER' | 'SPECTATOR' | 'NONE';

const App: React.FC = () => {
    const [view, setView] = useState<AppView>('MENU');
    const [myChar, setMyChar] = useState<CharacterConfig | null>(null);
    const [battleState, setBattleState] = useState<BattleState | null>(null);
    const [playerId] = useState(net.playerId); 
    const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
    
    // Lobby State
    const [roomId, setRoomId] = useState('');
    const [lobbyLog, setLobbyLog] = useState<string[]>([]);
    const [myRole, setMyRole] = useState<UserRole>('NONE');
    
    const [opponentChar, setOpponentChar] = useState<CharacterConfig | null>(null);
    const [opponentId, setOpponentId] = useState<string | null>(null);
    const [opponentReady, setOpponentReady] = useState(false);
    const [amIReady, setAmIReady] = useState(false);
    
    // Additional State for Spectator/Challenger Sync
    const [challengerId, setChallengerId] = useState<string | null>(null);
    const [spectatorChallengerChar, setSpectatorChallengerChar] = useState<CharacterConfig | null>(null);
    
    // Host specific lobby state
    const [spectators, setSpectators] = useState<{id: string, name: string}[]>([]);

    // Input Locking
    const processingTurnRef = useRef(false);
    
    // Refs for accessing latest state inside callbacks
    const myRoleRef = useRef<UserRole>('NONE');
    
    // --- STALE CLOSURE FIX: Message Handler Ref ---
    const handleMessageRef = useRef<((action: string, data: any) => void) | null>(null);

    useEffect(() => {
        myRoleRef.current = myRole;
    }, [myRole]);

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
        
        // Local battle: I am always P1 (logic handled in initBattle)
        setMyRole('HOST'); // Treated as Host for local
        initBattle(myChar, dummy, 'LOCAL_BOT');
    };

    // -- Lobby Logic --

    const startOnlineLobby = () => {
        if (!roomId) {
            alert("请输入房间号");
            return;
        }
        
        // Reset Lobby State
        setLobbyLog(['正在连接服务器...']);
        setMyRole('NONE');
        myRoleRef.current = 'NONE';
        setOpponentChar(null);
        setOpponentId(null);
        setChallengerId(null);
        setSpectatorChallengerChar(null);
        setOpponentReady(false);
        setAmIReady(false);
        setSpectators([]);
        setView('LOBBY');
        
        let handshakeTimeout: ReturnType<typeof setTimeout>;

        // Start Connection
        // We pass a wrapper that calls the current ref, preventing stale closures
        net.connect(roomId, (action, data) => handleMessageRef.current?.(action, data), () => {
            // This runs ONCE when connection is established
            setLobbyLog(prev => [...prev, '已连接服务器', '正在寻找房主...']);
            
            // Initial Discovery
            net.publish('query_host', {});
            
            // If no host replies in 2.0s, become host
            handshakeTimeout = setTimeout(() => {
                if (myRoleRef.current === 'NONE') {
                    setMyRole('HOST');
                    setLobbyLog(prev => [...prev, '未发现房主，自动创建房间', '我是房主，等待挑战者...']);
                }
            }, 2000);
        });
    };

    // --- Message Handler Logic (Recreated every render to capture fresh state) ---
    const handleMessage = useCallback((action: string, data: any) => {
        // 1. Presence & Role Assignment
        if (action === 'query_host') {
            // If I am Host, announce myself
            if (myRoleRef.current === 'HOST') {
                net.publish('host_announce', { 
                    hostId: playerId, 
                    hostName: myChar?.name,
                    hasChallenger: !!opponentId,
                    challengerName: opponentChar?.name
                });
            }
        }
        else if (action === 'host_announce') {
            // Received announcement from existing host
            if (myRoleRef.current === 'NONE') {
                setLobbyLog(prev => {
                     if (prev.some(l => l.includes(data.hostName))) return prev;
                     return [...prev, `发现房主: ${data.hostName}`];
                });
                // Ask to join
                net.publish('join_request', { id: playerId, name: myChar?.name, char: myChar });
            }
        }
        else if (action === 'join_request') {
            // HOST LOGIC: Handle join requests
            if (myRoleRef.current === 'HOST') {
                if (!opponentId && !challengerId) {
                    // Accept as Challenger
                    setOpponentId(data.id);
                    setChallengerId(data.id); // Sync global ID
                    setOpponentChar(data.char);
                    setOpponentReady(false);
                    setLobbyLog(prev => [...prev, `玩家 ${data.name} 加入挑战位`]);
                    
                    net.publish('assign_role', { targetId: data.id, role: 'CHALLENGER', hostChar: myChar });
                    
                    // BROADCAST NEW STATE to everyone (so spectators update)
                    net.publish('lobby_update', { 
                        challenger: { id: data.id, char: data.char, name: data.name },
                        spectators: spectators 
                    });
                } else {
                    // Add as Spectator
                    if (!spectators.find(s => s.id === data.id)) {
                        const newSpec = { id: data.id, name: data.name };
                        const newSpecsList = [...spectators, newSpec];
                        setSpectators(newSpecsList);
                        setLobbyLog(prev => [...prev, `玩家 ${data.name} 前来观战`]);
                        
                        net.publish('assign_role', { targetId: data.id, role: 'SPECTATOR', hostChar: myChar, challengerChar: opponentChar, challengerId: opponentId });
                        // Sync spectator list to everyone
                        net.publish('lobby_update', { 
                            challenger: { id: opponentId, char: opponentChar }, 
                            spectators: newSpecsList 
                        });
                    }
                }
            }
        }
        else if (action === 'assign_role') {
            // I received a role assignment
            if (data.targetId === playerId) {
                setMyRole(data.role);
                setOpponentChar(data.hostChar); // For guest, opponent is Host
                
                if (data.role === 'CHALLENGER') {
                     setLobbyLog(prev => [...prev, '你已成为挑战者', '请准备...']);
                } else if (data.role === 'SPECTATOR') {
                     setLobbyLog(prev => [...prev, '房间已满，你已进入观战模式']);
                     // Spectators initialize with current challenger data
                     if (data.challengerChar) {
                         setSpectatorChallengerChar(data.challengerChar);
                         setChallengerId(data.challengerId);
                     }
                }
            }
        }
        else if (action === 'lobby_update') {
            // Universal sync for Spectators/Joiners
            if (data.challenger) {
                setChallengerId(data.challenger.id);
                setSpectatorChallengerChar(data.challenger.char);
                // If I am spectator, I need to know who is on right side
            } else {
                setChallengerId(null);
                setSpectatorChallengerChar(null);
                setOpponentReady(false);
            }
            if (data.spectators) {
                setSpectators(data.spectators);
            }
        }
        else if (action === 'ready') {
            // Update ready status if sender is current challenger
            // Check both IDs to ensure we catch it regardless of role view
            if (data.sender === challengerId || data.sender === opponentId) {
                setOpponentReady(data.ready);
                setLobbyLog(prev => {
                    const msg = `挑战者 ${data.ready ? '已准备' : '取消准备'}`;
                    if (prev[prev.length-1] === msg) return prev; // Dedup
                    return [...prev, msg];
                });
            }
        }
        else if (action === 'leave') {
            const leavingId = data.id;

            // Universal Logic: If Challenger leaves, everyone should clear that slot visually
            if (leavingId === challengerId || leavingId === opponentId) {
                setOpponentReady(false);
                if (myRoleRef.current !== 'HOST') {
                     setChallengerId(null);
                     setSpectatorChallengerChar(null);
                     setLobbyLog(prev => [...prev, '挑战者离开了']);
                }
            }

            // HOST LOGIC: Handle leavers
            if (myRoleRef.current === 'HOST') {
                if (leavingId === opponentId) {
                    setLobbyLog(prev => [...prev, '挑战者离开了']);
                    setOpponentChar(null);
                    setOpponentId(null);
                    setChallengerId(null);
                    setOpponentReady(false);
                    
                    // Promote Spectator
                    if (spectators.length > 0) {
                        const nextPlayer = spectators[0];
                        const remainingSpecs = spectators.slice(1);
                        setSpectators(remainingSpecs);
                        
                        // We set ID, but we wait for them to re-join to get full char config and finalize
                        setOpponentId(nextPlayer.id);
                        setChallengerId(nextPlayer.id);

                        setLobbyLog(prev => [...prev, `观战者 ${nextPlayer.name} 补位成为挑战者`]);
                        
                        net.publish('promote_spectator', { targetId: nextPlayer.id });
                        // Broadcast that specs changed (Challenger is temp null until they rejoin)
                        net.publish('lobby_update', { challenger: null, spectators: remainingSpecs });
                    } else {
                        // Empty lobby
                        net.publish('lobby_update', { challenger: null, spectators: [] });
                    }
                } else {
                    // Remove from spectator list
                    const newSpecs = spectators.filter(s => s.id !== leavingId);
                    setSpectators(newSpecs);
                    net.publish('lobby_update', { 
                        challenger: { id: opponentId, char: opponentChar }, 
                        spectators: newSpecs 
                    });
                }
            }
        }
        else if (action === 'promote_spectator') {
            if (data.targetId === playerId) {
                setMyRole('CHALLENGER');
                setLobbyLog(prev => [...prev, '你已补位成为挑战者！']);
                setAmIReady(false);
                // Resend my char info to host just in case
                net.publish('join_request', { id: playerId, name: myChar?.name, char: myChar });
            }
        }
        else if (action === 'sync_state') {
            setBattleState(data.state);
            if (view !== 'BATTLE') setView('BATTLE');
        }
    }, [myRole, opponentId, challengerId, opponentChar, spectators, myChar, playerId, view]);

    // Keep the ref updated with the latest handler
    useEffect(() => {
        handleMessageRef.current = handleMessage;
    }, [handleMessage]);

    const handleToggleReady = () => {
        const newState = !amIReady;
        setAmIReady(newState);
        net.sendReady(newState);
    };

    const handleHostStartGame = () => {
        if (!myChar || !opponentChar) return;
        // Host starts game, sends state
        initBattle(myChar, opponentChar, 'ONLINE_PVP');
    };

    const initBattle = (hostConfig: CharacterConfig, challengerConfig: CharacterConfig, mode: BattleMode) => {
        const p1Speed = getTotalStat({ config: hostConfig } as any, StatType.SPEED);
        const p2Speed = getTotalStat({ config: challengerConfig } as any, StatType.SPEED);
        const p1First = p1Speed >= p2Speed;

        // IDs: Host always uses their playerId. Challenger uses theirs (if Online).
        // If Local, Challenger is 'bot_enemy'.
        const hostId = playerId;
        const challengerId = mode === 'LOCAL_BOT' ? 'bot_enemy' : (opponentId || 'unknown_challenger');

        const entity1: BattleEntity = { 
            id: hostId,
            config: hostConfig, 
            currentHp: getTotalStat({ config: hostConfig } as any, StatType.HP),
            currentMana: getTotalStat({ config: hostConfig } as any, StatType.MANA),
            buffs: [] 
        };
        const entity2: BattleEntity = { 
            id: challengerId,
            config: challengerConfig, 
            currentHp: getTotalStat({ config: challengerConfig } as any, StatType.HP),
            currentMana: getTotalStat({ config: challengerConfig } as any, StatType.MANA),
            buffs: [] 
        };
        
        // Determine P1/P2 based on speed
        const realP1 = p1First ? entity1 : entity2;
        const realP2 = p1First ? entity2 : entity1;

        const initialState: BattleState = {
            turn: 1,
            log: ['战斗开始！', `${realP1.config.name} 速度更快，获得先手！`],
            p1: realP1,
            p2: realP2,
            activePlayerId: realP1.id,
            phase: 'ACTION_SELECTION',
            timeLeft: 60,
            mode: mode,
            roomId: roomId,
            events: []
        };

        setBattleState(initialState);
        setView('BATTLE');
        setSelectedSkillIndex(0);
        processingTurnRef.current = false;
        
        if (mode === 'ONLINE_PVP') {
            net.sendState(initialState);
        }
    };

    // -- Core Turn Execution --

    const executeTurn = useCallback((skillId: string) => {
        if (!battleState || processingTurnRef.current) return;
        
        // Role Check
        let isMyTurn = false;
        if (battleState.mode === 'ONLINE_PVP') {
            if (myRole === 'SPECTATOR') isMyTurn = false;
            else isMyTurn = battleState.activePlayerId === playerId;
        } else {
            isMyTurn = battleState.activePlayerId === playerId;
        }

        if (battleState.mode === 'ONLINE_PVP' && !isMyTurn) return;
        
        // Lock input
        processingTurnRef.current = true;

        const newState = { ...battleState };
        const isP1Active = newState.activePlayerId === newState.p1.id;
        const active = isP1Active ? newState.p1 : newState.p2;
        const opponent = isP1Active ? newState.p2 : newState.p1;
        
        newState.events = [];
        const pushEvent = (evt: BattleEvent) => newState.events.push(evt);

        // 1. MANA CHECK
        if (skillId !== 'basic_attack') {
            const skill = active.config.skills.find(s => s.id === skillId);
            if (skill) {
                const cost = calculateManaCost(skill, active.config.stats);
                if (active.currentMana < cost) {
                    if (isMyTurn) alert("法力值不足！");
                    processingTurnRef.current = false;
                    return; 
                }
            }
        }

        newState.log.push(`\n--- 第 ${newState.turn} 回合 ---`);

        // 2. ACTION
        if (skillId === 'basic_attack') {
            processBasicAttack(active, opponent, pushEvent);
        } else {
            const skill = active.config.skills.find(s => s.id === skillId);
            if (skill) {
                const success = processSkill(skill, active, opponent, pushEvent);
                if (!success) {
                    processingTurnRef.current = false;
                    return; 
                }
            } else {
                processBasicAttack(active, opponent, pushEvent);
            }
        }

        // 3. PASSIVE PHASE
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

        newState.phase = 'EXECUTING';
        
        newState.events.forEach(evt => {
            if (evt.text) newState.log.push(evt.text);
        });

        setBattleState(newState);
        if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
        
        setSelectedSkillIndex(0); 
        // processingTurnRef.current remains true until animations complete

    }, [battleState, playerId, myRole]);

    // Called by BattleScene when animations finish
    const handleAnimationComplete = useCallback(() => {
        processingTurnRef.current = false; // Unlock input for next turn
        
        if (!battleState) return;
        
        // CRITICAL: Only Host (or local player) calculates state transitions. 
        // Guests/Spectators wait for sync.
        if (battleState.mode === 'ONLINE_PVP' && myRole !== 'HOST') return;

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

        // 5. NEXT TURN
        newState.turn += 1;
        newState.activePlayerId = opponent.id; 
        
        const nextActive = newState.activePlayerId === newState.p1.id ? newState.p1 : newState.p2;
        const manaRegen = getTotalStat(nextActive, StatType.MANA_REGEN);
        if (manaRegen > 0) {
            nextActive.currentMana = Math.min(getTotalStat(nextActive, StatType.MANA), nextActive.currentMana + (getTotalStat(nextActive, StatType.MANA) * manaRegen / 100));
        }

        newState.phase = 'ACTION_SELECTION';
        newState.timeLeft = 60;
        newState.events = []; 
        
        setBattleState(newState);
        if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
        
    }, [battleState, myRole]);

    // -- Side Effects --

    const handleSurrender = () => {
        if (!battleState || myRole === 'SPECTATOR') return;
        
        const newState = { ...battleState };
        const isP1Me = newState.p1.id === playerId;
        const enemyId = isP1Me ? newState.p2.id : newState.p1.id;
        
        newState.winnerId = enemyId;
        newState.phase = 'FINISHED';
        newState.log.push(`${myChar?.name || '玩家'} 认输了。`);
        
        // Surrender is a special event that can be sent by the loser even if not host
        // But strictly, host should process. 
        // For simplicity, if I surrender, I send the finished state myself.
        setBattleState(newState);
        if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
    };

    // Timer - Host Authoritative
    useEffect(() => {
        if (view !== 'BATTLE' || !battleState || battleState.phase !== 'ACTION_SELECTION' || battleState.winnerId) return;
        if (battleState.mode === 'ONLINE_PVP' && myRole !== 'HOST') return;

        const timer = setInterval(() => {
            setBattleState(prev => {
                if (!prev || prev.phase !== 'ACTION_SELECTION') return prev;
                if (prev.timeLeft <= 1) return { ...prev, timeLeft: 0 };
                return { ...prev, timeLeft: prev.timeLeft - 1 };
            });
        }, 1000);

        const syncTimer = setInterval(() => {
             if (battleState.mode === 'ONLINE_PVP' && myRole === 'HOST') {
                 net.sendState(battleState);
             }
        }, 2000);

        return () => {
            clearInterval(timer);
            clearInterval(syncTimer);
        };
    }, [view, battleState?.phase, battleState?.winnerId, myRole, battleState?.mode]);

    // Timeout
    useEffect(() => {
        if (battleState && battleState.timeLeft === 0 && battleState.phase === 'ACTION_SELECTION' && !battleState.winnerId) {
            if (battleState.mode === 'ONLINE_PVP' && myRole !== 'HOST') return;
            
            // Force basic attack
            if (battleState.mode === 'LOCAL_BOT' || myRole === 'HOST') {
                 // Logic handled by executeTurn or forced here
            }
        }
    }, [battleState?.timeLeft, myRole]);

    // Bot Logic
    useEffect(() => {
        if (!battleState) return;
        const { mode, phase, activePlayerId, winnerId } = battleState;

        if (mode === 'LOCAL_BOT' && phase === 'ACTION_SELECTION' && activePlayerId === 'bot_enemy' && !winnerId) {
            const timer = setTimeout(() => {
                const enemy = battleState.p1.id === 'bot_enemy' ? battleState.p1 : battleState.p2;
                const skills = enemy.config.skills.filter(s => !s.isPassive);
                const affordable = skills.filter(s => calculateManaCost(s, enemy.config.stats) <= enemy.currentMana);
                const useSkill = affordable.length > 0 && Math.random() < 0.7;

                executeTurn(useSkill ? affordable[Math.floor(Math.random() * affordable.length)].id : 'basic_attack');
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [battleState?.turn, battleState?.phase, battleState?.activePlayerId, executeTurn]);

    // Keyboard
    useEffect(() => {
        if (view !== 'BATTLE' || !battleState || battleState.phase !== 'ACTION_SELECTION') return;
        if (myRole === 'SPECTATOR') return;
        
        const isMyTurn = battleState.activePlayerId === playerId;
        if (!isMyTurn) return;

        const activeEntity = battleState.p1.id === battleState.activePlayerId ? battleState.p1 : battleState.p2;
        const customSkills = activeEntity.config.skills.filter(s => !s.isPassive);
        const allSkills = [
            ...customSkills,
            { id: 'basic_attack', name: '普通攻击', isPassive: false, conditions: [], effects: [] } as Skill
        ];
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (processingTurnRef.current) return;
            
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
    }, [view, battleState, playerId, selectedSkillIndex, executeTurn, myRole]);

    // Helper
    const getSkillDescription = (skill: Skill, stats?: CharacterConfig['stats']) => {
        if (skill.id === 'basic_attack') return "【基础动作】造成等于当前攻击力的物理伤害。计算护甲穿透与吸血。无消耗。";
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
                <span className="retro-font text-blue-400 text-sm cursor-pointer" onClick={() => {
                    net.disconnect();
                    setView('MENU');
                }}>CODE WARRIORS</span>
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
                    <div className="flex flex-col items-center justify-center h-full gap-8 p-12 relative">
                        <div className="absolute top-8 text-slate-500 font-mono text-xs">ROOM: {roomId}</div>
                        <div className="absolute top-8 right-8 flex items-center gap-2 text-slate-400">
                            <Eye size={16}/> 观战: {spectators.length}
                        </div>
                        
                        <h2 className="text-3xl font-bold retro-font text-white mb-8">对战大厅</h2>

                        <div className="flex gap-12 items-center">
                            {/* Host Card */}
                            <div className="flex flex-col items-center gap-4">
                                <div className={`relative w-48 h-64 bg-slate-800 rounded-xl border-2 flex flex-col items-center justify-center p-4 transition-all ${myRole === 'HOST' ? 'border-yellow-500' : 'border-slate-600'}`}>
                                    <div className="w-20 h-20 rounded-lg mb-4 shadow-lg" style={{backgroundColor: (myRole === 'HOST' ? myChar : opponentChar)?.avatarColor || '#333'}}></div>
                                    <h3 className="font-bold text-lg">{(myRole === 'HOST' ? myChar : opponentChar)?.name || 'Waiting...'}</h3>
                                    <span className="text-xs text-yellow-500 mb-4 font-bold">房主 (HOST)</span>
                                    
                                    {myRole === 'HOST' && (
                                        <div className="mt-auto px-3 py-1 rounded-full text-xs font-bold bg-yellow-900/50 text-yellow-400">
                                            已就绪
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="text-4xl font-black text-slate-700 italic">VS</div>

                            {/* Challenger Card */}
                            {/* Improved Rendering Logic for Spectators */}
                            <div className="flex flex-col items-center gap-4">
                                {(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : (myRole === 'SPECTATOR' ? spectatorChallengerChar : null))) ? (
                                    <div className={`relative w-48 h-64 bg-slate-800 rounded-xl border-2 flex flex-col items-center justify-center p-4 transition-all ${(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'border-slate-600'}`}>
                                        <div className="w-20 h-20 rounded-lg mb-4 shadow-lg" style={{backgroundColor: (myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : spectatorChallengerChar))?.avatarColor}}></div>
                                        <h3 className="font-bold text-lg">{(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : spectatorChallengerChar))?.name}</h3>
                                        <span className="text-xs text-blue-400 mb-4 font-bold">挑战者</span>
                                        
                                        <div className={`mt-auto flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? 'bg-green-900/50 text-green-400' : 'bg-slate-900/50 text-slate-500'}`}>
                                            {(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? <CheckCircle2 size={12} /> : <div className="w-3 h-3 rounded-full border border-slate-500"></div>}
                                            {(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? '已准备' : '未准备'}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-48 h-64 bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center p-4 text-slate-600 gap-4 animate-pulse">
                                        <Loader2 size={32} className="animate-spin" />
                                        <span className="text-sm">等待挑战者...</span>
                                    </div>
                                )}
                                
                                {/* Controls */}
                                {myRole === 'HOST' && (
                                    <button 
                                        onClick={handleHostStartGame}
                                        disabled={!opponentChar || !opponentReady}
                                        className={`px-8 py-3 rounded-lg font-bold transition-all shadow-lg flex items-center gap-2 ${opponentChar && opponentReady ? 'bg-blue-600 text-white hover:bg-blue-500 hover:scale-105' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                                    >
                                        <PlayCircle size={18} /> 开始对战
                                    </button>
                                )}

                                {myRole === 'CHALLENGER' && (
                                    <button 
                                        onClick={handleToggleReady}
                                        className={`px-8 py-3 rounded-lg font-bold transition-all shadow-lg flex items-center gap-2 ${amIReady ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-green-600 text-white hover:bg-green-500'}`}
                                    >
                                        <CheckCircle2 size={18} /> {amIReady ? '取消准备' : '准备就绪'}
                                    </button>
                                )}

                                {myRole === 'SPECTATOR' && (
                                    <div className="px-4 py-2 bg-slate-800 rounded text-slate-400 text-xs flex items-center gap-2">
                                        <Eye size={14}/> 你正在观战中...
                                    </div>
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
                        
                        {myRole !== 'SPECTATOR' && (
                            <div className="absolute top-4 right-4 z-20">
                                <button 
                                    onClick={handleSurrender}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-950/80 backdrop-blur hover:bg-red-900/50 border border-slate-700 hover:border-red-500 rounded-full text-slate-400 hover:text-red-400 transition-all text-sm font-bold"
                                >
                                    <Flag size={16} /> 认输
                                </button>
                            </div>
                        )}
                        
                        {myRole === 'SPECTATOR' && (
                            <div className="absolute top-4 left-4 z-20 px-3 py-1 bg-blue-900/50 border border-blue-500/50 rounded text-blue-200 text-xs flex items-center gap-2">
                                <Eye size={14}/> 观战模式
                            </div>
                        )}

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
                            const isMyTurn = battleState.activePlayerId === playerId;
                            const isSpectating = myRole === 'SPECTATOR';

                            if (!isSpectating && isMyTurn && battleState.phase === 'ACTION_SELECTION' && !battleState.winnerId) {
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
                            (battleState.mode === 'ONLINE_PVP' && battleState.activePlayerId !== playerId)) 
                            && !battleState.winnerId && (
                             <div className="mt-8 text-slate-500 font-mono animate-pulse flex items-center gap-2">
                                <div className="w-2 h-2 bg-slate-500 rounded-full"></div>
                                {battleState.phase === 'EXECUTING' ? '执行中...' : (myRole === 'SPECTATOR' ? '玩家思考中...' : '等待对手行动...')}
                             </div>
                        )}

                        {battleState.winnerId && (
                            <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in duration-1000">
                                <div className="text-center transform scale-110">
                                    {myRole === 'SPECTATOR' ? (
                                        <h2 className="text-5xl font-bold mb-6 retro-font text-yellow-400">
                                            GAME OVER
                                        </h2>
                                    ) : (
                                        <h2 className={`text-6xl font-bold mb-6 retro-font ${
                                            (battleState.winnerId === playerId) ? 'text-yellow-400' : 'text-red-500'
                                        }`}>
                                            { (battleState.winnerId === playerId) ? 'VICTORY' : 'DEFEAT' }
                                        </h2>
                                    )}
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
