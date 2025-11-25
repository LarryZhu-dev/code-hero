
import React, { useEffect, useState } from 'react';
import { Swords } from 'lucide-react';

interface ChallengeRequest {
    fromId: string;
    name: string;
    timestamp: number;
}

interface Props {
    challenge: ChallengeRequest;
    onAccept: () => void;
    onReject: () => void;
}

const ChallengeCard: React.FC<Props> = ({ challenge, onAccept, onReject }) => {
    const [progress, setProgress] = useState(100);

    useEffect(() => {
        const duration = 60000;
        const interval = setInterval(() => {
            const elapsed = Date.now() - challenge.timestamp;
            const remaining = Math.max(0, duration - elapsed);
            const pct = (remaining / duration) * 100;
            setProgress(pct);
            
            if (pct <= 0) {
                // Auto reject on timeout in the parent via cleanup, 
                // but visually we show empty
            }
        }, 100);

        return () => clearInterval(interval);
    }, [challenge.timestamp]);

    return (
        <div className="w-80 bg-slate-900 border-4 border-yellow-500 shadow-2xl p-4 animate-in slide-in-from-right duration-300 pointer-events-auto">
            <div className="flex items-center justify-between gap-2 mb-2 text-yellow-400 font-bold">
                <div className="flex items-center gap-2">
                    <Swords size={20} /> 对战请求
                </div>
                <span className="text-[10px] bg-yellow-900/50 px-1 border border-yellow-700 font-mono">
                    {Math.ceil(progress * 0.6)}s
                </span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full h-1 bg-slate-800 mb-3">
                <div className="h-full bg-yellow-500 transition-all duration-100 ease-linear" style={{ width: `${progress}%` }}></div>
            </div>

            <div className="text-white mb-4">
                玩家 <span className="font-bold text-yellow-200">{challenge.name}</span> 向你发起了挑战！
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={onAccept}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 font-bold border-2 border-green-800"
                >
                    接受
                </button>
                <button 
                    onClick={onReject}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 font-bold border-2 border-red-800"
                >
                    拒绝
                </button>
            </div>
        </div>
    );
};

export default ChallengeCard;
