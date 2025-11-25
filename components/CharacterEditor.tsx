

import React, { useState, useEffect, useRef } from 'react';
import { CharacterConfig, INITIAL_STATS, StatType, Skill, EffectType, TargetType, Operator, VariableSource, FormulaOp, Effect, ONLY_PERCENT_STATS, ONLY_BASE_STATS, CharacterStats, DYNAMIC_STATS, SkillLogic, Condition, EffectVisual, VisualShape } from '../types';
import { Save, Download, Plus, Trash2, Cpu, Zap, Activity, ArrowRight, ArrowLeft, GitBranch, Palette, Eye } from 'lucide-react';
import { calculateManaCost, hasDynamicStats } from '../utils/gameEngine';
import * as PIXI from 'pixi.js';

interface Props {
    onSave: (char: CharacterConfig) => void;
    existing?: CharacterConfig;
    onBack: () => void;
}

const MAX_BASE_POINTS = 10000;
const MAX_PERCENT_POINTS = 1000;

// Helper for generating IDs
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15);
};

// --- Enhanced Token Styles ---
const baseSelectClass = "appearance-none outline-none font-mono text-xs px-3 py-1.5 rounded cursor-pointer transition-all border shadow-sm text-center font-bold";

const styles = {
    target: `${baseSelectClass} bg-indigo-950/50 border-indigo-700 text-indigo-300 hover:bg-indigo-900 hover:border-indigo-500`,
    variable: `${baseSelectClass} bg-sky-950/50 border-sky-700 text-sky-300 hover:bg-sky-900 hover:border-sky-500`,
    operator: `${baseSelectClass} bg-orange-950/50 border-orange-700 text-orange-400 hover:bg-orange-900 hover:border-orange-500 min-w-[3rem]`,
    action: `${baseSelectClass} bg-emerald-950/50 border-emerald-700 text-emerald-400 hover:bg-emerald-900 hover:border-emerald-500`,
    input: "bg-slate-950/50 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-center text-yellow-200 w-20 focus:border-yellow-500 outline-none transition-colors",
};

const CharacterEditor: React.FC<Props> = ({ onSave, existing, onBack }) => {
    const [char, setChar] = useState<CharacterConfig>(existing || {
        id: generateId(),
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
                id: generateId(),
                name: '新技能',
                isPassive: false, 
                logic: [{
                    condition: undefined, // Default Always
                    effect: { 
                        type: 'DAMAGE_PHYSICAL', 
                        target: 'ENEMY', 
                        formula: {
                            factorA: { target: 'SELF', stat: StatType.AD },
                            operator: '*',
                            factorB: { target: 'SELF', stat: StatType.CRIT_RATE } 
                        },
                        visual: { color: '#ef4444', shape: 'ORB' }
                    }
                }]
            }]
        });
    };

    const updateSkill = (index: number, skill: Skill) => {
        const newSkills = [...char.skills];
        newSkills[index] = skill;
        setChar({ ...char, skills: newSkills });
    };

    const handleSave = () => {
        onSave(char);
    };

    const exportConfig = () => {
        try {
            const json = JSON.stringify(char);
            const bytes = new TextEncoder().encode(json);
            const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
            const b64 = btoa(binString);
            
            const blob = new Blob([b64], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${char.name.replace(/\s/g, '_')}.code`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Export failed", e);
            alert("导出失败：包含不支持的字符");
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-900 text-white p-4">
            <header className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4 bg-slate-900">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all border border-slate-700">
                        <ArrowLeft size={20} />
                    </button>
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
                    <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40">
                        <Save size={16} /> 保存角色
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden gap-6">
                {/* Stats Panel */}
                <div className="w-[400px] flex flex-col bg-slate-800/50 rounded-xl border border-slate-700/50 backdrop-blur-sm overflow-hidden shadow-xl">
                    <div className="bg-slate-800/80 p-5 border-b border-slate-700 shadow-md z-10">
                        <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2 retro-font">
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
                                <div className="text-xs text-slate-400 mb-1 font-bold uppercase tracking-wider">百分比点数</div>
                                <div className={`text-2xl font-mono font-bold ${usedPerc > MAX_PERCENT_POINTS ? 'text-red-500' : 'text-purple-400'}`}>
                                    {usedPerc}<span className="text-sm text-slate-600">/{MAX_PERCENT_POINTS}%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {Object.values(StatType)
                            .filter(stat => !DYNAMIC_STATS.includes(stat)) // Exclude dynamic stats from editor
                            .map(stat => {
                            const isPercentOnly = ONLY_PERCENT_STATS.includes(stat);
                            const isBaseOnly = ONLY_BASE_STATS.includes(stat);
                            
                            return (
                                <div key={stat} className="bg-slate-900/40 p-3 rounded-lg border border-slate-700/30 hover:border-slate-500/50 transition-all group">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className={`text-sm font-bold transition-colors ${stat === StatType.SPEED ? 'text-yellow-400' : 'text-slate-300'}`}>
                                            {stat} {stat === StatType.SPEED && '(决定先手)'}
                                        </label>
                                    </div>
                                    <div className="flex gap-3 items-center">
                                        {/* Base Input */}
                                        <div className="flex-1 relative">
                                            {!isPercentOnly ? (
                                                <>
                                                    <input 
                                                        type="number" 
                                                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-right outline-none font-mono text-sm text-yellow-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
                                                        value={char.stats.base[stat]}
                                                        onChange={(e) => handleStatChange('base', stat, parseInt(e.target.value) || 0)}
                                                        onFocus={(e) => e.target.select()}
                                                        min={0}
                                                    />
                                                    <span className="absolute left-2 top-1.5 text-xs text-slate-600 select-none pointer-events-none">基础</span>
                                                </>
                                            ) : (
                                                <div className="h-full flex items-center justify-center opacity-30 bg-slate-950/50 rounded border border-transparent">
                                                     <span className="text-[10px] text-slate-500">固定值不可用</span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Percent Input */}
                                        <div className="flex-1 relative">
                                            {!isBaseOnly ? (
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
                                                <div className="h-full flex items-center justify-center opacity-30 bg-slate-950/50 rounded border border-transparent">
                                                     <span className="text-[10px] text-slate-500">百分比不可用</span>
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
                        <h3 className="text-xl font-bold text-purple-400 flex items-center gap-2 retro-font">
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
                                stats={char.stats}
                                onChange={(s) => updateSkill(idx, s)} 
                                onDelete={() => {
                                    const ns = [...char.skills];
                                    ns.splice(idx, 1);
                                    setChar({ ...char, skills: ns });
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const VisualPreview: React.FC<{ type: EffectType, visual: EffectVisual }> = ({ type, visual }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const particlesRef = useRef<PIXI.Graphics[]>([]);

    useEffect(() => {
        const init = async () => {
             if (!containerRef.current) return;
             
             // Destroy old app if exists
             if (appRef.current) {
                 appRef.current.destroy({ removeView: true });
             }

             const app = new PIXI.Application();
             await app.init({ width: 100, height: 100, backgroundColor: 0x0f172a, antialias: true });
             if (containerRef.current) {
                 containerRef.current.appendChild(app.canvas);
             }
             appRef.current = app;

             // Dummy Character
             const char = new PIXI.Graphics();
             char.rect(-10, -20, 20, 40).fill(0x64748b);
             char.position.set(50, 80);
             app.stage.addChild(char);

             let frame = 0;
             const hexColor = parseInt(visual.color.replace('#', '0x'));

             app.ticker.add(() => {
                 frame++;
                 
                 if (type === 'INCREASE_STAT' || type === 'DECREASE_STAT') {
                     // Aura Effect
                     if (frame % 10 === 0) {
                        const p = new PIXI.Graphics();
                        p.rect(0, 0, 4, 4).fill(hexColor);
                        const offset = (Math.random() - 0.5) * 20;
                        p.x = 50 + offset;
                        
                        if (type === 'INCREASE_STAT') {
                             p.y = 100; // Start bottom
                             (p as any).vy = -2; // Move up
                        } else {
                             p.y = 50; // Start top
                             (p as any).vy = 2; // Move down
                        }
                        
                        app.stage.addChild(p);
                        particlesRef.current.push(p);
                     }

                     for (let i = particlesRef.current.length - 1; i >= 0; i--) {
                         const p = particlesRef.current[i];
                         p.y += (p as any).vy;
                         p.alpha -= 0.05;
                         if (p.alpha <= 0) {
                             app.stage.removeChild(p);
                             p.destroy();
                             particlesRef.current.splice(i, 1);
                         }
                     }
                 } else {
                     // Projectile Effect
                     // Only spawn one periodically
                     if (frame % 60 === 0) {
                         const p = new PIXI.Graphics();
                         if (visual.shape === 'SQUARE') p.rect(-6, -6, 12, 12).fill(hexColor);
                         else if (visual.shape === 'STAR') p.star(0, 0, 5, 8).fill(hexColor);
                         else if (visual.shape === 'BEAM') p.rect(-15, -4, 30, 8).fill(hexColor);
                         else if (visual.shape === 'ORB') {
                             p.circle(0, 0, 6).fill(hexColor);
                             p.circle(0, 0, 9).stroke({ color: hexColor, alpha: 0.5, width: 2 });
                         }
                         else p.circle(0, 0, 6).fill(hexColor);
                         
                         p.x = 10;
                         p.y = 50;
                         app.stage.addChild(p);
                         particlesRef.current.push(p);
                     }
                     
                     for (let i = particlesRef.current.length - 1; i >= 0; i--) {
                         const p = particlesRef.current[i];
                         p.x += 2;
                         p.rotation += 0.1;
                         if (p.x > 110) {
                             app.stage.removeChild(p);
                             p.destroy();
                             particlesRef.current.splice(i, 1);
                         }
                     }
                 }
             });
        };

        init();

        return () => {
            if (appRef.current) {
                appRef.current.destroy({ removeView: true });
                appRef.current = null;
            }
        };
    }, [visual, type]);

    return (
        <div ref={containerRef} className="w-[100px] h-[100px] rounded border border-slate-700 overflow-hidden bg-slate-950 shrink-0"></div>
    );
};

const SkillBlock: React.FC<{ skill: Skill, stats: CharacterStats, onChange: (s: Skill) => void, onDelete: () => void }> = ({ skill, stats, onChange, onDelete }) => {
    const [manaCost, setManaCost] = useState(0);
    const [isDynamic, setIsDynamic] = useState(false);
    const [expandedVisual, setExpandedVisual] = useState<number | null>(null);

    // Recalculate mana cost when skill OR stats change.
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
                    visual: { color: '#ef4444', shape: 'ORB' }
                }
            }]
        });
    };

    const updateBranch = (index: number, updates: Partial<SkillLogic>) => {
        const newLogic = [...skill.logic];
        newLogic[index] = { ...newLogic[index], ...updates };
        onChange({ ...skill, logic: newLogic });
    };

    // Helper to update specific parts of condition/effect easily
    const updateEffect = (branchIndex: number, updates: Partial<Effect>) => {
        const branch = skill.logic[branchIndex];
        // Safety check for targetStat
        if ((updates.type === 'INCREASE_STAT' || updates.type === 'DECREASE_STAT') && !branch.effect.targetStat && !updates.targetStat) {
            updates.targetStat = StatType.CURRENT_HP;
        }
        
        // Safety check for visual initialization
        let newVisual = updates.visual || branch.effect.visual || { color: '#ffffff', shape: 'CIRCLE' };
        
        // Auto-set default visual for type change if not manually set before
        if (updates.type && !updates.visual) {
             if (updates.type === 'INCREASE_STAT') newVisual = { color: '#4ade80', shape: 'CIRCLE' };
             else if (updates.type === 'DECREASE_STAT') newVisual = { color: '#ef4444', shape: 'CIRCLE' };
             else if (updates.type === 'DAMAGE_MAGIC') newVisual = { color: '#a855f7', shape: 'ORB' };
             else newVisual = { color: '#ef4444', shape: 'SQUARE' };
        }

        updateBranch(branchIndex, { effect: { ...branch.effect, ...updates, visual: newVisual } });
    };

    const updateVisual = (branchIndex: number, updates: Partial<EffectVisual>) => {
        const branch = skill.logic[branchIndex];
        const currentVisual = branch.effect.visual || { color: '#ffffff', shape: 'CIRCLE' };
        updateBranch(branchIndex, { effect: { ...branch.effect, visual: { ...currentVisual, ...updates } } });
    };

    const toggleCondition = (branchIndex: number) => {
        const branch = skill.logic[branchIndex];
        if (branch.condition) {
            // Remove condition (Make Always)
            updateBranch(branchIndex, { condition: undefined });
        } else {
            // Add default condition
            updateBranch(branchIndex, { 
                condition: { sourceTarget: 'SELF', variable: 'HP%', operator: '<', value: 50 } 
            });
        }
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
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">法力消耗</span>
                        <div className="flex items-center gap-1">
                            <span className={`font-mono font-bold text-lg ${manaCost > 1000 ? 'text-red-500 animate-pulse' : manaCost > 100 ? 'text-red-400' : 'text-blue-400'}`}>
                                {manaCost}
                            </span>
                            {isDynamic && <span className="text-xs text-yellow-400 font-bold">+ 战时</span>}
                        </div>
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
            
            <div className="p-5 space-y-4 bg-slate-900/50">
                {/* Logic Branches */}
                {skill.logic.map((branch, i) => {
                    const visual = branch.effect.visual || { color: '#ffffff', shape: 'CIRCLE' };
                    const isDamage = branch.effect.type.includes('DAMAGE');
                    
                    return (
                    <div key={i} className="relative bg-slate-950/80 rounded-xl border border-slate-800 shadow-sm overflow-hidden hover:border-slate-700 transition-all">
                         <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-500 to-green-500"></div>
                         
                         {/* Header / Toolbar */}
                         <div className="flex justify-between items-center px-4 py-2 border-b border-slate-900 bg-slate-900/50">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-2">
                                <GitBranch size={12}/> Logic Block #{i + 1}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setExpandedVisual(expandedVisual === i ? null : i)}
                                    className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded transition-colors ${expandedVisual === i ? 'bg-blue-900 text-blue-300' : 'bg-slate-800 text-slate-500 hover:text-blue-300'}`}
                                >
                                    <Palette size={12}/> 特效配置
                                </button>
                                <button 
                                    className="text-slate-600 hover:text-red-400 p-1 rounded hover:bg-red-950/30 transition-all"
                                    onClick={() => {
                                        const nl = [...skill.logic];
                                        nl.splice(i, 1);
                                        onChange({...skill, logic: nl});
                                    }}
                                >
                                    <Trash2 size={14}/>
                                </button>
                            </div>
                         </div>

                         <div className="p-3 grid gap-3">
                            {/* IF Condition */}
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => toggleCondition(i)}
                                    className={`text-xs font-mono font-bold px-2 py-1 rounded transition-colors ${branch.condition ? 'bg-yellow-950 text-yellow-500 border border-yellow-800' : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-yellow-900/30 hover:text-yellow-400'}`}
                                >
                                    IF
                                </button>
                                
                                {branch.condition ? (
                                    <div className="flex flex-wrap gap-2 items-center animate-in fade-in slide-in-from-left-2 duration-200">
                                        <select 
                                            className={styles.target}
                                            value={branch.condition.sourceTarget}
                                            onChange={(e) => updateBranch(i, { condition: { ...branch.condition!, sourceTarget: e.target.value as TargetType } })}
                                        >
                                            <option value="SELF">自己</option>
                                            <option value="ENEMY">敌人</option>
                                        </select>
                                        <span className="text-slate-600 font-mono">.</span>
                                        <select 
                                            className={styles.variable}
                                            value={branch.condition.variable}
                                            onChange={(e) => updateBranch(i, { condition: { ...branch.condition!, variable: e.target.value as VariableSource } })}
                                        >
                                            <option value="HP">当前生命值</option>
                                            <option value="HP%">当前生命百分比</option>
                                            <option value="HP_LOST">已损生命值</option>
                                            <option value="HP_LOST%">已损生命百分比</option>
                                            <option value="MANA">当前法力</option>
                                            <option value="MANA%">法力百分比</option>
                                            <option value="TURN">当前回合</option>
                                        </select>
                                        <select 
                                            className={styles.operator}
                                            value={branch.condition.operator}
                                            onChange={(e) => updateBranch(i, { condition: { ...branch.condition!, operator: e.target.value as Operator } })}
                                        >
                                            {['>', '<', '==', '>=', '<=', '!='].map(op => <option key={op} value={op}>{op}</option>)}
                                        </select>
                                        <input 
                                            type="number" 
                                            className={styles.input}
                                            value={branch.condition.value}
                                            onChange={(e) => updateBranch(i, { condition: { ...branch.condition!, value: parseFloat(e.target.value) } })}
                                        />
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-600 font-mono italic">
                                        [ Always True ] <span className="text-slate-700">- Click IF to add condition</span>
                                    </div>
                                )}
                            </div>

                            {/* THEN Effect */}
                            <div className="flex flex-wrap items-center gap-2 pl-8 relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 border-l-2 border-b-2 border-slate-800 rounded-bl-lg"></div>
                                <span className="text-green-600 font-mono text-xs font-bold px-2 py-1 bg-green-950/20 border border-green-900/50 rounded">DO</span>
                                
                                <select 
                                    className={styles.action}
                                    value={branch.effect.type}
                                    onChange={(e) => updateEffect(i, { type: e.target.value as EffectType })}
                                >
                                    <option value="DAMAGE_PHYSICAL">造成物理伤害</option>
                                    <option value="DAMAGE_MAGIC">造成魔法伤害</option>
                                    <option value="INCREASE_STAT">增加</option>
                                    <option value="DECREASE_STAT">减少</option>
                                </select>
                                
                                {(branch.effect.type === 'INCREASE_STAT' || branch.effect.type === 'DECREASE_STAT') ? (
                                    <>
                                        <select 
                                            className={styles.target}
                                            value={branch.effect.target}
                                            onChange={(e) => updateEffect(i, { target: e.target.value as TargetType })}
                                        >
                                            <option value="ENEMY">敌人</option>
                                            <option value="SELF">自己</option>
                                        </select>
                                        <span className="text-slate-500 text-xs">的</span>
                                        <select 
                                            className={styles.variable}
                                            value={branch.effect.targetStat || StatType.CURRENT_HP}
                                            onChange={(e) => updateEffect(i, { targetStat: e.target.value as StatType })}
                                        >
                                            <option value={StatType.CURRENT_HP}>当前生命值 (Heal/Dmg)</option>
                                            <option value={StatType.CURRENT_MANA}>当前法力值 (MP)</option>
                                            {Object.values(StatType)
                                                .filter(s => !DYNAMIC_STATS.includes(s) && s !== StatType.CURRENT_MANA) 
                                                .map(s => <option key={s} value={s}>{s}</option>)
                                            }
                                        </select>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-slate-500 text-xs">对</span>
                                        <select 
                                            className={styles.target}
                                            value={branch.effect.target}
                                            onChange={(e) => updateEffect(i, { target: e.target.value as TargetType })}
                                        >
                                            <option value="ENEMY">敌人</option>
                                            <option value="SELF">自己</option>
                                        </select>
                                    </>
                                )}
                                
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-slate-500 font-mono">=</span>
                                    {/* Formula Left */}
                                    <div className="flex items-center bg-slate-900/50 rounded border border-slate-800 px-1 py-0.5">
                                        <select 
                                            className="bg-transparent text-indigo-300 text-xs font-mono outline-none appearance-none cursor-pointer hover:text-white"
                                            value={branch.effect.formula.factorA.target}
                                            onChange={(e) => {
                                                const f = { ...branch.effect.formula, factorA: { ...branch.effect.formula.factorA, target: e.target.value as TargetType } };
                                                updateEffect(i, { formula: f });
                                            }}
                                        >
                                            <option value="SELF">自己</option>
                                            <option value="ENEMY">敌人</option>
                                        </select>
                                        <span className="text-slate-600 px-0.5">.</span>
                                        <select 
                                            className="bg-transparent text-slate-300 text-xs font-mono outline-none appearance-none cursor-pointer hover:text-white"
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
                                        className={styles.operator}
                                        value={branch.effect.formula.operator}
                                        onChange={(e) => {
                                            const f = { ...branch.effect.formula, operator: e.target.value as FormulaOp };
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
                                            value={branch.effect.formula.factorB.target}
                                            onChange={(e) => {
                                                const f = { ...branch.effect.formula, factorB: { ...branch.effect.formula.factorB, target: e.target.value as TargetType } };
                                                updateEffect(i, { formula: f });
                                            }}
                                        >
                                            <option value="SELF">自己</option>
                                            <option value="ENEMY">敌人</option>
                                        </select>
                                        <span className="text-slate-600 px-0.5">.</span>
                                        <select 
                                            className="bg-transparent text-slate-300 text-xs font-mono outline-none appearance-none cursor-pointer hover:text-white"
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

                            {/* Visual Configuration Panel */}
                            {expandedVisual === i && (
                                <div className="mt-2 pl-8 flex gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex-1 bg-slate-900 p-3 rounded border border-slate-700 flex flex-col gap-3">
                                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                            <span className="text-xs font-bold text-slate-400">视觉特效</span>
                                        </div>
                                        
                                        <div className="flex items-center gap-3">
                                            <label className="text-xs text-slate-500">颜色</label>
                                            <input 
                                                type="color" 
                                                value={visual.color}
                                                onChange={(e) => updateVisual(i, { color: e.target.value })}
                                                className="w-16 h-6 rounded cursor-pointer border-none bg-transparent"
                                            />
                                            <span className="text-xs font-mono text-slate-500">{visual.color}</span>
                                        </div>

                                        {isDamage && (
                                            <div className="flex items-center gap-3">
                                                <label className="text-xs text-slate-500">形状</label>
                                                <select 
                                                    className={styles.variable}
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
                                        
                                        {!isDamage && (
                                            <div className="text-xs text-slate-600 italic mt-1">
                                                {branch.effect.type === 'INCREASE_STAT' ? '向上流动的光环粒子' : '向下坠落的光环粒子'}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Live Preview */}
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] text-slate-500 text-center uppercase">Preview</span>
                                        <VisualPreview type={branch.effect.type} visual={visual} />
                                    </div>
                                </div>
                            )}
                         </div>
                    </div>
                );})}

                {skill.logic.length < 3 ? (
                    <button 
                        onClick={addBranch}
                        className="w-full py-3 border-2 border-dashed border-slate-800 rounded-xl text-slate-500 hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-950/20 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus size={16}/> 添加逻辑块 ({skill.logic.length}/3)
                    </button>
                ) : (
                    <div className="text-center text-xs text-slate-600 py-2">
                        已达到逻辑块上限 (3/3)
                    </div>
                )}
            </div>
        </div>
    );
};

export default CharacterEditor;