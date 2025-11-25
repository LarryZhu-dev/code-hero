
import { AppearanceConfig, CharacterConfig, HeroRole, StatType } from '../types';
import * as PIXI from 'pixi.js';

// --- CLASSIFICATION LOGIC ---

export const classifyHero = (char: CharacterConfig): HeroRole => {
    const { base, percent } = char.stats;
    const skills = char.skills;

    // Helper to get total potential (base + some percent weight)
    const getScore = (stat: StatType) => (base[stat] || 0) * (1 + (percent[stat] || 0) / 100);

    const hp = getScore(StatType.HP);
    const ad = getScore(StatType.AD);
    const ap = getScore(StatType.AP);
    const armor = getScore(StatType.ARMOR);
    const mr = getScore(StatType.MR);
    const speed = getScore(StatType.SPEED);
    const lifesteal = getScore(StatType.LIFESTEAL) + getScore(StatType.OMNIVAMP);
    
    // Check for special keywords in skills
    const hasRevive = skills.some(s => s.logic.some(l => l.effect.type === 'INCREASE_STAT' && l.effect.targetStat === StatType.CURRENT_HP && l.condition?.operator === '<='));
    const hasHeavyHeal = skills.some(s => s.logic.some(l => l.effect.type === 'INCREASE_STAT' && l.effect.targetStat === StatType.CURRENT_HP));

    // 1. Blood Demon (High Lifesteal + AD/HP)
    if (lifesteal > 20 && ad > 200) return 'BLOOD_DEMON';

    // 2. Undying Mage (Mage + Revive/Heal)
    if (ap > ad && (hasRevive || (hasHeavyHeal && lifesteal > 10))) return 'UNDYING_MAGE';

    // 3. Warlock (High AP + High HP)
    if (ap > ad && ap > 300 && hp > 3000) return 'WARLOCK';

    // 4. Burst Mage (Very High AP, Low HP)
    if (ap > ad && ap > 500 && hp < 2500) return 'BURST_MAGE';

    // 5. Mage (Standard)
    if (ap > ad * 1.5) return 'MAGE';

    // 6. Tank (Very High HP/Def)
    if (hp > 4000 && (armor > 100 || mr > 100)) return 'TANK';

    // 7. Juggernaut (High HP + Good AD)
    if (hp > 3000 && ad > 200) return 'JUGGERNAUT';

    // 8. Assassin (High AD + Speed, Low HP)
    if (ad > 300 && speed > 120 && hp < 2500) return 'ASSASSIN';

    // 9. Ranger (High Speed + AD, implied logic as we don't have Range stat yet)
    if (speed > 140 && ad > 150) return 'RANGER';

    // 10. Warrior (Balanced)
    return 'WARRIOR';
};

export const getDefaultAppearance = (role: HeroRole, color: string): AppearanceConfig => {
    switch (role) {
        case 'TANK': return { head: 'KNIGHT', body: 'PLATE', weapon: 'HAMMER', themeColor: color };
        case 'JUGGERNAUT': return { head: 'KNIGHT', body: 'PLATE', weapon: 'AXE', themeColor: color };
        case 'WARRIOR': return { head: 'BANDANA', body: 'PLATE', weapon: 'SWORD', themeColor: color };
        case 'RANGER': return { head: 'HOOD', body: 'LEATHER', weapon: 'BOW', themeColor: color };
        case 'ASSASSIN': return { head: 'HOOD', body: 'VEST', weapon: 'DAGGER', themeColor: color };
        case 'MAGE': return { head: 'HOOD', body: 'ROBE', weapon: 'STAFF', themeColor: color };
        case 'BURST_MAGE': return { head: 'CROWN', body: 'ROBE', weapon: 'STAFF', themeColor: color };
        case 'WARLOCK': return { head: 'HORNED', body: 'ROBE', weapon: 'STAFF', themeColor: color };
        case 'UNDYING_MAGE': return { head: 'CROWN', body: 'PLATE', weapon: 'STAFF', themeColor: color };
        case 'BLOOD_DEMON': return { head: 'WILD', body: 'VEST', weapon: 'SWORD', themeColor: '#ef4444' }; // Force Red ish
        default: return { head: 'BALD', body: 'VEST', weapon: 'SWORD', themeColor: color };
    }
};

export const getRoleDisplayName = (role: HeroRole): string => {
    const map: Record<HeroRole, string> = {
        'TANK': '坦克 (Tank)',
        'JUGGERNAUT': '重装战士 (Juggernaut)',
        'WARRIOR': '战士 (Warrior)',
        'RANGER': '游侠 (Ranger)',
        'ASSASSIN': '刺客 (Assassin)',
        'MAGE': '法师 (Mage)',
        'BURST_MAGE': '爆裂法师 (Burst Mage)',
        'WARLOCK': '术士 (Warlock)',
        'UNDYING_MAGE': '不灭法师 (Undying)',
        'BLOOD_DEMON': '血魔 (Blood Demon)',
        'UNKNOWN': '未知'
    };
    return map[role] || role;
};

// --- RENDERING LOGIC (PIXI.js) ---

export const drawBody = (g: PIXI.Graphics, config: AppearanceConfig) => {
    const S = 4;
    const color = parseInt(config.themeColor.replace('#', '0x'));
    const skin = 0xffdbac;
    const dark = 0x1e293b;
    const metal = 0x94a3b8;
    const brown = 0x78350f;
    const darkBrown = 0x451a03;

    // Legs (Base)
    g.rect(-4 * S, 0, 3 * S, 6 * S).fill(dark);
    g.rect(1 * S, 0, 3 * S, 6 * S).fill(dark);

    // --- BODY TYPES ---
    if (config.body === 'ROBE') {
        // Robe covers legs partly, wider at bottom
        g.moveTo(-5 * S, -8 * S).lineTo(5 * S, -8 * S).lineTo(6 * S, 5 * S).lineTo(-6 * S, 5 * S).fill(color);
        // Central strip
        g.rect(-2 * S, -8 * S, 4 * S, 13 * S).fill(0x334155); 
        // Shoulders (Soft)
        g.rect(-5 * S, -8 * S, 10 * S, 3 * S).fill(color);

    } else if (config.body === 'PLATE') {
        // Bulky chest
        g.rect(-5 * S, -8 * S, 10 * S, 8 * S).fill(metal);
        // Chest Core
        g.rect(-3 * S, -6 * S, 6 * S, 5 * S).fill(color); 
        // Big Shoulder Pads
        g.rect(-7 * S, -9 * S, 3 * S, 4 * S).fill(color);
        g.rect(4 * S, -9 * S, 3 * S, 4 * S).fill(color);
        // Belt
        g.rect(-5 * S, -1 * S, 10 * S, 2 * S).fill(dark);

    } else if (config.body === 'LEATHER') {
        // Tunic style
        g.rect(-4 * S, -8 * S, 8 * S, 9 * S).fill(brown); 
        // Straps / Detail
        g.rect(-4 * S, -8 * S, 8 * S, 2 * S).fill(darkBrown); // Shoulder yoke
        g.moveTo(-4 * S, -8 * S).lineTo(4 * S, 1 * S).stroke({ width: S/2, color: darkBrown }); // Cross belt

    } else {
        // VEST / Default (Slimmer)
        g.rect(-3 * S, -8 * S, 6 * S, 8 * S).fill(color);
        // Exposed Arms
        g.rect(-5 * S, -8 * S, 2 * S, 6 * S).fill(skin);
        g.rect(3 * S, -8 * S, 2 * S, 6 * S).fill(skin);
        // Exposed Chest patch
        g.rect(-1 * S, -7 * S, 2 * S, 3 * S).fill(skin); 
    }

    // --- HEAD ---
    // Adjust head height slightly based on body bulk
    const headY = (config.body === 'PLATE' || config.body === 'ROBE') ? -15 * S : -14 * S;
    
    // Face (Base)
    g.rect(-4 * S, headY, 8 * S, 6 * S).fill(skin); 
    
    // Eyes
    g.rect(-2 * S, headY + 2 * S, 1 * S, 1 * S).fill(0x000000); 
    g.rect(1 * S, headY + 2 * S, 1 * S, 1 * S).fill(0x000000); 

    // Headgear
    if (config.head === 'KNIGHT') {
        g.rect(-4 * S, headY - 2 * S, 8 * S, 4 * S).fill(color); // Top Helm
        g.rect(-5 * S, headY - 1 * S, 1 * S, 6 * S).fill(color); // Side guard
        g.rect(4 * S, headY - 1 * S, 1 * S, 6 * S).fill(color); // Side guard
        g.rect(-1 * S, headY - 5 * S, 2 * S, 3 * S).fill(0xffff00); // Plume
    } else if (config.head === 'HOOD') {
        g.rect(-5 * S, headY - 2 * S, 10 * S, 4 * S).fill(color);
        g.rect(-5 * S, headY, 2 * S, 7 * S).fill(color);
        g.rect(3 * S, headY, 2 * S, 7 * S).fill(color);
        // Shadow under hood
        g.rect(-3 * S, headY, 6 * S, 1 * S).fill({ color: 0x000000, alpha: 0.3 });
    } else if (config.head === 'CROWN') {
        g.rect(-4 * S, headY - 2 * S, 8 * S, 2 * S).fill(0xffd700);
        g.rect(-4 * S, headY - 4 * S, 1 * S, 2 * S).fill(0xffd700);
        g.rect(3 * S, headY - 4 * S, 1 * S, 2 * S).fill(0xffd700);
        g.rect(0 * S, headY - 4 * S, 1 * S, 2 * S).fill(0xffd700);
    } else if (config.head === 'HORNED') {
        g.rect(-4 * S, headY - 1 * S, 8 * S, 2 * S).fill(dark); 
        g.rect(-6 * S, headY - 5 * S, 2 * S, 4 * S).fill(0xffffff); // Big Horn L
        g.rect(4 * S, headY - 5 * S, 2 * S, 4 * S).fill(0xffffff); // Big Horn R
    } else if (config.head === 'WILD') {
        g.rect(-5 * S, headY - 3 * S, 10 * S, 3 * S).fill(color); 
        g.rect(-7 * S, headY - 1 * S, 3 * S, 5 * S).fill(color); // Messy side
        g.rect(4 * S, headY - 1 * S, 3 * S, 5 * S).fill(color); 
    } else if (config.head === 'BANDANA') {
        g.rect(-4 * S, headY - 1 * S, 8 * S, 2 * S).fill(color);
        g.rect(4 * S, headY - 1 * S, 3 * S, 2 * S).fill(color); // Knot tail
    }
};

export const drawWeapon = (g: PIXI.Graphics, config: AppearanceConfig) => {
    const S = 4;
    const color = parseInt(config.themeColor.replace('#', '0x'));
    const metal = 0x94a3b8;
    const wood = 0x8b4513;

    g.clear();
    
    // Hand (Reference point 0,0)
    g.rect(-1.5 * S, -1.5 * S, 3 * S, 3 * S).fill(0xffdbac);

    if (config.weapon === 'SWORD') {
        g.rect(-1 * S, -10 * S, 2 * S, 12 * S).fill(metal); // Blade centered
        g.rect(-3 * S, -2 * S, 6 * S, 1 * S).fill(0x475569); // Guard
        g.rect(-0.5 * S, -1 * S, 1 * S, 4 * S).fill(wood); // Hilt
    } else if (config.weapon === 'STAFF') {
        g.rect(-0.5 * S, -8 * S, 1 * S, 16 * S).fill(wood);
        g.circle(0, -8 * S, 2.5 * S).fill(color);
        g.circle(0, -8 * S, 1.5 * S).fill(0xffffff);
    } else if (config.weapon === 'AXE') {
        g.rect(-0.5 * S, -8 * S, 1 * S, 14 * S).fill(wood);
        g.rect(0.5 * S, -8 * S, 4 * S, 5 * S).fill(metal); // Blade R
        g.rect(-0.5 * S, -8 * S, -3 * S, 5 * S).fill(metal); // Blade L
    } else if (config.weapon === 'BOW') {
        // Draw bow centered so rotation works
        g.arc(0, 0, 8 * S, -Math.PI/2, Math.PI/2).stroke({width: S, color: wood});
        g.moveTo(0, -8 * S).lineTo(0, 8 * S).stroke({width: 1, color: 0xffffff}); // String
    } else if (config.weapon === 'DAGGER') {
        g.rect(-0.5 * S, -4 * S, 1 * S, 6 * S).fill(metal);
        g.rect(-0.5 * S, 0, 1 * S, 2 * S).fill(wood);
    } else if (config.weapon === 'HAMMER') {
        g.rect(-0.5 * S, -8 * S, 1 * S, 14 * S).fill(wood);
        g.rect(-4 * S, -11 * S, 8 * S, 4 * S).fill(metal);
    } else if (config.weapon === 'SPEAR') {
        g.rect(-0.5 * S, -12 * S, 1 * S, 20 * S).fill(wood);
        g.rect(-1 * S, -16 * S, 2 * S, 4 * S).fill(metal);
    }
};
