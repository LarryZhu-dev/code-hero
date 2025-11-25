
import { Skill, BattleEntity, CharacterStats, StatType } from '../types';
import { calculateManaCost, hasDynamicStats, getTotalStat } from './gameEngine';

export const getSkillDescription = (skill: Skill, stats?: CharacterStats, entity?: BattleEntity) => {
    let description = "";
    
    if (skill.id === 'basic_attack') {
        const ent = entity || { config: { stats: stats || { base: {}, percent: {} } } } as any;
        const ad = getTotalStat(ent, StatType.AD);
        const ap = getTotalStat(ent, StatType.AP);
        const isMagic = ap > ad;
        
        return `【基础动作】造成等于当前${isMagic ? '法术强度' : '攻击力'}的${isMagic ? '魔法' : '物理'}伤害。\n(自适应: AP > AD 时造成魔法伤害)\n当前效果: ${isMagic ? '计算法穿与全能吸血' : '计算物穿与生命偷取'}\n无消耗。`;
    }

    const currentStats = entity ? entity.config.stats : stats;
    if (currentStats) {
        const cost = calculateManaCost(skill, currentStats, entity);
        const isDynamic = hasDynamicStats(skill);
        let costText = `${cost}`;
        if (!entity && isDynamic) {
                costText += " + 战时加成";
        }
        description = skill.isPassive ? `【被动 | 估算消耗 ${costText} MP】` : `【主动 | 消耗 ${costText} MP】`;
    }

    if (skill.logic.length === 0) return description + " (无效果)";
    
    const logicDesc = skill.logic.map((branch, i) => {
        const cond = branch.condition;
        const eff = branch.effect;
        let condText = "总是";
        if (cond) {
            const target = cond.sourceTarget === 'SELF' ? '自身' : '敌方';
            const varMap: Record<string, string> = {
                'HP': '生命', 'HP%': '生命%', 
                'HP_LOST': '已损生命', 'HP_LOST%': '已损生命%',
                'MANA': '法力', 'MANA%': '法力%', 
                'TURN': '回合'
            };
            const v = varMap[cond.variable] || cond.variable;
            condText = `若 ${target}${v} ${cond.operator} ${cond.value}`;
        }

        const formatTarget = (t: string) => t === 'SELF' ? '自身' : '敌方';
        const actionMap: Record<string, string> = {
            'DAMAGE_PHYSICAL': '物理伤害',
            'DAMAGE_MAGIC': '魔法伤害',
            'INCREASE_STAT': '增加',
            'DECREASE_STAT': '减少'
        };
        const fa = eff.formula.factorA;
        const fb = eff.formula.factorB;
        const opMap: Record<string, string> = { '+':'+', '-':'-', '*':'x', '/':'÷' };
        const op = opMap[eff.formula.operator] || eff.formula.operator;
        let actionText = actionMap[eff.type] || eff.type;
        if (eff.type === 'INCREASE_STAT' || eff.type === 'DECREASE_STAT') {
            actionText += eff.targetStat;
        }
        
        return `[${i+1}] ${condText} -> 对${formatTarget(eff.target)}${actionText} (${fa.stat}${op}${fb.stat})`;
    }).join('\n');
    
    return description + "\n" + logicDesc;
};
