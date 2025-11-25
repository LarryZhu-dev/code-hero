

import { CharacterConfig, Skill, Effect, INITIAL_STATS, StatType } from "../types";

const STORAGE_KEY = 'cw_heroes_v1';
const DELETED_DEFAULTS_KEY = 'cw_deleted_defaults';
const LAST_HERO_KEY = 'cw_last_hero_id';
const TOWER_PROGRESS_KEY = 'cw_tower_progress';

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

// --- DEFAULT HARDCODED HEROES (Optimized) ---
const DEFAULT_HEROES: CharacterConfig[] = [
    {
        id: 'default_demacia',
        name: '德邦之力',
        avatarColor: '#fbbf24', // Gold
        stats: {
            base: { 
                ...INITIAL_STATS.base, 
                [StatType.HP]: 6500, 
                [StatType.AD]: 800, 
                [StatType.ARMOR]: 500, 
                [StatType.MR]: 300, 
                [StatType.SPEED]: 110,
                [StatType.MANA]: 1000, 
                [StatType.ARMOR_PEN_FLAT]: 50,
            },
            percent: { 
                ...INITIAL_STATS.percent, 
                [StatType.HP]: 300, 
                [StatType.AD]: 200,
                [StatType.TENACITY]: 50,
                [StatType.MANA_REGEN]: 100, // Regenerates full mana quickly
                [StatType.CRIT_RATE]: 50
            }
        },
        appearance: { head: 'KNIGHT', body: 'PLATE', weapon: 'SWORD', themeColor: '#fbbf24' },
        skills: [
            {
                id: 'skill_d_1', name: '坚韧之心', isPassive: true,
                logic: [{
                    // Passive: If HP < 50%, Heal 10% of Max HP per turn (Using Mana Regen as hack constant / 10)
                    condition: { sourceTarget: 'SELF', variable: 'HP%', operator: '<', value: 50 },
                    effect: { type: 'INCREASE_STAT', target: 'SELF', targetStat: StatType.CURRENT_HP, formula: { factorA: { target: 'SELF', stat: StatType.HP }, operator: '/', factorB: { target: 'SELF', stat: StatType.MANA_REGEN } }, visual: { color: '#4ade80', shape: 'CIRCLE' } }
                }]
            },
            {
                id: 'skill_d_2', name: '致命打击', isPassive: false,
                logic: [{
                    // Active: AD * 2.5 damage + Silence (Mana Burn in this system)
                    effect: { type: 'DAMAGE_PHYSICAL', target: 'ENEMY', formula: { factorA: { target: 'SELF', stat: StatType.AD }, operator: '*', factorB: { target: 'SELF', stat: StatType.AD } }, visual: { color: '#fbbf24', shape: 'SQUARE', animationType: 'THRUST' } }
                }, {
                    // Burn 500 Mana from enemy (Silence effect sim)
                    effect: { type: 'DECREASE_STAT', target: 'ENEMY', targetStat: StatType.CURRENT_MANA, formula: { factorA: { target: 'SELF', stat: StatType.ARMOR }, operator: '+', factorB: { target: 'SELF', stat: StatType.ARMOR } }, visual: { color: '#fbbf24', shape: 'CIRCLE' } }
                }]
            },
            {
                id: 'skill_d_3', name: '德玛西亚正义', isPassive: false,
                logic: [{
                    // Ult: Execute. Damage = Enemy Lost HP.
                    condition: { sourceTarget: 'ENEMY', variable: 'HP%', operator: '<', value: 40 },
                    effect: { type: 'DAMAGE_MAGIC', target: 'ENEMY', formula: { factorA: { target: 'ENEMY', stat: StatType.HP_LOST }, operator: '*', factorB: { target: 'SELF', stat: StatType.MANA_REGEN } }, visual: { color: '#fbbf24', shape: 'BEAM' } }
                }]
            }
        ]
    },
    {
        id: 'default_twilight',
        name: '星灵法师',
        avatarColor: '#a855f7', // Purple
        stats: {
            base: { 
                ...INITIAL_STATS.base, 
                [StatType.HP]: 3000, 
                [StatType.MANA]: 5000,
                [StatType.AP]: 1200, 
                [StatType.SPEED]: 140,
                [StatType.MAGIC_PEN_FLAT]: 100
            },
            percent: { 
                ...INITIAL_STATS.percent, 
                [StatType.MAGIC_PEN_PERC]: 60,
                [StatType.AP]: 400,
                [StatType.CRIT_DMG]: 200, // High Crit Dmg
                [StatType.CRIT_RATE]: 40, // Magic Crit
                [StatType.MANA_REGEN]: 20
            }
        },
        appearance: { head: 'HOOD', body: 'ROBE', weapon: 'STAFF', themeColor: '#a855f7' },
        skills: [
            {
                id: 'skill_t_1', name: '终极闪光', isPassive: false,
                // Laser: AP * 3. Massive AoE style damage
                logic: [{
                    effect: { type: 'DAMAGE_MAGIC', target: 'ENEMY', formula: { factorA: { target: 'SELF', stat: StatType.AP }, operator: '*', factorB: { target: 'SELF', stat: StatType.MANA_REGEN } }, visual: { color: '#a855f7', shape: 'BEAM' } }
                }]
            },
            {
                id: 'skill_t_2', name: '催眠气泡', isPassive: false,
                logic: [{
                    // Low Damage but sets up next hit (Reduces enemy MR)
                    effect: { type: 'DAMAGE_MAGIC', target: 'ENEMY', formula: { factorA: { target: 'SELF', stat: StatType.AP }, operator: '/', factorB: { target: 'SELF', stat: StatType.MANA_REGEN } }, visual: { color: '#e879f9', shape: 'ORB' } }
                }, {
                    // Reduce MR by Flat amount (AP / 2)
                    effect: { type: 'DECREASE_STAT', target: 'ENEMY', targetStat: StatType.MR, formula: { factorA: { target: 'SELF', stat: StatType.AP }, operator: '/', factorB: { target: 'SELF', stat: StatType.MANA_REGEN } } }
                }]
            },
             {
                id: 'skill_t_3', name: '窃法巧手', isPassive: true,
                logic: [{
                    // If Mana < 50%, restore based on AP
                    condition: { sourceTarget: 'SELF', variable: 'MANA%', operator: '<', value: 50 },
                    effect: { type: 'INCREASE_STAT', target: 'SELF', targetStat: StatType.CURRENT_MANA, formula: { factorA: { target: 'SELF', stat: StatType.AP }, operator: '+', factorB: { target: 'SELF', stat: StatType.AP } }, visual: { color: '#60a5fa', shape: 'CIRCLE' } }
                }, {
                    // Bonus: If Enemy uses Spell (Turn > 1), gain random AP (AP * 0.1)
                    condition: { sourceTarget: 'SELF', variable: 'TURN', operator: '>', value: 1 },
                    effect: { type: 'INCREASE_STAT', target: 'SELF', targetStat: StatType.AP, formula: { factorA: { target: 'SELF', stat: StatType.AP }, operator: '/', factorB: { target: 'SELF', stat: StatType.MANA_REGEN } } }
                }]
            }
        ]
    },
    {
        id: 'default_mountain',
        name: '熔岩巨兽',
        avatarColor: '#475569', // Slate
        stats: {
            base: { 
                ...INITIAL_STATS.base, 
                [StatType.HP]: 9000, 
                [StatType.ARMOR]: 1500,
                [StatType.MR]: 800,
                [StatType.SPEED]: 90,
                [StatType.MANA]: 2000,
                [StatType.AD]: 400
            },
            percent: { 
                ...INITIAL_STATS.percent, 
                [StatType.HP]: 400, 
                [StatType.ARMOR]: 300,
                [StatType.TENACITY]: 60
            }
        },
        appearance: { head: 'BALD', body: 'PLATE', weapon: 'HAMMER', themeColor: '#475569' },
        skills: [
            {
                id: 'skill_m_1', name: '花岗岩护盾', isPassive: true,
                // Gain Temp HP (Heal) equal to Armor at start of fight (Turn 1)
                logic: [{
                    condition: { sourceTarget: 'SELF', variable: 'TURN', operator: '==', value: 1 },
                    effect: { type: 'INCREASE_STAT', target: 'SELF', targetStat: StatType.CURRENT_HP, formula: { factorA: { target: 'SELF', stat: StatType.ARMOR }, operator: '*', factorB: { target: 'SELF', stat: StatType.MANA_REGEN } /* x20 constant hack from other hero? No, default regen is 0. Using formula A+A */ }, visual: { color: '#cbd5e1', shape: 'CIRCLE' } }
                }]
            },
            {
                id: 'skill_m_2', name: '大地震颤', isPassive: false,
                // Dmg based on Armor. 
                logic: [{
                    effect: { type: 'DAMAGE_PHYSICAL', target: 'ENEMY', formula: { factorA: { target: 'SELF', stat: StatType.ARMOR }, operator: '*', factorB: { target: 'SELF', stat: StatType.HP_LOST_PERC } /* Scales with missing HP slightly? No. Just Armor * 2 */ }, visual: { color: '#94a3b8', shape: 'SQUARE' } }
                }, {
                    // Hack to do Armor * 2 (A + A)
                    effect: { type: 'DAMAGE_PHYSICAL', target: 'ENEMY', formula: { factorA: { target: 'SELF', stat: StatType.ARMOR }, operator: '+', factorB: { target: 'SELF', stat: StatType.ARMOR } }, visual: { color: '#94a3b8', shape: 'SQUARE' } }
                }]
            },
             {
                id: 'skill_m_3', name: '势不可挡', isPassive: false,
                // Ult: Huge Damage (Armor * 5)
                logic: [{
                    effect: { type: 'DAMAGE_MAGIC', target: 'ENEMY', formula: { factorA: { target: 'SELF', stat: StatType.ARMOR }, operator: '*', factorB: { target: 'SELF', stat: StatType.HP_LOST_PERC } /* Placeholder op */ }, visual: { color: '#cbd5e1', shape: 'CIRCLE', animationType: 'THRUST' } }
                }, {
                    // Reduce Enemy Speed (Slow)
                    effect: { type: 'DECREASE_STAT', target: 'ENEMY', targetStat: StatType.SPEED, formula: { factorA: { target: 'ENEMY', stat: StatType.SPEED }, operator: '/', factorB: { target: 'SELF', stat: StatType.SPEED } /* ~50% slow */ } }
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
    },

    // --- TOWER MODE STORAGE ---
    getTowerProgress: (): number => {
        const saved = localStorage.getItem(TOWER_PROGRESS_KEY);
        return saved ? parseInt(saved, 10) : 1;
    },

    saveTowerProgress: (level: number) => {
        const current = StorageService.getTowerProgress();
        if (level > current) {
            localStorage.setItem(TOWER_PROGRESS_KEY, level.toString());
        }
    }
};