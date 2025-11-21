import { BattleEntity, Skill, StatType } from '../types';

export const getTotalStat = (entity: BattleEntity, stat: StatType): number => {
    const base = entity.config.stats.base[stat] || 0;
    const perc = entity.config.stats.percent[stat] || 0;
    return Math.max(0, base * (1 + perc / 100));
};

export const evaluateFormula = (formula: string, self: BattleEntity, enemy: BattleEntity): number => {
    // SECURITY: This is a basic parser. In production, use a math library like mathjs.
    let parsed = formula.toUpperCase();
    
    const replaceStats = (entity: BattleEntity, prefix: string) => {
        Object.values(StatType).forEach(stat => {
            // Basic stat retrieval logic (base * (1 + percent/100))
            const total = getTotalStat(entity, stat);
            
            // Replace full Chinese name, e.g. SELF.生命值
            parsed = parsed.split(`${prefix}.${stat}`).join(total.toString());
        });
        
        // Map common English shorthands to the correct StatType
        const map: Record<string, StatType> = {
            'AD': StatType.AD,
            'AP': StatType.AP,
            'HP': StatType.HP,
            'DEF': StatType.ARMOR,
            'MR': StatType.MR,
            'MANA': StatType.MANA,
            'SPD': StatType.SPEED,
            'CRIT': StatType.CRIT_RATE
        };
        
        // Replace mapped shorthands
        Object.entries(map).forEach(([short, full]) => {
                const val = getTotalStat(entity, full);
                parsed = parsed.split(`${prefix}.${short}`).join(val.toString());
        });
        
        // Fallback for explicit matching if needed
        parsed = parsed.split(`${prefix}.CURRENT_HP`).join(entity.currentHp.toString());
        parsed = parsed.split(`${prefix}.CURRENT_MANA`).join(entity.currentMana.toString());
    };

    replaceStats(self, 'SELF');
    replaceStats(enemy, 'ENEMY');

    try {
        // Sanitize: only allow numbers, operators, and parens
        const sanitized = parsed.replace(/[^0-9+\-*/().]/g, '');
        // eslint-disable-next-line no-new-func
        return new Function(`return ${sanitized}`)();
    } catch (e) {
        console.error("Formula evaluation error", e);
        return 0;
    }
};

export const processSkill = (skill: Skill, caster: BattleEntity, target: BattleEntity, logPush: (msg: string) => void): void => {
    logPush(`${caster.config.name} 使用了 ${skill.name}!`);

    // Deduct Mana
    const totalManaCost = skill.effects.reduce((sum, eff) => sum + eff.manaCost, 0);
    caster.currentMana = Math.max(0, caster.currentMana - totalManaCost);

    skill.effects.forEach(effect => {
        const effectTarget = effect.target === 'SELF' ? caster : target;
        
        const rawValue = evaluateFormula(effect.valueFormula, caster, target);

        if (effect.type === 'DAMAGE_PHYSICAL') {
            const armor = getTotalStat(effectTarget, StatType.ARMOR);
            const penFlat = getTotalStat(caster, StatType.ARMOR_PEN_FLAT);
            const penPerc = getTotalStat(caster, StatType.ARMOR_PEN_PERC);
            
            const effectiveArmor = (armor * (1 - penPerc / 100)) - penFlat;
            const mitigation = effectiveArmor > 0 ? (100 / (100 + effectiveArmor)) : 1; 
            
            // Crit logic
            const critRate = getTotalStat(caster, StatType.CRIT_RATE);
            const isCrit = Math.random() * 100 < critRate;
            const critMult = isCrit ? (getTotalStat(caster, StatType.CRIT_DMG) / 100) : 1;

            let damage = rawValue * mitigation * critMult;
            
            // Lifesteal
            const lifesteal = getTotalStat(caster, StatType.LIFESTEAL) + getTotalStat(caster, StatType.OMNIVAMP);
            if (lifesteal > 0) {
                caster.currentHp += damage * (lifesteal / 100);
            }

            effectTarget.currentHp -= damage;
            logPush(`对 ${effectTarget.config.name} 造成了 ${Math.floor(damage)} 点物理伤害 ${isCrit ? '(暴击!)' : ''}`);
        } else if (effect.type === 'DAMAGE_MAGIC') {
             const mr = getTotalStat(effectTarget, StatType.MR);
            const penFlat = getTotalStat(caster, StatType.MAGIC_PEN_FLAT);
            const penPerc = getTotalStat(caster, StatType.MAGIC_PEN_PERC);
            
            const effectiveMr = (mr * (1 - penPerc / 100)) - penFlat;
            const mitigation = effectiveMr > 0 ? (100 / (100 + effectiveMr)) : 1; 
            
            let damage = rawValue * mitigation;

            // Omnivamp only for spells usually, unless specified
            const omnivamp = getTotalStat(caster, StatType.OMNIVAMP);
            if (omnivamp > 0) {
                caster.currentHp += damage * (omnivamp / 100);
            }

            effectTarget.currentHp -= damage;
            logPush(`对 ${effectTarget.config.name} 造成了 ${Math.floor(damage)} 点魔法伤害`);
        } else if (effect.type === 'HEAL') {
            effectTarget.currentHp += rawValue;
            logPush(`${effectTarget.config.name} 回复了 ${Math.floor(rawValue)} 点生命`);
        }
    });

    // Cap HP
    const maxHp = getTotalStat(caster, StatType.HP);
    caster.currentHp = Math.min(caster.currentHp, maxHp);
    const maxEnemyHp = getTotalStat(target, StatType.HP);
    target.currentHp = Math.min(target.currentHp, maxEnemyHp);
};

export const checkConditions = (skill: Skill, self: BattleEntity, enemy: BattleEntity, turn: number): boolean => {
    return skill.conditions.every(cond => {
        const entity = cond.sourceTarget === 'SELF' ? self : enemy;
        let val = 0;
        const maxHp = getTotalStat(entity, StatType.HP);
        const maxMana = getTotalStat(entity, StatType.MANA);

        switch (cond.variable) {
            case 'HP': val = entity.currentHp; break;
            case 'HP%': val = (entity.currentHp / (maxHp || 1)) * 100; break;
            case 'MANA': val = entity.currentMana; break;
            case 'MANA%': val = (entity.currentMana / (maxMana || 1)) * 100; break;
            case 'TURN': val = turn; break;
            default: val = 0;
        }

        switch (cond.operator) {
            case '>': return val > cond.value;
            case '<': return val < cond.value;
            case '==': return val === cond.value;
            case '>=': return val >= cond.value;
            case '<=': return val <= cond.value;
            case '!=': return val !== cond.value;
            default: return false;
        }
    });
};
