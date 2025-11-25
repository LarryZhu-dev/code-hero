
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { BattleSession } from '../types';
import { StorageService } from '../services/storage';

interface Props {
    session: BattleSession | null;
    onClose: () => void;
    onReconnect: (roomId: string) => void;
}

const ReconnectModal: React.FC<Props> = ({ session, onClose, onReconnect }) => {
    if (!session) return null;
    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border-4 border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.3)] max-w-md w-full p-6 animate-in zoom-in duration-200">
                <div className="flex items-center gap-3 text-yellow-400 mb-4">
                    <AlertTriangle size={32} />
                    <h2 className="text-xl font-bold retro-font">检测到未完成的对局</h2>
                </div>
                <p className="text-slate-300 mb-6 leading-relaxed">
                    您有一场正在进行的 {session.mode === 'ONLINE_PVP' ? 'PVP 对局' : '战斗'}。
                    <br/><br/>
                    房间号: <span className="font-mono text-white bg-slate-800 px-2 py-0.5">{session.roomId}</span>
                </p>
                <div className="flex gap-4">
                    <button 
                        onClick={() => {
                            StorageService.clearBattleSession();
                            onClose();
                            // Treat as surrender if declined
                            alert("您已放弃重连，该对局将被视为逃跑判负。");
                        }}
                        className="flex-1 pixel-btn pixel-btn-danger border-2 py-3"
                    >
                        放弃 (判负)
                    </button>
                    <button 
                        onClick={() => onReconnect(session.roomId)}
                        className="flex-1 pixel-btn pixel-btn-success border-2 py-3"
                    >
                        重新连接
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReconnectModal;
