
import React from 'react';
import { StatType } from '../types';
import { 
    IconHeart, IconMana, IconSword, IconStaff, IconShield, IconBoot, 
    IconCrosshair, IconSkull, IconBrokenShield, IconSpark, IconVampire, 
    IconDroplet, IconMuscle 
} from './PixelIcons';

interface Props {
    stat: StatType;
    size?: number;
    className?: string;
}

export const StatIcon: React.FC<Props> = ({ stat, size = 18, className = '' }) => {
    switch(stat) {
        case StatType.HP: return <IconHeart size={size} className={`text-red-500 ${className}`}/>;
        case StatType.MANA: return <IconMana size={size} className={`text-blue-500 ${className}`}/>;
        case StatType.AD: return <IconSword size={size} className={`text-orange-500 ${className}`}/>;
        case StatType.AP: return <IconStaff size={size} className={`text-purple-500 ${className}`}/>;
        case StatType.ARMOR: return <IconShield size={size} className={`text-yellow-500 ${className}`}/>;
        case StatType.MR: return <IconShield size={size} className={`text-cyan-500 ${className}`}/>;
        case StatType.SPEED: return <IconBoot size={size} className={`text-emerald-500 ${className}`}/>;
        case StatType.CRIT_RATE: return <IconCrosshair size={size} className={`text-pink-500 ${className}`}/>;
        case StatType.CRIT_DMG: return <IconSkull size={size} className={`text-red-700 text-rose-700 ${className}`}/>; // Merged class logic
        case StatType.ARMOR_PEN_FLAT: return <IconBrokenShield size={size} className={`text-orange-300 ${className}`}/>;
        case StatType.ARMOR_PEN_PERC: return <IconBrokenShield size={size} className={`text-orange-600 ${className}`}/>;
        case StatType.MAGIC_PEN_FLAT: return <IconSpark size={size} className={`text-purple-300 ${className}`}/>;
        case StatType.MAGIC_PEN_PERC: return <IconSpark size={size} className={`text-purple-600 ${className}`}/>;
        case StatType.LIFESTEAL: return <IconVampire size={size} className={`text-red-600 text-red-400 ${className}`}/>;
        case StatType.OMNIVAMP: return <IconVampire size={size} className={`text-purple-600 text-purple-400 ${className}`}/>;
        case StatType.MANA_REGEN: return <IconDroplet size={size} className={`text-blue-300 ${className}`}/>;
        case StatType.TENACITY: return <IconMuscle size={size} className={`text-yellow-600 ${className}`}/>;
        default: return <div className={`bg-slate-600 ${className}`} style={{ width: size, height: size }} />;
    }
};
