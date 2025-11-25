

import { BattleEntity, Effect, Formula, Skill, StatType, CharacterStats, ONLY_PERCENT_STATS, BattleEvent, Condition } from '../types';

export const getTotalStat = (entity: BattleEntity, stat: StatType): number => {
    // Dynamic Stats Calculation
    if (stat === StatType.CURRENT_HP) {
        return entity.currentHp;
    }
    if (stat === StatType.CURRENT_MANA) {
        return entity.currentMana;
    }
    // Return runtime Max HP/Mana if available
    if (stat === StatType.HP && entity.maxHp !== undefined) {
        return entity.maxHp;
    }
    if (stat === StatType.MANA && entity.maxMana !== undefined) {
        return entity.maxMana;
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
    const dynamicVars: StatType[] = [StatType.CURRENT_HP, StatType.CURRENT_HP_PERC, StatType.HP_LOST, StatType.HP_LOST_PERC, StatType.MANA, StatType.CURRENT_MANA];
    
    // Check all branches
    return skill.logic.some(branch => {
        // Check condition
        const condHas = branch.condition ? ['HP', 'HP%', 'HP_LOST', 'HP_LOST%', 'MANA', 'MANA%'].includes(branch.condition.variable) : false;
        
        // Check effect
        const effectHas = 
             dynamicVars.includes(branch.effect.formula.factorA.stat) || 
             dynamicVars.includes(branch.effect.formula.factorB.stat);
             
        return condHas || effectHas;
    });
};

/**
 * Simulation-based Mana Calculation.
 * Sums up the potential cost/value of ALL logic blocks.
 */
export const calculateManaCost = (skill: Skill, stats: CharacterStats, entity?: BattleEntity): number => {
    if (skill.logic.length === 0) return 0;

    const dummyEntity: BattleEntity = entity || {
        id: 'sim',
        config: { stats: stats } as any,
        currentHp: 0, 
        currentMana: 0,
        maxHp: 0,
        maxMana: 0,
        buffs: []
    };

    // If not provided a live entity, init max stats from config
    if (!entity) {
        dummyEntity.maxHp = Math.max(0, (stats.base[StatType.HP] || 0) * (1 + (stats.percent[StatType.HP] || 0) / 100));
        dummyEntity.maxMana = Math.max(0, (stats.base[StatType.MANA] || 0) * (1 + (stats.percent[StatType.MANA] || 0) / 100));
    }

    let totalEstimatedValue = 0;

    skill.logic.forEach(branch => {
        const effect = branch.effect;
        let val = evaluateFormula(effect.formula, dummyEntity, dummyEntity);
        val = Math.abs(val);

        if (effect.type === 'INCREASE_STAT') {
             if (effect.targetStat === StatType.CURRENT_HP || effect.targetStat === StatType.CURRENT_MANA) {
                 val *= 1.5;
             }
        }
        
        // Cost reducer if condition is present (conditional power is cheaper than reliable power)
        if (branch.condition) {
            val *= 0.8;
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
    const totalAD = getTotalStat(caster, StatType.AD);
    const totalAP = getTotalStat(caster, StatType.AP);
    
    // Adaptive Logic
    const isMagic = totalAP > totalAD;
    const rawDamage = isMagic ? totalAP : totalAD;

    // Animation: Move to target ONLY if physical
    if (!isMagic) {
        pushEvent({
            type: 'ATTACK_MOVE',
            sourceId: caster.id,
            targetId: target.id,
            skillName: '普通攻击'
        });
    } else {
        // If magic, just trigger the casting/attack visual
        pushEvent({
            type: 'SKILL_EFFECT',
            sourceId: caster.id,
            skillName: '普通攻击',
            text: undefined // No text popup, just visual trigger
        });
    }

    let mitigation = 1;

    if (isMagic) {
        // Magic Damage Calc
        const mr = getTotalStat(target, StatType.MR);
        const penFlat = getTotalStat(caster, StatType.MAGIC_PEN_FLAT);
        const penPerc = getTotalStat(caster, StatType.MAGIC_PEN_PERC);
        const effectiveMr = Math.max(0, (mr * (1 - penPerc / 100)) - penFlat);
        mitigation = effectiveMr > 0 ? (100 / (100 + effectiveMr)) : 1;
    } else {
        // Physical Damage Calc
        const armor = getTotalStat(target, StatType.ARMOR);
        const penFlat = getTotalStat(caster, StatType.ARMOR_PEN_FLAT);
        const penPerc = getTotalStat(caster, StatType.ARMOR_PEN_PERC);
        const effectiveArmor = Math.max(0, (armor * (1 - penPerc / 100)) - penFlat);
        mitigation = effectiveArmor > 0 ? (100 / (100 + effectiveArmor)) : 1; 
    }
    
    // Crit (Applies to both forms of basic attack usually in this game context)
    const critRate = getTotalStat(caster, StatType.CRIT_RATE);
    const isCrit = Math.random() * 100 < critRate;
    const baseCritDmg = 150; 
    const extraCritDmg = getTotalStat(caster, StatType.CRIT_DMG); 
    const critMult = isCrit ? ((baseCritDmg + extraCritDmg) / 100) : 1;

    let damage = Math.max(1, rawDamage * mitigation * critMult);
    damage = Math.floor(damage);
    
    // Vamp Logic
    let healAmt = 0;
    const omnivamp = getTotalStat(caster, StatType.OMNIVAMP);
    
    if (isMagic) {
        // Magic Attack uses Omnivamp
        if (omnivamp > 0) healAmt += Math.floor(damage * (omnivamp / 100));
    } else {
        // Physical Attack uses Lifesteal + Omnivamp
        const lifesteal = getTotalStat(caster, StatType.LIFESTEAL);
        const totalVamp = lifesteal + omnivamp;
        if (totalVamp > 0) healAmt += Math.floor(damage * (totalVamp / 100));
    }

    if (healAmt > 0) {
        caster.currentHp += healAmt;
        // Overheal expands Max HP
        if (caster.currentHp > caster.maxHp) caster.maxHp = caster.currentHp;
        pushEvent({ type: 'HEAL', targetId: caster.id, value: healAmt, color: '#4ade80' });
    }

    target.currentHp -= damage;
    
    // Push Events
    // Only send projectile if Magic. Physical uses Melee animation (ATTACK_MOVE).
    if (isMagic) {
        pushEvent({
            type: 'PROJECTILE',
            sourceId: caster.id,
            targetId: target.id,
            projectileType: 'MAGIC',
            value: damage
        });
    }

    pushEvent({
        type: 'DAMAGE',
        targetId: target.id,
        value: damage,
        text: isCrit ? '暴击!' : '',
        color: isCrit ? (isMagic ? '#f0abfc' : '#fca5a5') : (isMagic ? '#a855f7' : '#ef4444')
    });
    
    pushEvent({
        type: 'TEXT',
        text: `${caster.config.name} 对 ${target.config.name} 造成 ${damage} 点${isMagic ? '魔法' : '物理'}伤害`
    });
};

export const evaluateCondition = (cond: Condition | undefined, self: BattleEntity, enemy: BattleEntity, turn: number): boolean => {
    if (!cond) return true; // Always true if no condition

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
};

/**
 * Returns TRUE if skill was cast/triggered (mana consumed).
 * isPassiveTrigger: If true, checks conditions FIRST. If no conditions met, returns false without cost.
 */
export const processSkill = (
    skill: Skill, 
    caster: BattleEntity, 
    target: BattleEntity, 
    pushEvent: (evt: BattleEvent) => void, 
    turn: number,
    isPassiveTrigger: boolean = false
): boolean => {
    // Calculate cost based on CURRENT runtime stats
    const manaCost = calculateManaCost(skill, caster.config.stats, caster);
    
    // 1. If Passive, identify if any branches trigger. If none, do nothing.
    // 2. If Active, we assume intent to cast, so we proceed to cost check (unless we want 'fizzle' logic).
    //    For now, active skills execute whatever branches pass (usually 'Always').
    
    const triggeredBranches = skill.logic.filter(branch => 
        evaluateCondition(branch.condition, caster, target, turn)
    );

    if (isPassiveTrigger && triggeredBranches.length === 0) {
        return false;
    }

    // Mana Check
    if (caster.currentMana < manaCost) {
        if (!isPassiveTrigger && !skill.isPassive) {
            pushEvent({ type: 'TEXT', text: `${caster.config.name} 法力不足!` });
        }
        return false;
    }

    // Deduct Cost
    caster.currentMana = Math.max(0, caster.currentMana - manaCost);
    
    if (!skill.isPassive) {
        pushEvent({ 
            type: 'SKILL_EFFECT', 
            sourceId: caster.id, 
            skillName: skill.name,
            text: `${caster.config.name} 释放了 ${skill.name}`,
            visual: skill.logic[0]?.effect.visual // Use first block visual for main cast anim
        });
        pushEvent({ type: 'MANA', targetId: caster.id, value: -manaCost });
    }

    // Execute Logic
    triggeredBranches.forEach(branch => {
        const effect = branch.effect;
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
                // Overheal check
                if (caster.currentHp > caster.maxHp) caster.maxHp = caster.currentHp;
                if (heal > 0) pushEvent({ type: 'HEAL', targetId: caster.id, value: heal });
            }

            // Projectile Visual
            pushEvent({
                type: 'PROJECTILE',
                sourceId: caster.id,
                targetId: effectTarget.id,
                projectileType: 'PHYSICAL',
                value: damage,
                visual: effect.visual // Pass visual config
            });

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
                // Overheal check
                if (caster.currentHp > caster.maxHp) caster.maxHp = caster.currentHp;
                if (heal > 0) pushEvent({ type: 'HEAL', targetId: caster.id, value: heal });
            }

            // Projectile Visual
            pushEvent({
                type: 'PROJECTILE',
                sourceId: caster.id,
                targetId: effectTarget.id,
                projectileType: 'MAGIC',
                value: damage,
                visual: effect.visual // Pass visual config
            });

            effectTarget.currentHp -= damage;
            pushEvent({
                type: 'DAMAGE',
                targetId: effectTarget.id,
                value: damage,
                color: '#c084fc' // purple
            });

        } else if (effect.type === 'INCREASE_STAT' || effect.type === 'DECREASE_STAT') {
            const stat = effect.targetStat;
            if (stat) {
                const multiplier = effect.type === 'DECREASE_STAT' ? -1 : 1;
                const val = Math.floor(finalValue * multiplier);
                
                if (stat === StatType.CURRENT_HP) {
                    if (val > 0) {
                        effectTarget.currentHp += val;
                        // Overheal check
                        if (effectTarget.currentHp > effectTarget.maxHp) {
                            effectTarget.maxHp = effectTarget.currentHp;
                        }
                        pushEvent({ type: 'HEAL', targetId: effectTarget.id, value: val, visual: effect.visual });
                    } else if (val < 0) {
                        const dmg = Math.abs(val);
                        effectTarget.currentHp -= dmg;
                        pushEvent({ type: 'DAMAGE', targetId: effectTarget.id, value: dmg, text: '流失', color: '#b91c1c', visual: effect.visual }); 
                    }
                } else if (stat === StatType.CURRENT_MANA) {
                     effectTarget.currentMana += val;
                     // Overmana check
                     if (effectTarget.currentMana > effectTarget.maxMana) {
                         effectTarget.maxMana = effectTarget.currentMana;
                     }
                     if (val !== 0) {
                         pushEvent({ type: 'MANA', targetId: effectTarget.id, value: val, color: '#60a5fa', visual: effect.visual });
                     }
                } else {
                    // Buff/Debuff Base Stat
                    if (stat === StatType.HP) {
                        // Directly modifying Max HP
                        effectTarget.maxHp += val;
                        if (effectTarget.maxHp < 1) effectTarget.maxHp = 1;
                        if (effectTarget.currentHp > effectTarget.maxHp) {
                            effectTarget.currentHp = effectTarget.maxHp;
                        }
                        const sign = val >= 0 ? '+' : '';
                        pushEvent({
                            type: 'STAT_CHANGE',
                            targetId: effectTarget.id,
                            stat: stat,
                            value: val,
                            text: `${sign}${val} MaxHP`,
                            visual: effect.visual
                        });
                    } else if (stat === StatType.MANA) {
                        effectTarget.maxMana += val;
                        if (effectTarget.maxMana < 0) effectTarget.maxMana = 0;
                        if (effectTarget.currentMana > effectTarget.maxMana) {
                            effectTarget.currentMana = effectTarget.maxMana;
                        }
                        const sign = val >= 0 ? '+' : '';
                        pushEvent({
                            type: 'STAT_CHANGE',
                            targetId: effectTarget.id,
                            stat: stat,
                            value: val,
                            text: `${sign}${val} MaxMP`,
                            visual: effect.visual
                        });
                    } else if (typeof effectTarget.config.stats.base[stat] === 'number') {
                        // Legacy handling for other stats (AD, AP...)
                        effectTarget.config.stats.base[stat] += val;
                        const sign = val >= 0 ? '+' : '';
                        
                        pushEvent({
                            type: 'STAT_CHANGE',
                            targetId: effectTarget.id,
                            stat: stat,
                            value: val,
                            text: `${sign}${val} ${stat}`,
                            visual: effect.visual
                        });
                    }
                }
            }
        }
    });

    return true;
};