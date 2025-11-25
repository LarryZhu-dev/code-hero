import React, { useState, useEffect, useRef } from 'react';
import { CharacterConfig, INITIAL_STATS, StatType, Skill, EffectType, TargetType, Operator, VariableSource, FormulaOp, Effect, ONLY_PERCENT_STATS, ONLY_BASE_STATS, CharacterStats, DYNAMIC_STATS, SkillLogic, EffectVisual, VisualShape, AppearanceConfig, HeadType, BodyType, WeaponType } from '../types';
import { Save, Download, Plus, Trash2, Cpu, Zap, Activity, ArrowLeft, Palette, Eye, Shirt, Sword } from 'lucide-react';
import { calculateManaCost, hasDynamicStats } from '../utils/gameEngine';
import { classifyHero, getDefaultAppearance, getRoleDisplayName, drawBody, drawWeapon } from '../utils/heroSystem';
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

const HeroPreview: React.FC<{ appearance: AppearanceConfig }> = ({ appearance }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const appearanceRef = useRef(appearance);

    // Keep appearance ref fresh for the ticker
    useEffect(() => {
        appearanceRef.current = appearance;
    }, [appearance]);

    useEffect(() => {
        let isCancelled = false;

        const init = async () => {
            if (!containerRef.current || appRef.current) return;

            const app = new PIXI.Application();
            await app.init({ width: 200, height: 200, backgroundColor: 0x0f172a, antialias: false });
            
            if (isCancelled) {
                app.destroy();
                return;
            }

            if (containerRef.current) {
                containerRef.current.appendChild(app.canvas);
            }
            appRef.current = app;

            // Construct Scene Graph similar to PixelEntity for accurate preview
            const mainContainer = new PIXI.Container();
            mainContainer.x = 100;
            mainContainer.y = 120; // Center vertical
            mainContainer.scale.set(2); // Scale 2 fits 200px box perfectly without clipping
            app.stage.addChild(mainContainer);

            // Shadow
            const shadow = new PIXI.Graphics();
            shadow.ellipse(0, 0, 30, 8).fill({ color: 0x000000, alpha: 0.3 });
            shadow.y = 10;
            mainContainer.addChild(shadow);

            const bodyGroup = new PIXI.Container();
            mainContainer.addChild(bodyGroup);
            
            const handGroup = new PIXI.Container();
            handGroup.x = -8; // Shoulder X (approx -2 * 4)
            handGroup.y = -36; // Shoulder Y (approx -9 * 4)
            mainContainer.addChild(handGroup);

            const bodyGraphics = new PIXI.Graphics();
            bodyGroup.addChild(bodyGraphics);

            const weaponGraphics = new PIXI.Graphics();
            handGroup.addChild(weaponGraphics);

            let time = 0;
            app.ticker.add(() => {
                time++;
                const appConfig = appearanceRef.current;
                
                // Redraw every frame to handle color changes instantly without React re-mounts
                drawBody(bodyGraphics, appConfig);
                drawWeapon(weaponGraphics, appConfig);

                // Weapon Position Logic
                if (appConfig.weapon === 'SWORD' || appConfig.weapon === 'AXE' || appConfig.weapon === 'HAMMER') {
                   weaponGraphics.rotation = 0.5;
                   weaponGraphics.x = 8;
                } else if (appConfig.weapon === 'BOW') {
                    weaponGraphics.x = 16;
                } else {
                    weaponGraphics.rotation = 0;
                    weaponGraphics.x = 0;
                }
                
                // Idle Animation
                const yOffset = Math.sin(time * 0.1) * 4;
                mainContainer.y = 120 + yOffset;
                shadow.scale.set(1 + Math.sin(time * 0.1) * 0.1);
                
                const wType = appConfig.weapon;
                if (wType === 'STAFF' || wType === 'BOW') {
                   handGroup.rotation = Math.sin(time * 0.05) * 0.1;
                } else {
                    handGroup.rotation = Math.sin(time * 0.1) * 0.05;
                }
            });
        };
        init();

        return () => {
            isCancelled = true;
            if (appRef.current) {
                // Safe destroy: remove view to prevent context loss issues
                appRef.current.destroy({ removeView: true });
                appRef.current = null;
            }
        };
    }, []);

    return <div ref={containerRef} className="w-[200px] h-[200px] rounded border border-slate-700 bg-slate-950 shadow-inner"></div>;
};

const VisualPreview: React.FC<{ type: EffectType, visual: EffectVisual }> = ({ type, visual }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const propsRef = useRef({ type, visual });

    useEffect(() => {
        propsRef.current = { type, visual };
    }, [type, visual]);

    useEffect(() => {
        let isCancelled = false;
        
        const init = async () => {
             if (!containerRef.current || appRef.current) return;

             const app = new PIXI.Application();
             await app.init({ width: 240, height: 120, backgroundColor: 0x0f172a, antialias: true });
             
             if (isCancelled) {
                 app.destroy();
                 return;
             }

             if (containerRef.current) containerRef.current.appendChild(app.canvas);
             appRef.current = app;

             const particles = new PIXI.Container();
             app.stage.addChild(particles);
             let frame = 0;
             app.ticker.add(() => {
                 frame++;
                 const { type: t, visual: v } = propsRef.current;
                 
                 if (frame % 60 === 0) {
                     particles.removeChildren(); // Simple loop, clear old
                     const p = new PIXI.Graphics();
                     const hex = parseInt(v.color.replace('#', '0x'));
                     
                     if (t.includes('DAMAGE')) {
                        if (v.shape === 'SQUARE') p.rect(0,0,10,10).fill(hex);
                        else p.circle(0,0,5).fill(hex);
                        p.x = 20; p.y = 60;
                        (p as any).vx = 5;
                     } else {
                        p.circle(0,0,3).fill(hex);
                        p.x = 120; p.y = 60;
                        (p as any).vy = -1;
                     }
                     particles.addChild(p);
                 }
                 
                 particles.children.forEach((p: any) => {
                     if (p.vx) p.x += p.vx;
                     if (p.vy) p.y += p.vy;
                 });
             });
        };
        init();
        return () => { 
            isCancelled = true;
            if (appRef.current) {
                appRef.current.destroy({ removeView: true });
                appRef.current = null;
            }
        };
    }, []);

    return <div ref={containerRef} className="w-[240px] h-[120px] rounded border border-slate-700 overflow-hidden bg-slate-950 shrink-0 mx-auto"></div>;
};

const CharacterEditor: React.FC<Props> = ({ onSave, existing, onBack }) => {
    const [char, setChar] = useState<CharacterConfig>(existing || {
        id: generateId(),
        name: '新角色',
        avatarColor: '#3b82f6',
        stats: JSON.parse(JSON.stringify(INITIAL_STATS)),
        skills: []
    });

    // Merged Tabs: CORE (Stats + Skills) and VISUAL (Appearance)
    const [activeTab, setActiveTab] = useState<'CORE' | 'VISUAL'>('CORE');

    // Auto-update Role and Appearance defaults on Mount/Stat Change
    useEffect(() => {
        const role = classifyHero(char);
        const currentApp = char.appearance || getDefaultAppearance(role, char.avatarColor);
        
        // Only update if changed to avoid loop (though role calc is pure)
        if (char.role !== role) {
            setChar(prev => ({ ...prev, role }));
        }
        
        // If appearance is missing, set default
        if (!char.appearance) {
             setChar(prev => ({ ...prev, appearance: currentApp }));
        }
    }, [char.stats, char.avatarColor]);

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
            }]
        });
    };

    const updateSkill = (index: number, skill: Skill) => {
        const newSkills = [...char.skills];
        newSkills[index] = skill;
        setChar({ ...char, skills: newSkills });
    };

    const handleSave = () => {
        const finalChar = {
            ...char,
            appearance: {
                ...char.appearance!,
                themeColor: char.avatarColor
            }
        };
        onSave(finalChar);
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
            <header className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4 bg-slate-900 shrink-0">
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
                    
                    <div className="px-3 py-1 rounded bg-slate-800 border border-slate-600 text-xs font-mono text-slate-300">
                        {char.role ? getRoleDisplayName(char.role) : '未定级'}
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={exportConfig} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-sm transition-all hover:shadow-lg">
                        <Download size={16} /> 导出
                    </button>
                    <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40">
                        <Save size={16} /> 保存角色
                    </button>
                </div>
            </header>

            {/* TABS */}
            <div className="flex gap-4 mb-4 border-b border-slate-800 shrink-0">
                <button 
                    onClick={() => setActiveTab('CORE')}
                    className={`pb-2 px-4 font-bold text-sm transition-colors relative ${activeTab === 'CORE' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <div className="flex items-center gap-2"><Activity size={16}/> 核心配置 (属性 & 技能)</div>
                    {activeTab === 'CORE' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('VISUAL')}
                    className={`pb-2 px-4 font-bold text-sm transition-colors relative ${activeTab === 'VISUAL' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <div className="flex items-center gap-2"><Shirt size={16}/> 外观定制</div>
                    {activeTab === 'VISUAL' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-400"></div>}
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                
                {/* --- CORE PANEL (Stats & Skills) --- */}
                {activeTab === 'CORE' && (
                <div className="w-full h-full flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    
                    {/* STATS COLUMN */}
                    <div className="w-5/12 flex flex-col bg-slate-800/50 rounded-xl border border-slate-700/50 backdrop-blur-sm overflow-hidden shadow-xl">
                        <div className="bg-slate-800/80 p-5 border-b border-slate-700 shadow-md z-10">
                             <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-1 opacity-10"><Cpu size={40}/></div>
                                    <div className="text-xs text-slate-400 mb-1 font-bold uppercase tracking-wider">基础点数</div>
                                    <div className={`text-xl font-mono font-bold ${usedBase > MAX_BASE_POINTS ? 'text-red-500' : 'text-white'}`}>
                                        {usedBase}<span className="text-xs text-slate-600">/{MAX_BASE_POINTS}</span>
                                    </div>
                                </div>
                                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-1 opacity-10"><Zap size={40}/></div>
                                    <div className="text-xs text-slate-400 mb-1 font-bold uppercase tracking-wider">百分比点数</div>
                                    <div className={`text-xl font-mono font-bold ${usedPerc > MAX_PERCENT_POINTS ? 'text-red-500' : 'text-purple-400'}`}>
                                        {usedPerc}<span className="text-xs text-slate-600">/{MAX_PERCENT_POINTS}%</span>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-slate-900 p-2 rounded border border-slate-700 text-center">
                                <span className="text-xs text-slate-500 uppercase mr-2">定位</span>
                                <span className="text-sm font-bold text-yellow-400 retro-font">{getRoleDisplayName(char.role || 'UNKNOWN')}</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 gap-2 custom-scrollbar">
                            {Object.values(StatType)
                                .filter(stat => !DYNAMIC_STATS.includes(stat)) 
                                .map(stat => {
                                const isPercentOnly = ONLY_PERCENT_STATS.includes(stat);
                                const isBaseOnly = ONLY_BASE_STATS.includes(stat);
                                
                                return (
                                    <div key={stat} className="bg-slate-900/40 p-2 rounded border border-slate-700/30 hover:border-slate-500/50 transition-all flex items-center gap-2">
                                        <div className="w-24 text-right">
                                            <label className={`text-xs font-bold transition-colors ${stat === StatType.SPEED ? 'text-yellow-400' : 'text-slate-300'}`}>
                                                {stat}
                                            </label>
                                        </div>
                                        <div className="flex gap-2 flex-1">
                                            {/* Base Input */}
                                            <div className="flex-1 relative">
                                                {!isPercentOnly ? (
                                                    <>
                                                        <input 
                                                            type="number" 
                                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right outline-none font-mono text-xs text-yellow-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
                                                            value={char.stats.base[stat]}
                                                            onChange={(e) => handleStatChange('base', stat, parseInt(e.target.value) || 0)}
                                                            onFocus={(e) => e.target.select()}
                                                            min={0}
                                                        />
                                                        <span className="absolute left-1 top-1 text-[10px] text-slate-600 select-none pointer-events-none">B</span>
                                                    </>
                                                ) : (
                                                    <div className="h-full flex items-center justify-center opacity-30 bg-slate-950/50 rounded border border-transparent">
                                                         <span className="text-[10px] text-slate-500">-</span>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Percent Input */}
                                            <div className="flex-1 relative">
                                                {!isBaseOnly ? (
                                                    <>
                                                        <input 
                                                            type="number" 
                                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right outline-none font-mono text-xs text-purple-300 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all"
                                                            value={char.stats.percent[stat]}
                                                            onChange={(e) => handleStatChange('percent', stat, parseInt(e.target.value) || 0)}
                                                            onFocus={(e) => e.target.select()}
                                                            min={0}
                                                        />
                                                        <span className="absolute left-1 top-1 text-[10px] text-slate-600 select-none pointer-events-none">%</span>
                                                    </>
                                                ) : (
                                                    <div className="h-full flex items-center justify-center opacity-30 bg-slate-950/50 rounded border border-transparent">
                                                         <span className="text-[10px] text-slate-500">-</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* SKILLS COLUMN */}
                    <div className="w-7/12 flex flex-col bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
                         <div className="flex justify-between items-center p-5 border-b border-slate-700 bg-slate-900/50 backdrop-blur z-10">
                            <h3 className="text-xl font-bold text-green-400 flex items-center gap-2 retro-font">
                                <Cpu size={24} /> 技能逻辑
                            </h3>
                            <div className="flex items-center gap-3">
                                 <div className="flex gap-1">
                                    {Array.from({length: 3}).map((_, i) => (
                                        <div key={i} className={`w-2 h-2 rounded-full ${i < char.skills.length ? 'bg-green-500' : 'bg-slate-700'}`}></div>
                                    ))}
                                </div>
                                <button 
                                    onClick={addSkill} 
                                    disabled={char.skills.length >= 3}
                                    className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-bold transition-all shadow-lg ${char.skills.length >= 3 ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white hover:shadow-green-900/30'}`}
                                >
                                    <Plus size={14} /> 新建
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
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
                            {char.skills.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                                    <Cpu size={48} className="opacity-20"/>
                                    <p>点击上方按钮添加技能</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                )}

                {/* --- VISUAL PANEL --- */}
                {activeTab === 'VISUAL' && char.appearance && (
                    <div className="w-full h-full flex gap-8 p-8 animate-in fade-in slide-in-from-right duration-300 items-start">
                        {/* Preview Box */}
                        <div className="w-1/3 flex flex-col items-center gap-6">
                            <div className="text-xl font-bold text-white retro-font">形象预览</div>
                            <div className="p-4 bg-slate-800 rounded-2xl border-2 border-slate-600 shadow-2xl">
                                <HeroPreview appearance={char.appearance} />
                            </div>
                            <div className="text-center text-slate-500 text-sm">
                                实时渲染 Pixel Sprite
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex-1 bg-slate-800/50 rounded-xl border border-slate-700 p-6">
                            <h3 className="text-lg font-bold text-purple-400 mb-6 flex items-center gap-2">
                                <Palette size={20}/> 个性化定制
                            </h3>

                            <div className="space-y-6">
                                {/* Color Picker */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-bold text-slate-300">主题颜色 (全套装备)</label>
                                    <div className="flex items-center gap-4">
                                        <input 
                                            type="color" 
                                            value={char.avatarColor}
                                            onChange={(e) => setChar({
                                                ...char, 
                                                avatarColor: e.target.value, 
                                                appearance: { ...char.appearance!, themeColor: e.target.value } 
                                            })}
                                            className="w-16 h-10 rounded cursor-pointer border-none bg-transparent"
                                        />
                                        <span className="font-mono text-slate-400">{char.avatarColor}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-300 flex items-center gap-2"><Eye size={16}/> 头部外观</label>
                                        <select 
                                            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none focus:border-purple-500"
                                            value={char.appearance.head}
                                            onChange={(e) => setChar({ ...char, appearance: { ...char.appearance!, head: e.target.value as HeadType } })}
                                        >
                                            <option value="BALD">默认 (Bald)</option>
                                            <option value="KNIGHT">骑士头盔 (Knight)</option>
                                            <option value="HOOD">兜帽 (Hood)</option>
                                            <option value="WILD">狂野发型 (Wild)</option>
                                            <option value="BANDANA">头巾 (Bandana)</option>
                                            <option value="CROWN">皇冠 (Crown)</option>
                                            <option value="HORNED">恶魔之角 (Horned)</option>
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-300 flex items-center gap-2"><Shirt size={16}/> 身体护甲</label>
                                        <select 
                                            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none focus:border-purple-500"
                                            value={char.appearance.body}
                                            onChange={(e) => setChar({ ...char, appearance: { ...char.appearance!, body: e.target.value as BodyType } })}
                                        >
                                            <option value="VEST">布衣 (Vest)</option>
                                            <option value="PLATE">板甲 (Plate)</option>
                                            <option value="ROBE">法袍 (Robe)</option>
                                            <option value="LEATHER">皮甲 (Leather)</option>
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-300 flex items-center gap-2"><Sword size={16}/> 武器类型</label>
                                        <select 
                                            className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white outline-none focus:border-purple-500"
                                            value={char.appearance.weapon}
                                            onChange={(e) => setChar({ ...char, appearance: { ...char.appearance!, weapon: e.target.value as WeaponType } })}
                                        >
                                            <option value="SWORD">长剑 (Sword)</option>
                                            <option value="STAFF">法杖 (Staff)</option>
                                            <option value="AXE">战斧 (Axe)</option>
                                            <option value="HAMMER">战锤 (Hammer)</option>
                                            <option value="DAGGER">匕首 (Dagger)</option>
                                            <option value="BOW">长弓 (Bow)</option>
                                            <option value="SPEAR">长矛 (Spear)</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div className="mt-8 p-4 bg-slate-900/50 rounded border border-slate-700 text-xs text-slate-500">
                                    提示：英雄外观也会在战斗画面中实时显示。不同的武器会有微小的攻击动画差异（如法杖挥舞幅度较小，弓箭会有拉弓动作）。
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const SkillBlock: React.FC<{ skill: Skill, stats: CharacterStats, onChange: (s: Skill) => void, onDelete: () => void }> = ({ skill, stats, onChange, onDelete }) => {
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

    const updateEffect = (branchIndex: number, updates: Partial<Effect>) => {
        const branch = skill.logic[branchIndex];
        if ((updates.type === 'INCREASE_STAT' || updates.type === 'DECREASE_STAT') && !branch.effect.targetStat && !updates.targetStat) {
            updates.targetStat = StatType.CURRENT_HP;
        }
        
        let newVisual = updates.visual || branch.effect.visual || { color: '#ffffff', shape: 'CIRCLE' };
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
            updateBranch(branchIndex, { condition: undefined });
        } else {
            updateBranch(branchIndex, { 
                condition: { sourceTarget: 'SELF', variable: 'HP%', operator: '<', value: 50 } 
            });
        }
    };

    return (
        <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-lg hover:border-slate-600 transition-all group">
            <div className="bg-slate-800 p-3 flex items-center gap-3 border-b border-slate-700">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-600 to-emerald-600 flex items-center justify-center shadow-inner shrink-0">
                    <Zap size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                     <input 
                        className="bg-transparent font-bold outline-none text-sm w-full placeholder-slate-500 focus:text-blue-300 transition-colors"
                        value={skill.name}
                        onChange={(e) => onChange({...skill, name: e.target.value})}
                        placeholder="未命名技能"
                    />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] text-slate-400 uppercase tracking-wider">消耗</span>
                        <div className="flex items-center gap-1">
                            <span className={`font-mono font-bold text-sm ${manaCost > 1000 ? 'text-red-500 animate-pulse' : manaCost > 100 ? 'text-red-400' : 'text-blue-400'}`}>
                                {manaCost}
                            </span>
                            {isDynamic && <span className="text-[10px] text-yellow-400 font-bold">+</span>}
                        </div>
                    </div>
                    <div className="h-6 w-[1px] bg-slate-700"></div>
                    <label className="flex items-center gap-2 cursor-pointer select-none group/toggle" title={skill.isPassive ? "被动" : "主动"}>
                        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${skill.isPassive ? 'bg-blue-600' : 'bg-slate-700'}`}>
                            <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${skill.isPassive ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                        <input 
                            type="checkbox" 
                            className="hidden"
                            checked={skill.isPassive} 
                            onChange={(e) => onChange({...skill, isPassive: e.target.checked})} 
                        />
                    </label>
                    <button onClick={onDelete} className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-all">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            
            <div className="p-3 space-y-3 bg-slate-900/50">
                {/* Logic Branches */}
                {skill.logic.map((branch, i) => {
                    const visual = branch.effect.visual || { color: '#ffffff', shape: 'CIRCLE' };
                    const isDamage = branch.effect.type.includes('DAMAGE');
                    
                    return (
                    <div key={i} className="relative bg-slate-950/80 rounded-lg border border-slate-800 shadow-sm overflow-hidden hover:border-slate-700 transition-all">
                         <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-500 to-green-500"></div>
                         
                         {/* Header / Toolbar */}
                         <div className="flex justify-between items-center px-3 py-1.5 border-b border-slate-900 bg-slate-900/50">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-2">
                                BLOCK #{i + 1}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setExpandedVisual(expandedVisual === i ? null : i)}
                                    className={`text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${expandedVisual === i ? 'bg-blue-900 text-blue-300' : 'bg-slate-800 text-slate-500 hover:text-blue-300'}`}
                                >
                                    <Palette size={10}/> 特效
                                </button>
                                <button 
                                    className="text-slate-600 hover:text-red-400 p-0.5 rounded hover:bg-red-950/30 transition-all"
                                    onClick={() => {
                                        const nl = [...skill.logic];
                                        nl.splice(i, 1);
                                        onChange({...skill, logic: nl});
                                    }}
                                >
                                    <Trash2 size={12}/>
                                </button>
                            </div>
                         </div>

                         <div className="p-2 grid gap-2">
                            {/* IF Condition */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <button 
                                    onClick={() => toggleCondition(i)}
                                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${branch.condition ? 'bg-yellow-950 text-yellow-500 border border-yellow-800' : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-yellow-900/30 hover:text-yellow-400'}`}
                                >
                                    IF
                                </button>
                                
                                {branch.condition ? (
                                    <div className="flex flex-wrap gap-1.5 items-center animate-in fade-in slide-in-from-left-2 duration-200">
                                        <select 
                                            className={styles.target}
                                            value={branch.condition.sourceTarget}
                                            onChange={(e) => updateBranch(i, { condition: { ...branch.condition!, sourceTarget: e.target.value as TargetType } })}
                                        >
                                            <option value="SELF">自己</option>
                                            <option value="ENEMY">敌人</option>
                                        </select>
                                        <span className="text-slate-600 font-mono text-[10px]">.</span>
                                        <select 
                                            className={styles.variable}
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
                                    <div className="text-[10px] text-slate-600 font-mono italic">
                                        Always
                                    </div>
                                )}
                            </div>

                            {/* THEN Effect */}
                            <div className="flex flex-wrap items-center gap-1.5 pl-4 relative">
                                <div className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 border-l border-b border-slate-800 rounded-bl"></div>
                                <span className="text-green-600 font-mono text-[10px] font-bold px-1.5 py-0.5 bg-green-950/20 border border-green-900/50 rounded">DO</span>
                                
                                <select 
                                    className={styles.action}
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
                                            className={styles.target}
                                            value={branch.effect.target}
                                            onChange={(e) => updateEffect(i, { target: e.target.value as TargetType })}
                                        >
                                            <option value="ENEMY">敌</option>
                                            <option value="SELF">己</option>
                                        </select>
                                        <span className="text-slate-500 text-[10px]">.</span>
                                        <select 
                                            className={styles.variable}
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
                                            className={styles.target}
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
                                    <div className="flex items-center bg-slate-900/50 rounded border border-slate-800 px-1 py-0.5">
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
                                        className={styles.operator}
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
                                    <div className="flex items-center bg-slate-900/50 rounded border border-slate-800 px-1 py-0.5">
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

                            {/* Visual Configuration Panel */}
                            {expandedVisual === i && (
                                <div className="mt-2 pl-4 flex gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex-1 bg-slate-900 p-2 rounded border border-slate-700 flex flex-col gap-2">
                                        <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                                            <span className="text-[10px] font-bold text-slate-400">视觉特效</span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            <label className="text-[10px] text-slate-500">颜色</label>
                                            <input 
                                                type="color" 
                                                value={visual.color}
                                                onChange={(e) => updateVisual(i, { color: e.target.value })}
                                                className="w-8 h-5 rounded cursor-pointer border-none bg-transparent"
                                            />
                                        </div>

                                        {isDamage && (
                                            <div className="flex items-center gap-2">
                                                <label className="text-[10px] text-slate-500">形状</label>
                                                <select 
                                                    className={`${styles.variable} text-[10px] py-0.5`}
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
                                    </div>
                                    
                                    {/* Live Preview */}
                                    <div className="flex flex-col gap-1">
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
                        className="w-full py-2 border-2 border-dashed border-slate-800 rounded-lg text-slate-500 text-xs hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-950/20 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus size={14}/> 添加逻辑 ({skill.logic.length}/3)
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

export default CharacterEditor;