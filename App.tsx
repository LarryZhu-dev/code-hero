
import React, { useState, useEffect, useCallback, useRef } from 'react';
import CharacterEditor from './components/CharacterEditor';
import CharacterList from './components/CharacterList';
import BattleScene from './components/BattleScene';
import HeroAvatar from './components/HeroAvatar';
import { GameLogo } from './components/GameLogo';
import { CharacterConfig, BattleState, BattleEntity, StatType, Skill, BattleMode, BattleEvent, DYNAMIC_STATS } from './types';
import { processSkill, evaluateCondition, getTotalStat, calculateManaCost, processBasicAttack, hasDynamicStats } from './utils/gameEngine';
import { StorageService } from './services/storage';
import { net } from './services/mqtt';
import { 
    IconBolt, IconBoot, IconCheck, IconCrosshair, IconHeart, IconHome, IconMana, 
    IconPlay, IconRefresh, IconSave, IconShield, IconSkull, IconStaff, IconSword,
    IconBrokenShield, IconVampire, IconDroplet, IconSpark, IconMuscle, IconBack
} from './components/PixelIcons';
import { Loader2, Lock, Flag, Eye, Copy, Check, Users, Swords, X } from 'lucide-react';

type AppView = 'MENU' | 'HERO_MANAGE' | 'EDITOR' | 'BATTLE_SETUP' | 'PUBLIC_HALL' | 'LOBBY' | 'BATTLE';
type UserRole = 'HOST' | 'CHALLENGER' | 'SPECTATOR' | 'NONE';

// --- Stat Icon Mapping ---
const getStatIcon = (stat: StatType) => {
    switch(stat) {
        case StatType.HP: return <IconHeart size={14} className="text-red-500"/>;
        case StatType.MANA: return <IconMana size={14} className="text-blue-500"/>;
        case StatType.AD: return <IconSword size={14} className="text-orange-500"/>;
        case StatType.AP: return <IconStaff size={14} className="text-purple-500"/>;
        case StatType.ARMOR: return <IconShield size={14} className="text-yellow-500"/>;
        case StatType.MR: return <IconShield size={14} className="text-cyan-500"/>;
        case StatType.SPEED: return <IconBoot size={14} className="text-emerald-500"/>;
        case StatType.CRIT_RATE: return <IconCrosshair size={14} className="text-pink-500"/>;
        case StatType.CRIT_DMG: return <IconSkull size={14} className="text-rose-700"/>;
        case StatType.ARMOR_PEN_FLAT: return <IconBrokenShield size={14} className="text-orange-300"/>;
        case StatType.ARMOR_PEN_PERC: return <IconBrokenShield size={14} className="text-orange-600"/>;
        case StatType.MAGIC_PEN_FLAT: return <IconSpark size={14} className="text-purple-300"/>;
        case StatType.MAGIC_PEN_PERC: return <IconSpark size={14} className="text-purple-600"/>;
        case StatType.LIFESTEAL: return <IconVampire size={14} className="text-red-400"/>;
        case StatType.OMNIVAMP: return <IconVampire size={14} className="text-purple-400"/>;
        case StatType.MANA_REGEN: return <IconDroplet size={14} className="text-blue-300"/>;
        case StatType.TENACITY: return <IconMuscle size={14} className="text-yellow-600"/>;
        default: return <div className="w-3 h-3 bg-slate-600" />;
    }
}

interface PublicPlayer {
    id: string; // Network ID
    name: string;
    char: CharacterConfig;
    status: 'IDLE' | 'BUSY';
    lastSeen: number;
}

const App: React.FC = () => {
    const [view, setView] = useState<AppView>('MENU');
    const [myChar, setMyChar] = useState<CharacterConfig | null>(null);
    const [battleState, setBattleState] = useState<BattleState | null>(null);
    const [playerId] = useState(net.playerId); 
    const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
    
    // Modal State
    const [showHeroSelect, setShowHeroSelect] = useState(false);

    // Online State
    const [roomId, setRoomId] = useState('');
    const [lobbyLog, setLobbyLog] = useState<string[]>([]);
    const [myRole, setMyRole] = useState<UserRole>('NONE');
    const [copiedRoomId, setCopiedRoomId] = useState(false);
    const [battleOrigin, setBattleOrigin] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
    
    // Public Hall State
    const [hallPlayers, setHallPlayers] = useState<PublicPlayer[]>([]);
    const [incomingChallenge, setIncomingChallenge] = useState<{fromId: string, name: string} | null>(null);
    const [challengeSentTo, setChallengeSentTo] = useState<string | null>(null);

    // Battle Lobby State
    const [opponentChar, setOpponentChar] = useState<CharacterConfig | null>(null);
    const [opponentId, setOpponentId] = useState<string | null>(null);
    const [opponentReady, setOpponentReady] = useState(false);
    const [amIReady, setAmIReady] = useState(false);
    
    const [challengerId, setChallengerId] = useState<string | null>(null);
    const [spectatorChallengerChar, setSpectatorChallengerChar] = useState<CharacterConfig | null>(null);
    const [spectators, setSpectators] = useState<{id: string, name: string}[]>([]);

    const [myRematchRequest, setMyRematchRequest] = useState(false);
    const [opponentRematchRequest, setOpponentRematchRequest] = useState(false);
    const [opponentLeft, setOpponentLeft] = useState(false);

    const [inspectedEntity, setInspectedEntity] = useState<BattleEntity | null>(null);
    const processingTurnRef = useRef(false);
    
    const myRoleRef = useRef<UserRole>('NONE');
    const handleMessageRef = useRef<((action: string, data: any) => void) | null>(null);

    // Load Last Used Hero
    useEffect(() => {
        const lastId = StorageService.getLastUsed();
        const all = StorageService.getAll();
        if (all.length > 0) {
            const found = all.find(c => c.id === lastId);
            setMyChar(found || all[0]);
        }
    }, []);

    useEffect(() => {
        myRoleRef.current = myRole;
    }, [myRole]);

    // Public Hall Heartbeat
    useEffect(() => {
        if (view !== 'PUBLIC_HALL' || !myChar) return;
        
        const timer = setInterval(() => {
            // Prune offline players (5s timeout)
            const now = Date.now();
            setHallPlayers(prev => prev.filter(p => now - p.lastSeen < 5000));
            
            // Broadcast self
            net.announcePresence({
                name: myChar.name,
                char: myChar,
                status: 'IDLE'
            });
        }, 2000);

        return () => clearInterval(timer);
    }, [view, myChar]);

    const getSortedSkills = useCallback((entity: BattleEntity | CharacterConfig) => {
        const skills = 'config' in entity ? entity.config.skills : entity.skills;
        const actives = skills.filter(s => !s.isPassive);
        const passives = skills.filter(s => s.isPassive);
        const basic: Skill = { id: 'basic_attack', name: '普通攻击', isPassive: false, logic: [] };
        return [...actives, basic, ...passives];
    }, []);

    const handleSaveChar = (char: CharacterConfig) => {
        StorageService.save(char);
        setMyChar(char);
        setView('HERO_MANAGE');
    };

    const handleSelectHero = (char: CharacterConfig) => {
        setMyChar(char);
        StorageService.saveLastUsed(char.id);
        setShowHeroSelect(false);
    };

    const startLocalBotBattle = () => {
        if (!myChar) return;
        const dummy: CharacterConfig = JSON.parse(JSON.stringify(myChar));
        dummy.id = 'bot_enemy';
        dummy.name = "训练机器人";
        dummy.avatarColor = '#64748b';
        dummy.stats.base[StatType.SPEED] = 100;
        setMyRole('HOST'); 
        initBattle(myChar, dummy, 'LOCAL_BOT');
    };

    const enterPublicHall = () => {
        if (!myChar) return;
        net.disconnect();
        setBattleOrigin('PUBLIC');
        setHallPlayers([]);
        setIncomingChallenge(null);
        setChallengeSentTo(null);
        setView('PUBLIC_HALL');
        
        net.connect('public_hall_global_v1', (action, data) => handleMessageRef.current?.(action, data), () => {
             net.announcePresence({ name: myChar.name, char: myChar, status: 'IDLE' });
        }, true);
    };

    const joinPrivateRoom = () => {
        if (!roomId) {
            alert("请输入房间号");
            return;
        }
        if (!myChar) return;
        
        setBattleOrigin('PRIVATE');
        net.disconnect();
        setupLobbyState();
        setView('LOBBY');
        
        let handshakeTimeout: ReturnType<typeof setTimeout>;

        net.connect(roomId, (action, data) => handleMessageRef.current?.(action, data), () => {
            setLobbyLog(prev => [...prev, '已连接服务器', '正在寻找房主...']);
            net.publish('query_host', {});
            handshakeTimeout = setTimeout(() => {
                if (myRoleRef.current === 'NONE') {
                    setMyRole('HOST');
                    setLobbyLog(prev => [...prev, '未发现房主，自动创建房间', '我是房主，等待挑战者...']);
                }
            }, 2000);
        });
    };

    const setupLobbyState = () => {
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
        setCopiedRoomId(false);
    };

    const copyRoomId = () => {
        navigator.clipboard.writeText(roomId);
        setCopiedRoomId(true);
        setTimeout(() => setCopiedRoomId(false), 2000);
    };

    const handleChallengePlayer = (targetId: string, targetName: string) => {
        if (challengeSentTo) return;
        setChallengeSentTo(targetId);
        net.sendChallenge(targetId, myChar?.name || 'Player');
        setTimeout(() => {
            if (view === 'PUBLIC_HALL' && challengeSentTo === targetId) {
                setChallengeSentTo(null);
                // Maybe show timeout toast
            }
        }, 10000);
    };

    const handleRespondChallenge = (accept: boolean) => {
        if (!incomingChallenge) return;
        
        if (accept) {
            // Generate match room ID
            const matchRoomId = `match_${Math.random().toString(36).substr(2, 9)}`;
            net.respondChallenge(incomingChallenge.fromId, true, matchRoomId);
            
            // Switch to Lobby Mode immediately
            net.disconnect();
            setRoomId(matchRoomId);
            setBattleOrigin('PUBLIC');
            setupLobbyState();
            setMyRole('HOST'); // Responder acts as Host
            myRoleRef.current = 'HOST'; 
            setView('LOBBY');
            
            // Connect to match room
            net.connect(matchRoomId, (action, data) => handleMessageRef.current?.(action, data), () => {
                 setLobbyLog(prev => [...prev, '匹配成功，房间建立', '等待对手连接...']);
            });

        } else {
            net.respondChallenge(incomingChallenge.fromId, false);
        }
        setIncomingChallenge(null);
    };

    const handleMessage = useCallback((action: string, data: any) => {
        // --- PUBLIC HALL MESSAGES ---
        if (view === 'PUBLIC_HALL') {
            if (action === 'presence' || action === 'presence_request') {
                if (action === 'presence_request') {
                     // Reply to request
                     if (myChar) net.announcePresence({ name: myChar.name, char: myChar, status: 'IDLE' });
                } else {
                    // Update list
                    const p = data as PublicPlayer & { sender: string };
                    setHallPlayers(prev => {
                        const existing = prev.find(x => x.id === p.sender);
                        if (existing) {
                            return prev.map(x => x.id === p.sender ? { ...x, lastSeen: Date.now(), status: p.status as any } : x);
                        }
                        return [...prev, { id: p.sender, name: p.name, char: p.char, status: p.status as any, lastSeen: Date.now() }];
                    });
                }
            }
            else if (action === 'challenge') {
                if (data.targetId === playerId) {
                    setIncomingChallenge({ fromId: data.sender, name: data.challengerName });
                }
            }
            else if (action === 'challenge_response') {
                if (data.targetId === playerId && data.sender === challengeSentTo) {
                    setChallengeSentTo(null);
                    if (data.accept && data.privateRoomId) {
                        // Accepted! Join room as Challenger
                        net.disconnect();
                        setRoomId(data.privateRoomId);
                        setBattleOrigin('PUBLIC');
                        setupLobbyState();
                        // Assume Challenger role first, but handshake will confirm
                        setMyRole('NONE'); 
                        setView('LOBBY');
                        
                        net.connect(data.privateRoomId, (action, data) => handleMessageRef.current?.(action, data), () => {
                             setLobbyLog(prev => [...prev, '对手已接受，加入房间...']);
                             // Trigger join request
                             net.publish('join_request', { id: playerId, name: myChar?.name, char: myChar });
                        });
                    } else {
                        alert("对方拒绝了挑战");
                    }
                }
            }
            return;
        }

        // --- PRIVATE ROOM MESSAGES (LOBBY/BATTLE) ---

        if (action === 'query_host') {
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
            if (myRoleRef.current === 'NONE') {
                setLobbyLog(prev => {
                     if (prev.some(l => l.includes(data.hostName))) return prev;
                     return [...prev, `发现房主: ${data.hostName}`];
                });
                net.publish('join_request', { id: playerId, name: myChar?.name, char: myChar });
            }
        }
        else if (action === 'join_request') {
            if (myRoleRef.current === 'HOST') {
                if (!opponentId && !challengerId) {
                    setOpponentId(data.id);
                    setChallengerId(data.id); 
                    setOpponentChar(data.char);
                    setOpponentReady(false);
                    setLobbyLog(prev => [...prev, `玩家 ${data.name} 加入挑战位`]);
                    net.publish('assign_role', { targetId: data.id, role: 'CHALLENGER', hostChar: myChar });
                    net.publish('lobby_update', { 
                        challenger: { id: data.id, char: data.char, name: data.name },
                        spectators: spectators 
                    });
                } else {
                    if (!spectators.find(s => s.id === data.id)) {
                        const newSpec = { id: data.id, name: data.name };
                        const newSpecsList = [...spectators, newSpec];
                        setSpectators(newSpecsList);
                        setLobbyLog(prev => [...prev, `玩家 ${data.name} 前来观战`]);
                        net.publish('assign_role', { targetId: data.id, role: 'SPECTATOR', hostChar: myChar, challengerChar: opponentChar, challengerId: opponentId });
                        net.publish('lobby_update', { 
                            challenger: { id: opponentId, char: opponentChar }, 
                            spectators: newSpecsList 
                        });
                    }
                }
            }
        }
        else if (action === 'assign_role') {
            if (data.targetId === playerId) {
                setMyRole(data.role);
                setOpponentChar(data.hostChar);
                if (data.role === 'CHALLENGER') {
                     setLobbyLog(prev => [...prev, '你已成为挑战者', '请准备...']);
                } else if (data.role === 'SPECTATOR') {
                     setLobbyLog(prev => [...prev, '房间已满，你已进入观战模式']);
                     if (data.challengerChar) {
                         setSpectatorChallengerChar(data.challengerChar);
                         setChallengerId(data.challengerId);
                     }
                }
            }
        }
        else if (action === 'lobby_update') {
            if (data.challenger) {
                setChallengerId(data.challenger.id);
                setSpectatorChallengerChar(data.challenger.char);
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
            if (data.sender === challengerId || data.sender === opponentId) {
                setOpponentReady(data.ready);
                setLobbyLog(prev => {
                    const msg = `挑战者 ${data.ready ? '已准备' : '取消准备'}`;
                    if (prev[prev.length-1] === msg) return prev; 
                    return [...prev, msg];
                });
            }
        }
        else if (action === 'leave') {
            const leavingId = data.id;
            if (leavingId === challengerId || leavingId === opponentId) {
                setOpponentLeft(true);
            }
            if (leavingId === challengerId || leavingId === opponentId) {
                setOpponentReady(false);
                if (myRoleRef.current !== 'HOST') {
                     setChallengerId(null);
                     setSpectatorChallengerChar(null);
                     setLobbyLog(prev => [...prev, '挑战者离开了']);
                }
            }
            if (myRoleRef.current === 'HOST') {
                if (leavingId === opponentId) {
                    setLobbyLog(prev => [...prev, '挑战者离开了']);
                    setOpponentChar(null);
                    setOpponentId(null);
                    setChallengerId(null);
                    setOpponentReady(false);
                    if (spectators.length > 0) {
                        const nextPlayer = spectators[0];
                        const remainingSpecs = spectators.slice(1);
                        setSpectators(remainingSpecs);
                        setOpponentId(nextPlayer.id);
                        setChallengerId(nextPlayer.id);
                        setLobbyLog(prev => [...prev, `观战者 ${nextPlayer.name} 补位成为挑战者`]);
                        net.publish('promote_spectator', { targetId: nextPlayer.id });
                        net.publish('lobby_update', { challenger: null, spectators: remainingSpecs });
                    } else {
                        net.publish('lobby_update', { challenger: null, spectators: [] });
                    }
                } else {
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
                net.publish('join_request', { id: playerId, name: myChar?.name, char: myChar });
            }
        }
        else if (action === 'sync_state') {
            setBattleState(data.state);
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
    }, [myRole, opponentId, challengerId, opponentChar, spectators, myChar, playerId, view, challengeSentTo]);

    useEffect(() => {
        handleMessageRef.current = handleMessage;
    }, [handleMessage]);

    useEffect(() => {
        if (battleState?.mode === 'ONLINE_PVP' && myRole === 'HOST') {
            if (myRematchRequest && opponentRematchRequest) {
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
        setMyRematchRequest(false);
        setOpponentRematchRequest(false);
        setOpponentLeft(false);

        const p1Speed = getTotalStat({ config: hostConfig } as any, StatType.SPEED);
        const p2Speed = getTotalStat({ config: challengerConfig } as any, StatType.SPEED);
        const p1First = p1Speed >= p2Speed;

        const hostId = playerId;
        const challengerId = mode === 'LOCAL_BOT' ? 'bot_enemy' : (opponentId || 'unknown_challenger');

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

    const executeTurn = useCallback((skillId: string) => {
        if (!battleState || processingTurnRef.current) return;
        
        let isMyTurn = false;
        if (battleState.mode === 'ONLINE_PVP') {
            if (myRole === 'SPECTATOR') isMyTurn = false;
            else isMyTurn = battleState.activePlayerId === playerId;
        } else {
            isMyTurn = battleState.activePlayerId === playerId;
        }

        if (battleState.mode === 'ONLINE_PVP' && !isMyTurn) return;
        processingTurnRef.current = true;

        const newState = { ...battleState };
        const isP1Active = newState.activePlayerId === newState.p1.id;
        const active = isP1Active ? newState.p1 : newState.p2;
        const opponent = isP1Active ? newState.p2 : newState.p1;
        
        newState.events = [];
        const pushEvent = (evt: BattleEvent) => newState.events.push(evt);

        if (skillId !== 'basic_attack') {
            const skill = active.config.skills.find(s => s.id === skillId);
            if (!skill) return;
            if (skill.isPassive) {
                 processingTurnRef.current = false;
                 return;
            }
            const cost = calculateManaCost(skill, active.config.stats, active);
            if (active.currentMana < cost) {
                if (isMyTurn) alert("法力值不足！");
                processingTurnRef.current = false;
                return; 
            }
        }

        newState.log.push(`\n--- 第 ${newState.turn} 回合 ---`);

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

        const entities = [active, opponent];
        let passiveTriggered = true;
        let loops = 0;
        const triggeredSkillIds = new Set<string>();

        while (passiveTriggered && loops < 5) {
            passiveTriggered = false;
            entities.forEach(entity => {
                const enemyOfEntity = entity.id === active.id ? opponent : active;
                entity.config.skills.filter(s => s.isPassive).forEach(s => {
                    const uniqueTriggerKey = `${entity.id}-${s.id}`;
                    if (triggeredSkillIds.has(uniqueTriggerKey)) return;
                    const success = processSkill(s, entity, enemyOfEntity, pushEvent, newState.turn, true);
                    if (success) {
                        passiveTriggered = true;
                        triggeredSkillIds.add(uniqueTriggerKey);
                        pushEvent({ 
                            type: 'SKILL_EFFECT', 
                            sourceId: entity.id, 
                            targetId: enemyOfEntity.id,
                            skillName: s.name,
                            text: undefined,
                            visual: s.logic[0]?.effect.visual
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

    }, [battleState, playerId, myRole]);

    const handleAnimationComplete = useCallback(() => {
        processingTurnRef.current = false; 
        if (!battleState) return;
        if (battleState.mode === 'ONLINE_PVP' && myRole !== 'HOST') return;

        const newState = { ...battleState };
        const isP1Active = newState.activePlayerId === newState.p1.id;
        const active = isP1Active ? newState.p1 : newState.p2;
        const opponent = isP1Active ? newState.p2 : newState.p1;

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

    const handleSurrender = () => {
        if (!battleState || myRole === 'SPECTATOR') return;
        const newState = { ...battleState };
        const isP1Me = newState.p1.id === playerId;
        const enemyId = isP1Me ? newState.p2.id : newState.p1.id;
        newState.winnerId = enemyId;
        newState.phase = 'FINISHED';
        newState.log.push(`${myChar?.name || '玩家'} 认输了。`);
        setBattleState(newState);
        if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
    };

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

    useEffect(() => {
        if (battleState && battleState.timeLeft === 0 && battleState.phase === 'ACTION_SELECTION' && !battleState.winnerId) {
            if (battleState.mode === 'ONLINE_PVP' && myRole !== 'HOST') return;
            if (battleState.mode === 'LOCAL_BOT' || myRole === 'HOST') {
                 executeTurn('basic_attack');
            }
        }
    }, [battleState?.timeLeft, myRole, executeTurn, battleState?.mode, battleState?.phase, battleState?.winnerId]);

    useEffect(() => {
        if (!battleState) return;
        const { mode, phase, activePlayerId, winnerId } = battleState;
        if (mode === 'LOCAL_BOT' && phase === 'ACTION_SELECTION' && activePlayerId === 'bot_enemy' && !winnerId) {
            const timer = setTimeout(() => {
                const enemy = battleState.p1.id === 'bot_enemy' ? battleState.p1 : battleState.p2;
                const skills = enemy.config.skills.filter(s => !s.isPassive);
                const affordable = skills.filter(s => calculateManaCost(s, enemy.config.stats, enemy) <= enemy.currentMana);
                const useSkill = affordable.length > 0 && Math.random() < 0.7;
                executeTurn(useSkill ? affordable[Math.floor(Math.random() * affordable.length)].id : 'basic_attack');
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [battleState?.turn, battleState?.phase, battleState?.activePlayerId, executeTurn]);

    useEffect(() => {
        if (view !== 'BATTLE' || !battleState || battleState.phase !== 'ACTION_SELECTION') return;
        if (myRole === 'SPECTATOR') return;
        
        const isMyTurn = battleState.activePlayerId === playerId;
        if (!isMyTurn) return;

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

    const StatPanel: React.FC<{ entity: BattleEntity, isRight?: boolean }> = ({ entity, isRight }) => {
        const displayStats = Object.values(StatType).filter(s => !DYNAMIC_STATS.includes(s));
        
        return (
            <div className={`absolute top-20 bottom-24 w-64 ${isRight ? 'right-4' : 'left-4'} bg-slate-900 border-4 border-slate-700 p-4 flex flex-col z-20 overflow-y-auto custom-scrollbar shadow-2xl`}>
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
                
                <div className="grid grid-cols-2 gap-2">
                    {displayStats.map(stat => {
                        const val = getTotalStat(entity, stat);
                        return (
                            <div key={stat} className="bg-slate-800 p-2 border-2 border-slate-700 flex items-center justify-between group relative hover:border-slate-500 transition-colors cursor-help">
                                <div className="flex items-center gap-2">
                                    {getStatIcon(stat)}
                                </div>
                                <span className="font-mono text-xs font-bold text-slate-300">
                                    {Number.isInteger(val) ? val : val.toFixed(1)}
                                </span>
                                
                                <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-xs px-2 py-1 -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none z-50 shadow-lg border-2 border-slate-500">
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
            <div className="h-12 border-b-4 border-slate-700 bg-slate-900 flex items-center px-6 justify-between select-none z-50">
                <span className="retro-font text-blue-400 text-sm cursor-pointer" onClick={() => {
                    net.disconnect();
                    setView('MENU');
                }}>Code Hero</span>
                <div className="text-xs text-slate-600 font-mono">ID: {playerId.slice(0, 6)}</div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {/* HERO SELECTION MODAL */}
                {showHeroSelect && (
                    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
                        <div className="w-full max-w-6xl h-full max-h-[90vh] bg-slate-900 border-4 border-slate-600 shadow-2xl overflow-hidden flex flex-col">
                            <CharacterList 
                                onSelect={handleSelectHero}
                                onEdit={()=>{}}
                                onBack={() => setShowHeroSelect(false)}
                                mode="SELECT"
                            />
                        </div>
                    </div>
                )}

                {/* CHALLENGE POPUP */}
                {incomingChallenge && (
                    <div className="fixed top-20 right-8 z-[70] w-80 bg-slate-900 border-4 border-yellow-500 shadow-2xl p-4 animate-in slide-in-from-right duration-300">
                        <div className="flex items-center gap-2 mb-2 text-yellow-400 font-bold">
                            <Swords size={20} /> 对战请求
                        </div>
                        <div className="text-white mb-4">
                            玩家 <span className="font-bold text-yellow-200">{incomingChallenge.name}</span> 向你发起了挑战！
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleRespondChallenge(true)}
                                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 font-bold border-2 border-green-800"
                            >
                                接受
                            </button>
                            <button 
                                onClick={() => handleRespondChallenge(false)}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 font-bold border-2 border-red-800"
                            >
                                拒绝
                            </button>
                        </div>
                    </div>
                )}

                {inspectedEntity && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setInspectedEntity(null)}>
                        <div className="bg-slate-900 border-4 border-slate-700 p-6 shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            {/* Entity Inspection Content (Simplified) */}
                             <div className="flex justify-between items-start mb-4">
                                <h3 className="text-xl font-bold retro-font">{inspectedEntity.config.name}</h3>
                                <button onClick={() => setInspectedEntity(null)}><X /></button>
                             </div>
                             <div className="overflow-y-auto custom-scrollbar flex-1">
                                 {/* Full stats/skills inspection could go here */}
                                 <p className="text-slate-400 font-mono">详细属性查看暂未完全实现...</p>
                             </div>
                        </div>
                    </div>
                )}

                {view === 'MENU' && (
                    <div className="flex flex-col items-center justify-center h-full gap-12 animate-in fade-in zoom-in duration-500">
                        <GameLogo />
                        
                        <div className="flex gap-6 mt-12">
                            <button 
                                onClick={() => setView('HERO_MANAGE')} 
                                className="group relative w-64 h-40 bg-slate-800 pixel-border hover:border-blue-500 transition-all overflow-hidden flex flex-col items-center justify-center gap-4 hover:-translate-y-2"
                            >
                                <IconStaff size={48} className="text-blue-400 relative z-10" />
                                <span className="text-xl font-bold retro-font relative z-10">英雄名册</span>
                                <span className="text-xs text-slate-500 relative z-10 font-mono">Manage & Create</span>
                            </button>

                            <button 
                                onClick={() => {
                                    if (myChar) setView('BATTLE_SETUP');
                                    else setView('HERO_MANAGE');
                                }} 
                                className="group relative w-64 h-40 bg-slate-800 pixel-border hover:border-red-500 transition-all overflow-hidden flex flex-col items-center justify-center gap-4 hover:-translate-y-2"
                            >
                                <IconSword size={48} className="text-red-400 relative z-10" />
                                <span className="text-xl font-bold retro-font relative z-10">开始战斗</span>
                                <span className="text-xs text-slate-500 relative z-10 font-mono">Single / Multi</span>
                            </button>
                        </div>
                    </div>
                )}

                {view === 'HERO_MANAGE' && (
                    <CharacterList 
                        onSelect={() => {}}
                        onEdit={(char) => { setMyChar(char); setView('EDITOR'); }}
                        onBack={() => setView('MENU')}
                        mode="MANAGE"
                    />
                )}

                {view === 'EDITOR' && (
                    <CharacterEditor 
                        existing={myChar!} 
                        onSave={handleSaveChar}
                        onBack={() => setView('HERO_MANAGE')} 
                    />
                )}

                {view === 'BATTLE_SETUP' && myChar && (
                     <div className="flex flex-col items-center justify-center h-full gap-8 animate-in fade-in slide-in-from-right duration-300 p-8">
                        <h2 className="text-3xl font-bold retro-font drop-shadow-md text-white">战斗准备</h2>
                        
                        {/* CURRENT HERO CARD */}
                        <div className="flex items-center gap-6 bg-slate-800 p-6 border-4 border-slate-700 mb-4 shadow-xl relative">
                             <div className="border-4 border-slate-900 bg-slate-950">
                                <HeroAvatar appearance={myChar.appearance!} size={80} bgColor={myChar.avatarColor} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">出战英雄</div>
                                <div className="font-bold text-2xl retro-font text-white">{myChar.name}</div>
                                <div className="flex gap-2 text-xs text-slate-500 font-mono">
                                    <span>{myChar.role}</span>
                                    <span>•</span>
                                    <span>{myChar.skills.length} Skills</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowHeroSelect(true)} 
                                className="ml-8 px-4 py-2 bg-slate-700 border-2 border-slate-600 hover:bg-slate-600 hover:border-slate-500 transition-colors text-sm font-bold flex items-center gap-2"
                            >
                                <IconRefresh size={16}/> 更换
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl">
                            {/* LOCAL BOT */}
                            <button onClick={startLocalBotBattle} className="group relative bg-slate-800 hover:bg-emerald-900/30 border-4 border-slate-700 hover:border-emerald-500 flex flex-col items-center gap-4 p-8 transition-all hover:-translate-y-1">
                                <div className="p-4 bg-slate-900 rounded-full border-2 border-slate-700 group-hover:border-emerald-500 group-hover:text-emerald-400 text-slate-500 transition-colors">
                                     <IconShield size={32} />
                                </div>
                                <div className="text-center">
                                    <span className="font-bold text-lg retro-font block mb-1">人机训练</span>
                                    <span className="text-xs text-slate-500 font-mono">VS AI BOT</span>
                                </div>
                            </button>

                            {/* PUBLIC HALL */}
                            <button onClick={enterPublicHall} className="group relative bg-slate-800 hover:bg-purple-900/30 border-4 border-slate-700 hover:border-purple-500 flex flex-col items-center gap-4 p-8 transition-all hover:-translate-y-1">
                                <div className="p-4 bg-slate-900 rounded-full border-2 border-slate-700 group-hover:border-purple-500 group-hover:text-purple-400 text-slate-500 transition-colors">
                                     <Users size={32} />
                                </div>
                                <div className="text-center">
                                    <span className="font-bold text-lg retro-font block mb-1">对战大厅</span>
                                    <span className="text-xs text-slate-500 font-mono">Public Matchmaking</span>
                                </div>
                            </button>

                            {/* PRIVATE ROOM */}
                            <div className="bg-slate-800 border-4 border-slate-700 flex flex-col items-center gap-4 p-8 relative">
                                <div className="p-4 bg-slate-900 rounded-full border-2 border-slate-700 text-blue-400">
                                     <IconBolt size={32} />
                                </div>
                                <div className="text-center w-full">
                                    <span className="font-bold text-lg retro-font block mb-4">私有房间</span>
                                    <div className="flex gap-2 w-full">
                                        <input 
                                            className="pixel-input w-full text-center text-sm"
                                            placeholder="输入房间号"
                                            value={roomId}
                                            onChange={e => setRoomId(e.target.value)}
                                        />
                                        <button 
                                            onClick={joinPrivateRoom}
                                            className="pixel-btn pixel-btn-primary px-3"
                                        >
                                            <IconPlay size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <button onClick={() => setView('MENU')} className="mt-4 text-slate-500 hover:text-white pixel-btn pixel-btn-secondary border-2 flex items-center gap-2">
                             <IconBack size={16}/> 返回主菜单
                        </button>
                     </div>
                )}

                {view === 'PUBLIC_HALL' && (
                    <div className="flex flex-col h-full bg-slate-950 p-8">
                        <header className="flex justify-between items-center mb-6 pb-4 border-b-4 border-slate-800">
                             <div>
                                <h2 className="text-3xl font-bold text-white retro-font flex items-center gap-3">
                                    <Users size={32} className="text-purple-400"/> 对战大厅
                                </h2>
                                <p className="text-slate-500 text-xs font-mono mt-1">Global Public Hall • {hallPlayers.length + 1} Online</p>
                             </div>
                             
                             <div className="flex items-center gap-4">
                                <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 border-2 border-slate-700">
                                    <span className="text-xs text-slate-400 uppercase font-bold">Current Hero</span>
                                    <div className="font-bold text-white retro-font">{myChar?.name}</div>
                                    <button onClick={() => setShowHeroSelect(true)} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2 py-1 text-slate-300">
                                        Change
                                    </button>
                                </div>
                                <button onClick={() => { net.disconnect(); setView('BATTLE_SETUP'); }} className="pixel-btn pixel-btn-danger text-xs border-2 flex items-center gap-2">
                                    <IconBack size={14}/> 离开大厅
                                </button>
                             </div>
                        </header>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {hallPlayers.length === 0 ? (
                                <div className="h-64 flex flex-col items-center justify-center text-slate-600 gap-4">
                                    <Loader2 size={48} className="animate-spin opacity-20"/>
                                    <p className="font-mono text-sm">正在寻找其他玩家...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {hallPlayers.map(player => (
                                        <div key={player.id} className="bg-slate-900 border-4 border-slate-800 p-4 flex items-center gap-4 hover:border-slate-600 transition-colors">
                                            <div className="border-2 border-slate-700 bg-slate-950 relative">
                                                <HeroAvatar appearance={player.char.appearance!} size={64} bgColor={player.char.avatarColor} />
                                                <div className={`absolute -bottom-1 -right-1 w-3 h-3 border-2 border-slate-900 ${player.status === 'IDLE' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-white retro-font truncate">{player.name}</div>
                                                <div className="text-xs text-slate-500 font-mono truncate">{player.char.role || 'Warrior'}</div>
                                            </div>
                                            <button 
                                                onClick={() => handleChallengePlayer(player.id, player.name)}
                                                disabled={player.status !== 'IDLE' || !!challengeSentTo}
                                                className={`px-3 py-1 text-xs font-bold border-2 ${challengeSentTo === player.id ? 'bg-yellow-900/50 border-yellow-600 text-yellow-400' : 'bg-blue-600 border-blue-800 text-white hover:bg-blue-500'}`}
                                            >
                                                {challengeSentTo === player.id ? '等待...' : '挑战'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {view === 'LOBBY' && myChar && (
                    <div className="flex flex-col items-center justify-center h-full gap-8 p-12 relative">
                        <div className="absolute top-12 flex flex-col items-center gap-2">
                            <div className="text-slate-400 text-sm font-bold uppercase tracking-widest font-mono">
                                {battleOrigin === 'PUBLIC' ? 'Match Room' : 'Private Room ID'}
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-4xl font-mono font-bold text-white bg-slate-800 px-6 py-2 border-4 border-slate-700 shadow-xl">
                                    {battleOrigin === 'PUBLIC' ? '---' : roomId}
                                </div>
                                {battleOrigin === 'PRIVATE' && (
                                    <button 
                                        onClick={copyRoomId}
                                        className="w-12 h-12 flex items-center justify-center bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 transition-all border-4 border-slate-700 active:border-b-2 active:border-r-2"
                                        title="复制房间号"
                                    >
                                        {copiedRoomId ? <Check size={24} /> : <Copy size={24} />}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="absolute top-8 right-8 flex items-center gap-2 text-slate-400">
                            <Eye size={16}/> 观战: {spectators.length}
                        </div>
                        
                        <h2 className="text-3xl font-bold retro-font text-white mb-8 mt-16 drop-shadow-md">
                            {battleOrigin === 'PUBLIC' ? '比赛准备' : '房间大厅'}
                        </h2>

                        <div className="flex gap-12 items-center">
                            {/* Host Card */}
                            <div className="flex flex-col items-center gap-4">
                                <div className={`relative w-48 h-64 bg-slate-800 border-4 flex flex-col items-center justify-center p-4 transition-all ${myRole === 'HOST' ? 'border-yellow-500' : 'border-slate-600'}`}>
                                    <div className="mb-4 border-2 border-slate-600">
                                        <HeroAvatar 
                                            appearance={(myRole === 'HOST' ? myChar : opponentChar)?.appearance!} 
                                            size={80} 
                                            bgColor={(myRole === 'HOST' ? myChar : opponentChar)?.avatarColor || '#333'} 
                                        />
                                    </div>
                                    <h3 className="font-bold text-lg retro-font">{(myRole === 'HOST' ? myChar : opponentChar)?.name || '等待中...'}</h3>
                                    <span className="text-xs text-yellow-500 mb-4 font-bold uppercase">HOST</span>
                                    
                                    {myRole === 'HOST' && (
                                        <div className="mt-auto px-3 py-1 text-xs font-bold bg-yellow-900/50 text-yellow-400 border border-yellow-700 flex items-center gap-2">
                                            <IconCheck size={12}/> 已就绪
                                        </div>
                                    )}
                                    {myRole === 'HOST' && (
                                        <button 
                                            onClick={() => setShowHeroSelect(true)} 
                                            className="absolute top-2 right-2 p-1 bg-slate-700 hover:bg-white hover:text-slate-900 text-slate-400 border border-slate-600"
                                            title="更换英雄"
                                        >
                                            <IconRefresh size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="text-4xl font-black text-slate-700 italic retro-font">VS</div>

                            {/* Challenger Card */}
                            <div className="flex flex-col items-center gap-4">
                                {(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : (myRole === 'SPECTATOR' ? spectatorChallengerChar : null))) ? (
                                    <div className={`relative w-48 h-64 bg-slate-800 border-4 flex flex-col items-center justify-center p-4 transition-all ${(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'border-slate-600'}`}>
                                        <div className="mb-4 border-2 border-slate-600">
                                            <HeroAvatar 
                                                appearance={(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : spectatorChallengerChar))?.appearance!} 
                                                size={80} 
                                                bgColor={(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : spectatorChallengerChar))?.avatarColor} 
                                            />
                                        </div>
                                        <h3 className="font-bold text-lg retro-font">{(myRole === 'CHALLENGER' ? myChar : (myRole === 'HOST' ? opponentChar : spectatorChallengerChar))?.name}</h3>
                                        <span className="text-xs text-blue-400 mb-4 font-bold uppercase">CHALLENGER</span>
                                        
                                        <div className={`mt-auto flex items-center gap-2 px-3 py-1 text-xs font-bold border ${(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? 'bg-green-900/50 text-green-400 border-green-600' : 'bg-slate-900/50 text-slate-500 border-slate-700'}`}>
                                            {(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? <IconCheck size={12} /> : <div className="w-3 h-3 border border-slate-500"></div>}
                                            {(myRole === 'CHALLENGER' ? amIReady : opponentReady) ? '已准备' : '未准备'}
                                        </div>

                                        {myRole === 'CHALLENGER' && (
                                            <button 
                                                onClick={() => setShowHeroSelect(true)} 
                                                disabled={amIReady}
                                                className={`absolute top-2 right-2 p-1 border ${amIReady ? 'bg-transparent text-slate-600 border-slate-700' : 'bg-slate-700 hover:bg-white hover:text-slate-900 text-slate-400 border-slate-600'}`}
                                                title="更换英雄"
                                            >
                                                <IconRefresh size={12} />
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="w-48 h-64 bg-slate-900/50 border-4 border-dashed border-slate-700 flex flex-col items-center justify-center p-4 text-slate-600 gap-4 animate-pulse">
                                        <Loader2 size={32} className="animate-spin" />
                                        <span className="text-sm font-mono">Waiting...</span>
                                    </div>
                                )}
                                
                                {/* Controls */}
                                {myRole === 'HOST' && (
                                    <button 
                                        onClick={handleHostStartGame}
                                        disabled={!opponentChar || !opponentReady}
                                        className={`pixel-btn w-full ${opponentChar && opponentReady ? 'pixel-btn-primary' : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'} flex items-center justify-center gap-2`}
                                    >
                                        <IconPlay size={18} /> 开始对战
                                    </button>
                                )}

                                {myRole === 'CHALLENGER' && (
                                    <button 
                                        onClick={handleToggleReady}
                                        className={`pixel-btn w-full ${amIReady ? 'pixel-btn-secondary' : 'pixel-btn-success'} flex items-center justify-center gap-2`}
                                    >
                                        <IconCheck size={18} /> {amIReady ? '取消准备' : '准备就绪'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Log Window */}
                        <div className="w-[500px] h-32 bg-slate-900 border-4 border-slate-800 p-4 overflow-y-auto custom-scrollbar font-mono text-xs text-slate-400">
                            {lobbyLog.map((log, i) => (
                                <div key={i} className="mb-1">{log}</div>
                            ))}
                        </div>

                         <button 
                            onClick={() => { 
                                net.disconnect(); 
                                if(battleOrigin === 'PUBLIC') enterPublicHall(); 
                                else setView('BATTLE_SETUP'); 
                            }} 
                            className="mt-4 text-sm text-red-400 hover:text-red-300 border border-red-900/50 px-4 py-2 hover:bg-red-900/20 pixel-btn pixel-btn-danger flex items-center justify-center gap-2"
                        >
                            <IconBack size={14} /> 离开房间
                        </button>
                    </div>
                )}

                {view === 'BATTLE' && battleState && (
                    <div className="flex h-full">
                    <div className="flex-1 relative bg-slate-900 flex flex-col items-center justify-center p-8 overflow-hidden">
                        <div className="absolute top-4 text-2xl font-bold retro-font text-yellow-400 drop-shadow-md z-10">
                            回合 {battleState.turn}
                        </div>

                        {/* Timer */}
                         <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
                            <div className="text-xs text-slate-500 uppercase tracking-widest mb-1 shadow-black/50 text-shadow font-mono">TIME</div>
                            <div className={`text-2xl font-mono font-bold px-4 py-1 border-4 shadow-lg ${battleState.timeLeft < 10 ? 'text-red-500 border-red-900 bg-red-950/80' : 'text-white border-slate-700 bg-slate-800/80'}`}>
                                {battleState.phase === 'ACTION_SELECTION' && !battleState.winnerId ? battleState.timeLeft : '--'}
                            </div>
                        </div>
                        
                        {myRole !== 'SPECTATOR' && !battleState.winnerId && (
                            <div className="absolute top-4 right-4 z-20">
                                <button 
                                    onClick={handleSurrender}
                                    className="pixel-btn pixel-btn-danger text-xs flex items-center justify-center gap-2"
                                >
                                    <Flag size={14} /> 认输
                                </button>
                            </div>
                        )}
                        
                        {/* Winner/Loser Display */}
                        {battleState.winnerId && (
                            <div className="absolute top-32 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center animate-in fade-in zoom-in duration-300">
                                {myRole === 'SPECTATOR' ? (
                                    <div className="text-4xl font-bold retro-font text-yellow-400 drop-shadow-[4px_4px_0_rgba(0,0,0,0.8)]">GAME OVER</div>
                                ) : (
                                    <div className={`text-6xl font-black retro-font drop-shadow-[6px_6px_0_rgba(0,0,0,0.8)] ${battleState.winnerId === playerId ? 'text-yellow-400' : 'text-red-600'}`}>
                                        {battleState.winnerId === playerId ? 'VICTORY' : 'DEFEAT'}
                                    </div>
                                )}
                                <div className="mt-2 text-xl font-bold text-white drop-shadow-md retro-font">
                                    {(battleState.winnerId === battleState.p1.id ? battleState.p1.config.name : battleState.p2.config.name)} 获胜!
                                </div>
                            </div>
                        )}

                        <BattleScene 
                            gameState={battleState} 
                            onAnimationsComplete={handleAnimationComplete}
                            onEntityClick={handleEntityClick}
                        />
                        
                        <StatPanel entity={battleState.p1} isRight={false} />
                        <StatPanel entity={battleState.p2} isRight={true} />

                        <div className={`absolute bottom-0 w-full h-2 transition-all duration-500 bg-gradient-to-r from-yellow-500/0 via-yellow-500 to-yellow-500/0 ${battleState.activePlayerId === battleState.p1.id ? 'translate-x-[-25%]' : 'translate-x-[25%]'}`}></div>

                        {/* Controls */}
                        <div className={`absolute bottom-4 w-full max-w-4xl left-1/2 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-8 duration-500 transition-all`}>
                        {(() => {
                            const isMyTurn = battleState.activePlayerId === playerId;
                            const isSpectating = myRole === 'SPECTATOR';
                            
                            if (battleState.winnerId || battleState.phase === 'FINISHED') {
                                return (
                                    <div className="bg-slate-900/90 border-4 border-slate-700 p-6 flex items-center justify-center gap-8 shadow-2xl backdrop-blur max-w-lg mx-auto">
                                        <button 
                                            onClick={() => { 
                                                net.disconnect(); 
                                                if(battleOrigin === 'PUBLIC') enterPublicHall(); 
                                                else if (battleOrigin === 'PRIVATE') setupLobbyState(); // Return to room logic depends on if we stay in room?
                                                // Actually, for Private, we stay in Lobby context usually? 
                                                // The current logic was "Return to List".
                                                // New spec: "Return to Room" for Private, "Return to Hall" for Public.
                                                
                                                if (battleOrigin === 'PUBLIC') {
                                                    enterPublicHall();
                                                } else {
                                                    // Re-enter lobby flow for same room ID
                                                    joinPrivateRoom(); 
                                                }
                                            }} 
                                            className="pixel-btn pixel-btn-secondary flex items-center justify-center gap-2"
                                        >
                                            <IconBack size={20} /> {battleOrigin === 'PUBLIC' ? '返回大厅' : '返回房间'}
                                        </button>
                                        
                                        {!isSpectating && (
                                            <button 
                                                onClick={handleRematchClick}
                                                disabled={myRematchRequest || opponentLeft}
                                                className={`pixel-btn flex items-center justify-center gap-2 ${
                                                    opponentLeft 
                                                        ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                                                        : myRematchRequest 
                                                            ? 'bg-yellow-900/50 text-yellow-400 border-yellow-600/50 cursor-wait'
                                                            : 'pixel-btn-primary'
                                                }`}
                                            >
                                                {opponentLeft ? (
                                                    <>对方已离开</>
                                                ) : myRematchRequest ? (
                                                    <><Loader2 size={20} className="animate-spin" /> 等待对方...</>
                                                ) : (
                                                    <><IconRefresh size={20} /> 再来一局</>
                                                )}
                                            </button>
                                        )}
                                        
                                        {battleState.mode === 'ONLINE_PVP' && !isSpectating && !opponentLeft && (
                                             <div className="absolute -top-10 left-0 right-0 text-center">
                                                {opponentRematchRequest && !myRematchRequest && (
                                                    <span className="bg-blue-900/80 text-blue-200 px-3 py-1 text-xs animate-bounce border-2 border-blue-500">
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
                                            <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-30 bg-slate-900/80 px-4 py-2 border-2 border-slate-700 text-yellow-400 font-bold flex items-center gap-2 whitespace-nowrap">
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
                                                                relative w-24 h-24 border-4 flex flex-col items-center justify-between p-2 transition-all duration-200 cursor-pointer bg-slate-900
                                                                ${isSelected ? 'scale-110 z-10 shadow-[0_0_20px_rgba(59,130,246,0.4)]' : 'scale-95 opacity-60'}
                                                                ${isSelected ? (isPassive ? 'border-indigo-400' : canAfford ? 'border-blue-400' : 'border-red-500') : 'border-slate-700'}
                                                            `}
                                                        >
                                                            {isPassive && (
                                                                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-indigo-900 text-indigo-200 text-[10px] px-2 py-0.5 border border-indigo-500 whitespace-nowrap z-20 shadow-sm font-bold">
                                                                    PASSIVE
                                                                </div>
                                                            )}
                                                            
                                                            {!isAttack && (
                                                                <div className={`absolute -top-2 -right-2 text-[10px] font-bold px-2 py-0.5 border-2 ${canAfford ? 'bg-blue-900 border-blue-500 text-blue-200' : 'bg-red-900 border-red-500 text-white'}`}>
                                                                    {cost} MP
                                                                </div>
                                                            )}

                                                            <div className={`flex-1 flex items-center justify-center ${isPassive ? 'text-indigo-400' : canAfford ? (isAttack ? 'text-yellow-400' : 'text-purple-400') : 'text-red-500'}`}>
                                                                {isPassive ? <IconShield size={32} /> : isAttack ? <IconSword size={32} /> : <IconBolt size={32} />}
                                                            </div>

                                                            <div className="w-full text-center text-[10px] font-bold truncate text-slate-300 retro-font">
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

                                        <div className="absolute bottom-[calc(100%+1.5rem)] left-1/2 -translate-x-1/2 bg-slate-900/90 border-4 border-slate-700 p-6 flex flex-col items-center text-center shadow-2xl max-w-2xl w-full min-h-[120px] z-20 backdrop-blur">
                                            <div className="mt-2 w-full">
                                                {(() => {
                                                    const myEntity = battleState.p1.id === playerId ? battleState.p1 : battleState.p2;
                                                    const sortedSkills = getSortedSkills(myEntity);
                                                    const selectedSkill = sortedSkills[selectedSkillIndex % sortedSkills.length];
                                                    
                                                    return (
                                                        <>
                                                            <h4 className="text-xl font-bold text-white mb-2 retro-font">{selectedSkill.name}</h4>
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
                             <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-slate-500 font-mono animate-pulse flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-1">
                                <div className="w-2 h-2 bg-slate-500"></div>
                                {myRole === 'SPECTATOR' ? 'THINKING...' : 'WAITING FOR OPPONENT...'}
                             </div>
                        )}
                    </div>

                    <div className="w-80 bg-slate-950 border-l-4 border-slate-800 p-0 flex flex-col shadow-xl z-20">
                        <div className="p-4 border-b-4 border-slate-800 bg-slate-900">
                            <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 animate-pulse"></div>
                                BATTLE LOG
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs custom-scrollbar bg-slate-950">
                            {battleState.log.map((entry, i) => (
                                <div key={i} className="border-l-4 border-slate-800 pl-3 py-1 text-slate-400 hover:border-blue-500 hover:text-slate-200 transition-colors">
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
