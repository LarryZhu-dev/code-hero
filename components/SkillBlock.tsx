
import React, { useState, useEffect } from 'react';
import { Skill, CharacterStats, WeaponType, SkillLogic, Effect, EffectVisual, TargetType, VariableSource, Operator, EffectType, StatType, FormulaOp, DYNAMIC_STATS, VisualShape, AnimationType } from '../types';
import { calculateManaCost, hasDynamicStats } from '../utils/gameEngine';
import { IconBolt, IconTrash, IconPlay, IconX, IconPlus } from './PixelIcons';
import { editorStyles } from './EditorStyles';

interface Props {
    skill: Skill;
    stats: CharacterStats;
    weapon: WeaponType;
    onPreview: (effect: Effect) => void;
    onChange: (s: Skill) => void;
    onDelete: () => void;
}

const SkillBlock: React.FC<Props> = ({ skill, stats, weapon, onPreview, onChange, onDelete }) => {
    const [manaCost, setManaCost] = useState(0);
    const [isDynamic, setIsDynamic] = useState(false);
    const [expandedVisual, setExpandedVisual] = useState<number | null>(null);

    useEffect(() => {
        setManaCost(calculateManaCost(skill, stats));
        setIsDynamic(hasDynamicStats(skill));
    }, [skill, stats]);

    const addBranch = () => {
        if (skill.logic.length >= 3) return;
        onChange({
            ...skill,
            logic: [...skill.logic, { 
                condition: undefined, 
                effect: { 
                    type: 'DAMAGE_PHYSICAL', 
                    target: 'ENEMY', 
                    formula: {
                        factorA: { target: 'SELF', stat: StatType.AD },
                        operator: '*',
                        factorB: { target: 'SELF', stat: StatType.CRIT_RATE } 
                    },
                    visual: { color: '#ef4444', shape: 'ORB', animationType: 'CAST' }
                }
            }]
        });
    };

    const updateBranch = (index: number, updates: Partial<SkillLogic>) => {
        const newLogic = [...skill.logic];
        newLogic[index] = { ...newLogic[index], ...updates };
        onChange({ ...skill, logic: newLogic });
    };

    const updateEffect = (branchIndex: number, updates: Partial<Effect>) => {
        const branch = skill.logic[branchIndex];
        if ((updates.type === 'INCREASE_STAT' || updates.type === 'DECREASE_STAT') && !branch.effect.targetStat && !updates.targetStat) {
            updates.targetStat = StatType.CURRENT_HP;
        }
        
        let newVisual = updates.visual || branch.effect.visual || { color: '#ffffff', shape: 'CIRCLE', animationType: 'CAST' };
        if (updates.type && !updates.visual) {
             if (updates.type === 'INCREASE_STAT') newVisual = { color: '#4ade80', shape: 'CIRCLE', animationType: 'CAST' };
             else if (updates.type === 'DECREASE_STAT') newVisual = { color: '#ef4444', shape: 'CIRCLE', animationType: 'CAST' };
             else if (updates.type === 'DAMAGE_MAGIC') newVisual = { color: '#a855f7', shape: 'ORB', animationType: 'CAST' };
             else newVisual = { color: '#ef4444', shape: 'SQUARE', animationType: 'THRUST' };
        }

        updateBranch(branchIndex, { effect: { ...branch.effect, ...updates, visual: newVisual } });
    };

    const updateVisual = (branchIndex: number, updates: Partial<EffectVisual>) => {
        const branch = skill.logic[branchIndex];
        const currentVisual = branch.effect.visual || { color: '#ffffff', shape: 'CIRCLE', animationType: 'CAST' };
        updateBranch(branchIndex, { effect: { ...branch.effect, visual: { ...currentVisual, ...updates } } });
    };

    const toggleCondition = (branchIndex: number) => {
        const branch = skill.logic[branchIndex];
        if (branch.condition) {
            updateBranch(branchIndex, { condition: undefined });
        } else {
            updateBranch(branchIndex, { 
                condition: { sourceTarget: 'SELF', variable: 'HP%', operator: '<', value: 50 } 
            });
        }
    };

    return (
        <div className="bg-slate-900 pixel-border hover:border-slate-500 transition-all group">
            {/* ... Header ... */}
            <div className="bg-slate-800 p-3 flex items-center gap-3 border-b-2 border-slate-700">
                <div className="w-8 h-8 bg-green-600 border-2 border-green-800 flex items-center justify-center shrink-0">
                    <IconBolt size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                     <input 
                        className="bg-slate-900 border-b-2 border-slate-700 font-bold outline-none text-sm w-full placeholder-slate-500 focus:border-blue-400 focus:text-blue-300 transition-colors py-1"
                        value={skill.name}
                        onChange={(e) => onChange({...skill, name: e.target.value})}
                        placeholder="未命名技能"
                    />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">COST</span>
                        <div className="flex items-center gap-1">
                            <span className={`font-mono font-bold text-sm ${manaCost > 1000 ? 'text-red-500 animate-pulse' : manaCost > 100 ? 'text-red-400' : 'text-blue-400'}`}>
                                {manaCost}
                            </span>
                            {isDynamic && <span className="text-[10px] text-yellow-400 font-bold">+</span>}
                        </div>
                    </div>
                    <div className="h-6 w-[2px] bg-slate-700"></div>
                    
                    {/* New Slider Toggle for Active/Passive */}
                    <div 
                        onClick={() => onChange({...skill, isPassive: !skill.isPassive})}
                        className="flex items-center bg-slate-950 rounded-full p-1 border border-slate-600 relative w-24 h-6 cursor-pointer select-none"
                    >
                        <div className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full transition-all duration-200 z-0 ${skill.isPassive ? 'left-[calc(50%+1px)] bg-indigo-600' : 'left-0.5 bg-green-600'}`}></div>
                        <span className={`flex-1 text-center text-[10px] z-10 relative font-bold transition-colors ${!skill.isPassive ? 'text-white' : 'text-slate-500'}`}>主动</span>
                        <span className={`flex-1 text-center text-[10px] z-10 relative font-bold transition-colors ${skill.isPassive ? 'text-white' : 'text-slate-500'}`}>被动</span>
                    </div>

                    <button onClick={onDelete} className="text-slate-500 hover:text-red-400 transition-all ml-1">
                        <IconTrash size={16} />
                    </button>
                </div>
            </div>
            
            <div className="p-3 space-y-3 bg-slate-900">
                {/* Logic Branches */}
                {skill.logic.map((branch, i) => {
                    const visual = branch.effect.visual || { color: '#ffffff', shape: 'CIRCLE', animationType: 'CAST' };
                    const isDamage = branch.effect.type.includes('DAMAGE');
                    const isWeaponAnim = visual.animationType === 'THRUST' || visual.animationType === 'THROW';

                    return (
                    <div key={i} className="relative bg-slate-950 border-2 border-slate-800 hover:border-slate-600 transition-all">
                         <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-yellow-500 to-green-500"></div>
                         
                         {/* Header / Toolbar */}
                         <div className="flex justify-between items-center px-3 py-1.5 border-b-2 border-slate-900 bg-slate-900">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-2 ml-2">
                                BLOCK #{i + 1}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => onPreview(branch.effect)}
                                    className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 border border-blue-900 transition-colors bg-blue-950 text-blue-300 hover:bg-blue-900"
                                >
                                    <IconPlay size={10}/> 预览
                                </button>
                                <button 
                                    className="text-slate-600 hover:text-red-400 p-0.5 transition-all"
                                    onClick={() => {
                                        const nl = [...skill.logic];
                                        nl.splice(i, 1);
                                        onChange({...skill, logic: nl});
                                    }}
                                >
                                    <IconX size={12}/>
                                </button>
                            </div>
                         </div>

                         <div className="p-2 grid gap-2 ml-2">
                            {/* IF / THEN Logic */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <button 
                                    onClick={() => toggleCondition(i)}
                                    className={`text-[10px] font-mono font-bold px-1.5 py-1 border-2 transition-colors ${branch.condition ? 'bg-yellow-900 text-yellow-500 border-yellow-700' : 'bg-slate-800 text-slate-500 border-slate-700 hover:bg-slate-700'}`}
                                >
                                    IF
                                </button>
                                
                                {branch.condition ? (
                                    <div className="flex flex-wrap gap-1.5 items-center animate-in fade-in slide-in-from-left-2 duration-200">
                                        <select 
                                            className={editorStyles.target}
                                            value={branch.condition.sourceTarget}
                                            onChange={(e) => updateBranch(i, { condition: { ...branch.condition!, sourceTarget: e.target.value as TargetType } })}
                                        >
                                            <option value="SELF">自己</option>
                                            <option value="ENEMY">敌人</option>
                                        </select>
                                        <span className="text-slate-600 font-mono text-[10px]">.</span>
                                        <select 
                                            className={editorStyles.variable}
                                            value={branch.condition.variable}
                                            onChange={(e) => updateBranch(i, { condition: { ...branch.condition!, variable: e.target.value as VariableSource } })}
                                        >
                                            <option value="HP">HP</option>
                                            <option value="HP%">HP%</option>
                                            <option value="HP_LOST">损HP</option>
                                            <option value="HP_LOST%">损HP%</option>
                                            <option value="MANA">MP</option>
                                            <option value="MANA%">MP%</option>
                                            <option value="TURN">回合</option>
                                        </select>
                                        <select 
                                            className={editorStyles.operator}
                                            value={branch.condition.operator}
                                            onChange={(e) => updateBranch(i, { condition: { ...branch.condition!, operator: e.target.value as Operator } })}
                                        >
                                            {['>', '<', '==', '>=', '<=', '!='].map(op => <option key={op} value={op}>{op}</option>)}
                                        </select>
                                        <input 
                                            type="number" 
                                            className={editorStyles.input}
                                            value={branch.condition.value}
                                            onChange={(e) => updateBranch(i, { condition: { ...branch.condition!, value: parseFloat(e.target.value) } })}
                                        />
                                    </div>
                                ) : (
                                    <div className="text-[10px] text-slate-600 font-mono italic">
                                        Always
                                    </div>
                                )}
                            </div>

                            {/* THEN Effect */}
                            <div className="flex flex-wrap items-center gap-1.5 pl-4 relative border-l-2 border-slate-800 ml-2">
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-0.5 bg-slate-800"></div>
                                <span className="text-green-600 font-mono text-[10px] font-bold px-1.5 py-0.5 bg-green-950/20 border border-green-900/50">DO</span>
                                
                                <select 
                                    className={editorStyles.action}
                                    value={branch.effect.type}
                                    onChange={(e) => updateEffect(i, { type: e.target.value as EffectType })}
                                >
                                    <option value="DAMAGE_PHYSICAL">物理伤</option>
                                    <option value="DAMAGE_MAGIC">魔法伤</option>
                                    <option value="INCREASE_STAT">增加</option>
                                    <option value="DECREASE_STAT">减少</option>
                                </select>
                                
                                {(branch.effect.type === 'INCREASE_STAT' || branch.effect.type === 'DECREASE_STAT') ? (
                                    <>
                                        <select 
                                            className={editorStyles.target}
                                            value={branch.effect.target}
                                            onChange={(e) => updateEffect(i, { target: e.target.value as TargetType })}
                                        >
                                            <option value="ENEMY">敌</option>
                                            <option value="SELF">己</option>
                                        </select>
                                        <span className="text-slate-500 text-[10px]">.</span>
                                        <select 
                                            className={editorStyles.variable}
                                            value={branch.effect.targetStat || StatType.CURRENT_HP}
                                            onChange={(e) => updateEffect(i, { targetStat: e.target.value as StatType })}
                                        >
                                            <option value={StatType.CURRENT_HP}>HP</option>
                                            <option value={StatType.CURRENT_MANA}>MP</option>
                                            {Object.values(StatType)
                                                .filter(s => !DYNAMIC_STATS.includes(s) && s !== StatType.CURRENT_MANA) 
                                                .map(s => <option key={s} value={s}>{s}</option>)
                                            }
                                        </select>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-slate-500 text-[10px]">to</span>
                                        <select 
                                            className={editorStyles.target}
                                            value={branch.effect.target}
                                            onChange={(e) => updateEffect(i, { target: e.target.value as TargetType })}
                                        >
                                            <option value="ENEMY">敌</option>
                                            <option value="SELF">己</option>
                                        </select>
                                    </>
                                )}
                                
                                <div className="flex flex-wrap items-center gap-1.5 mt-1 sm:mt-0">
                                    <span className="text-[10px] text-slate-500 font-mono">=</span>
                                    {/* Formula Left */}
                                    <div className="flex items-center bg-slate-900 border-2 border-slate-700 px-1 py-0.5">
                                        <select 
                                            className="bg-transparent text-indigo-300 text-[10px] font-mono outline-none appearance-none cursor-pointer hover:text-white"
                                            value={branch.effect.formula.factorA.target}
                                            onChange={(e) => {
                                                const f = { ...branch.effect.formula, factorA: { ...branch.effect.formula.factorA, target: e.target.value as TargetType } };
                                                updateEffect(i, { formula: f });
                                            }}
                                        >
                                            <option value="SELF">己</option>
                                            <option value="ENEMY">敌</option>
                                        </select>
                                        <span className="text-slate-600 px-0.5 text-[10px]">.</span>
                                        <select 
                                            className="bg-transparent text-slate-300 text-[10px] font-mono outline-none appearance-none cursor-pointer hover:text-white max-w-[50px]"
                                            value={branch.effect.formula.factorA.stat}
                                            onChange={(e) => {
                                                const f = { ...branch.effect.formula, factorA: { ...branch.effect.formula.factorA, stat: e.target.value as StatType } };
                                                updateEffect(i, { formula: f });
                                            }}
                                        >
                                            {Object.values(StatType)
                                                .filter(s => s !== StatType.CURRENT_MANA)
                                                .map(s => <option key={s} value={s}>{s}</option>)
                                            }
                                        </select>
                                    </div>

                                    {/* Operator */}
                                    <select 
                                        className={editorStyles.operator}
                                        value={branch.effect.formula.operator}
                                        onChange={(e) => {
                                            const f = { ...branch.effect.formula, operator: e.target.value as FormulaOp };
                                            updateEffect(i, { formula: f });
                                        }}
                                        style={{minWidth: '2rem'}}
                                    >
                                        <option value="+">+</option>
                                        <option value="-">-</option>
                                        <option value="*">*</option>
                                        <option value="/">/</option>
                                    </select>

                                    {/* Formula Right */}
                                    <div className="flex items-center bg-slate-900 border-2 border-slate-700 px-1 py-0.5">
                                        <select 
                                            className="bg-transparent text-indigo-300 text-[10px] font-mono outline-none appearance-none cursor-pointer hover:text-white"
                                            value={branch.effect.formula.factorB.target}
                                            onChange={(e) => {
                                                const f = { ...branch.effect.formula, factorB: { ...branch.effect.formula.factorB, target: e.target.value as TargetType } };
                                                updateEffect(i, { formula: f });
                                            }}
                                        >
                                            <option value="SELF">己</option>
                                            <option value="ENEMY">敌</option>
                                        </select>
                                        <span className="text-slate-600 px-0.5 text-[10px]">.</span>
                                        <select 
                                            className="bg-transparent text-slate-300 text-[10px] font-mono outline-none appearance-none cursor-pointer hover:text-white max-w-[50px]"
                                            value={branch.effect.formula.factorB.stat}
                                            onChange={(e) => {
                                                const f = { ...branch.effect.formula, factorB: { ...branch.effect.formula.factorB, stat: e.target.value as StatType } };
                                                updateEffect(i, { formula: f });
                                            }}
                                        >
                                            {Object.values(StatType)
                                                .filter(s => s !== StatType.CURRENT_MANA)
                                                .map(s => <option key={s} value={s}>{s}</option>)
                                            }
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Compact Visual Config */}
                            <button 
                                onClick={() => setExpandedVisual(expandedVisual === i ? null : i)}
                                className={`text-[10px] text-left px-2 py-1 border-2 border-dashed flex justify-between items-center ${expandedVisual === i ? 'bg-slate-800 border-slate-500 text-slate-300' : 'bg-slate-900 border-slate-800 text-slate-600 hover:text-slate-400'}`}
                            >
                                <span>视觉配置: {visual.animationType || 'CAST'} {isDamage && !isWeaponAnim ? `+ ${visual.shape}` : ''}</span>
                                <span className="opacity-50">{expandedVisual === i ? '收起' : '展开'}</span>
                            </button>

                            {expandedVisual === i && (
                                <div className="pl-2 pr-2 pb-2 bg-slate-950 border-2 border-slate-700 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="grid grid-cols-2 gap-4 mt-2">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-slate-500">动作类型</label>
                                            <select
                                                className={`${editorStyles.variable} text-[10px] py-0.5`}
                                                value={visual.animationType || 'CAST'}
                                                onChange={(e) => updateVisual(i, { animationType: e.target.value as AnimationType })}
                                            >
                                                <option value="CAST">施法 (Cast)</option>
                                                <option value="THRUST">突刺 (Thrust)</option>
                                                <option value="THROW">投掷 (Throw)</option>
                                            </select>
                                        </div>
                                        
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-slate-500">颜色</label>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="color" 
                                                    value={visual.color}
                                                    onChange={(e) => updateVisual(i, { color: e.target.value })}
                                                    className="w-full h-5 cursor-pointer border-2 border-slate-500 bg-slate-800 p-0.5"
                                                />
                                            </div>
                                        </div>

                                        {isDamage && !isWeaponAnim && (
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] text-slate-500">发射物形状</label>
                                                <select 
                                                    className={`${editorStyles.variable} text-[10px] py-0.5`}
                                                    value={visual.shape}
                                                    onChange={(e) => updateVisual(i, { shape: e.target.value as VisualShape })}
                                                >
                                                    <option value="CIRCLE">圆形</option>
                                                    <option value="SQUARE">方块</option>
                                                    <option value="STAR">星形</option>
                                                    <option value="BEAM">光束</option>
                                                    <option value="ORB">法球</option>
                                                </select>
                                            </div>
                                        )}
                                        {isWeaponAnim && (
                                            <div className="col-span-2 text-[10px] text-slate-500 italic p-1 bg-slate-800 border border-slate-700">
                                                使用当前武器模型进行攻击动画
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                         </div>
                    </div>
                );})}

                {skill.logic.length < 3 ? (
                    <button 
                        onClick={addBranch}
                        className="w-full py-2 border-2 border-dashed border-slate-700 text-slate-500 text-xs hover:text-blue-400 hover:border-blue-500 hover:bg-blue-900/20 transition-all flex items-center justify-center gap-2 font-bold"
                    >
                        <IconPlus size={14}/> 添加逻辑 ({skill.logic.length}/3)
                    </button>
                ) : (
                    <div className="text-center text-[10px] text-slate-600 py-1">
                        已达上限
                    </div>
                )}
            </div>
        </div>
    );
};

export default SkillBlock;
