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

export const drawHeroSprite = (
    graphics: PIXI.Graphics, 
    config: AppearanceConfig, 
    animState: { time: number, action: 'IDLE' | 'ATTACK' | 'CAST' },
    isFacingLeft: boolean
) => {
    const S = 4; // Scale factor for pixel look
    const color = parseInt(config.themeColor.replace('#', '0x'));
    const skin = 0xffdbac;
    const dark = 0x1e293b;
    const metal = 0x94a3b8;
    const wood = 0x8b4513;

    graphics.clear();
    
    // Container group to handle flipping
    const container = new PIXI.Container();
    container.scale.x = isFacingLeft ? -1 : 1;
    
    // We can't add containers to graphics, but we can draw relative to 0,0 
    // and let the caller handle the container scaling.
    // However, since we are passed a Graphics object, we must draw directly.
    // To handle flip, we just invert X coordinates if facing left? 
    // Easier: The caller usually puts this graphics inside a container.
    // We will assume 0,0 is center bottom.
    
    const drawRect = (x: number, y: number, w: number, h: number, col: number) => {
        graphics.rect(x * S, y * S, w * S, h * S).fill(col);
    };

    // --- LEGS ---
    drawRect(-4, 0, 3, 6, dark); // Left Leg
    drawRect(1, 0, 3, 6, dark);  // Right Leg

    // --- BODY ---
    if (config.body === 'ROBE') {
        drawRect(-5, -8, 10, 9, color);
        drawRect(-2, -8, 4, 9, 0x334155); // Strip
    } else if (config.body === 'PLATE') {
        drawRect(-5, -8, 10, 8, metal);
        drawRect(-3, -6, 6, 4, color); // Chest plate
    } else if (config.body === 'LEATHER') {
        drawRect(-4, -8, 8, 8, 0x78350f); // Brown
        drawRect(-3, -7, 6, 6, 0x451a03); // Dark Brown
    } else {
        // Vest / Default
        drawRect(-4, -8, 8, 8, color);
        drawRect(-2, -6, 4, 4, skin); // Chest exposed
    }

    // --- HEAD ---
    const headY = config.body === 'ROBE' ? -14 : -14;
    
    // Face (Common)
    drawRect(-4, headY, 8, 6, skin);
    
    // Eyes
    drawRect(-2, headY + 2, 1, 1, 0x000000);
    drawRect(1, headY + 2, 1, 1, 0x000000);

    if (config.head === 'KNIGHT') {
        drawRect(-4, headY - 2, 8, 4, color); // Top
        drawRect(-5, headY - 1, 1, 6, color); // Side
        drawRect(4, headY - 1, 1, 6, color); // Side
        drawRect(-1, headY - 4, 2, 2, 0xffff00); // Plume
    } else if (config.head === 'HOOD') {
        drawRect(-5, headY - 2, 10, 4, color);
        drawRect(-5, headY, 1, 6, color);
        drawRect(4, headY, 1, 6, color);
    } else if (config.head === 'CROWN') {
        drawRect(-4, headY - 2, 8, 2, 0xffd700);
        drawRect(-4, headY - 4, 1, 2, 0xffd700);
        drawRect(3, headY - 4, 1, 2, 0xffd700);
        drawRect(0, headY - 4, 1, 2, 0xffd700);
    } else if (config.head === 'HORNED') {
        drawRect(-4, headY - 1, 8, 2, dark); // Band
        drawRect(-5, headY - 4, 1, 3, 0xffffff); // Horn L
        drawRect(4, headY - 4, 1, 3, 0xffffff); // Horn R
    } else if (config.head === 'WILD') {
        drawRect(-5, headY - 3, 10, 3, color); // Hair Top
        drawRect(-6, headY - 1, 2, 4, color); // Hair Side
        drawRect(4, headY - 1, 2, 4, color); // Hair Side
    } else if (config.head === 'BANDANA') {
        drawRect(-4, headY - 1, 8, 2, color);
        drawRect(3, headY - 1, 2, 2, color); // Knot
    }

    // --- WEAPON (Animated) ---
    // We calculate weapon position based on animation state
    let wx = 4 * S;
    let wy = -5 * S;
    let rot = 0;

    if (animState.action === 'ATTACK') {
        rot = Math.sin(animState.time * 0.5) * 1.5;
        wx += Math.cos(animState.time * 0.5) * 5;
    } else if (animState.action === 'CAST') {
        wy -= Math.sin(animState.time * 0.5) * 5;
    }

    // Draw weapon into a separate Graphics context? 
    // Since we are drawing to one Graphics, we have to transform points manually or rely on the fact 
    // that this function is called every frame to redraw the whole mesh.
    // For simplicity in this pixel engine, we just draw it relative to body with offsets.
    
    // To properly rotate weapon around a pivot in a single Graphics object is hard.
    // Strategy: We won't draw the weapon HERE. The caller (PixelEntity) separates HandGroup.
    // BUT for the "Preview" in editor, we might want it all in one.
    // Let's modify the contract: `drawHeroSprite` draws the BODY. `drawWeapon` draws the WEAPON.
};

export const drawBody = (g: PIXI.Graphics, config: AppearanceConfig) => {
    const S = 4;
    const color = parseInt(config.themeColor.replace('#', '0x'));
    const skin = 0xffdbac;
    const dark = 0x1e293b;
    const metal = 0x94a3b8;

    // Legs
    g.rect(-4 * S, 0, 3 * S, 6 * S).fill(dark);
    g.rect(1 * S, 0, 3 * S, 6 * S).fill(dark);

    // Body
    if (config.body === 'ROBE') {
        g.rect(-5 * S, -8 * S, 10 * S, 9 * S).fill(color);
        g.rect(-2 * S, -8 * S, 4 * S, 9 * S).fill(0x334155); 
    } else if (config.body === 'PLATE') {
        g.rect(-5 * S, -8 * S, 10 * S, 8 * S).fill(metal);
        g.rect(-3 * S, -6 * S, 6 * S, 4 * S).fill(color); 
    } else if (config.body === 'LEATHER') {
        g.rect(-4 * S, -8 * S, 8 * S, 8 * S).fill(0x78350f); 
        g.rect(-3 * S, -7 * S, 6 * S, 6 * S).fill(0x451a03); 
    } else {
        g.rect(-4 * S, -8 * S, 8 * S, 8 * S).fill(color);
        g.rect(-2 * S, -6 * S, 4 * S, 4 * S).fill(skin); 
    }

    // Head
    const headY = config.body === 'ROBE' ? -14 * S : -14 * S;
    g.rect(-4 * S, headY, 8 * S, 6 * S).fill(skin); // Face
    g.rect(-2 * S, headY + 2 * S, 1 * S, 1 * S).fill(0x000000); // Eye
    g.rect(1 * S, headY + 2 * S, 1 * S, 1 * S).fill(0x000000); // Eye

    if (config.head === 'KNIGHT') {
        g.rect(-4 * S, headY - 2 * S, 8 * S, 4 * S).fill(color); 
        g.rect(-5 * S, headY - 1 * S, 1 * S, 6 * S).fill(color); 
        g.rect(4 * S, headY - 1 * S, 1 * S, 6 * S).fill(color); 
        g.rect(-1 * S, headY - 4 * S, 2 * S, 2 * S).fill(0xffff00); 
    } else if (config.head === 'HOOD') {
        g.rect(-5 * S, headY - 2 * S, 10 * S, 4 * S).fill(color);
        g.rect(-5 * S, headY, 1 * S, 6 * S).fill(color);
        g.rect(4 * S, headY, 1 * S, 6 * S).fill(color);
    } else if (config.head === 'CROWN') {
        g.rect(-4 * S, headY - 2 * S, 8 * S, 2 * S).fill(0xffd700);
        g.rect(-4 * S, headY - 4 * S, 1 * S, 2 * S).fill(0xffd700);
        g.rect(3 * S, headY - 4 * S, 1 * S, 2 * S).fill(0xffd700);
        g.rect(0 * S, headY - 4 * S, 1 * S, 2 * S).fill(0xffd700);
    } else if (config.head === 'HORNED') {
        g.rect(-4 * S, headY - 1 * S, 8 * S, 2 * S).fill(dark); 
        g.rect(-5 * S, headY - 4 * S, 1 * S, 3 * S).fill(0xffffff); 
        g.rect(4 * S, headY - 4 * S, 1 * S, 3 * S).fill(0xffffff); 
    } else if (config.head === 'WILD') {
        g.rect(-5 * S, headY - 3 * S, 10 * S, 3 * S).fill(color); 
        g.rect(-6 * S, headY - 1 * S, 2 * S, 4 * S).fill(color); 
        g.rect(4 * S, headY - 1 * S, 2 * S, 4 * S).fill(color); 
    } else if (config.head === 'BANDANA') {
        g.rect(-4 * S, headY - 1 * S, 8 * S, 2 * S).fill(color);
        g.rect(3 * S, headY - 1 * S, 2 * S, 2 * S).fill(color); 
    }
};

export const drawWeapon = (g: PIXI.Graphics, config: AppearanceConfig) => {
    const S = 4;
    const color = parseInt(config.themeColor.replace('#', '0x'));
    const metal = 0x94a3b8;
    const wood = 0x8b4513;

    g.clear();
    
    // Hand
    g.rect(0, 0, 3 * S, 3 * S).fill(0xffdbac);

    if (config.weapon === 'SWORD') {
        g.rect(1 * S, -8 * S, 2 * S, 12 * S).fill(metal);
        g.rect(-1 * S, 0 * S, 6 * S, 1 * S).fill(0x475569); // Guard
        g.rect(1.5 * S, 1 * S, 1 * S, 3 * S).fill(wood); // Hilt
    } else if (config.weapon === 'STAFF') {
        g.rect(1 * S, -6 * S, 1 * S, 14 * S).fill(wood);
        g.circle(1.5 * S, -6 * S, 2.5 * S).fill(color);
        g.circle(1.5 * S, -6 * S, 1.5 * S).fill(0xffffff);
    } else if (config.weapon === 'AXE') {
        g.rect(1 * S, -6 * S, 1 * S, 12 * S).fill(wood);
        g.rect(2 * S, -6 * S, 4 * S, 4 * S).fill(metal); // Blade R
        g.rect(0 * S, -6 * S, -3 * S, 4 * S).fill(metal); // Blade L
    } else if (config.weapon === 'BOW') {
        g.arc(1.5 * S, 1.5 * S, 8 * S, -Math.PI/2, Math.PI/2).stroke({width: S, color: wood});
        g.moveTo(1.5 * S, -6.5 * S).lineTo(1.5 * S, 9.5 * S).stroke({width: 1, color: 0xffffff}); // String
    } else if (config.weapon === 'DAGGER') {
        g.rect(1 * S, -3 * S, 1 * S, 6 * S).fill(metal);
        g.rect(1.5 * S, 1 * S, 1 * S, 2 * S).fill(wood);
    } else if (config.weapon === 'HAMMER') {
        g.rect(1 * S, -6 * S, 1 * S, 12 * S).fill(wood);
        g.rect(-2 * S, -9 * S, 8 * S, 4 * S).fill(metal);
    } else if (config.weapon === 'SPEAR') {
        g.rect(1 * S, -10 * S, 1 * S, 16 * S).fill(wood);
        g.rect(0.5 * S, -14 * S, 2 * S, 4 * S).fill(metal);
    }
};