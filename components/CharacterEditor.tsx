import React, { useState } from 'react';
import { CharacterConfig, INITIAL_STATS, StatType, Skill, EffectType, TargetType, Operator, VariableSource } from '../types';
import { Save, Download, Plus, Trash2, Cpu } from 'lucide-react';

interface Props {
    onSave: (char: CharacterConfig) => void;
    existing?: CharacterConfig;
}

const MAX_BASE_POINTS = 10000;
const MAX_PERCENT_POINTS = 100000;

const ALLOWED_PERCENT_STATS = [
    StatType.CRIT_RATE,
    StatType.ARMOR_PEN_PERC,
    StatType.MAGIC_PEN_PERC,
    StatType.LIFESTEAL,
    StatType.OMNIVAMP,
    StatType.MANA_REGEN
];

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

        // Check limit (allow reducing value, block increasing if over limit)
        if (val > currentVal && (currentTotal - currentVal + val) > limit) {
            // Optional: could clamp to limit, but simple return is safer for UX to avoid 'stuck' numbers
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
            <header className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                <div className="flex items-center gap-4">
                    <input 
                        value={char.name} 
                        onChange={e => setChar({...char, name: e.target.value})}
                        className="bg-transparent text-2xl font-bold border-b border-slate-500 focus:border-blue-500 outline-none"
                        placeholder="角色名称"
                    />
                    <input 
                        type="color" 
                        value={char.avatarColor}
                        onChange={e => setChar({...char, avatarColor: e.target.value})}
                        className="w-8 h-8 rounded cursor-pointer border-none"
                    />
                </div>
                <div className="flex gap-2">
                    <button onClick={exportConfig} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors">
                        <Download size={16} /> 导出配置
                    </button>
                    <button onClick={() => onSave(char)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-bold transition-colors">
                        <Save size={16} /> 保存角色
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden gap-6">
                {/* Stats Panel */}
                <div className="w-1/3 flex flex-col bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                    {/* Sticky Header */}
                    <div className="bg-slate-900 p-4 border-b border-slate-700 shadow-md z-10">
                        <h3 className="text-xl font-bold text-blue-400 mb-4">属性分配</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-800 p-2 rounded border border-slate-700">
                                <div className="text-xs text-slate-400 mb-1">固定点数 (Max {MAX_BASE_POINTS})</div>
                                <div className={`text-xl font-mono font-bold ${usedBase > MAX_BASE_POINTS ? 'text-red-500' : 'text-green-400'}`}>
                                    {usedBase}
                                </div>
                            </div>
                            <div className="bg-slate-800 p-2 rounded border border-slate-700">
                                <div className="text-xs text-slate-400 mb-1">百分比加成 (Max {MAX_PERCENT_POINTS}%)</div>
                                <div className={`text-xl font-mono font-bold ${usedPerc > MAX_PERCENT_POINTS ? 'text-red-500' : 'text-green-400'}`}>
                                    {usedPerc}%
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Scrollable List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {Object.values(StatType).map(stat => {
                            const isPercentAllowed = ALLOWED_PERCENT_STATS.includes(stat);
                            return (
                                <div key={stat} className="bg-slate-900/50 p-3 rounded border border-slate-700/50 hover:border-blue-500/50 transition-colors">
                                    <label className="block text-base font-bold text-slate-200 mb-2">{stat}</label>
                                    <div className="flex gap-4 items-center">
                                        <div className="flex-1">
                                            <div className="flex items-center bg-slate-900 border border-slate-600 rounded px-2 hover:border-blue-500 focus-within:border-blue-500 transition-colors">
                                                <span className="text-xs text-slate-500 mr-2 select-none">数值</span>
                                                <input 
                                                    type="number" 
                                                    className="w-full bg-transparent py-1 text-right outline-none font-mono text-yellow-100"
                                                    value={char.stats.base[stat]}
                                                    onChange={(e) => handleStatChange('base', stat, parseInt(e.target.value) || 0)}
                                                    onFocus={(e) => e.target.select()}
                                                    min={0}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            {isPercentAllowed ? (
                                                <div className="flex items-center bg-slate-900 border border-slate-600 rounded px-2 hover:border-purple-500 focus-within:border-purple-500 transition-colors">
                                                     <span className="text-xs text-slate-500 mr-2 select-none">%</span>
                                                     <input 
                                                        type="number" 
                                                        className="w-full bg-transparent py-1 text-right outline-none font-mono text-purple-300"
                                                        value={char.stats.percent[stat]}
                                                        onChange={(e) => handleStatChange('percent', stat, parseInt(e.target.value) || 0)}
                                                        onFocus={(e) => e.target.select()}
                                                        min={0}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center h-full opacity-10">
                                                    <span className="text-slate-500 text-xs font-mono">---</span>
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
                <div className="flex-1 overflow-y-auto pl-2 border-l border-slate-700">
                    <div className="flex justify-between items-center mb-4 sticky top-0 bg-slate-900 py-4 z-10 border-b border-slate-800">
                        <h3 className="text-xl font-bold text-purple-400">技能编程</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">{char.skills.length} / 3</span>
                            <button 
                                onClick={addSkill} 
                                disabled={char.skills.length >= 3}
                                className={`flex items-center gap-2 text-sm px-3 py-1 rounded ${char.skills.length >= 3 ? 'bg-slate-600 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500'}`}
                            >
                                <Plus size={14} /> 添加技能
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6 pb-10">
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
                            <div className="text-center text-slate-500 mt-20">
                                <Cpu size={64} className="mx-auto mb-6 opacity-20" />
                                <p className="text-lg">未安装战斗逻辑模块</p>
                                <p className="text-sm mt-2">点击右上角添加技能以开始编程</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const SkillBlock: React.FC<{ skill: Skill, onChange: (s: Skill) => void, onDelete: () => void }> = ({ skill, onChange, onDelete }) => {
    const addCondition = () => {
        onChange({
            ...skill,
            conditions: [...skill.conditions, { sourceTarget: 'SELF', variable: 'HP%', operator: '<', value: 50 }]
        });
    };

    const addEffect = () => {
        onChange({
            ...skill,
            effects: [...skill.effects, { type: 'DAMAGE_PHYSICAL', target: 'ENEMY', valueFormula: 'SELF.攻击力 * 1.0', manaCost: 10 }]
        });
    };

    return (
        <div className="bg-slate-800 rounded-lg border border-slate-600 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="bg-slate-700 p-3 flex items-center gap-4">
                <div className="w-2 h-8 bg-purple-500 rounded-full"></div>
                <input 
                    className="bg-transparent font-bold outline-none flex-1 text-lg"
                    value={skill.name}
                    onChange={(e) => onChange({...skill, name: e.target.value})}
                    placeholder="技能名称"
                />
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none bg-slate-800 px-2 py-1 rounded border border-slate-600">
                    <input 
                        type="checkbox" 
                        checked={skill.isPassive} 
                        onChange={(e) => onChange({...skill, isPassive: e.target.checked})} 
                    />
                    被动触发
                </label>
                <button onClick={onDelete} className="text-slate-400 hover:text-red-400 transition-colors p-1"><Trash2 size={18} /></button>
            </div>
            
            <div className="p-4 space-y-4">
                {/* Conditions */}
                <div>
                    <div className="text-xs uppercase text-slate-400 mb-2 flex justify-between items-center font-bold">
                        <span>触发条件 (ALL TRUE)</span>
                        <button onClick={addCondition} className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1">+ 添加判定</button>
                    </div>
                    <div className="space-y-2">
                        {skill.conditions.length === 0 && (
                            <div className="text-xs text-slate-600 italic p-2 border border-dashed border-slate-700 rounded">
                                无条件 (总是触发 / 主动释放)
                            </div>
                        )}
                        {skill.conditions.map((cond, i) => (
                            <div key={i} className="flex gap-2 items-center bg-slate-900 p-2 rounded border border-slate-700">
                                <span className="text-yellow-500 font-mono text-sm font-bold">IF</span>
                                <select 
                                    className="bg-slate-800 text-xs rounded p-1 border border-slate-600 outline-none"
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
                                <span className="text-slate-500">.</span>
                                <select 
                                    className="bg-slate-800 text-xs rounded p-1 border border-slate-600 outline-none"
                                    value={cond.variable}
                                    onChange={(e) => {
                                        const nc = [...skill.conditions];
                                        nc[i].variable = e.target.value as VariableSource;
                                        onChange({...skill, conditions: nc});
                                    }}
                                >
                                    <option value="HP">HP</option>
                                    <option value="HP%">HP %</option>
                                    <option value="MANA">Mana</option>
                                    <option value="MANA%">Mana %</option>
                                    <option value="TURN">回合数</option>
                                </select>
                                <select 
                                    className="bg-slate-800 text-xs rounded p-1 border border-slate-600 outline-none font-mono"
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
                                    className="w-20 bg-slate-800 text-xs rounded p-1 border border-slate-600 outline-none font-mono text-center"
                                    value={cond.value}
                                    onChange={(e) => {
                                        const nc = [...skill.conditions];
                                        nc[i].value = parseFloat(e.target.value);
                                        onChange({...skill, conditions: nc});
                                    }}
                                />
                                <button 
                                    className="ml-auto text-slate-600 hover:text-red-400"
                                    onClick={() => {
                                        const nc = [...skill.conditions];
                                        nc.splice(i, 1);
                                        onChange({...skill, conditions: nc});
                                    }}
                                >x</button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Effects */}
                <div>
                    <div className="text-xs uppercase text-slate-400 mb-2 flex justify-between items-center font-bold">
                        <span>执行效果 (SEQUENCE)</span>
                        <button onClick={addEffect} className="text-green-400 hover:text-green-300 text-xs flex items-center gap-1">+ 添加动作</button>
                    </div>
                    <div className="space-y-2">
                        {skill.effects.length === 0 && (
                            <div className="text-xs text-slate-600 italic p-2 border border-dashed border-slate-700 rounded">
                                无效果
                            </div>
                        )}
                        {skill.effects.map((eff, i) => (
                            <div key={i} className="flex flex-col gap-2 bg-slate-900 p-3 rounded border-l-4 border-green-600 shadow-sm">
                                <div className="flex gap-2 items-center">
                                    <span className="text-green-500 font-mono text-sm font-bold">DO</span>
                                    <select 
                                        className="bg-slate-800 text-xs rounded p-1 border border-slate-600 outline-none"
                                        value={eff.type}
                                        onChange={(e) => {
                                            const ne = [...skill.effects];
                                            ne[i].type = e.target.value as EffectType;
                                            onChange({...skill, effects: ne});
                                        }}
                                    >
                                        <option value="DAMAGE_PHYSICAL">造成物理伤害</option>
                                        <option value="DAMAGE_MAGIC">造成魔法伤害</option>
                                        <option value="HEAL">回复生命</option>
                                        <option value="GAIN_MANA">回复法力</option>
                                    </select>
                                    <span className="text-xs text-slate-400">to</span>
                                    <select 
                                        className="bg-slate-800 text-xs rounded p-1 border border-slate-600 outline-none"
                                        value={eff.target}
                                        onChange={(e) => {
                                            const ne = [...skill.effects];
                                            ne[i].target = e.target.value as TargetType;
                                            onChange({...skill, effects: ne});
                                        }}
                                    >
                                        <option value="ENEMY">敌人</option>
                                        <option value="SELF">自己</option>
                                    </select>
                                </div>
                                <div className="flex gap-2 items-center text-xs pl-8">
                                    <span className="text-slate-400">数值公式:</span>
                                    <input 
                                        type="text" 
                                        className="flex-1 bg-slate-800 rounded p-1 font-mono text-yellow-300 border border-slate-600 outline-none focus:border-yellow-500 transition-colors"
                                        placeholder="例如: SELF.攻击力 * 1.5"
                                        value={eff.valueFormula}
                                        onChange={(e) => {
                                            const ne = [...skill.effects];
                                            ne[i].valueFormula = e.target.value;
                                            onChange({...skill, effects: ne});
                                        }}
                                    />
                                </div>
                                <div className="flex gap-2 items-center text-xs pl-8">
                                    <span className="text-slate-400">蓝耗:</span>
                                    <input 
                                        type="number" 
                                        className="w-16 bg-slate-800 rounded p-1 border border-slate-600 outline-none text-center"
                                        value={eff.manaCost}
                                        onChange={(e) => {
                                            const ne = [...skill.effects];
                                            ne[i].manaCost = parseFloat(e.target.value);
                                            onChange({...skill, effects: ne});
                                        }}
                                    />
                                    <button 
                                        className="ml-auto text-red-400 text-xs hover:text-red-300 underline"
                                        onClick={() => {
                                            const ne = [...skill.effects];
                                            ne.splice(i, 1);
                                            onChange({...skill, effects: ne});
                                        }}
                                    >删除动作</button>
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