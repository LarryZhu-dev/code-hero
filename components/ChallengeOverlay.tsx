
import React from 'react';
import ChallengeCard from './ChallengeCard';

interface ChallengeRequest {
    fromId: string;
    name: string;
    timestamp: number;
}

interface Props {
    challenges: ChallengeRequest[];
    onRespond: (challenge: ChallengeRequest, accept: boolean) => void;
}

const ChallengeOverlay: React.FC<Props> = ({ challenges, onRespond }) => {
    if (challenges.length === 0) return null;
    
    return (
        <div className="fixed top-14 right-4 z-[70] flex flex-col gap-4 max-h-[80vh] overflow-y-auto no-scrollbar pointer-events-none">
            {challenges.map((challenge) => (
                <ChallengeCard 
                    key={challenge.fromId}
                    challenge={challenge}
                    onAccept={() => onRespond(challenge, true)}
                    onReject={() => onRespond(challenge, false)}
                />
            ))}
        </div>
    );
};

export default ChallengeOverlay;
