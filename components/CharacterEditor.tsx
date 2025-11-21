import React, { useState, useEffect } from 'react';
import { CharacterConfig, INITIAL_STATS, StatType, Skill, EffectType, TargetType, Operator, VariableSource, FormulaOp, Effect } from '../types';
import { Save, Download, Plus, Trash2, Cpu, Zap, Activity, Crosshair, ArrowRight } from 'lucide-react';
import { calculateManaCost } from '../utils/gameEngine';

interface Props {
    onSave: (char: CharacterConfig) => void;
    existing?: CharacterConfig;
}

const MAX_BASE_POINTS = 10000;
const MAX_PERCENT_POINTS = 1000;

const ALLOWED_PERCENT_STATS = [
    StatType.CRIT_RATE,
    StatType.ARMOR_PEN_PERC,
    StatType.MAGIC_PEN_PERC,
    StatType.LIFESTEAL,
    StatType.OMNIVAMP,
    StatType.MANA_REGEN
];

// --- Enhanced Token Styles ---
const baseSelectClass = "appearance-none outline-none font-mono text-xs px-3 py-1.5 rounded cursor-pointer transition-all border shadow-sm text-center font-bold";

const styles = {
    target: `${baseSelectClass} bg-indigo-950/50 border-indigo-700 text-indigo-300 hover:bg-indigo-900 hover:border-indigo-500`,
    variable: `${baseSelectClass} bg-sky-950/50 border-sky-700 text-sky-300 hover:bg-sky-900 hover:border-sky-500`,
    operator: `${baseSelectClass} bg-orange-950/50 border-orange-700 text-orange-400 hover:bg-orange-900 hover:border-orange-500 min-w-[3rem]`,
    action: `${baseSelectClass} bg-emerald-950/50 border-emerald-700 text-emerald-400 hover:bg-emerald-900 hover:border-emerald-500`,
    input: "bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-center text-yellow-200 w-20 focus:border-yellow-500 outline-none transition-colors",
};

const CharacterEditor: React.FC<Props> = ({ onSave, existing }) => {
    const [char, setChar] = useState<CharacterConfig>(existing || {
        id: crypto.randomUUID(),
        name: '新角色',
        avatarColor: '#3b82f6',
        stats: JSON.parse(JSON.stringify(INITIAL_STATS)),
        skills: []
    });

    const usedBase = (Object.values(char.stats.base) as number[]).reduce((a, b) => a + b, 0);
    const usedPerc = (Object.values(char.stats.percent) as number[]).reduce((a, b) => a + b, 0);

    const handleStatChange = (type: 'base' | 'percent', stat: StatType, val: number) => {
        if (val < 0 || isNaN(val)) return;

        const currentTotal = type === 'base' ? usedBase : usedPerc;
        const currentVal = char.stats[type][stat] || 0;
        const limit = type === 'base' ? MAX_BASE_POINTS : MAX_PERCENT_POINTS;

        if (val > currentVal && (currentTotal - currentVal + val) > limit) {
            return; 
        }

        setChar(prev => ({
            ...prev,
            stats: {
                ...prev.stats,
                [type]: {
                    ...prev.stats[type],
                    [stat]: val
                }
            }
        }));
    };

    const addSkill = () => {
        if (char.skills.length >= 3) {
            alert("技能数量上限为 3 个");
            return;
        }
        setChar({
            ...char,
            skills: [...char.skills, {
                id: crypto.randomUUID(),
                name: '新技能',
                isPassive: false,
                conditions: [],
                effects: []
            }]
        });
    };

    const updateSkill = (index: number, skill: Skill) => {
        const newSkills = [...char.skills];
        newSkills[index] = skill;
        setChar({ ...char, skills: newSkills });
    };

    const exportConfig = () => {
        const json = JSON.stringify(char);
        const b64 = btoa(json);
        const blob = new Blob([b64], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${char.name.replace(/\s/g, '_')}.code`;
        a.click();
    };

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-900 text-white p-4">
            <header className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4 bg-slate-900">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg shadow-lg" style={{backgroundColor: char.avatarColor}}></div>
                    <input 
                        value={char.name} 
                        onChange={e => setChar({...char, name: e.target.value})}
                        className="bg-transparent text-2xl font-bold border-b-2 border-transparent hover:border-slate-700 focus:border-blue-500 outline-none transition-all"
                        placeholder="角色名称"
                    />
                    <div className="relative group">
                        <input 
                            type="color" 
                            value={char.avatarColor}
                            onChange={e => setChar({...char, avatarColor: e.target.value})}
                            className="w-6 h-6 rounded cursor-pointer border-none opacity-0 absolute inset-0"
                        />
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-700 to-slate-600 border border-slate-500 flex items-center justify-center cursor-pointer group-hover:border-blue-400">
                            <div className="w-4 h-4 rounded-full" style={{backgroundColor: char.avatarColor}}></div>
                        </div>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={exportConfig} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm transition-all hover:shadow-lg">
                        <Download size={16} /> 导出配置
                    </button>
                    <button onClick={() => onSave(char)} className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40">
                        <Save size={16} /> 保存角色
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden gap-6">
                {/* Stats Panel */}
                <div className="w-[380px] flex flex-col bg-slate-800/50 rounded-xl border border-slate-700/50 backdrop-blur-sm overflow-hidden shadow-xl">
                    <div className="bg-slate-800/80 p-5 border-b border-slate-700 shadow-md z-10">
                        <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2">
                            <Activity size={18}/> 属性配置
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-1 opacity-10"><Cpu size={40}/></div>
                                <div className="text-xs text-slate-400 mb-1 font-bold uppercase tracking-wider">基础点数</div>
                                <div className={`text-2xl font-mono font-bold ${usedBase > MAX_BASE_POINTS ? 'text-red-500' : 'text-white'}`}>
                                    {usedBase}<span className="text-sm text-slate-600">/{MAX_BASE_POINTS}</span>
                                </div>
                            </div>
                            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-1 opacity-10"><Zap size={40}/></div>
                                <div className="text-xs text-slate-400 mb-1 font-bold uppercase tracking-wider">百分比加成</div>
                                <div className={`text-2xl font-mono font-bold ${usedPerc > MAX_PERCENT_POINTS ? 'text-red-500' : 'text-purple-400'}`}>
                                    {usedPerc}<span className="text-sm text-slate-600">/{MAX_PERCENT_POINTS}%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {Object.values(StatType).map(stat => {
                            const isPercentAllowed = ALLOWED_PERCENT_STATS.includes(stat);
                            return (
                                <div key={stat} className="bg-slate-900/40 p-3 rounded-lg border border-slate-700/30 hover:border-slate-500/50 transition-all group">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">{stat}</label>
                                    </div>
                                    <div className="flex gap-3 items-center">
                                        <div className="flex-1 relative">
                                            <input 
                                                type="number" 
                                                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-right outline-none font-mono text-sm text-yellow-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
                                                value={char.stats.base[stat]}
                                                onChange={(e) => handleStatChange('base', stat, parseInt(e.target.value) || 0)}
                                                onFocus={(e) => e.target.select()}
                                                min={0}
                                            />
                                            <span className="absolute left-2 top-1.5 text-xs text-slate-600 select-none pointer-events-none">Base</span>
                                        </div>
                                        <div className="flex-1 relative">
                                            {isPercentAllowed ? (
                                                <>
                                                    <input 
                                                        type="number" 
                                                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-right outline-none font-mono text-sm text-purple-300 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                                                        value={char.stats.percent[stat]}
                                                        onChange={(e) => handleStatChange('percent', stat, parseInt(e.target.value) || 0)}
                                                        onFocus={(e) => e.target.select()}
                                                        min={0}
                                                    />
                                                    <span className="absolute left-2 top-1.5 text-xs text-slate-600 select-none pointer-events-none">%</span>
                                                </>
                                            ) : (
                                                <div className="h-full flex items-center justify-center opacity-20">
                                                    <div className="h-[1px] w-full bg-slate-500"></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Skills Editor */}
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-800/30 rounded-xl border border-slate-700/50">
                    <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-900/50 backdrop-blur z-10">
                        <h3 className="text-xl font-bold text-purple-400 flex items-center gap-2">
                            <Cpu size={24} /> 技能编程逻辑
                        </h3>
                        <div className="flex items-center gap-3">
                            <div className="flex gap-1">
                                {Array.from({length: 3}).map((_, i) => (
                                    <div key={i} className={`w-2 h-2 rounded-full ${i < char.skills.length ? 'bg-purple-500' : 'bg-slate-700'}`}></div>
                                ))}
                            </div>
                            <button 
                                onClick={addSkill} 
                                disabled={char.skills.length >= 3}
                                className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-bold transition-all shadow-lg ${char.skills.length >= 3 ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white hover:shadow-purple-900/30'}`}
                            >
                                <Plus size={16} /> 新建技能
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                        {char.skills.map((skill, idx) => (
                            <SkillBlock 
                                key={skill.id} 
                                skill={skill} 
                                onChange={(s) => updateSkill(idx, s)} 
                                onDelete={() => {
                                    const ns = [...char.skills];
                                    ns.splice(idx, 1);
                                    setChar({ ...char, skills: ns });
                                }}
                            />
                        ))}
                        {char.skills.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600">
                                <div className="p-6 rounded-full bg-slate-800/50 mb-4 animate-pulse">
                                    <Cpu size={64} className="opacity-50" />
                                </div>
                                <p className="text-xl font-bold mb-2">逻辑核心为空</p>
                                <p className="text-sm opacity-60">点击右上角添加技能模块</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const SkillBlock: React.FC<{ skill: Skill, onChange: (s: Skill) => void, onDelete: () => void }> = ({ skill, onChange, onDelete }) => {
    const [manaCost, setManaCost] = useState(0);

    useEffect(() => {
        setManaCost(calculateManaCost(skill));
    }, [skill]);

    const addCondition = () => {
        if (skill.conditions.length >= 3) return;
        onChange({
            ...skill,
            conditions: [...skill.conditions, { sourceTarget: 'SELF', variable: 'HP%', operator: '<', value: 50 }]
        });
    };

    const addEffect = () => {
        if (skill.effects.length >= 3) return;
        onChange({
            ...skill,
            effects: [...skill.effects, { 
                type: 'DAMAGE_PHYSICAL', 
                target: 'ENEMY', 
                formula: {
                    factorA: { target: 'SELF', stat: StatType.AD },
                    operator: '*',
                    factorB: { target: 'SELF', stat: StatType.CRIT_RATE } 
                }
            }]
        });
    };

    const updateEffect = (index: number, updates: Partial<Effect>) => {
        const newEffects = [...skill.effects];
        newEffects[index] = { ...newEffects[index], ...updates };
        onChange({ ...skill, effects: newEffects });
    };

    return (
        <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-lg hover:border-slate-600 transition-all group">
            <div className="bg-slate-800 p-4 flex items-center gap-4 border-b border-slate-700">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-inner">
                    <Zap size={20} className="text-white" />
                </div>
                <div className="flex-1">
                     <input 
                        className="bg-transparent font-bold outline-none text-lg w-full placeholder-slate-500 focus:text-blue-300 transition-colors"
                        value={skill.name}
                        onChange={(e) => onChange({...skill, name: e.target.value})}
                        placeholder="未命名技能模块"
                    />
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">Mana Cost</span>
                        <span className="text-blue-400 font-mono font-bold text-lg">{manaCost}</span>
                    </div>
                    <div className="h-8 w-[1px] bg-slate-700"></div>
                    <label className="flex items-center gap-2 cursor-pointer select-none group/toggle">
                        <div className={`w-10 h-5 rounded-full p-1 transition-colors ${skill.isPassive ? 'bg-blue-600' : 'bg-slate-700'}`}>
                            <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${skill.isPassive ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </div>
                        <input 
                            type="checkbox" 
                            className="hidden"
                            checked={skill.isPassive} 
                            onChange={(e) => onChange({...skill, isPassive: e.target.checked})} 
                        />
                        <span className={`text-xs font-bold ${skill.isPassive ? 'text-blue-400' : 'text-slate-500'}`}>
                            {skill.isPassive ? '被动触发' : '主动释放'}
                        </span>
                    </label>
                    <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-all ml-2">
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>
            
            <div className="p-5 space-y-6 bg-slate-900/50">
                {/* Conditions */}
                <div className="relative">
                    <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-800"></div>
                    <div className="flex justify-between items-center mb-3 pl-6">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-500"></div> 触发条件 (IF)
                        </span>
                        {skill.conditions.length < 3 && (
                            <button onClick={addCondition} className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-950/30 transition-colors">
                                <Plus size={12}/> 添加判定
                            </button>
                        )}
                    </div>
                    
                    <div className="space-y-2 pl-6">
                        {skill.conditions.length === 0 && (
                            <div className="text-xs text-slate-600 py-2 px-3 border border-dashed border-slate-800 rounded-lg flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                无条件 (总是执行 / 等待玩家释放)
                            </div>
                        )}
                        {skill.conditions.map((cond, i) => (
                            <div key={i} className="flex flex-wrap gap-2 items-center bg-slate-950/80 p-2 rounded-lg border border-slate-800 shadow-sm group/line hover:border-slate-700 transition-colors">
                                <span className="text-yellow-600 font-mono text-xs font-bold px-1">IF</span>
                                <select 
                                    className={styles.target}
                                    value={cond.sourceTarget}
                                    onChange={(e) => {
                                        const nc = [...skill.conditions];
                                        nc[i].sourceTarget = e.target.value as TargetType;
                                        onChange({...skill, conditions: nc});
                                    }}
                                >
                                    <option value="SELF">自己</option>
                                    <option value="ENEMY">敌人</option>
                                </select>
                                <span className="text-slate-600 font-mono">.</span>
                                <select 
                                    className={styles.variable}
                                    value={cond.variable}
                                    onChange={(e) => {
                                        const nc = [...skill.conditions];
                                        nc[i].variable = e.target.value as VariableSource;
                                        onChange({...skill, conditions: nc});
                                    }}
                                >
                                    <option value="HP">当前生命</option>
                                    <option value="HP%">生命百分比</option>
                                    <option value="MANA">当前法力</option>
                                    <option value="MANA%">法力百分比</option>
                                    <option value="TURN">当前回合</option>
                                </select>
                                <select 
                                    className={styles.operator}
                                    value={cond.operator}
                                    onChange={(e) => {
                                        const nc = [...skill.conditions];
                                        nc[i].operator = e.target.value as Operator;
                                        onChange({...skill, conditions: nc});
                                    }}
                                >
                                    {['>', '<', '==', '>=', '<=', '!='].map(op => <option key={op} value={op}>{op}</option>)}
                                </select>
                                <input 
                                    type="number" 
                                    className={styles.input}
                                    value={cond.value}
                                    onChange={(e) => {
                                        const nc = [...skill.conditions];
                                        nc[i].value = parseFloat(e.target.value);
                                        onChange({...skill, conditions: nc});
                                    }}
                                />
                                <button 
                                    className="ml-auto text-slate-600 hover:text-red-400 p-1 rounded hover:bg-red-950/30 opacity-0 group-hover/line:opacity-100 transition-all"
                                    onClick={() => {
                                        const nc = [...skill.conditions];
                                        nc.splice(i, 1);
                                        onChange({...skill, conditions: nc});
                                    }}
                                >
                                    <Trash2 size={14}/>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Effects */}
                <div className="relative">
                    <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-800"></div>
                    <div className="flex justify-between items-center mb-3 pl-6">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div> 执行效果 (THEN)
                        </span>
                         {skill.effects.length < 3 && (
                            <button onClick={addEffect} className="text-xs text-green-400 hover:text-green-300 font-bold flex items-center gap-1 px-2 py-1 rounded hover:bg-green-950/30 transition-colors">
                                <Plus size={12}/> 添加动作
                            </button>
                        )}
                    </div>

                    <div className="space-y-3 pl-6">
                         {skill.effects.length === 0 && (
                            <div className="text-xs text-slate-600 py-2 px-3 border border-dashed border-slate-800 rounded-lg flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
                                无效果
                            </div>
                        )}
                        {skill.effects.map((eff, i) => (
                            <div key={i} className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 shadow-sm group/line hover:border-slate-700 transition-colors relative overflow-hidden">
                                <div className="flex flex-wrap gap-2 items-center mb-2 pb-2 border-b border-slate-900">
                                    <span className="text-green-600 font-mono text-xs font-bold px-1">DO</span>
                                    <select 
                                        className={styles.action}
                                        value={eff.type}
                                        onChange={(e) => updateEffect(i, { type: e.target.value as EffectType })}
                                    >
                                        <option value="DAMAGE_PHYSICAL">造成物理伤害</option>
                                        <option value="DAMAGE_MAGIC">造成魔法伤害</option>
                                        <option value="HEAL">回复生命值</option>
                                        <option value="GAIN_MANA">回复法力值</option>
                                    </select>
                                    <span className="text-slate-500 text-xs">to</span>
                                    <select 
                                        className={styles.target}
                                        value={eff.target}
                                        onChange={(e) => updateEffect(i, { target: e.target.value as TargetType })}
                                    >
                                        <option value="ENEMY">敌人</option>
                                        <option value="SELF">自己</option>
                                    </select>
                                    <button 
                                        className="ml-auto text-slate-600 hover:text-red-400 p-1 rounded hover:bg-red-950/30 opacity-0 group-hover/line:opacity-100 transition-all"
                                        onClick={() => {
                                            const ne = [...skill.effects];
                                            ne.splice(i, 1);
                                            onChange({...skill, effects: ne});
                                        }}
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                                
                                <div className="flex flex-wrap items-center gap-2 pl-4">
                                    <span className="text-xs text-slate-500 font-mono">=</span>
                                    
                                    {/* Formula Left */}
                                    <div className="flex items-center bg-slate-900/50 rounded border border-slate-800 px-1 py-0.5">
                                        <select 
                                            className="bg-transparent text-indigo-300 text-xs font-mono outline-none appearance-none cursor-pointer hover:text-white"
                                            value={eff.formula.factorA.target}
                                            onChange={(e) => {
                                                const f = { ...eff.formula, factorA: { ...eff.formula.factorA, target: e.target.value as TargetType } };
                                                updateEffect(i, { formula: f });
                                            }}
                                        >
                                            <option value="SELF">自己</option>
                                            <option value="ENEMY">敌人</option>
                                        </select>
                                        <span className="text-slate-600 px-0.5">.</span>
                                        <select 
                                            className="bg-transparent text-slate-300 text-xs font-mono outline-none appearance-none cursor-pointer hover:text-white"
                                            value={eff.formula.factorA.stat}
                                            onChange={(e) => {
                                                const f = { ...eff.formula, factorA: { ...eff.formula.factorA, stat: e.target.value as StatType } };
                                                updateEffect(i, { formula: f });
                                            }}
                                        >
                                            {Object.values(StatType).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>

                                    {/* Operator */}
                                    <select 
                                        className={styles.operator}
                                        value={eff.formula.operator}
                                        onChange={(e) => {
                                            const f = { ...eff.formula, operator: e.target.value as FormulaOp };
                                            updateEffect(i, { formula: f });
                                        }}
                                    >
                                        <option value="+">+</option>
                                        <option value="-">-</option>
                                        <option value="*">*</option>
                                        <option value="/">/</option>
                                    </select>

                                    {/* Formula Right */}
                                    <div className="flex items-center bg-slate-900/50 rounded border border-slate-800 px-1 py-0.5">
                                        <select 
                                            className="bg-transparent text-indigo-300 text-xs font-mono outline-none appearance-none cursor-pointer hover:text-white"
                                            value={eff.formula.factorB.target}
                                            onChange={(e) => {
                                                const f = { ...eff.formula, factorB: { ...eff.formula.factorB, target: e.target.value as TargetType } };
                                                updateEffect(i, { formula: f });
                                            }}
                                        >
                                            <option value="SELF">自己</option>
                                            <option value="ENEMY">敌人</option>
                                        </select>
                                        <span className="text-slate-600 px-0.5">.</span>
                                        <select 
                                            className="bg-transparent text-slate-300 text-xs font-mono outline-none appearance-none cursor-pointer hover:text-white"
                                            value={eff.formula.factorB.stat}
                                            onChange={(e) => {
                                                const f = { ...eff.formula, factorB: { ...eff.formula.factorB, stat: e.target.value as StatType } };
                                                updateEffect(i, { formula: f });
                                            }}
                                        >
                                            {Object.values(StatType).map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CharacterEditor;