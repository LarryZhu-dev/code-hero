
import React, { useState, useEffect, useCallback, useRef } from 'react';
import CharacterEditor from './components/CharacterEditor';
import CharacterList from './components/CharacterList';
import { CharacterConfig, BattleState, BattleEntity, StatType, BattleMode, BattleEvent, BattleSession } from './types';
import { processSkill, getTotalStat, calculateManaCost, processBasicAttack } from './utils/gameEngine';
import { StorageService } from './services/storage';
import { net } from './services/mqtt';
import { TOWER_LEVELS } from './utils/towerData';
import ReconnectModal from './components/ReconnectModal';
import { AlertTriangle } from 'lucide-react';

// Views
import MenuView from './components/views/MenuView';
import BattleSetupView from './components/views/BattleSetupView';
import TowerSelectView from './components/views/TowerSelectView';
import PublicHallView from './components/views/PublicHallView';
import LobbyView from './components/views/LobbyView';
import BattleView from './components/views/BattleView';
import ChallengeOverlay from './components/ChallengeOverlay';

type AppView = 'MENU' | 'HERO_MANAGE' | 'EDITOR' | 'BATTLE_SETUP' | 'PUBLIC_HALL' | 'LOBBY' | 'BATTLE' | 'TOWER_SELECT';
type UserRole = 'HOST' | 'CHALLENGER' | 'SPECTATOR' | 'NONE';

interface PublicPlayer {
    id: string; 
    name: string;
    char: CharacterConfig;
    status: 'IDLE' | 'BUSY';
    lastSeen: number;
}

interface ChallengeRequest {
    fromId: string;
    name: string;
    timestamp: number;
}

const App: React.FC = () => {
    const [view, setView] = useState<AppView>('MENU');
    const [myChar, setMyChar] = useState<CharacterConfig | null>(null);
    const [battleState, setBattleState] = useState<BattleState | null>(null);
    const [playerId] = useState(net.playerId); 
    
    // Modal State
    const [showHeroSelect, setShowHeroSelect] = useState(false);

    // Online State
    const [roomId, setRoomId] = useState('');
    const [lobbyLog, setLobbyLog] = useState<string[]>([]);
    const [myRole, setMyRole] = useState<UserRole>('NONE');
    const [battleOrigin, setBattleOrigin] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
    
    // Public Hall State
    const [hallPlayers, setHallPlayers] = useState<PublicPlayer[]>([]);
    const [incomingChallenges, setIncomingChallenges] = useState<ChallengeRequest[]>([]);
    
    // Challenge Sender State
    const [challengeSentTo, setChallengeSentTo] = useState<string | null>(null);
    const [challengeStatus, setChallengeStatus] = useState<'IDLE' | 'SENDING' | 'WAITING' | 'TIMEOUT' | 'REJECTED'>('IDLE');

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

    // Reconnection State
    const [showReconnectModal, setShowReconnectModal] = useState<BattleSession | null>(null);
    const [opponentDisconnectTime, setOpponentDisconnectTime] = useState<number | null>(null);

    // Tower State
    const [towerProgress, setTowerProgress] = useState(1);

    const processingTurnRef = useRef(false);
    const battleStateRef = useRef<BattleState | null>(null);
    const myRoleRef = useRef<UserRole>('NONE');
    const handleMessageRef = useRef<((action: string, data: any) => void) | null>(null);

    useEffect(() => { battleStateRef.current = battleState; }, [battleState]);
    useEffect(() => { myRoleRef.current = myRole; }, [myRole]);

    // Check for previous session on load
    useEffect(() => {
        const session = StorageService.getBattleSession();
        if (session) {
            const now = Date.now();
            if (now - session.lastActiveTime > 65000) {
                alert("您在上一场对局中意外断开连接超过60秒，已被系统判负。");
                StorageService.clearBattleSession();
            } else {
                setShowReconnectModal(session);
            }
        }
    }, []);

    // Session Persistence Loop
    useEffect(() => {
        if (!battleState || battleState.phase === 'FINISHED') return;
        if (battleState.mode !== 'ONLINE_PVP') return;
        const interval = setInterval(() => {
            const session: BattleSession = {
                roomId: battleState.roomId || '',
                mode: battleState.mode,
                lastActiveTime: Date.now(),
                myId: playerId
            };
            StorageService.saveBattleSession(session);
        }, 1000);
        return () => clearInterval(interval);
    }, [battleState?.mode, battleState?.roomId, battleState?.phase, playerId]);

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
        if (view === 'TOWER_SELECT') {
            setTowerProgress(StorageService.getTowerProgress());
        }
    }, [view]);

    // Tab Notification for Challenges
    useEffect(() => {
        if (incomingChallenges.length === 0) return;
        const originalTitle = document.title;
        let interval: any;
        const handleVisibilityChange = () => {
            if (document.hidden) {
                let flash = false;
                interval = setInterval(() => {
                    document.title = flash ? `⚔️ ${incomingChallenges.length} 个新挑战! ⚔️` : originalTitle;
                    flash = !flash;
                }, 1000);
            } else {
                clearInterval(interval);
                document.title = originalTitle;
            }
        };
        handleVisibilityChange();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            clearInterval(interval);
            document.title = originalTitle;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [incomingChallenges.length]);

    // Challenge Timeout & Public Hall Heartbeat
    useEffect(() => {
        if (incomingChallenges.length > 0) {
            const timer = setInterval(() => {
                const now = Date.now();
                setIncomingChallenges(prev => prev.filter(c => now - c.timestamp < 60000));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [incomingChallenges.length]);

    useEffect(() => {
        if (view !== 'PUBLIC_HALL' || !myChar) return;
        const timer = setInterval(() => {
            const now = Date.now();
            setHallPlayers(prev => prev.filter(p => now - p.lastSeen < 5000));
            if (net.isConnected()) {
                net.announcePresence({ name: myChar.name, char: myChar, status: 'IDLE' });
            }
        }, 2000);
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && !net.isConnected() && view === 'PUBLIC_HALL') {
                enterPublicHall();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [view, myChar]);

    // Auto Start Host Logic
    useEffect(() => {
        if (view === 'LOBBY' && battleOrigin === 'PUBLIC' && myRole === 'HOST') {
            if (opponentReady && opponentChar && myChar) {
                const t = setTimeout(() => handleHostStartGame(), 500);
                return () => clearTimeout(t);
            }
        }
    }, [view, battleOrigin, myRole, opponentReady, opponentChar, myChar]);

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

    const startTowerBattle = (level: number) => {
        if (!myChar) return;
        const enemy = TOWER_LEVELS[level - 1];
        setMyRole('HOST');
        initBattle(myChar, enemy, 'TOWER', level);
    };

    const enterPublicHall = () => {
        if (!myChar) return;
        net.disconnect();
        setBattleOrigin('PUBLIC');
        setHallPlayers([]);
        setIncomingChallenges([]);
        setChallengeSentTo(null);
        setChallengeStatus('IDLE');
        setView('PUBLIC_HALL');
        net.connect('public_hall_global_v1', (action, data) => handleMessageRef.current?.(action, data), () => {
             net.announcePresence({ name: myChar.name, char: myChar, status: 'IDLE' });
        }, true);
    };

    const joinPrivateRoom = (rId?: string) => {
        const targetRoom = rId || roomId;
        if (!targetRoom) { alert("请输入房间号"); return; }
        if (!myChar) return;
        setBattleOrigin('PRIVATE');
        net.disconnect();
        setupLobbyState();
        if (rId) setRoomId(rId); 
        setView('LOBBY');
        let handshakeTimeout: ReturnType<typeof setTimeout>;
        net.connect(targetRoom, (action, data) => handleMessageRef.current?.(action, data), () => {
            setLobbyLog(prev => [...prev, '已连接服务器', '正在寻找房主...']);
            if (showReconnectModal && targetRoom === showReconnectModal.roomId) {
                net.sendRejoin();
                setShowReconnectModal(null);
            } else {
                net.publish('query_host', {});
                handshakeTimeout = setTimeout(() => {
                    if (myRoleRef.current === 'NONE' && view !== 'BATTLE') {
                        setMyRole('HOST');
                        setLobbyLog(prev => [...prev, '未发现房主，自动创建房间', '我是房主，等待挑战者...']);
                    }
                }, 2000);
            }
        });
    };

    const setupLobbyState = () => {
        setLobbyLog(['正在连接服务器...']);
        setMyRole('NONE');
        myRoleRef.current = 'NONE';
        setOpponentChar(null); setOpponentId(null); setChallengerId(null);
        setSpectatorChallengerChar(null); setOpponentReady(false); setAmIReady(false);
        setSpectators([]); setOpponentDisconnectTime(null);
    };

    const handleChallengePlayer = (targetId: string, targetName: string) => {
        if (challengeSentTo) return;
        setChallengeSentTo(targetId);
        setChallengeStatus('WAITING');
        net.sendChallenge(targetId, myChar?.name || 'Player');
        setTimeout(() => {
            if (view === 'PUBLIC_HALL' && challengeSentTo === targetId) {
                setChallengeStatus('TIMEOUT');
                setTimeout(() => {
                    if (challengeSentTo === targetId) {
                        setChallengeSentTo(null);
                        setChallengeStatus('IDLE');
                    }
                }, 2000);
            }
        }, 60000);
    };

    const handleRespondChallenge = (targetChallenge: ChallengeRequest, accept: boolean) => {
        if (accept) {
            const matchRoomId = `match_${Math.random().toString(36).substr(2, 9)}`;
            net.respondChallenge(targetChallenge.fromId, true, matchRoomId);
            incomingChallenges.forEach(c => { if (c.fromId !== targetChallenge.fromId) net.respondChallenge(c.fromId, false); });
            setIncomingChallenges([]);
            net.disconnect();
            setRoomId(matchRoomId);
            setBattleOrigin('PUBLIC');
            setupLobbyState();
            setMyRole('HOST'); 
            myRoleRef.current = 'HOST'; 
            setView('LOBBY');
            net.connect(matchRoomId, (action, data) => handleMessageRef.current?.(action, data), () => {
                 setLobbyLog(prev => [...prev, '匹配成功，房间建立', '等待对手连接...']);
            });
        } else {
            net.respondChallenge(targetChallenge.fromId, false);
            setIncomingChallenges(prev => prev.filter(c => c.fromId !== targetChallenge.fromId));
        }
    };

    // Message Handler (Crucial logic)
    const handleMessage = useCallback((action: string, data: any) => {
        if (view === 'PUBLIC_HALL') {
            if (action === 'presence' || action === 'presence_request') {
                if (action === 'presence_request') { if (myChar) net.announcePresence({ name: myChar.name, char: myChar, status: 'IDLE' }); } 
                else {
                    const p = data as PublicPlayer & { sender: string };
                    setHallPlayers(prev => {
                        const existing = prev.find(x => x.id === p.sender);
                        if (existing) return prev.map(x => x.id === p.sender ? { ...x, lastSeen: Date.now(), status: p.status as any } : x);
                        return [...prev, { id: p.sender, name: p.name, char: p.char, status: p.status as any, lastSeen: Date.now() }];
                    });
                }
            } else if (action === 'challenge') {
                if (data.targetId === playerId) {
                    setIncomingChallenges(prev => {
                        if (prev.find(c => c.fromId === data.sender)) return prev;
                        return [...prev, { fromId: data.sender, name: data.challengerName, timestamp: Date.now() }];
                    });
                }
            } else if (action === 'challenge_response') {
                if (data.targetId === playerId && data.sender === challengeSentTo) {
                    if (data.accept && data.privateRoomId) {
                        setChallengeStatus('IDLE'); setChallengeSentTo(null);
                        net.disconnect(); setRoomId(data.privateRoomId); setBattleOrigin('PUBLIC');
                        setupLobbyState(); setMyRole('NONE'); setView('LOBBY');
                        net.connect(data.privateRoomId, (action, data) => handleMessageRef.current?.(action, data), () => {
                             setLobbyLog(prev => [...prev, '对手已接受，加入房间...']);
                             net.publish('join_request', { id: playerId, name: myChar?.name, char: myChar });
                        });
                    } else {
                        setChallengeStatus('REJECTED');
                        setTimeout(() => { if (challengeSentTo === data.sender) { setChallengeSentTo(null); setChallengeStatus('IDLE'); } }, 2000);
                    }
                }
            }
            return;
        }

        if (action === 'query_host') {
            if (myRoleRef.current === 'HOST') net.publish('host_announce', { hostId: playerId, hostName: myChar?.name, hasChallenger: !!opponentId, challengerName: opponentChar?.name });
        } else if (action === 'host_announce') {
            if (myRoleRef.current === 'NONE') {
                setLobbyLog(prev => { if (prev.some(l => l.includes(data.hostName))) return prev; return [...prev, `发现房主: ${data.hostName}`]; });
                net.publish('join_request', { id: playerId, name: myChar?.name, char: myChar });
            }
        } else if (action === 'rejoin') {
            if (battleStateRef.current && (data.id === battleStateRef.current.p1.id || data.id === battleStateRef.current.p2.id)) {
                setOpponentDisconnectTime(null);
                setLobbyLog(prev => [...prev, `玩家 ${data.id.slice(0,6)} 重连成功！`]);
                net.sendState(battleStateRef.current);
            }
        } else if (action === 'join_request') {
            if (myRoleRef.current === 'HOST') {
                if (!opponentId && !challengerId) {
                    setOpponentId(data.id); setChallengerId(data.id); setOpponentChar(data.char); setOpponentReady(false);
                    setLobbyLog(prev => [...prev, `玩家 ${data.name} 加入挑战位`]);
                    net.publish('assign_role', { targetId: data.id, role: 'CHALLENGER', hostChar: myChar });
                    net.publish('lobby_update', { challenger: { id: data.id, char: data.char, name: data.name }, spectators: spectators });
                } else {
                    if (!spectators.find(s => s.id === data.id)) {
                        const newSpecsList = [...spectators, { id: data.id, name: data.name }];
                        setSpectators(newSpecsList);
                        setLobbyLog(prev => [...prev, `玩家 ${data.name} 前来观战`]);
                        net.publish('assign_role', { targetId: data.id, role: 'SPECTATOR', hostChar: myChar, challengerChar: opponentChar, challengerId: opponentId });
                        net.publish('lobby_update', { challenger: { id: opponentId, char: opponentChar }, spectators: newSpecsList });
                    }
                }
            }
        } else if (action === 'assign_role') {
            if (data.targetId === playerId) {
                setMyRole(data.role); setOpponentChar(data.hostChar);
                if (data.role === 'CHALLENGER') {
                     setLobbyLog(prev => [...prev, '你已成为挑战者', '请准备...']);
                     if (battleOrigin === 'PUBLIC') { setAmIReady(true); net.sendReady(true); }
                } else if (data.role === 'SPECTATOR') {
                     setLobbyLog(prev => [...prev, '房间已满，你已进入观战模式']);
                     if (data.challengerChar) { setSpectatorChallengerChar(data.challengerChar); setChallengerId(data.challengerId); }
                }
            }
        } else if (action === 'lobby_update') {
            if (data.challenger) { setChallengerId(data.challenger.id); setSpectatorChallengerChar(data.challenger.char); } 
            else { setChallengerId(null); setSpectatorChallengerChar(null); setOpponentReady(false); }
            if (data.spectators) setSpectators(data.spectators);
        } else if (action === 'ready') {
            if (data.sender === challengerId || data.sender === opponentId) {
                setOpponentReady(data.ready);
                setLobbyLog(prev => { const msg = `挑战者 ${data.ready ? '已准备' : '取消准备'}`; return prev[prev.length-1] === msg ? prev : [...prev, msg]; });
            }
        } else if (action === 'leave') {
            const leavingId = data.id;
            const currentBattle = battleStateRef.current;
            if (currentBattle && currentBattle.mode === 'ONLINE_PVP' && !currentBattle.winnerId) {
                if (currentBattle.p1.id === leavingId || currentBattle.p2.id === leavingId) {
                    if (!opponentDisconnectTime) setOpponentDisconnectTime(Date.now());
                    return;
                }
            }
            if (leavingId === challengerId || leavingId === opponentId) { setOpponentLeft(true); setOpponentReady(false); }
            if ((leavingId === challengerId || leavingId === opponentId) && myRoleRef.current !== 'HOST') {
                     setChallengerId(null); setSpectatorChallengerChar(null); setLobbyLog(prev => [...prev, '挑战者离开了']);
            }
            if (myRoleRef.current === 'HOST') {
                if (leavingId === opponentId) {
                    setLobbyLog(prev => [...prev, '挑战者离开了']);
                    setOpponentChar(null); setOpponentId(null); setChallengerId(null); setOpponentReady(false);
                    if (spectators.length > 0) {
                        const nextPlayer = spectators[0]; const remainingSpecs = spectators.slice(1);
                        setSpectators(remainingSpecs); setOpponentId(nextPlayer.id); setChallengerId(nextPlayer.id);
                        setLobbyLog(prev => [...prev, `观战者 ${nextPlayer.name} 补位成为挑战者`]);
                        net.publish('promote_spectator', { targetId: nextPlayer.id });
                        net.publish('lobby_update', { challenger: null, spectators: remainingSpecs });
                    } else { net.publish('lobby_update', { challenger: null, spectators: [] }); }
                } else {
                    const newSpecs = spectators.filter(s => s.id !== leavingId); setSpectators(newSpecs);
                    net.publish('lobby_update', { challenger: { id: opponentId, char: opponentChar }, spectators: newSpecs });
                }
            }
        } else if (action === 'promote_spectator') {
            if (data.targetId === playerId) {
                setMyRole('CHALLENGER'); setLobbyLog(prev => [...prev, '你已补位成为挑战者！']); setAmIReady(false);
                net.publish('join_request', { id: playerId, name: myChar?.name, char: myChar });
            }
        } else if (action === 'sync_state') {
            if (opponentDisconnectTime) setOpponentDisconnectTime(null);
            setBattleState(data.state);
            if (data.state.turn === 1 && data.state.phase !== 'FINISHED') { setMyRematchRequest(false); setOpponentRematchRequest(false); setOpponentLeft(false); }
            if (view !== 'BATTLE') { if (data.state.p1.id === playerId || data.state.p2.id === playerId) setMyRole(data.state.p1.id === playerId ? 'HOST' : 'CHALLENGER'); setView('BATTLE'); }
        } else if (action === 'rematch_request') {
            if (data.sender !== playerId) setOpponentRematchRequest(true);
        }
    }, [myRole, opponentId, challengerId, opponentChar, spectators, myChar, playerId, view, challengeSentTo, battleOrigin, opponentDisconnectTime, showReconnectModal]);

    useEffect(() => { handleMessageRef.current = handleMessage; }, [handleMessage]);

    // Opponent Disconnect Timer Logic
    useEffect(() => {
        if (!opponentDisconnectTime) return;
        const timer = setInterval(() => {
            if ((Date.now() - opponentDisconnectTime) > 60000) {
                if (battleStateRef.current && !battleStateRef.current.winnerId) {
                    const current = battleStateRef.current;
                    const newState = { ...current, phase: 'FINISHED' as any, winnerId: current.p1.id === playerId ? current.p1.id : current.p2.id };
                    newState.log.push(`对手断开连接超时，${current.p1.id === playerId ? current.p1.config.name : current.p2.config.name} 获胜！`);
                    setBattleState(newState); setOpponentDisconnectTime(null); StorageService.clearBattleSession();
                }
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [opponentDisconnectTime, playerId]);

    // Host Auto Rematch
    useEffect(() => {
        if (battleState?.mode === 'ONLINE_PVP' && myRole === 'HOST' && myRematchRequest && opponentRematchRequest && myChar && opponentChar) {
            initBattle(myChar, opponentChar, 'ONLINE_PVP');
        }
    }, [myRematchRequest, opponentRematchRequest, battleState?.mode, myRole, myChar, opponentChar]);

    const handleToggleReady = () => { const newState = !amIReady; setAmIReady(newState); net.sendReady(newState); };
    const handleHostStartGame = () => { if (myChar && opponentChar) initBattle(myChar, opponentChar, 'ONLINE_PVP'); };
    const handleRematchClick = () => {
        if (battleState?.mode === 'LOCAL_BOT') startLocalBotBattle();
        else if (battleState?.mode === 'TOWER' && battleState.towerLevel) startTowerBattle(battleState.towerLevel);
        else { setMyRematchRequest(true); net.sendRematch(); }
    };

    const initBattle = (hostConfig: CharacterConfig, challengerConfig: CharacterConfig, mode: BattleMode, towerLevel?: number) => {
        setMyRematchRequest(false); setOpponentRematchRequest(false); setOpponentLeft(false); setOpponentDisconnectTime(null);
        const p1Speed = getTotalStat({ config: hostConfig } as any, StatType.SPEED);
        const p2Speed = getTotalStat({ config: challengerConfig } as any, StatType.SPEED);
        const p1First = p1Speed >= p2Speed;

        const hostId = playerId;
        const chalId = mode === 'LOCAL_BOT' || mode === 'TOWER' ? 'bot_enemy' : (opponentId || 'unknown_challenger');
        const entity1 = { id: hostId, config: hostConfig, currentHp: getTotalStat({ config: hostConfig } as any, StatType.HP), currentMana: getTotalStat({ config: hostConfig } as any, StatType.MANA), maxHp: getTotalStat({ config: hostConfig } as any, StatType.HP), maxMana: getTotalStat({ config: hostConfig } as any, StatType.MANA), buffs: [] };
        const entity2 = { id: chalId, config: challengerConfig, currentHp: getTotalStat({ config: challengerConfig } as any, StatType.HP), currentMana: getTotalStat({ config: challengerConfig } as any, StatType.MANA), maxHp: getTotalStat({ config: challengerConfig } as any, StatType.HP), maxMana: getTotalStat({ config: challengerConfig } as any, StatType.MANA), buffs: [] };

        const initialState: BattleState = {
            turn: 1, log: ['战斗开始！', `${p1First ? entity1.config.name : entity2.config.name} 速度更快，获得先手！`],
            p1: p1First ? entity1 : entity2, p2: p1First ? entity2 : entity1, activePlayerId: p1First ? entity1.id : entity2.id,
            phase: 'ACTION_SELECTION', timeLeft: 60, mode, roomId, events: [], towerLevel
        };
        setBattleState(initialState); setView('BATTLE'); processingTurnRef.current = false;
        if (mode === 'ONLINE_PVP') net.sendState(initialState);
    };

    const executeTurn = useCallback((skillId: string) => {
        if (!battleState || processingTurnRef.current) return;
        let isMyTurn = battleState.mode === 'ONLINE_PVP' ? (myRole !== 'SPECTATOR' && battleState.activePlayerId === playerId) : (battleState.activePlayerId === playerId);
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
            const cost = calculateManaCost(skill, active.config.stats, active);
            if (active.currentMana < cost) { if (isMyTurn) alert("法力值不足！"); processingTurnRef.current = false; return; }
        }

        newState.log.push(`\n--- 第 ${newState.turn} 回合 ---`);
        if (skillId === 'basic_attack') processBasicAttack(active, opponent, pushEvent);
        else {
            const skill = active.config.skills.find(s => s.id === skillId);
            if (skill && !processSkill(skill, active, opponent, pushEvent, newState.turn)) { processingTurnRef.current = false; return; }
            else if (!skill) processBasicAttack(active, opponent, pushEvent);
        }

        const entities = [active, opponent];
        let passiveTriggered = true; let loops = 0; const triggeredSkillIds = new Set<string>();
        while (passiveTriggered && loops < 5) {
            passiveTriggered = false;
            entities.forEach(entity => {
                const enemyOfEntity = entity.id === active.id ? opponent : active;
                entity.config.skills.filter(s => s.isPassive).forEach(s => {
                    const key = `${entity.id}-${s.id}`;
                    if (!triggeredSkillIds.has(key) && processSkill(s, entity, enemyOfEntity, pushEvent, newState.turn, true)) {
                        passiveTriggered = true; triggeredSkillIds.add(key);
                        pushEvent({ type: 'SKILL_EFFECT', sourceId: entity.id, targetId: enemyOfEntity.id, skillName: s.name, visual: s.logic[0]?.effect.visual });
                        pushEvent({ type: 'TEXT', text: `[被动] ${entity.config.name} 触发 ${s.name}`});
                    }
                });
            });
            loops++;
        }

        newState.phase = 'EXECUTING';
        newState.events.forEach(evt => { if (evt.text) newState.log.push(evt.text); });
        setBattleState(newState);
        if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
    }, [battleState, playerId, myRole]);

    const handleAnimationComplete = useCallback(() => {
        processingTurnRef.current = false; 
        if (!battleState || battleState.phase === 'FINISHED' || battleState.winnerId) return;
        if (battleState.mode === 'ONLINE_PVP' && myRole !== 'HOST') return;

        const newState = { ...battleState };
        const isP1Active = newState.activePlayerId === newState.p1.id;
        const active = isP1Active ? newState.p1 : newState.p2;
        const opponent = isP1Active ? newState.p2 : newState.p1;

        if (opponent.currentHp <= 0) {
            newState.winnerId = active.id; newState.phase = 'FINISHED'; newState.log.push(`${active.config.name} 获胜！`);
            setBattleState(newState); if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
            if (newState.mode === 'TOWER' && active.id === playerId && newState.towerLevel) StorageService.saveTowerProgress(newState.towerLevel + 1);
            StorageService.clearBattleSession(); return;
        }
        if (active.currentHp <= 0) {
            newState.winnerId = opponent.id; newState.phase = 'FINISHED'; newState.log.push(`${opponent.config.name} 获胜！`);
            setBattleState(newState); if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
            StorageService.clearBattleSession(); return;
        }

        newState.turn += 1; newState.activePlayerId = opponent.id; 
        const nextActive = newState.activePlayerId === newState.p1.id ? newState.p1 : newState.p2;
        const manaRegen = getTotalStat(nextActive, StatType.MANA_REGEN);
        if (manaRegen > 0) nextActive.currentMana = Math.min(getTotalStat(nextActive, StatType.MANA), nextActive.currentMana + (getTotalStat(nextActive, StatType.MANA) * manaRegen / 100));

        newState.phase = 'ACTION_SELECTION'; newState.timeLeft = 60; newState.events = []; 
        setBattleState(newState); if (newState.mode === 'ONLINE_PVP') net.sendState(newState);
    }, [battleState, myRole, playerId]);

    const handleSurrender = () => {
        if (!battleState || myRole === 'SPECTATOR') return;
        const newState = { ...battleState, winnerId: battleState.p1.id === playerId ? battleState.p2.id : battleState.p1.id, phase: 'FINISHED' as any };
        newState.log.push(`${myChar?.name || '玩家'} 认输了。`);
        setBattleState(newState); if (newState.mode === 'ONLINE_PVP') net.sendState(newState); StorageService.clearBattleSession();
    };

    // Battle Timer Sync
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
        const syncTimer = setInterval(() => { if (battleState.mode === 'ONLINE_PVP' && myRole === 'HOST') net.sendState(battleState); }, 2000);
        return () => { clearInterval(timer); clearInterval(syncTimer); };
    }, [view, battleState?.phase, battleState?.winnerId, myRole, battleState?.mode]);

    // Timer Expiry Trigger
    useEffect(() => {
        if (battleState && battleState.timeLeft === 0 && battleState.phase === 'ACTION_SELECTION' && !battleState.winnerId) {
            if (battleState.mode === 'ONLINE_PVP' && myRole !== 'HOST') return;
            processingTurnRef.current = false; executeTurn('basic_attack');
        }
    }, [battleState?.timeLeft, myRole, executeTurn, battleState?.mode, battleState?.phase, battleState?.winnerId]);

    return (
        <div className="h-screen w-screen bg-slate-950 text-slate-200 flex flex-col overflow-hidden">
            <ReconnectModal session={showReconnectModal} onClose={() => setShowReconnectModal(null)} onReconnect={joinPrivateRoom} />
            <ChallengeOverlay challenges={incomingChallenges} onRespond={handleRespondChallenge} />
            
            <div className="h-12 border-b-4 border-slate-700 bg-slate-900 flex items-center px-4 md:px-6 justify-between select-none z-50 shrink-0">
                <span className="retro-font text-blue-400 text-sm cursor-pointer" onClick={() => { net.disconnect(); setView('MENU'); }}>Code Hero</span>
                <div className="text-xs text-slate-600 font-mono">ID: {playerId.slice(0, 6)}</div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {showHeroSelect && (
                    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
                        <div className="w-full max-w-6xl h-full max-h-[90vh] bg-slate-900 border-4 border-slate-600 shadow-2xl overflow-hidden flex flex-col">
                            <CharacterList onSelect={handleSelectHero} onEdit={()=>{}} onBack={() => setShowHeroSelect(false)} mode="SELECT" />
                        </div>
                    </div>
                )}
                
                {opponentDisconnectTime && !battleState?.winnerId && (
                    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center pointer-events-none">
                        <div className="bg-slate-900 border-4 border-red-500 p-6 shadow-2xl animate-pulse">
                            <h2 className="text-red-500 font-bold text-xl mb-2 flex items-center gap-2">
                                <AlertTriangle /> 对手断开连接
                            </h2>
                            <p className="text-white font-mono">
                                等待重连: {60 - Math.floor((Date.now() - opponentDisconnectTime) / 1000)}s
                            </p>
                        </div>
                    </div>
                )}

                {view === 'MENU' && <MenuView onNavigate={setView} hasHero={!!myChar} />}
                {view === 'HERO_MANAGE' && <CharacterList onSelect={() => {}} onEdit={(char) => { setMyChar(char); setView('EDITOR'); }} onBack={() => setView('MENU')} mode="MANAGE" />}
                {view === 'EDITOR' && myChar && <CharacterEditor existing={myChar} onSave={handleSaveChar} onBack={() => setView('HERO_MANAGE')} />}
                {view === 'BATTLE_SETUP' && myChar && (
                    <BattleSetupView 
                        myChar={myChar} onNavigate={setView} onShowHeroSelect={() => setShowHeroSelect(true)}
                        onStartBot={startLocalBotBattle} onStartTower={() => setView('TOWER_SELECT')}
                        onEnterPublic={enterPublicHall} onJoinPrivate={joinPrivateRoom}
                        roomId={roomId} setRoomId={setRoomId}
                    />
                )}
                {view === 'TOWER_SELECT' && <TowerSelectView progress={towerProgress} onStartLevel={startTowerBattle} onBack={() => setView('BATTLE_SETUP')} />}
                {view === 'PUBLIC_HALL' && myChar && (
                    <PublicHallView 
                        players={hallPlayers} myChar={myChar} challengeSentTo={challengeSentTo} challengeStatus={challengeStatus}
                        onChallenge={handleChallengePlayer} onDisconnect={() => { net.disconnect(); setView('BATTLE_SETUP'); }}
                        onShowHeroSelect={() => setShowHeroSelect(true)}
                    />
                )}
                {view === 'LOBBY' && (
                    <LobbyView 
                        roomId={roomId} battleOrigin={battleOrigin} myRole={myRole} myChar={myChar}
                        opponentChar={opponentChar} spectatorChallengerChar={spectatorChallengerChar} spectators={spectators}
                        opponentReady={opponentReady} amIReady={amIReady} lobbyLog={lobbyLog}
                        onStartGame={handleHostStartGame} onToggleReady={handleToggleReady}
                        onLeave={() => { net.disconnect(); if(battleOrigin === 'PUBLIC') enterPublicHall(); else setView('BATTLE_SETUP'); }}
                        onShowHeroSelect={() => setShowHeroSelect(true)}
                    />
                )}
                {view === 'BATTLE' && battleState && (
                    <BattleView 
                        battleState={battleState} myRole={myRole} playerId={playerId}
                        onSurrender={handleSurrender} onRematch={handleRematchClick}
                        myRematchRequest={myRematchRequest} opponentRematchRequest={opponentRematchRequest}
                        opponentLeft={opponentLeft}
                        onLeave={() => { 
                            net.disconnect(); StorageService.clearBattleSession();
                            if (battleState.mode === 'LOCAL_BOT') setView('BATTLE_SETUP');
                            else if (battleState.mode === 'TOWER') setView('TOWER_SELECT');
                            else if(battleOrigin === 'PUBLIC') enterPublicHall(); 
                            else if (battleOrigin === 'PRIVATE') joinPrivateRoom();
                        }}
                        executeTurn={executeTurn} onAnimationComplete={handleAnimationComplete} onNextLevel={startTowerBattle}
                        battleOrigin={battleOrigin}
                    />
                )}
            </div>
        </div>
    );
};

export default App;
