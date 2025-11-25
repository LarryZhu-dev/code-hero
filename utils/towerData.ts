
import { CharacterConfig, INITIAL_STATS, StatType, CharacterStats, Skill, HeadType, BodyType, WeaponType } from '../types';

// Generators for tower enemies
const TOWER_HERO_NAMES = [
    "哥布林斥候", "兽人战士", "黑暗学徒", "骷髅将军", "狂暴巨魔",
    "吸血鬼伯爵", "堕落圣骑", "深渊法师", "暗影刺客", "元素巨像",
    "虚空行者", "龙血武士", "死灵法师", "机械战神", "远古树精",
    "地狱领主", "大天使长", "混沌魔龙", "星界裁决者", "创世神影"
];

const ROLES_CONFIG = [
    { role: 'WARRIOR', head: 'KNIGHT' as HeadType, body: 'PLATE' as BodyType, weapon: 'SWORD' as WeaponType, color: '#ef4444' },
    { role: 'MAGE', head: 'HOOD' as HeadType, body: 'ROBE' as BodyType, weapon: 'STAFF' as WeaponType, color: '#a855f7' },
    { role: 'TANK', head: 'HORNED' as HeadType, body: 'PLATE' as BodyType, weapon: 'HAMMER' as WeaponType, color: '#64748b' },
    { role: 'ASSASSIN', head: 'BANDANA' as HeadType, body: 'VEST' as BodyType, weapon: 'DAGGER' as WeaponType, color: '#22c55e' },
    { role: 'RANGER', head: 'WILD' as HeadType, body: 'LEATHER' as BodyType, weapon: 'BOW' as WeaponType, color: '#eab308' }
];

const generateTowerEnemy = (level: number): CharacterConfig => {
    // Level is 1-20
    const difficultyMultiplier = 1 + ((level - 1) / 19) * 9; // 1x to 10x
    
    // Level 1: ~10k Base, ~1000% Perc
    // Level 20: ~100k Base, ~10000% Perc
    const totalBasePoints = 10000 * difficultyMultiplier;
    const totalPercPoints = 1000 * difficultyMultiplier;

    const roleConfig = ROLES_CONFIG[(level - 1) % ROLES_CONFIG.length];
    
    // Generate Stats
    const stats: CharacterStats = JSON.parse(JSON.stringify(INITIAL_STATS));
    
    // Distribution weights based on role
    let weights = { hp: 1, ad: 1, ap: 1, def: 1, speed: 1 };
    if (roleConfig.role === 'WARRIOR') weights = { hp: 3, ad: 3, ap: 0, def: 2, speed: 2 };
    if (roleConfig.role === 'MAGE') weights = { hp: 2, ad: 0, ap: 4, def: 1, speed: 2 };
    if (roleConfig.role === 'TANK') weights = { hp: 5, ad: 1, ap: 0, def: 4, speed: 0.5 };
    if (roleConfig.role === 'ASSASSIN') weights = { hp: 1, ad: 5, ap: 0, def: 0.5, speed: 4 };
    if (roleConfig.role === 'RANGER') weights = { hp: 2, ad: 4, ap: 0, def: 1, speed: 3 };

    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    
    // Allocate Base
    stats.base[StatType.HP] = Math.floor((weights.hp / totalWeight) * totalBasePoints * 0.6); // HP takes more points typically
    stats.base[StatType.MANA] = 2000 * difficultyMultiplier; // Abundant mana
    stats.base[StatType.AD] = Math.floor((weights.ad / totalWeight) * totalBasePoints * 0.4);
    stats.base[StatType.AP] = Math.floor((weights.ap / totalWeight) * totalBasePoints * 0.4);
    stats.base[StatType.ARMOR] = Math.floor((weights.def / totalWeight) * totalBasePoints * 0.2);
    stats.base[StatType.MR] = Math.floor((weights.def / totalWeight) * totalBasePoints * 0.2);
    stats.base[StatType.SPEED] = 100 + (level * 5) + ((weights.speed / totalWeight) * 50);

    // Allocate Percent
    stats.percent[StatType.HP] = Math.floor((weights.hp / totalWeight) * totalPercPoints);
    stats.percent[StatType.AD] = Math.floor((weights.ad / totalWeight) * totalPercPoints);
    stats.percent[StatType.AP] = Math.floor((weights.ap / totalWeight) * totalPercPoints);
    stats.percent[StatType.CRIT_RATE] = level * 2; // Increasing Crit
    stats.percent[StatType.CRIT_DMG] = level * 10;
    
    // Generate Skills (3 per hero)
    const skills: Skill[] = [];
    
    // Skill 1: Basic Scaling Damage
    const dmgStat = weights.ap > weights.ad ? StatType.AP : StatType.AD;
    const dmgType = weights.ap > weights.ad ? 'DAMAGE_MAGIC' : 'DAMAGE_PHYSICAL';
    skills.push({
        id: `tower_${level}_s1`,
        name: '强力打击',
        isPassive: false,
        logic: [{
            effect: {
                type: dmgType as any,
                target: 'ENEMY',
                formula: { factorA: { target: 'SELF', stat: dmgStat }, operator: '*', factorB: { target: 'SELF', stat: StatType.CRIT_DMG } /* Mock multiplier */ },
                visual: { color: roleConfig.color, shape: 'SQUARE', animationType: 'THRUST' }
            }
        }]
    });

    // Skill 2: Utility / Buff / Conditional
    if (roleConfig.role === 'TANK' || roleConfig.role === 'WARRIOR') {
        skills.push({
            id: `tower_${level}_s2`,
            name: '坚不可摧',
            isPassive: true,
            logic: [{
                condition: { sourceTarget: 'SELF', variable: 'HP%', operator: '<', value: 50 },
                effect: {
                    type: 'INCREASE_STAT', target: 'SELF', targetStat: StatType.CURRENT_HP,
                    formula: { factorA: { target: 'SELF', stat: StatType.HP }, operator: '/', factorB: { target: 'SELF', stat: StatType.SPEED } /* ~1% heal per speed? just dummy math */ },
                    visual: { color: '#4ade80', shape: 'CIRCLE' }
                }
            }]
        });
    } else {
        skills.push({
            id: `tower_${level}_s2`,
            name: '毁灭充能',
            isPassive: false,
            logic: [{
                effect: {
                    type: 'INCREASE_STAT', target: 'SELF', targetStat: dmgStat,
                    formula: { factorA: { target: 'SELF', stat: dmgStat }, operator: '/', factorB: { target: 'SELF', stat: StatType.SPEED } },
                    visual: { color: '#fbbf24', shape: 'CIRCLE' }
                }
            }]
        });
    }

    // Skill 3: Ultimate (High Multiplier)
    skills.push({
        id: `tower_${level}_s3`,
        name: '终极奥义',
        isPassive: false,
        logic: [{
            effect: {
                type: dmgType as any,
                target: 'ENEMY',
                formula: { factorA: { target: 'SELF', stat: dmgStat }, operator: '+', factorB: { target: 'SELF', stat: dmgStat } /* 2x Dmg */ },
                visual: { color: roleConfig.color, shape: 'BEAM', animationType: 'CAST' }
            }
        }]
    });

    return {
        id: `tower_lvl_${level}`,
        name: `[${level}F] ${TOWER_HERO_NAMES[level - 1]}`,
        avatarColor: roleConfig.color,
        stats,
        skills,
        appearance: {
            head: roleConfig.head,
            body: roleConfig.body,
            weapon: roleConfig.weapon,
            themeColor: roleConfig.color
        },
        role: roleConfig.role as any
    };
};

export const TOWER_LEVELS = Array.from({ length: 20 }, (_, i) => generateTowerEnemy(i + 1));
