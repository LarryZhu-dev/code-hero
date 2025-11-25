
import { CharacterConfig, Skill, Effect, INITIAL_STATS, StatType } from "../types";

const STORAGE_KEY = 'cw_heroes_v1';
const DELETED_DEFAULTS_KEY = 'cw_deleted_defaults';
const LAST_HERO_KEY = 'cw_last_hero_id';

// Migration helper for v1 stat name changes & Skill Logic Structure
const migrateCharacter = (char: CharacterConfig): CharacterConfig => {
    // 1. Migrate Base Stats
    if (char.stats.base['生命值' as any] !== undefined) {
        char.stats.base['最大生命值' as any] = char.stats.base['生命值' as any];
        delete char.stats.base['生命值' as any];
    }
    if (char.stats.base['法力值' as any] !== undefined) {
        char.stats.base['最大法力值' as any] = char.stats.base['法力值' as any];
        delete char.stats.base['法力值' as any];
    }

    // 2. Migrate Percent Stats
    if (char.stats.percent['生命值' as any] !== undefined) {
        char.stats.percent['最大生命值' as any] = char.stats.percent['生命值' as any];
        delete char.stats.percent['生命值' as any];
    }
    if (char.stats.percent['法力值' as any] !== undefined) {
        char.stats.percent['最大法力值' as any] = char.stats.percent['法力值' as any];
        delete char.stats.percent['法力值' as any];
    }

    // 3. Migrate Skills (Old structure conditions[] + effects[] -> logic[])
    char.skills = char.skills.map((skill: any) => {
        // Migration for Stats in effects (done in previous version, kept for safety)
        if (skill.effects && Array.isArray(skill.effects)) {
            skill.effects.forEach((eff: any) => {
                // Target Stat
                if (eff.targetStat === '生命值') eff.targetStat = '最大生命值';
                if (eff.targetStat === '法力值') eff.targetStat = '最大法力值';

                // Formula Factors
                if (eff.formula.factorA.stat === '生命值') eff.formula.factorA.stat = '最大生命值';
                if (eff.formula.factorA.stat === '法力值') eff.formula.factorA.stat = '最大法力值';
                
                if (eff.formula.factorB.stat === '生命值') eff.formula.factorB.stat = '最大生命值';
                if (eff.formula.factorB.stat === '法力值') eff.formula.factorB.stat = '最大法力值';
            });
        }

        // Structure Migration: Logic Blocks
        if (skill.logic) return skill; // Already migrated

        const newSkill: Skill = {
            id: skill.id,
            name: skill.name,
            isPassive: skill.isPassive,
            logic: []
        };

        // Convert old effects to logic blocks
        if (skill.effects && Array.isArray(skill.effects)) {
            skill.effects.forEach((eff: Effect) => {
                newSkill.logic.push({
                    // Use the first condition if available, otherwise undefined (Always)
                    // We can't easily support AND conditions in the new simplified 1:1 structure,
                    // so we take the first one as a best-effort migration.
                    condition: (skill.conditions && skill.conditions.length > 0) 
                        ? skill.conditions[0] 
                        : undefined,
                    effect: eff
                });
            });
        }
        
        return newSkill;
    });

    return char;
};

// --- DEFAULT HARDCODED HEROES ---
const DEFAULT_HEROES: CharacterConfig[] = [
    {
        id: 'default_demacia',
        name: '呆马西亚之力',
        avatarColor: '#fbbf24', // Gold
        stats: {
            base: { 
                ...INITIAL_STATS.base, 
                [StatType.HP]: 4000, 
                [StatType.AD]: 300, 
                [StatType.ARMOR]: 150, 
                [StatType.MR]: 150, 
                [StatType.SPEED]: 100,
                [StatType.MANA]: 1000, // Added Mana
                [StatType.MANA_REGEN]: 20 // Hack: Used as constant "20" for division
            },
            percent: { 
                ...INITIAL_STATS.percent, 
                [StatType.HP]: 50, 
                [StatType.TENACITY]: 30 
            }
        },
        appearance: { head: 'KNIGHT', body: 'PLATE', weapon: 'SWORD', themeColor: '#fbbf24' },
        skills: [
            {
                id: 'skill_d_1', name: '坚韧', isPassive: true,
                logic: [{
                    condition: { sourceTarget: 'SELF', variable: 'TURN', operator: '>', value: 0 },
                    // Formula: HP / MANA_REGEN (4000 / 20 = 200 Heal)
                    effect: { type: 'INCREASE_STAT', target: 'SELF', targetStat: StatType.CURRENT_HP, formula: { factorA: { target: 'SELF', stat: StatType.HP }, operator: '/', factorB: { target: 'SELF', stat: StatType.MANA_REGEN } }, visual: { color: '#4ade80', shape: 'CIRCLE' } }
                }]
            },
            {
                id: 'skill_d_2', name: '审判', isPassive: false,
                logic: [{
                    // Dmg: AD * 1.5
                    effect: { type: 'DAMAGE_PHYSICAL', target: 'ENEMY', formula: { factorA: { target: 'SELF', stat: StatType.AD }, operator: '*', factorB: { target: 'SELF', stat: StatType.AD } }, visual: { color: '#fbbf24', shape: 'SQUARE' } }
                }]
            },
            {
                id: 'skill_d_3', name: '德玛西亚正义', isPassive: false,
                logic: [{
                    // Dmg: Enemy Lost HP * 0.5 (Using lost hp as Factor A, need 0.5 const... Hack: Use CRIT_RATE as 50?)
                    // Let's simplified: 50% of Enemy Lost HP. 
                    // Assume user has 0 crit rate? No.
                    // Just do AD * 5 for big dmg.
                    effect: { type: 'DAMAGE_MAGIC', target: 'ENEMY', formula: { factorA: { target: 'SELF', stat: StatType.AD }, operator: '*', factorB: { target: 'SELF', stat: StatType.MANA_REGEN } }, visual: { color: '#fbbf24', shape: 'BEAM' } }
                }]
            }
        ]
    },
    {
        id: 'default_twilight',
        name: '黄昏女郎',
        avatarColor: '#a855f7', // Purple
        stats: {
            base: { 
                ...INITIAL_STATS.base, 
                [StatType.HP]: 2000, 
                [StatType.MANA]: 2000,
                [StatType.AP]: 500, 
                [StatType.SPEED]: 130
            },
            percent: { 
                ...INITIAL_STATS.percent, 
                [StatType.MAGIC_PEN_PERC]: 40,
                [StatType.AP]: 50,
                [StatType.CRIT_DMG]: 3 // Hack: Used as multiplier
            }
        },
        appearance: { head: 'HOOD', body: 'ROBE', weapon: 'STAFF', themeColor: '#a855f7' },
        skills: [
            {
                id: 'skill_t_1', name: '终极闪光', isPassive: false,
                // Laser: AP * CRIT_DMG (500 * 3 = 1500)
                logic: [{
                    effect: { type: 'DAMAGE_MAGIC', target: 'ENEMY', formula: { factorA: { target: 'SELF', stat: StatType.AP }, operator: '*', factorB: { target: 'SELF', stat: StatType.CRIT_DMG } }, visual: { color: '#a855f7', shape: 'BEAM' } }
                }]
            },
            {
                id: 'skill_t_2', name: '星飞弹', isPassive: false,
                logic: [{
                    effect: { type: 'DAMAGE_MAGIC', target: 'ENEMY', formula: { factorA: { target: 'SELF', stat: StatType.AP }, operator: '+', factorB: { target: 'SELF', stat: StatType.AP } }, visual: { color: '#e879f9', shape: 'STAR' } }
                }]
            },
             {
                id: 'skill_t_3', name: '窃法之刃', isPassive: true,
                logic: [{
                    condition: { sourceTarget: 'SELF', variable: 'MANA', operator: '<', value: 200 },
                    // Restore 200 Mana
                    effect: { type: 'INCREASE_STAT', target: 'SELF', targetStat: StatType.CURRENT_MANA, formula: { factorA: { target: 'SELF', stat: StatType.SPEED }, operator: '+', factorB: { target: 'SELF', stat: StatType.SPEED } }, visual: { color: '#60a5fa', shape: 'CIRCLE' } }
                }]
            }
        ]
    },
    {
        id: 'default_mountain',
        name: '魔山',
        avatarColor: '#475569', // Slate
        stats: {
            base: { 
                ...INITIAL_STATS.base, 
                [StatType.HP]: 8000, 
                [StatType.ARMOR]: 200,
                [StatType.MR]: 200,
                [StatType.SPEED]: 80,
                [StatType.MANA]: 2000 // Used for revive amount
            },
            percent: { 
                ...INITIAL_STATS.percent, 
                [StatType.HP]: 50 
            }
        },
        appearance: { head: 'BALD', body: 'PLATE', weapon: 'HAMMER', themeColor: '#475569' },
        skills: [
            {
                id: 'skill_m_1', name: '不灭', isPassive: true,
                // Revive: If HP <= 0, Heal MANA amount (2000)
                logic: [{
                    condition: { sourceTarget: 'SELF', variable: 'HP', operator: '<=', value: 0 },
                    effect: { type: 'INCREASE_STAT', target: 'SELF', targetStat: StatType.CURRENT_HP, formula: { factorA: { target: 'SELF', stat: StatType.MANA }, operator: '+', factorB: { target: 'SELF', stat: StatType.OMNIVAMP } }, visual: { color: '#22c55e', shape: 'CIRCLE' } }
                }]
            },
            {
                id: 'skill_m_2', name: '碎骨', isPassive: false,
                // Dmg based on HP? HP / 20. Need constant 20. Reuse Demacia hack? No, mana regen is 0 here.
                // Just use Armor * 2. 400 Dmg.
                logic: [{
                    effect: { type: 'DAMAGE_PHYSICAL', target: 'ENEMY', formula: { factorA: { target: 'SELF', stat: StatType.ARMOR }, operator: '+', factorB: { target: 'SELF', stat: StatType.ARMOR } }, visual: { color: '#94a3b8', shape: 'SQUARE' } }
                }]
            },
             {
                id: 'skill_m_3', name: '巨像', isPassive: false,
                // Increase Armor
                logic: [{
                    effect: { type: 'INCREASE_STAT', target: 'SELF', targetStat: StatType.ARMOR, formula: { factorA: { target: 'SELF', stat: StatType.SPEED }, operator: '*', factorB: { target: 'SELF', stat: StatType.OMNIVAMP /* 0 */ } }, visual: { color: '#cbd5e1', shape: 'CIRCLE' } }
                }]
            }
        ]
    }
];

export const StorageService = {
    getAll: (): CharacterConfig[] => {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            const savedHeroes: CharacterConfig[] = data ? JSON.parse(data).map(migrateCharacter) : [];
            
            const deletedDefaultsRaw = localStorage.getItem(DELETED_DEFAULTS_KEY);
            const deletedDefaults: string[] = deletedDefaultsRaw ? JSON.parse(deletedDefaultsRaw) : [];

            // Filter defaults: Exclude if deleted OR if user has a custom version (same ID) saved
            const activeDefaults = DEFAULT_HEROES.filter(def => 
                !deletedDefaults.includes(def.id) && 
                !savedHeroes.find(saved => saved.id === def.id)
            );

            return [...savedHeroes, ...activeDefaults];
        } catch (e) {
            console.error("Failed to load heroes", e);
            return [];
        }
    },

    save: (char: CharacterConfig) => {
        const all = StorageService.getAll();
        // Identify if this is a default hero being edited (it will have a default_ ID)
        // If we save it, it goes into the 'saved' list in localStorage.
        // We don't need to add it to 'deleted defaults' because the existence in 'saved' overrides default in getAll().
        
        // Re-read RAW storage to ensure we don't duplicate logic.
        const rawData = localStorage.getItem(STORAGE_KEY);
        let rawList: CharacterConfig[] = rawData ? JSON.parse(rawData) : [];
        
        const index = rawList.findIndex(c => c.id === char.id);
        if (index >= 0) {
            rawList[index] = char;
        } else {
            rawList.push(char);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rawList));
    },

    delete: (id: string) => {
        // 1. Check if it is a default hero ID
        if (id.startsWith('default_')) {
            const deletedDefaultsRaw = localStorage.getItem(DELETED_DEFAULTS_KEY);
            const deletedDefaults: string[] = deletedDefaultsRaw ? JSON.parse(deletedDefaultsRaw) : [];
            if (!deletedDefaults.includes(id)) {
                deletedDefaults.push(id);
                localStorage.setItem(DELETED_DEFAULTS_KEY, JSON.stringify(deletedDefaults));
            }
        }

        // 2. Also remove from saved list if it exists there (e.g. edited default)
        const rawData = localStorage.getItem(STORAGE_KEY);
        if (rawData) {
            const list: CharacterConfig[] = JSON.parse(rawData);
            const newList = list.filter(c => c.id !== id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
        }
    },

    get: (id: string): CharacterConfig | undefined => {
        return StorageService.getAll().find(c => c.id === id);
    },

    saveLastUsed: (id: string) => {
        localStorage.setItem(LAST_HERO_KEY, id);
    },

    getLastUsed: (): string | null => {
        return localStorage.getItem(LAST_HERO_KEY);
    }
};
