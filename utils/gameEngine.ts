import { BattleEntity, Effect, Formula, Skill, StatType } from '../types';

export const getTotalStat = (entity: BattleEntity, stat: StatType): number => {
    const base = entity.config.stats.base[stat] || 0;
    const perc = entity.config.stats.percent[stat] || 0;
    return Math.max(0, base * (1 + perc / 100));
};

export const evaluateFormula = (formula: Formula, self: BattleEntity, enemy: BattleEntity): number => {
    const getVal = (target: 'SELF' | 'ENEMY', stat: StatType) => {
        const entity = target === 'SELF' ? self : enemy;
        return getTotalStat(entity, stat);
    };

    const valA = getVal(formula.factorA.target, formula.factorA.stat);
    const valB = getVal(formula.factorB.target, formula.factorB.stat);

    switch (formula.operator) {
        case '+': return valA + valB;
        case '-': return valA - valB;
        case '*': return valA * valB;
        case '/': return valB === 0 ? 0 : valA / valB;
        default: return 0;
    }
};

export const calculateManaCost = (skill: Skill): number => {
    let totalCost = 0;

    skill.effects.forEach(effect => {
        let effectCost = 0;
        
        // Weight Mapping
        const getWeight = (stat: StatType) => {
            switch (stat) {
                case StatType.HP: 
                case StatType.MANA: return 20; // High numbers
                case StatType.AD:
                case StatType.AP: 
                case StatType.ARMOR:
                case StatType.MR: return 10; // Medium numbers
                default: return 2; // Percentages / Low numbers
            }
        };

        const wA = getWeight(effect.formula.factorA.stat);
        const wB = getWeight(effect.formula.factorB.stat);

        // Operator Multiplier
        if (effect.formula.operator === '*' || effect.formula.operator === '/') {
            effectCost = (wA * wB) * 2; 
        } else {
            effectCost = (wA + wB) * 1.5;
        }

        // Effect Type Multiplier
        if (effect.type === 'HEAL') effectCost *= 1.5;
        if (effect.type === 'DAMAGE_MAGIC') effectCost *= 1.2;

        totalCost += effectCost;
    });

    skill.conditions.forEach(cond => {
        totalCost += Math.ceil(cond.value / 100); 
    });

    return Math.max(5, Math.floor(totalCost));
};

export const processBasicAttack = (caster: BattleEntity, target: BattleEntity, logPush: (msg: string) => void): void => {
    const damageRaw = getTotalStat(caster, StatType.AD);
    
    const armor = getTotalStat(target, StatType.ARMOR);
    const penFlat = getTotalStat(caster, StatType.ARMOR_PEN_FLAT);
    const penPerc = getTotalStat(caster, StatType.ARMOR_PEN_PERC);
    
    const effectiveArmor = (armor * (1 - penPerc / 100)) - penFlat;
    const mitigation = effectiveArmor > 0 ? (100 / (100 + effectiveArmor)) : 1; 
    
    // Crit logic
    const critRate = getTotalStat(caster, StatType.CRIT_RATE);
    const isCrit = Math.random() * 100 < critRate;
    const critMult = isCrit ? (getTotalStat(caster, StatType.CRIT_DMG) / 100) : 1;

    let damage = damageRaw * mitigation * critMult;
    
    // Lifesteal
    const lifesteal = getTotalStat(caster, StatType.LIFESTEAL) + getTotalStat(caster, StatType.OMNIVAMP);
    if (lifesteal > 0) {
        caster.currentHp += damage * (lifesteal / 100);
    }

    target.currentHp -= damage;
    logPush(`${caster.config.name} 对 ${target.config.name} 造成了 ${Math.floor(damage)} 点物理伤害 (普通攻击)${isCrit ? ' (暴击!)' : ''}`);
    
    const maxHp = getTotalStat(caster, StatType.HP);
    caster.currentHp = Math.min(caster.currentHp, maxHp);
    const maxEnemyHp = getTotalStat(target, StatType.HP);
    target.currentHp = Math.min(target.currentHp, maxEnemyHp);
};

// Returns TRUE if skill was successfully cast
export const processSkill = (skill: Skill, caster: BattleEntity, target: BattleEntity, logPush: (msg: string) => void): boolean => {
    const manaCost = calculateManaCost(skill);
    
    if (caster.currentMana < manaCost) {
        logPush(`${caster.config.name} 尝试使用 ${skill.name} 但法力不足!`);
        return false;
    }

    logPush(`${caster.config.name} 使用了 ${skill.name}!`);
    caster.currentMana = Math.max(0, caster.currentMana - manaCost);

    skill.effects.forEach(effect => {
        const effectTarget = effect.target === 'SELF' ? caster : target;
        
        const rawValue = evaluateFormula(effect.formula, caster, target);
        const finalValue = Math.max(0, rawValue); 

        if (effect.type === 'DAMAGE_PHYSICAL') {
            const armor = getTotalStat(effectTarget, StatType.ARMOR);
            const penFlat = getTotalStat(caster, StatType.ARMOR_PEN_FLAT);
            const penPerc = getTotalStat(caster, StatType.ARMOR_PEN_PERC);
            
            const effectiveArmor = (armor * (1 - penPerc / 100)) - penFlat;
            const mitigation = effectiveArmor > 0 ? (100 / (100 + effectiveArmor)) : 1; 
            
            const critRate = getTotalStat(caster, StatType.CRIT_RATE);
            const isCrit = Math.random() * 100 < critRate;
            const critMult = isCrit ? (getTotalStat(caster, StatType.CRIT_DMG) / 100) : 1;

            let damage = finalValue * mitigation * critMult;
            
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
            
            let damage = finalValue * mitigation;

            const omnivamp = getTotalStat(caster, StatType.OMNIVAMP);
            if (omnivamp > 0) {
                caster.currentHp += damage * (omnivamp / 100);
            }

            effectTarget.currentHp -= damage;
            logPush(`对 ${effectTarget.config.name} 造成了 ${Math.floor(damage)} 点魔法伤害`);
        } else if (effect.type === 'HEAL') {
            effectTarget.currentHp += finalValue;
            logPush(`${effectTarget.config.name} 回复了 ${Math.floor(finalValue)} 点生命`);
        } else if (effect.type === 'GAIN_MANA') {
            effectTarget.currentMana += finalValue;
            logPush(`${effectTarget.config.name} 回复了 ${Math.floor(finalValue)} 点法力`);
        }
    });

    const maxHp = getTotalStat(caster, StatType.HP);
    caster.currentHp = Math.min(caster.currentHp, maxHp);
    const maxEnemyHp = getTotalStat(target, StatType.HP);
    target.currentHp = Math.min(target.currentHp, maxEnemyHp);
    
    return true;
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