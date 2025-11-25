
import React from 'react';

interface IconProps {
    size?: number;
    className?: string;
    color?: string;
    style?: React.CSSProperties;
}

const PixelSvg: React.FC<IconProps & { children: React.ReactNode, viewBox?: string }> = ({ size = 24, className = '', color = 'currentColor', style, children, viewBox = "0 0 24 24" }) => (
    <svg 
        width={size} 
        height={size} 
        viewBox={viewBox} 
        fill={color} 
        xmlns="http://www.w3.org/2000/svg" 
        className={className}
        style={style}
        shapeRendering="crispEdges"
    >
        {children}
    </svg>
);

// --- UI Icons ---

export const IconBack: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M6 4h2v2h2v2h2v2h2v4h-2v2h-2v2H8v2H6V4zm4 4v2h2v4h-2v2H8v-8h2z" fillRule="evenodd"/>
        <path d="M14 8h4v8h-4V8z"/>
    </PixelSvg>
);

export const IconHome: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M10 2h4v2h2v2h2v2h2v2h2v12H2V10h2V8h2V6h2V4h2V2zm0 4h-2v2H6v2H4v10h16V10h-2V8h-2V6h-2V4h-4z" />
        <path d="M10 14h4v6h-4v-6z" />
    </PixelSvg>
);

export const IconEdit: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M18 2h4v4h-2v2h-2v2h-2v2h-2v2h-2v2H8v-2H6v-2h2v-2h2v-2h2V8h2V6h2V4h2V2zm-2 4h-2v2h-2v2h-2v2h-2v2H8v2h2v-2h2v-2h2v-2h2V8h2V6zM4 16h2v4H4v-4zm-2 4h2v2H2v-2z" />
    </PixelSvg>
);

export const IconTrash: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M2 4h20v2H2V4zm2 4h16v14H4V8zm2 2v10h2V10H6zm4 0v10h2V10h-2zm4 0v10h2V10h-2z" />
    </PixelSvg>
);

export const IconSave: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M4 4h14l2 2v14H4V4zm2 2v4h10V6H6zm0 12h12v-6H6v6z" />
    </PixelSvg>
);

export const IconDownload: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M10 2h4v10h4l-6 6-6-6h4V2zM4 20h16v2H4v-2z" />
    </PixelSvg>
);

export const IconPlay: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M6 4h2v2h2v2h2v2h2v4h-2v2h-2v2H6V4z" />
    </PixelSvg>
);

export const IconPlus: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4z" />
    </PixelSvg>
);

export const IconX: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M4 4h4v2h2v2h4V6h4V4h2v2h-2v2h-2v2h-2v4h2v2h2v2h2v2h-2v-2h-4v-2h-4v2H6v2H4v-2h2v-2h2v-2H6v-2H4V8h2V6H4V4z" />
    </PixelSvg>
);

export const IconCheck: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M18 6h2v2h-2V6zm-2 2h2v2h-2V8zm-2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm-2 2h2v2h-2v-2H8v-2H6v-2H4v2h2v2h2v2h2z" />
    </PixelSvg>
);

export const IconRefresh: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M10 4h4v2h-4V4zm6 2h4v2h-2v2h-2v2h2v-2h2V6h-4zm2 8h4v6h-4v-2h-4v2h-4v-2H6v2H2v-6h4v2h4v-2H6v2h2v-2h2v2h8v-2zm-2 0v2h-2v-2h2z" />
    </PixelSvg>
);

export const IconEye: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
         <path d="M8 6h8v2h4v2h2v4h-2v2h-4v2H8v-2H4v-2H2v-4h2V8h4V6zm4 4h4v4h-4v-4z" />
    </PixelSvg>
);

// --- Stat / Game Icons ---

export const IconHeart: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M4 4h4v2h2V4h2v2h2V4h4v4h-2v2h-2v2h-2v2h-2v2h-2v2H8v-2H6v-2H4v-2H2V8h2V4z" />
        <path d="M6 6h2v2H6V6zm8 0h2v2h-2V6z" fill="rgba(255,255,255,0.5)"/>
    </PixelSvg>
);

export const IconMana: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M10 2h4v2h2v4h2v4h2v4h-2v4h-4v2h-4v-2H6v-4H4v-4H2V8h2V4h2V2h4z" />
        <path d="M10 6h2v4h-2V6zm-2 4h2v2H8v-2zm6 0h2v2h-2v-2z" fill="rgba(255,255,255,0.4)"/>
    </PixelSvg>
);

export const IconSword: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M18 2h4v4h-2v2h-2v2h-2v2h-2v2h-2v2H8v-2H6v-2H2v4h4v4H2v-4H0v-4h4v-2h2v-2h2v-2h2V8h2V6h2V4h2V2z" />
        <path d="M14 6h2v2h-2V6zM10 10h2v2h-2v-2zM6 14h2v2H6v-2z" fill="rgba(255,255,255,0.3)" />
    </PixelSvg>
);

export const IconStaff: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M14 2h6v6h-2v2h-2v12h-4V10h-2V8h-2V2h6zm2 2h2v2h-2V4z" />
        <path d="M16 4h2v2h-2V4z" fill="white"/>
    </PixelSvg>
);

export const IconShield: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M4 2h16v4h2v8h-2v4h-2v2h-2v2h-8v-2H6v-2H4v-4H2V6h2V2zm2 4v10h12V6H6z" />
        <path d="M8 6h2v2H8V6zm4 0h2v2h-2V6zm4 0h2v2h-2V6z" fill="rgba(255,255,255,0.2)"/>
    </PixelSvg>
);

export const IconBrokenShield: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M4 2h6v2h2V2h8v4h2v8h-2v4h-2v2h-2v2h-8v-2H6v-2H4v-4H2V6h2V2zm2 4v2h4v2h2v-2h2v2h2V6H6zm0 8h2v2h4v2h-2v2h-4v-2H6v-4zM16 14h4v4h-4v-4z" />
    </PixelSvg>
);

export const IconBoot: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M6 2h10v6h-2v2h-2v2h4v2h4v2h2v6H2v-4h2v-2h2v-2h2V8H6V2z" />
        <path d="M14 16h4v2h-4v-2z" fill="rgba(255,255,255,0.3)"/>
    </PixelSvg>
);

export const IconBolt: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M12 2h6v8h-4v12l-6-8h4V2z" />
    </PixelSvg>
);

export const IconCrosshair: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M10 0h4v4h-4V0zM10 20h4v4h-4v-4zM0 10h4v4H0v-4zm20 0h4v4h-4v-4zM8 8h2v2H8V8zm6 0h2v2h-2V8zm-6 6h2v2H8v-2zm6 0h2v2h-2v-2z" />
    </PixelSvg>
);

export const IconSkull: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M8 2h8v2h2v4h2v4h-2v2h-2v2h-2v4h-4v-4H8v-2H6v-2H4V8h2V4h2V2zm2 4h2v2h-2V6zm4 0h2v2h-2V6z" />
    </PixelSvg>
);

export const IconVampire: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
         <path d="M2 6h4v4H4v4h2v2h2v4h2v2h4v-2h2v-4h2v-2h2v-4h-2V6h-4v2h-2v2h-4V8H8V6H2zm6 6h2v4H8v-4zm6 0h2v4h-2v-4z" />
    </PixelSvg>
);

export const IconDroplet: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M10 2h4v4h2v4h2v6h-2v4h-2v2h-4v-2H8v-4H6v-6h2V6h2V2z" />
        <path d="M10 6h2v4h-2V6z" fill="rgba(255,255,255,0.4)"/>
    </PixelSvg>
);

export const IconSpark: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M10 0h4v6h6v4h-6v14h-4V10H4V6h6V0z" />
    </PixelSvg>
);

export const IconMuscle: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M4 8h4v-2h6v2h6v4h-2v4h-2v4h-8v-4H6v-4H4V8zm4 2v4h8v-4H8z" />
    </PixelSvg>
);

// --- New Role Icons ---

export const IconBow: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M6 2h2v4h2v4h-2v4h2v4h-2v4H6v-4h2v-4H6V8h2V6H6V2zm10 0h2v20h-2V2zM6 8h8v2H6V8zm0 6h8v2H6v-2z" />
    </PixelSvg>
);

export const IconDagger: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M14 2h4v2h2v2h-2v2h-2v2h-2v2h-2v2h-2v4h-4v-4H4v-2h2v-2h2V8h2V6h2V4h2V2zM6 14h2v2H6v-2z" />
    </PixelSvg>
);

export const IconFist: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M4 6h4v-2h4v2h4v2h2v10h-2v2H4v-2H2V8h2V6zm4 2v4h2v-4H8zm4 0v4h2v-4h-2z" />
    </PixelSvg>
);

export const IconFire: React.FC<IconProps> = (props) => (
    <PixelSvg {...props}>
        <path d="M8 2h4v2h4v4h2v6h-2v2h-2v4h-2v2h-4v-2H6v-4H4v-2H2V8h2V6h4V2zm2 4h2v4h-2V6z" />
    </PixelSvg>
);

// --- Role Badge Component ---

export const RoleBadge: React.FC<{ role: string, className?: string }> = ({ role, className = '' }) => {
    let icon = <IconSword size={14} />;
    let label = role;
    let colorClass = 'bg-slate-700 text-slate-300 border-slate-500';

    switch (role) {
        case 'TANK':
            icon = <IconShield size={14} />;
            label = '坦克 (Tank)';
            colorClass = 'bg-yellow-900/40 text-yellow-400 border-yellow-600';
            break;
        case 'JUGGERNAUT':
            icon = <IconFist size={14} />;
            label = '重装 (Juggernaut)';
            colorClass = 'bg-orange-900/40 text-orange-400 border-orange-600';
            break;
        case 'WARRIOR':
            icon = <IconSword size={14} />;
            label = '战士 (Warrior)';
            colorClass = 'bg-red-900/40 text-red-400 border-red-600';
            break;
        case 'RANGER':
            icon = <IconBow size={14} />;
            label = '游侠 (Ranger)';
            colorClass = 'bg-emerald-900/40 text-emerald-400 border-emerald-600';
            break;
        case 'ASSASSIN':
            icon = <IconDagger size={14} />;
            label = '刺客 (Assassin)';
            colorClass = 'bg-fuchsia-900/40 text-fuchsia-400 border-fuchsia-600';
            break;
        case 'MAGE':
            icon = <IconStaff size={14} />;
            label = '法师 (Mage)';
            colorClass = 'bg-blue-900/40 text-blue-400 border-blue-600';
            break;
        case 'BURST_MAGE':
            icon = <IconFire size={14} />;
            label = '爆裂 (Burst)';
            colorClass = 'bg-pink-900/40 text-pink-400 border-pink-600';
            break;
        case 'WARLOCK':
            icon = <IconSkull size={14} />;
            label = '术士 (Warlock)';
            colorClass = 'bg-indigo-900/40 text-indigo-400 border-indigo-600';
            break;
        case 'UNDYING_MAGE':
            icon = <IconHeart size={14} />;
            label = '不灭 (Undying)';
            colorClass = 'bg-teal-900/40 text-teal-400 border-teal-600';
            break;
        case 'BLOOD_DEMON':
            icon = <IconVampire size={14} />;
            label = '血魔 (Demon)';
            colorClass = 'bg-rose-900/40 text-rose-500 border-rose-700';
            break;
        default:
            label = role;
            break;
    }

    return (
        <div className={`flex items-center gap-2 px-2 py-1 text-xs font-bold border-2 rounded-sm ${colorClass} ${className}`}>
            {icon}
            <span className="retro-font tracking-wide">{label}</span>
        </div>
    );
};
