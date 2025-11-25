

import { CharacterConfig, Skill, Effect } from "../types";

const STORAGE_KEY = 'cw_heroes_v1';

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

export const StorageService = {
    getAll: (): CharacterConfig[] => {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (!data) return [];
            
            const list: CharacterConfig[] = JSON.parse(data);
            // Apply migration on load
            return list.map(migrateCharacter);
        } catch (e) {
            console.error("Failed to load heroes", e);
            return [];
        }
    },

    save: (char: CharacterConfig) => {
        const list = StorageService.getAll();
        const index = list.findIndex(c => c.id === char.id);
        if (index >= 0) {
            list[index] = char;
        } else {
            list.push(char);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    },

    delete: (id: string) => {
        const list = StorageService.getAll().filter(c => c.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    },

    get: (id: string): CharacterConfig | undefined => {
        return StorageService.getAll().find(c => c.id === id);
    }
};