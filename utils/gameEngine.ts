
import { BattleEntity, Effect, Formula, Skill, StatType, CharacterStats, ONLY_PERCENT_STATS, BattleEvent } from '../types';

export const getTotalStat = (entity: BattleEntity, stat: StatType): number => {
    // Dynamic Stats Calculation
    if (stat === StatType.CURRENT_HP) {
        return entity.currentHp;
    }
    if (stat === StatType.CURRENT_HP_PERC) {
        const max = getTotalStat(entity, StatType.HP);
        return max > 0 ? (entity.currentHp / max) * 100 : 0;
    }
    if (stat === StatType.HP_LOST) {
        const max = getTotalStat(entity, StatType.HP);
        return Math.max(0, max - entity.currentHp);
    }
    if (stat === StatType.HP_LOST_PERC) {
        const max = getTotalStat(entity, StatType.HP);
        return max > 0 ? (Math.max(0, max - entity.currentHp) / max) * 100 : 0;
    }

    // For pure percent stats (like Crit Rate), return the raw value stored in 'percent'.
    // e.g. if User put 50 for Crit Rate, return 50.
    if (ONLY_PERCENT_STATS.includes(stat)) {
        return entity.config.stats.percent[stat] || 0;
    }

    const base = entity.config.stats.base[stat] || 0;
    const perc = entity.config.stats.percent[stat] || 0;
    // Standard stat calculation: Base * (1 + Percent/100)
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

/**
 * Checks if a skill uses dynamic runtime stats (Current HP, Mana, Turn, etc.)
 */
export const hasDynamicStats = (skill: Skill): boolean => {
    const dynamicVars: StatType[] = [StatType.CURRENT_HP, StatType.CURRENT_HP_PERC, StatType.HP_LOST, StatType.HP_LOST_PERC, StatType.MANA];
    
    // Check conditions
    const condHas = skill.conditions.some(c => ['HP', 'HP%', 'HP_LOST', 'HP_LOST%', 'MANA', 'MANA%'].includes(c.variable));
    
    // Check formulas
    const effectHas = skill.effects.some(e => 
         dynamicVars.includes(e.formula.factorA.stat) || 
         dynamicVars.includes(e.formula.factorB.stat)
    );
    
    return condHas || effectHas;
};

/**
 * Simulation-based Mana Calculation.
 * If entity is provided, it uses the entity's current state for calculation.
 * If not (e.g. in Editor), it uses a dummy entity with 0 current HP/Mana to calculate the 'Base' cost.
 */
export const calculateManaCost = (skill: Skill, stats: CharacterStats, entity?: BattleEntity): number => {
    if (skill.effects.length === 0) return 0;

    const dummyEntity: BattleEntity = entity || {
        id: 'sim',
        config: { stats: stats } as any,
        currentHp: 0, 
        currentMana: 0,
        buffs: []
    };

    let totalEstimatedValue = 0;

    skill.effects.forEach(effect => {
        let val = evaluateFormula(effect.formula, dummyEntity, dummyEntity);
        val = Math.abs(val);

        if (effect.type === 'HEAL' || effect.type === 'GAIN_MANA') {
            val *= 1.5; 
        }
        
        totalEstimatedValue += val;
    });

    let cost = 10 + (totalEstimatedValue / 20);

    if (skill.isPassive) {
        cost *= 1.3;
    }

    return Math.floor(Math.max(1, cost));
};

export const processBasicAttack = (caster: BattleEntity, target: BattleEntity, pushEvent: (evt: BattleEvent) => void): void => {
    // Animation: Move to target
    pushEvent({
        type: 'ATTACK_MOVE',
        sourceId: caster.id,
        targetId: target.id,
        skillName: '普通攻击'
    });

    const damageRaw = getTotalStat(caster, StatType.AD);
    
    const armor = getTotalStat(target, StatType.ARMOR);
    const penFlat = getTotalStat(caster, StatType.ARMOR_PEN_FLAT);
    const penPerc = getTotalStat(caster, StatType.ARMOR_PEN_PERC);
    
    const effectiveArmor = Math.max(0, (armor * (1 - penPerc / 100)) - penFlat);
    const mitigation = effectiveArmor > 0 ? (100 / (100 + effectiveArmor)) : 1; 
    
    const critRate = getTotalStat(caster, StatType.CRIT_RATE);
    const isCrit = Math.random() * 100 < critRate;
    const baseCritDmg = 150; 
    const extraCritDmg = getTotalStat(caster, StatType.CRIT_DMG); 
    const critMult = isCrit ? ((baseCritDmg + extraCritDmg) / 100) : 1;

    let damage = Math.max(1, damageRaw * mitigation * critMult);
    damage = Math.floor(damage);
    
    // Lifesteal
    const lifesteal = getTotalStat(caster, StatType.LIFESTEAL) + getTotalStat(caster, StatType.OMNIVAMP);
    if (lifesteal > 0) {
        const healAmt = Math.floor(damage * (lifesteal / 100));
        caster.currentHp += healAmt;
        if (healAmt > 0) {
            pushEvent({ type: 'HEAL', targetId: caster.id, value: healAmt, color: '#4ade80' });
        }
    }

    target.currentHp -= damage;
    
    pushEvent({
        type: 'DAMAGE',
        targetId: target.id,
        value: damage,
        text: isCrit ? '暴击!' : '',
        color: isCrit ? '#fca5a5' : '#ef4444'
    });
    pushEvent({
        type: 'TEXT',
        text: `${caster.config.name} 对 ${target.config.name} 造成 ${damage} 点物理伤害`
    });
    
    // Removed Cap for basic attack lifesteal as well to be consistent
    // caster.currentHp = Math.min(caster.currentHp, maxHp);
};

// Returns TRUE if skill was cast (mana consumed)
export const processSkill = (skill: Skill, caster: BattleEntity, target: BattleEntity, pushEvent: (evt: BattleEvent) => void): boolean => {
    // Calculate cost based on CURRENT runtime stats
    const manaCost = calculateManaCost(skill, caster.config.stats, caster);
    
    if (caster.currentMana < manaCost) {
        if (!skill.isPassive) {
            pushEvent({ type: 'TEXT', text: `${caster.config.name} 法力不足!` });
        }
        return false;
    }

    caster.currentMana = Math.max(0, caster.currentMana - manaCost);
    if (!skill.isPassive) {
        pushEvent({ 
            type: 'SKILL_EFFECT', 
            sourceId: caster.id, 
            skillName: skill.name,
            text: `${caster.config.name} 释放了 ${skill.name}`
        });
        pushEvent({ type: 'MANA', targetId: caster.id, value: -manaCost });
    }

    skill.effects.forEach(effect => {
        const effectTarget = effect.target === 'SELF' ? caster : target;
        
        const rawValue = evaluateFormula(effect.formula, caster, target);
        const finalValue = Math.max(0, rawValue); 

        if (effect.type === 'DAMAGE_PHYSICAL') {
            const armor = getTotalStat(effectTarget, StatType.ARMOR);
            const penFlat = getTotalStat(caster, StatType.ARMOR_PEN_FLAT);
            const penPerc = getTotalStat(caster, StatType.ARMOR_PEN_PERC);
            const effectiveArmor = Math.max(0, (armor * (1 - penPerc / 100)) - penFlat);
            const mitigation = effectiveArmor > 0 ? (100 / (100 + effectiveArmor)) : 1; 
            
            const critRate = getTotalStat(caster, StatType.CRIT_RATE);
            const isCrit = Math.random() * 100 < critRate;
            const baseCritDmg = 150; 
            const extraCritDmg = getTotalStat(caster, StatType.CRIT_DMG);
            const critMult = isCrit ? ((baseCritDmg + extraCritDmg) / 100) : 1;

            let damage = Math.floor(Math.max(1, finalValue * mitigation * critMult));
            
            const lifesteal = getTotalStat(caster, StatType.LIFESTEAL) + getTotalStat(caster, StatType.OMNIVAMP);
            if (lifesteal > 0) {
                const heal = Math.floor(damage * (lifesteal / 100));
                caster.currentHp += heal;
                if (heal > 0) pushEvent({ type: 'HEAL', targetId: caster.id, value: heal });
            }

            effectTarget.currentHp -= damage;
            pushEvent({
                type: 'DAMAGE',
                targetId: effectTarget.id,
                value: damage,
                text: isCrit ? '暴击!' : '',
                color: isCrit ? '#fca5a5' : '#ef4444'
            });

        } else if (effect.type === 'DAMAGE_MAGIC') {
            const mr = getTotalStat(effectTarget, StatType.MR);
            const penFlat = getTotalStat(caster, StatType.MAGIC_PEN_FLAT);
            const penPerc = getTotalStat(caster, StatType.MAGIC_PEN_PERC);
            const effectiveMr = Math.max(0, (mr * (1 - penPerc / 100)) - penFlat);
            const mitigation = effectiveMr > 0 ? (100 / (100 + effectiveMr)) : 1; 
            
            let damage = Math.floor(Math.max(1, finalValue * mitigation));

            const omnivamp = getTotalStat(caster, StatType.OMNIVAMP);
            if (omnivamp > 0) {
                const heal = Math.floor(damage * (omnivamp / 100));
                caster.currentHp += heal;
                if (heal > 0) pushEvent({ type: 'HEAL', targetId: caster.id, value: heal });
            }

            effectTarget.currentHp -= damage;
            pushEvent({
                type: 'DAMAGE',
                targetId: effectTarget.id,
                value: damage,
                color: '#c084fc' // purple
            });

        } else if (effect.type === 'HEAL') {
            const val = Math.floor(finalValue);
            effectTarget.currentHp += val;
            pushEvent({ type: 'HEAL', targetId: effectTarget.id, value: val });

        } else if (effect.type === 'GAIN_MANA') {
            const val = Math.floor(finalValue);
            effectTarget.currentMana += val;
            pushEvent({ type: 'MANA', targetId: effectTarget.id, value: val, color: '#60a5fa' });
        }
    });

    // Uncapped Stats - We no longer clamp to Max HP/Mana after skill execution
    // Allowing for overheal / overmana mechanics
    
    return true;
};

export const checkConditions = (skill: Skill, self: BattleEntity, enemy: BattleEntity, turn: number): boolean => {
    if (!skill.isPassive) return false;
    if (skill.conditions.length === 0) return true; 

    return skill.conditions.every(cond => {
        const entity = cond.sourceTarget === 'SELF' ? self : enemy;
        let val = 0;
        const maxHp = getTotalStat(entity, StatType.HP);
        const maxMana = getTotalStat(entity, StatType.MANA);

        switch (cond.variable) {
            case 'HP': val = entity.currentHp; break;
            case 'HP%': val = (entity.currentHp / (maxHp || 1)) * 100; break;
            case 'HP_LOST': val = Math.max(0, maxHp - entity.currentHp); break;
            case 'HP_LOST%': val = (Math.max(0, maxHp - entity.currentHp) / (maxHp || 1)) * 100; break;
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
