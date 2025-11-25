

import React, { useState, useEffect, useCallback, useRef } from 'react';
import CharacterEditor from './components/CharacterEditor';
import CharacterList from './components/CharacterList';
import BattleScene from './components/BattleScene';
import HeroAvatar from './components/HeroAvatar';
import { CharacterConfig, BattleState, BattleEntity, StatType, Skill, BattleMode, BattleEvent, DYNAMIC_STATS } from './types';
import { processSkill, evaluateCondition, getTotalStat, calculateManaCost, processBasicAttack, hasDynamicStats } from './utils/gameEngine';
import { StorageService } from './services/storage';
import { net } from './services/mqtt';
import { Swords, Users, ArrowLeft, ArrowRight, CornerDownLeft, Flag, Zap, Cpu, Globe, CheckCircle2, PlayCircle, Loader2, Eye, Copy, Check, X, Shield, Lock, Heart, Sparkles, Wind, Crosshair, Axe, ShieldCheck, HeartPulse, ShieldAlert, ArrowUpFromLine, RefreshCcw, Home } from 'lucide-react';

type AppView = 'MENU' | 'HERO_LIST' | 'EDITOR' | 'BATTLE_SETUP' | 'LOBBY' | 'BATTLE';
type UserRole = 'HOST' | 'CHALLENGER' | 'SPECTATOR' | 'NONE';

// --- Stat Icon Mapping ---
const getStatIcon = (stat: StatType) => {
    switch (stat) {
        case StatType.HP: return <Heart size={14} className="text-red-500" />;
        case StatType.MANA: return <Zap size={14} className="text-blue-500" />;
        case StatType.AD: return <Swords size={14} className="text-orange-500" />;
        case StatType.AP: return <Sparkles size={14} className="text-purple-500" />;
        case StatType.ARMOR: return <Shield size={14} className="text-yellow-500" />;
        case StatType.MR: return <ShieldCheck size={14} className="text-cyan-500" />;
        case StatType.SPEED: return <Wind size={14} className="text-emerald-500" />;
        case StatType.CRIT_RATE: return <Crosshair size={14} className="text-pink-500" />;
        case StatType.CRIT_DMG: return <Axe size={14} className="text-rose-700" />;
        case StatType.LIFESTEAL: return <HeartPulse size={14} className="text-red-400" />;
        case StatType.OMNIVAMP: return <HeartPulse size={14} className="text-purple-400" />;
        case StatType.TENACITY: return <ShieldAlert size={14} className="text-slate-400" />;
        case StatType.MANA_REGEN: return <Zap size={14} className="text-blue-300" />;
        case StatType.ARMOR_PEN_FLAT: case StatType.ARMOR_PEN_PERC: 
        case StatType.MAGIC_PEN_FLAT: case StatType.MAGIC_PEN_PERC:
            return <ArrowUpFromLine size={14} className="text-gray-400" />;
        default: return <div className="w-3 h-3 bg-slate-600 rounded-full" />;
    }
};

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
    const [copiedRoomId, setCopiedRoomId] = useState(false);
    
    const [opponentChar, setOpponentChar] = useState<CharacterConfig | null>(null);
    const [opponentId, setOpponentId] = useState<string | null>(null);
    const [opponentReady, setOpponentReady] = useState(false);
    const [amIReady, setAmIReady] = useState(false);
    
    // Additional State for Spectator/Challenger Sync
    const [challengerId, setChallengerId] = useState<string | null>(null);
    const [spectatorChallengerChar, setSpectatorChallengerChar] = useState<CharacterConfig | null>(null);
    
    // Host specific lobby state
    const [spectators, setSpectators] = useState<{id: string, name: string}[]>([]);

    // Rematch State
    const [myRematchRequest, setMyRematchRequest] = useState(false);
    const [opponentRematchRequest, setOpponentRematchRequest] = useState(false);
    const [opponentLeft, setOpponentLeft] = useState(false);

    // Inspection State
    const [inspectedEntity, setInspectedEntity] = useState<BattleEntity | null>(null);

    // Input Locking
    const processingTurnRef = useRef(false);
    
    // Refs for accessing latest state inside callbacks
    const myRoleRef = useRef<UserRole>('NONE');
    
    // --- STALE CLOSURE FIX: Message Handler Ref ---
    const handleMessageRef = useRef<((action: string, data: any) => void) | null>(null);

    useEffect(() => {
        myRoleRef.current = myRole;
    }, [myRole]);

    // -- Helper: Skill Sorting --
    const getSortedSkills = useCallback((entity: BattleEntity | CharacterConfig) => {
        const skills = 'config' in entity ? entity.config.skills : entity.skills;
        const actives = skills.filter(s => !s.isPassive);
        const passives = skills.filter(s => s.isPassive);
        const basic: Skill = { id: 'basic_attack', name: '普通攻击', isPassive: false, logic: [] };
        
        // Order: [Active Skills] -> [Basic Attack] -> [Passive Skills]
        return [...actives, basic, ...passives];
    }, []);

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
        setCopiedRoomId(false);
        
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

    const copyRoomId = () => {
        navigator.clipboard.writeText(roomId);
        setCopiedRoomId(true);
        setTimeout(() => setCopiedRoomId(false), 2000);
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

            // Mark opponent as left to disable rematch button
            if (leavingId === challengerId || leavingId === opponentId) {
                setOpponentLeft(true);
            }

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
            // If received new initial state (turn 1), reset rematch flags
            if (data.state.turn === 1 && data.state.phase !== 'FINISHED') {
                setMyRematchRequest(false);
                setOpponentRematchRequest(false);
                setOpponentLeft(false);
            }
            if (view !== 'BATTLE') setView('BATTLE');
        }
        else if (action === 'rematch_request') {
            if (data.sender !== playerId) {
                setOpponentRematchRequest(true);
            }
        }
    }, [myRole, opponentId, challengerId, opponentChar, spectators, myChar, playerId, view]);

    // Keep the ref updated with the latest handler
    useEffect(() => {
        handleMessageRef.current = handleMessage;
    }, [handleMessage]);

    // Effect to check if rematch conditions met (Host authoritative mostly, but symmetrical here)
    useEffect(() => {
        if (battleState?.mode === 'ONLINE_PVP' && myRole === 'HOST') {
            if (myRematchRequest && opponentRematchRequest) {
                // Restart Battle
                if (myChar && opponentChar) {
                    initBattle(myChar, opponentChar, 'ONLINE_PVP');
                }
            }
        }
    }, [myRematchRequest, opponentRematchRequest, battleState?.mode, myRole, myChar, opponentChar]);

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

    const handleRematchClick = () => {
        if (battleState?.mode === 'LOCAL_BOT') {
            startLocalBotBattle();
        } else {
            setMyRematchRequest(true);
            net.sendRematch();
        }
    };

    const initBattle = (hostConfig: CharacterConfig, challengerConfig: CharacterConfig, mode: BattleMode) => {
        // Reset flags
        setMyRematchRequest(false);
        setOpponentRematchRequest(false);
        setOpponentLeft(false);

        const p1Speed = getTotalStat({ config: hostConfig } as any, StatType.SPEED);
        const p2Speed = getTotalStat({ config: challengerConfig } as any, StatType.SPEED);
        const p1First = p1Speed >= p2Speed;

        // IDs: Host always uses their playerId. Challenger uses theirs (if Online).
        // If Local, Challenger is 'bot_enemy'.
        const hostId = playerId;
        const challengerId = mode === 'LOCAL_BOT' ? 'bot_enemy' : (opponentId || 'unknown_challenger');

        // Calculate Initial Max Stats (Standard Config calculation)
        const hostMaxHp = getTotalStat({ config: hostConfig } as any, StatType.HP);
        const hostMaxMana = getTotalStat({ config: hostConfig } as any, StatType.MANA);
        const challengerMaxHp = getTotalStat({ config: challengerConfig } as any, StatType.HP);
        const challengerMaxMana = getTotalStat({ config: challengerConfig } as any, StatType.MANA);

        const entity1: BattleEntity = { 
            id: hostId,
            config: hostConfig, 
            currentHp: hostMaxHp,
            currentMana: hostMaxMana,
            maxHp: hostMaxHp,
            maxMana: hostMaxMana,
            buffs: [] 
        };
        const entity2: BattleEntity = { 
            id: challengerId,
            config: challengerConfig, 
            currentHp: challengerMaxHp,
            currentMana: challengerMaxMana,
            maxHp: challengerMaxHp,
            maxMana: challengerMaxMana,
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
            if (!skill) return;
            
            // PASSIVE CHECK - Should not be executable
            if (skill.isPassive) {
                 processingTurnRef.current = false;
                 return;
            }

            // IMPORTANT: Calculate cost using current entity state for runtime values
            const cost = calculateManaCost(skill, active.config.stats, active);
            if (active.currentMana < cost) {
                if (isMyTurn) alert("法力值不足！");
                processingTurnRef.current = false;
                return; 
            }
        }

        newState.log.push(`\n--- 第 ${newState.turn} 回合 ---`);

        // 2. ACTION
        if (skillId === 'basic_attack') {
            processBasicAttack(active, opponent, pushEvent);
        } else {
            const skill = active.config.skills.find(s => s.id === skillId);
            if (skill) {
                const success = processSkill(skill, active, opponent, pushEvent, newState.turn);
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
        
        // Track triggered skills this turn to prevent infinite loops and ensure "once per turn" logic
        const triggeredSkillIds = new Set<string>();

        while (passiveTriggered && loops < 5) {
            passiveTriggered = false;
            entities.forEach(entity => {
                const enemyOfEntity = entity.id === active.id ? opponent : active;
                entity.config.skills.filter(s => s.isPassive).forEach(s => {
                    // Unique key per entity+skill to handle mirror matches
                    const uniqueTriggerKey = `${entity.id}-${s.id}`;
                    if (triggeredSkillIds.has(uniqueTriggerKey)) return;

                    // New processSkill signature handles condition checking inside
                    // Passing isPassiveTrigger=true makes it only return true (and cost mana) if conditions match
                    const success = processSkill(s, entity, enemyOfEntity, pushEvent, newState.turn, true);
                    
                    if (success) {
                        passiveTriggered = true;
                        triggeredSkillIds.add(uniqueTriggerKey);
                        // Add visual floating text for passive
                        pushEvent({ 
                        type: 'SKILL_EFFECT', 
                        sourceId: entity.id, 
                        skillName: s.name,
                        text: undefined 
                        });
                        pushEvent({ type: 'TEXT', text: `[被动] ${entity.config.name} 触发 ${s.name}`});
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
        
        // NOTE: removed setSelectedSkillIndex(0) to persist selection
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
            
            // Force basic attack on timeout (handles passive skill selected or AFK)
            if (battleState.mode === 'LOCAL_BOT' || myRole === 'HOST') {
                 executeTurn('basic_attack');
            }
        }
    }, [battleState?.timeLeft, myRole, executeTurn, battleState?.mode, battleState?.phase, battleState?.winnerId]);

    // Bot Logic
    useEffect(() => {
        if (!battleState) return;
        const { mode, phase, activePlayerId, winnerId } = battleState;

        if (mode === 'LOCAL_BOT' && phase === 'ACTION_SELECTION' && activePlayerId === 'bot_enemy' && !winnerId) {
            const timer = setTimeout(() => {
                const enemy = battleState.p1.id === 'bot_enemy' ? battleState.p1 : battleState.p2;
                const skills = enemy.config.skills.filter(s => !s.isPassive);
                // Bot calculates costs based on its current state
                const affordable = skills.filter(s => calculateManaCost(s, enemy.config.stats, enemy) <= enemy.currentMana);
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

        // Use MY entity for skill selection
        const myEntity = battleState.p1.id === playerId ? battleState.p1 : battleState.p2;
        const sortedSkills = getSortedSkills(myEntity);
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (processingTurnRef.current) return;
            
            if (e.key === 'ArrowRight') {
                setSelectedSkillIndex(prev => (prev + 1) % sortedSkills.length);
            } else if (e.key === 'ArrowLeft') {
                setSelectedSkillIndex(prev => (prev - 1 + sortedSkills.length) % sortedSkills.length);
            } else if (e.key === 'Enter') {
                const skill = sortedSkills[selectedSkillIndex % sortedSkills.length];
                if (!skill.isPassive) {
                    executeTurn(skill.id);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [view, battleState, playerId, selectedSkillIndex, executeTurn, myRole, getSortedSkills]);

    // Helper
    const getSkillDescription = (skill: Skill, entity?: BattleEntity) => {
        let description = "";
        
        if (skill.id === 'basic_attack') {
            const ent = entity || { config: { stats: myChar!.stats } } as any;
            const ad = getTotalStat(ent, StatType.AD);
            const ap = getTotalStat(ent, StatType.AP);
            const isMagic = ap > ad;
            
            return `【基础动作】造成等于当前${isMagic ? '法术强度' : '攻击力'}的${isMagic ? '魔法' : '物理'}伤害。\n(自适应: AP > AD 时造成魔法伤害)\n当前效果: ${isMagic ? '计算法穿与全能吸血' : '计算物穿与生命偷取'}\n无消耗。`;
        }

        const stats = entity ? entity.config.stats : myChar?.stats;
        if (stats) {
            const cost = calculateManaCost(skill, stats, entity);
            const isDynamic = hasDynamicStats(skill);
            let costText = `${cost}`;
            if (!entity && isDynamic) {
                    costText += " + 战时加成";
            }
            description = skill.isPassive ? `【被动 | 估算消耗 ${costText} MP】` : `【主动 | 消耗 ${costText} MP】`;
        }

        if (skill.logic.length === 0) return description + " (无效果)";
        
        // Simplified description for the main battle view, detailing logic branches
        const logicDesc = skill.logic.map((branch, i) => {
            const cond = branch.condition;
            const eff = branch.effect;
            
            let condText = "总是";
            if (cond) {
                const target = cond.sourceTarget === 'SELF' ? '自身' : '敌方';
                const varMap: Record<string, string> = {
                    'HP': '生命', 'HP%': '生命%', 
                    'HP_LOST': '已损生命', 'HP_LOST%': '已损生命%',
                    'MANA': '法力', 'MANA%': '法力%', 
                    'TURN': '回合'
                };
                const v = varMap[cond.variable] || cond.variable;
                condText = `若 ${target}${v} ${cond.operator} ${cond.value}`;
            }

            const formatTarget = (t: string) => t === 'SELF' ? '自身' : '敌方';
            const actionMap: Record<string, string> = {
                'DAMAGE_PHYSICAL': '物理伤害',
                'DAMAGE_MAGIC': '魔法伤害',
                'INCREASE_STAT': '增加',
                'DECREASE_STAT': '减少'
            };
            const fa = eff.formula.factorA;
            const fb = eff.formula.factorB;
            const opMap: Record<string, string> = { '+':'+', '-':'-', '*':'x', '/':'÷' };
            const op = opMap[eff.formula.operator] || eff.formula.operator;
            
            let actionText = actionMap[eff.type] || eff.type;
            if (eff.type === 'INCREASE_STAT' || eff.type === 'DECREASE_STAT') {
                actionText += eff.targetStat;
            }
            
            return `[${i+1}] ${condText} -> 对${formatTarget(eff.target)}${actionText} (${fa.stat}${op}${fb.stat})`;
        }).join('\n');
        
        return description + "\n" + logicDesc;
    };

    const handleEntityClick = (id: string) => {
        if (!battleState) return;
        const entity = [battleState.p1, battleState.p2].find(e => e.id === id);
        if (entity) setInspectedEntity(entity);
    };

    // --- Sub-Component for Stats Panel ---
    const StatPanel: React.FC<{ entity: BattleEntity, isRight?: boolean }> = ({ entity, isRight }) => {
        // Exclude dynamic stats from the grid display
        const displayStats = Object.values(StatType).filter(s => !DYNAMIC_STATS.includes(s));
        
        return (
            <div className={`absolute top-20 bottom-24 w-64 ${isRight ? 'right-4' : 'left-4'} bg-slate-900/80 backdrop-blur border border-slate-700 rounded-xl p-4 flex flex-col z-20 overflow-y-auto custom-scrollbar shadow-2xl`}>
                <div className="flex items-center gap-3 mb-4 border-b border-slate-700 pb-2">
                    {/* Replaced Div with HeroAvatar */}
                    <div className={`rounded-lg shadow-lg border-2 overflow-hidden ${isRight ? 'border-red-500' : 'border-blue-500'}`}>
                        <HeroAvatar appearance={entity.config.appearance!} size={48} bgColor={entity.config.avatarColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="font-bold text-white truncate">{entity.config.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono flex flex-col gap-0.5">
                             <div className="flex justify-between">
                                 <span>HP</span>
                                 <span className="text-white">{Math.floor(entity.currentHp)}/{Math.floor(getTotalStat(entity, StatType.HP))}</span>
                             </div>
                             <div className="flex justify-between">
                                 <span>MP</span>
                                 <span className="text-white">{Math.floor(entity.currentMana)}/{Math.floor(getTotalStat(entity, StatType.MANA))}</span>
                             </div>
                        </div>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                    {displayStats.map(stat => {
                        const val = getTotalStat(entity, stat);
                        return (
                            <div key={stat} className="bg-slate-800/50 p-2 rounded border border-slate-700/50 flex items-center justify-between group relative hover:bg-slate-700 transition-colors cursor-help">
                                <div className="flex items-center gap-2">
                                    {getStatIcon(stat)}
                                </div>
                                <span className="font-mono text-xs font-bold text-slate-300">
                                    {Number.isInteger(val) ? val : val.toFixed(1)}
                                    {/* Percent suffix for stats that are purely percentage based if needed, though raw number is usually what's stored */}
                                </span>
                                
                                {/* Hover Tooltip */}
                                <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-xs px-2 py-1 rounded -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none z-50 shadow-lg border border-slate-600">
                                    {stat}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="h-screen w-screen bg-slate-950 text-slate-200 flex flex-col overflow-hidden">
            {/* Top Bar */}
            <div className="h-12 border-b border-slate-800 bg-slate-900/50 flex items-center px-6 justify-between select-none z-50">
                <span className="retro-font text-blue-400 text-sm cursor-pointer" onClick={() => {
                    net.disconnect();
                    setView('MENU');
                }}>Code Hero</span>
                <div className="text-xs text-slate-600 font-mono">ID: {playerId.slice(0, 6)}</div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden relative">
                
                {/* --- INSPECTION MODAL --- */}
                {inspectedEntity && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setInspectedEntity(null)}>
                        <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="rounded-lg shadow-lg overflow-hidden border border-slate-600">
                                        <HeroAvatar appearance={inspectedEntity.config.appearance!} size={48} bgColor={inspectedEntity.config.avatarColor} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">{inspectedEntity.config.name}</h3>
                                        <div className="text-xs text-slate-400">技能列表</div>
                                    </div>
                                </div>
                                <button onClick={() => setInspectedEntity(null)} className="text-slate-500 hover:text-white"><X size={24} /></button>
                            </div>
                            <div className="overflow-y-auto custom-scrollbar space-y-4 pr-2">
                                {inspectedEntity.config.skills.map(skill => (
                                    <div key={skill.id} className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="font-bold text-yellow-100 flex items-center gap-2">
                                                {skill.name}
                                                {skill.isPassive && <span className="text-[10px] bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">被动</span>}
                                            </div>
                                            <div className="text-xs text-slate-500 font-mono">{calculateManaCost(skill, inspectedEntity.config.stats, inspectedEntity)} MP</div>
                                        </div>
                                        <div className="text-xs text-slate-400 leading-relaxed space-y-3">
                                            {skill.logic.map((branch, i) => (
                                                <div key={i} className="bg-slate-900/50 p-2 rounded border border-slate-800/50">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] text-slate-500 font-bold bg-slate-800 px-1 rounded">BLOCK {i+1}</span>
                                                        <div className="text-blue-400 font-bold flex gap-1">
                                                            IF 
                                                            {branch.condition ? (
                                                                <span className="text-slate-300">
                                                                    {(branch.condition.sourceTarget === 'SELF' ? '自身' : '敌方') + branch.condition.variable} {branch.condition.operator} {branch.condition.value}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-500 italic">Always</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="pl-4 border-l border-slate-700">
                                                        <div className="text-green-400 font-bold flex gap-1">
                                                            THEN 
                                                            <span className="text-slate-300">
                                                                {(() => {
                                                                    const eff = branch.effect;
                                                                    const formatTarget = (t: string) => t === 'SELF' ? '自身' : '敌方';
                                                                    const actionMap: Record<string, string> = {
                                                                        'DAMAGE_PHYSICAL': '物理伤害',
                                                                        'DAMAGE_MAGIC': '魔法伤害',
                                                                        'INCREASE_STAT': '增加',
                                                                        'DECREASE_STAT': '减少'
                                                                    };
                                                                    let actionText = actionMap[eff.type] || eff.type;
                                                                    if (eff.type === 'INCREASE_STAT' || eff.type === 'DECREASE_STAT') {
                                                                        actionText += eff.targetStat;
                                                                    }
                                                                    const op = eff.formula.operator === '*' ? 'x' : eff.formula.operator;
                                                                    return `对${formatTarget(eff.target)}${actionText} (${eff.formula.factorA.stat} ${op} ${eff.formula.factorB.stat})`;
                                                                })()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {skill.logic.length === 0 && <span className="italic opacity-50">无逻辑块</span>}
                                        </div>
                                    </div>
                                ))}
                                {inspectedEntity.config.skills.length === 0 && (
                                    <div className="text-center text-slate-600 py-8">该角色没有自定义技能</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {view === 'MENU' && (
                    <div className="flex flex-col items-center justify-center h-full gap-12 animate-in fade-in zoom-in duration-500">
                        <h1 className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 retro-font drop-shadow-2xl">
                            Code Hero
                        </h1>
                        
                        <div className="flex gap-6">
                            <button 
                                onClick={() => setView('HERO_LIST')} 
                                className="group relative w-64 h-40 bg-slate-800 rounded-2xl border border-slate-700 hover:border-blue-500 transition-all overflow-hidden flex flex-col items-center justify-center gap-4 shadow-2xl hover:-translate-y-2"
                            >
                                <div className="absolute inset-0 bg-blue-900/20 scale-0 group-hover:scale-100 transition-transform rounded-full blur-3xl"></div>
                                <Users size={48} className="text-blue-400 relative z-10" />
                                <span className="text-xl font-bold retro-font relative z-10">英雄名册</span>
                                <span className="text-xs text-slate-500 relative z-10">创建 & 管理</span>
                            </button>

                            <button 
                                onClick={() => setView('HERO_LIST')} 
                                className="group relative w-64 h-40 bg-slate-800 rounded-2xl border border-slate-700 hover:border-red-500 transition-all overflow-hidden flex flex-col items-center justify-center gap-4 shadow-2xl hover:-translate-y-2"
                            >
                                <div className="absolute inset-0 bg-red-900/20 scale-0 group-hover:scale-100 transition-transform rounded-full blur-3xl"></div>
                                <Swords size={48} className="text-red-400 relative z-10" />
                                <span className="text-xl font-bold retro-font relative z-10">开始战斗</span>
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
                        onBack={() => setView('HERO_LIST')} 
                    />
                )}

                {view === 'BATTLE_SETUP' && myChar && (
                     <div className="flex flex-col items-center justify-center h-full gap-8 animate-in fade-in slide-in-from-right duration-300">
                        <h2 className="text-3xl font-bold retro-font">选择战斗模式</h2>
                        
                        <div className="flex items-center gap-4 bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4">
                             <div className="rounded overflow-hidden border border-slate-600">
                                <HeroAvatar appearance={myChar.appearance!} size={64} bgColor={myChar.avatarColor} />
                            </div>
                            <div>
                                <div className="text-xs text-slate-400">当前使用</div>
                                <div className="font-bold text-xl">{myChar.name}</div>
                            </div>
                            <button onClick={() => setView('HERO_LIST')} className="ml-4 text-xs bg-slate-700 px-2 py-1 rounded hover:bg-slate-600">更换</button>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                             <button onClick={startLocalBotBattle} className="w-64 p-6 bg-slate-800 hover:bg-emerald-900/30 border border-slate-600 hover:border-emerald-500 rounded-xl flex flex-col items-center gap-3 transition-all">
                                <Cpu size={40} className="text-emerald-400"/>
                                <span className="font-bold text-lg retro-font">人机训练</span>
                                <span className="text-xs text-slate-500">VS AI BOT (本地)</span>
                            </button>

                            <div className="w-64 p-6 bg-slate-800 border border-slate-600 rounded-xl flex flex-col items-center gap-4">
                                <Globe size={40} className="text-blue-400"/>
                                <span className="font-bold text-lg retro-font">在线对战</span>
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
                        {/* ... existing Lobby layout ... */}
                        <div className="absolute top-12 flex flex-col items-center gap-2">
                            <div className="text-slate-400 text-sm font-bold uppercase tracking-widest">房间号</div>
                            <div className="flex items-center gap-4">
                                <div className="text-4xl font-mono font-bold text-white bg-slate-800 px-6 py-2 rounded-xl border border-slate-700 shadow-xl">
                                    {roomId}
                                </div>
                                <button 
                                    onClick={copyRoomId}
                                    className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 transition-all border border-slate-700"
                                    title="复制房间号"
                                >
                                    {copiedRoomId ? <Check size={24} /> : <Copy size={24} />}
                                </button>
                            </div>
                        </div>

                        <div className="absolute top-8 right-8 flex items-center gap-2 text-slate-400">
                            <Eye size={16}/> 观战: {spectators.length}
                        </div>
                        
                        <h2 className="text-3xl font-bold retro-font text-white mb-8 mt-16">对战大厅</h2>

                        <div className="flex gap-12 items-center">
                            {/* Host Card */}
                            <div className="flex flex-col items-center gap-4">
                                <div className={`relative w-48 h-64 bg-slate-800 rounded-xl border-2 flex flex-col items-center justify-center p-4 transition-all ${myRole === 'HOST' ? 'border-yellow-500' : 'border-slate-600'}`}>
                                    {/* Avatar */}
                                    <div className="rounded-lg mb-4 shadow-lg overflow-hidden border border-slate-600">
                                        <HeroAvatar 
                                            appearance={(myRole === 'HOST' ? myChar : opponentChar)?.appearance!} 
                                            size={80} 
                                            bgColor={(myRole === 'HOST' ? myChar : opponentChar)?.avatarColor || '#333'} 
                                        />
                                    </div>
                                    <h3 className="font-bold text-lg">{(myRole === 'HOST' ? myChar : opponentChar)?.name || '等待中...'}</h3>
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
                            <div className="flex flex-col items-center gap-4">
                                {(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : (myRole === 'SPECTATOR' ? spectatorChallengerChar : null))) ? (
                                    <div className={`relative w-48 h-64 bg-slate-800 rounded-xl border-2 flex flex-col items-center justify-center p-4 transition-all ${(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'border-slate-600'}`}>
                                        <div className="rounded-lg mb-4 shadow-lg overflow-hidden border border-slate-600">
                                            <HeroAvatar 
                                                appearance={(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : spectatorChallengerChar))?.appearance!} 
                                                size={80} 
                                                bgColor={(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : spectatorChallengerChar))?.avatarColor} 
                                            />
                                        </div>
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
                            回合 {battleState.turn}
                        </div>

                        {/* Timer Moved to Top Center */}
                         <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
                            <div className="text-xs text-slate-500 uppercase tracking-widest mb-1 shadow-black/50 text-shadow">倒计时</div>
                            <div className={`text-2xl font-mono font-bold px-4 py-1 rounded border shadow-lg ${battleState.timeLeft < 10 ? 'text-red-500 border-red-900 bg-red-950/80' : 'text-white border-slate-700 bg-slate-800/80'}`}>
                                {battleState.phase === 'ACTION_SELECTION' && !battleState.winnerId ? battleState.timeLeft : '--'}
                            </div>
                        </div>
                        
                        {myRole !== 'SPECTATOR' && !battleState.winnerId && (
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
                        
                        {/* IN-SCENE RESULT DISPLAY */}
                        {battleState.winnerId && (
                            <div className="absolute top-32 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center animate-in fade-in zoom-in duration-300">
                                {myRole === 'SPECTATOR' ? (
                                    <div className="text-4xl font-bold retro-font text-yellow-400 drop-shadow-[0_4px_0_rgba(0,0,0,0.8)]">游戏结束</div>
                                ) : (
                                    <div className={`text-6xl font-black retro-font drop-shadow-[0_6px_0_rgba(0,0,0,0.8)] ${battleState.winnerId === playerId ? 'text-yellow-400 stroke-text-yellow' : 'text-red-600 stroke-text-red'}`}>
                                        {battleState.winnerId === playerId ? 'VICTORY' : 'DEFEAT'}
                                    </div>
                                )}
                                <div className="mt-2 text-xl font-bold text-white drop-shadow-md">
                                    {(battleState.winnerId === battleState.p1.id ? battleState.p1.config.name : battleState.p2.config.name)} 获胜!
                                </div>
                            </div>
                        )}

                        <BattleScene 
                            gameState={battleState} 
                            onAnimationsComplete={handleAnimationComplete}
                            onEntityClick={handleEntityClick}
                        />
                        
                        {/* Player Stats Panels (Left & Right) */}
                        <StatPanel entity={battleState.p1} isRight={false} />
                        <StatPanel entity={battleState.p2} isRight={true} />

                        {/* Active Player Indicator Bar */}
                        <div className={`absolute bottom-0 w-full h-2 transition-all duration-500 bg-gradient-to-r from-yellow-500/0 via-yellow-500 to-yellow-500/0 ${battleState.activePlayerId === battleState.p1.id ? 'translate-x-[-25%]' : 'translate-x-[25%]'}`}></div>


                        {/* Controls (Bottom Center) */}
                        <div className={`absolute bottom-4 w-full max-w-4xl left-1/2 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-8 duration-500 transition-all`}>
                        {(() => {
                            // ... (Existing controls logic) ...
                            const isMyTurn = battleState.activePlayerId === playerId;
                            const isSpectating = myRole === 'SPECTATOR';
                            
                            // --- GAME FINISHED UI ---
                            if (battleState.winnerId || battleState.phase === 'FINISHED') {
                                return (
                                    <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-6 flex items-center justify-center gap-8 shadow-2xl backdrop-blur max-w-lg mx-auto">
                                        <button 
                                            onClick={() => { net.disconnect(); setView('HERO_LIST'); }} 
                                            className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold transition-all hover:scale-105 border border-slate-600"
                                        >
                                            <Home size={20} /> 返回名册
                                        </button>
                                        
                                        {!isSpectating && (
                                            <button 
                                                onClick={handleRematchClick}
                                                disabled={myRematchRequest || opponentLeft}
                                                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all shadow-lg border ${
                                                    opponentLeft 
                                                        ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                                                        : myRematchRequest 
                                                            ? 'bg-yellow-900/50 text-yellow-400 border-yellow-600/50 cursor-wait'
                                                            : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105 border-blue-400'
                                                }`}
                                            >
                                                {opponentLeft ? (
                                                    <>对方已离开</>
                                                ) : myRematchRequest ? (
                                                    <><Loader2 size={20} className="animate-spin" /> 等待对方...</>
                                                ) : (
                                                    <><RefreshCcw size={20} /> 再来一局</>
                                                )}
                                            </button>
                                        )}
                                        
                                        {/* Show opponent status text if in Online PVP */}
                                        {battleState.mode === 'ONLINE_PVP' && !isSpectating && !opponentLeft && (
                                             <div className="absolute -top-10 left-0 right-0 text-center">
                                                {opponentRematchRequest && !myRematchRequest && (
                                                    <span className="bg-blue-900/80 text-blue-200 px-3 py-1 rounded-full text-xs animate-bounce border border-blue-500">
                                                        对方想再来一局!
                                                    </span>
                                                )}
                                             </div>
                                        )}
                                    </div>
                                );
                            }

                            if (!isSpectating) {
                                return (
                                    <>
                                        {!isMyTurn && (
                                            <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-30 bg-slate-900/80 px-4 py-2 rounded-full border border-slate-700 text-yellow-400 font-bold flex items-center gap-2 whitespace-nowrap">
                                                <Lock size={16}/> 对手回合 - 技能仅供查看
                                            </div>
                                        )}

                                        <div className="flex justify-center items-center gap-4">
                                            {(() => {
                                                const myEntity = battleState.p1.id === playerId ? battleState.p1 : battleState.p2;
                                                const sortedSkills = getSortedSkills(myEntity);
                                                
                                                return sortedSkills.map((skill, idx) => {
                                                    const isSelected = idx === (selectedSkillIndex % sortedSkills.length);
                                                    const cost = skill.id === 'basic_attack' ? 0 : calculateManaCost(skill, myEntity.config.stats, myEntity);
                                                    const canAfford = myEntity.currentMana >= cost;
                                                    const isAttack = skill.id === 'basic_attack';
                                                    const isPassive = skill.isPassive;

                                                    return (
                                                        <div 
                                                            key={skill.id} 
                                                            onClick={() => {
                                                                setSelectedSkillIndex(idx);
                                                                if (isMyTurn && !isPassive && canAfford && !processingTurnRef.current) {
                                                                    executeTurn(skill.id);
                                                                }
                                                            }}
                                                            className={`
                                                                relative w-24 h-24 rounded-xl border-2 flex flex-col items-center justify-between p-2 transition-all duration-200 cursor-pointer bg-slate-900/90
                                                                ${isSelected ? 'scale-110 z-10 shadow-[0_0_20px_rgba(59,130,246,0.4)]' : 'scale-95 opacity-60'}
                                                                ${isSelected ? (isPassive ? 'border-indigo-400' : canAfford ? 'border-blue-400' : 'border-red-500') : 'border-slate-700'}
                                                            `}
                                                        >
                                                            {/* ... existing skill button content ... */}
                                                            {isPassive && (
                                                                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-indigo-900 text-indigo-200 text-[10px] px-2 py-0.5 rounded-full border border-indigo-500 whitespace-nowrap z-20 shadow-sm">
                                                                    被动
                                                                </div>
                                                            )}
                                                            
                                                            {!isAttack && (
                                                                <div className={`absolute -top-2 -right-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${canAfford ? 'bg-blue-900 border-blue-500 text-blue-200' : 'bg-red-900 border-red-500 text-white'}`}>
                                                                    {cost} MP
                                                                </div>
                                                            )}

                                                            <div className={`flex-1 flex items-center justify-center ${isPassive ? 'text-indigo-400' : canAfford ? (isAttack ? 'text-yellow-400' : 'text-purple-400') : 'text-red-500'}`}>
                                                                {isPassive ? <Shield size={32} /> : isAttack ? <Swords size={32} /> : <Zap size={32} />}
                                                            </div>

                                                            <div className="w-full text-center text-[10px] font-bold truncate text-slate-300">
                                                                {skill.name}
                                                            </div>

                                                            {isSelected && (
                                                                <div className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent ${isPassive ? '-top-2 border-t-[6px] border-t-indigo-400' : '-bottom-2 border-b-[6px] border-b-blue-400'}`}></div>
                                                            )}
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>

                                        <div className="absolute bottom-[calc(100%+1.5rem)] left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-700 rounded-xl p-6 flex flex-col items-center text-center shadow-2xl max-w-2xl w-full min-h-[120px] z-20 backdrop-blur">
                                            {isMyTurn && (
                                                <>
                                                    <div className="absolute top-4 left-4 flex gap-1">
                                                        <div className="w-6 h-6 rounded bg-slate-800 border border-slate-600 flex items-center justify-center text-xs text-slate-400"><ArrowLeft size={12}/></div>
                                                        <div className="w-6 h-6 rounded bg-slate-800 border border-slate-600 flex items-center justify-center text-xs text-slate-400"><ArrowRight size={12}/></div>
                                                        <span className="text-xs text-slate-600 ml-2 self-center">选择</span>
                                                    </div>
                                                    <div className="absolute top-4 right-4 flex gap-2 items-center">
                                                        <span className="text-xs text-slate-600 self-center">确认</span>
                                                        <div className="px-2 h-6 rounded bg-slate-800 border border-slate-600 flex items-center justify-center text-xs text-slate-400 font-mono">回车</div>
                                                        <CornerDownLeft size={14} className="text-slate-500"/>
                                                    </div>
                                                </>
                                            )}

                                            <div className="mt-2 w-full">
                                                {(() => {
                                                    const myEntity = battleState.p1.id === playerId ? battleState.p1 : battleState.p2;
                                                    const sortedSkills = getSortedSkills(myEntity);
                                                    const selectedSkill = sortedSkills[selectedSkillIndex % sortedSkills.length];
                                                    
                                                    return (
                                                        <>
                                                            <h4 className="text-xl font-bold text-white mb-2">{selectedSkill.name}</h4>
                                                            <div className="text-slate-400 font-mono text-sm leading-relaxed max-w-lg mx-auto whitespace-pre-wrap">
                                                                {getSkillDescription(selectedSkill, myEntity)}
                                                            </div>
                                                        </>
                                                    )
                                                })()}
                                            </div>
                                        </div>
                                    </>
                                )
                            }
                        })()}
                        </div>
                        
                        {(battleState.mode === 'ONLINE_PVP' && battleState.activePlayerId !== playerId && battleState.phase !== 'EXECUTING') 
                            && !battleState.winnerId && (
                             <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-slate-500 font-mono animate-pulse flex items-center gap-2">
                                <div className="w-2 h-2 bg-slate-500 rounded-full"></div>
                                {myRole === 'SPECTATOR' ? '玩家思考中...' : '等待对手行动...'}
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
