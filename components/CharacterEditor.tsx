
import React, { useState, useEffect, useRef } from 'react';
import { CharacterConfig, INITIAL_STATS, StatType, Skill, EffectType, TargetType, Operator, VariableSource, FormulaOp, Effect, ONLY_PERCENT_STATS, ONLY_BASE_STATS, CharacterStats, DYNAMIC_STATS, SkillLogic, EffectVisual, VisualShape, AppearanceConfig, HeadType, BodyType, WeaponType, AnimationType, STAT_DESCRIPTIONS } from '../types';
import { calculateManaCost, hasDynamicStats } from '../utils/gameEngine';
import { classifyHero, getDefaultAppearance, getRoleDisplayName, drawWeapon } from '../utils/heroSystem';
import { createProjectile, createAuraEffect, createParticles, createSlashEffect, createMagicEffect } from '../utils/visualEffects';
import * as PIXI from 'pixi.js';
import HeroAvatar from './HeroAvatar';
import { 
    IconBack, IconBolt, IconDownload, IconEdit, IconEye, IconHeart, IconMana, 
    IconPlay, IconPlus, IconSave, IconShield, IconStaff, IconSword, IconTrash, 
    IconX, IconBoot, IconSkull, IconCrosshair, IconBrokenShield, IconVampire, 
    IconDroplet, IconSpark, IconMuscle, RoleBadge
} from './PixelIcons';

interface Props {
    onSave: (char: CharacterConfig) => void;
    existing?: CharacterConfig;
    onBack: () => void;
}

const MAX_BASE_POINTS = 10000;
const MAX_PERCENT_POINTS = 1000;

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15);
};

const baseSelectClass = "appearance-none outline-none font-mono text-xs px-2 py-1 cursor-pointer transition-all border-2 text-center font-bold rounded-none h-8 flex items-center justify-center";

const styles = {
    target: `${baseSelectClass} bg-indigo-950 border-indigo-700 text-indigo-300 hover:bg-indigo-900`,
    variable: `${baseSelectClass} bg-sky-950 border-sky-700 text-sky-300 hover:bg-sky-900`,
    operator: `${baseSelectClass} bg-orange-950 border-orange-700 text-orange-400 hover:bg-orange-900 min-w-[2.5rem]`,
    action: `${baseSelectClass} bg-emerald-950 border-emerald-700 text-emerald-400 hover:bg-emerald-900`,
    input: "bg-slate-950 border-2 border-slate-700 px-1 py-1 text-xs font-mono text-center text-yellow-200 w-16 h-8 focus:border-yellow-500 outline-none transition-colors rounded-none",
};

const getStatIcon = (stat: StatType) => {
    switch(stat) {
        case StatType.HP: return <IconHeart size={18} className="text-red-500"/>;
        case StatType.MANA: return <IconMana size={18} className="text-blue-500"/>;
        case StatType.AD: return <IconSword size={18} className="text-orange-500"/>;
        case StatType.AP: return <IconStaff size={18} className="text-purple-500"/>;
        case StatType.ARMOR: return <IconShield size={18} className="text-yellow-500"/>;
        case StatType.MR: return <IconShield size={18} className="text-cyan-500"/>;
        case StatType.SPEED: return <IconBoot size={18} className="text-emerald-500"/>;
        case StatType.CRIT_RATE: return <IconCrosshair size={18} className="text-pink-500"/>;
        case StatType.CRIT_DMG: return <IconSkull size={18} className="text-red-700"/>;
        case StatType.ARMOR_PEN_FLAT: return <IconBrokenShield size={18} className="text-orange-300"/>;
        case StatType.ARMOR_PEN_PERC: return <IconBrokenShield size={18} className="text-orange-600"/>;
        case StatType.MAGIC_PEN_FLAT: return <IconSpark size={18} className="text-purple-300"/>;
        case StatType.MAGIC_PEN_PERC: return <IconSpark size={18} className="text-purple-600"/>;
        case StatType.LIFESTEAL: return <IconVampire size={18} className="text-red-600"/>;
        case StatType.OMNIVAMP: return <IconVampire size={18} className="text-purple-600"/>;
        case StatType.MANA_REGEN: return <IconDroplet size={18} className="text-blue-300"/>;
        case StatType.TENACITY: return <IconMuscle size={18} className="text-yellow-600"/>;
        default: return <div className="w-4 h-4 bg-slate-600" />;
    }
}

// ... (Color Generation Logic) ...
const generateContrastingColor = (hex: string): string => {
    const color = parseInt(hex.replace('#', ''), 16);
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    const r1 = r / 255, g1 = g / 255, b1 = b / 255;
    const max = Math.max(r1, g1, b1), min = Math.min(r1, g1, b1);
    let h = 0, s, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r1: h = (g1 - b1) / d + (g1 < b1 ? 6 : 0); break;
            case g1: h = (b1 - r1) / d + 2; break;
            case b1: h = (r1 - g1) / d + 4; break;
        }
        h /= 6;
    }
    h = (h + 0.5) % 1; 
    l = l > 0.5 ? 0.3 : 0.7; 
    s = Math.min(s, 0.6); 

    const hue2rgb = (p: number, q: number, t: number) => {
        if(t < 0) t += 1;
        if(t > 1) t -= 1;
        if(t < 1/6) return p + (q - p) * 6 * t;
        if(t < 1/2) return q;
        if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    
    const r2 = Math.round(hue2rgb(p, q, h + 1/3) * 255);
    const g2 = Math.round(hue2rgb(p, q, h) * 255);
    const b2 = Math.round(hue2rgb(p, q, h - 1/3) * 255);

    const toHex = (c: number) => {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }

    return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
};

const SkillVisualPreview: React.FC<{ effect: Effect, weapon: WeaponType, onClose: () => void }> = ({ effect, weapon, onClose }) => {
    // ... (Keep existing implementation logic) ...
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const effectRef = useRef(effect);
    const weaponRef = useRef(weapon);

    useEffect(() => {
        effectRef.current = effect;
        weaponRef.current = weapon;
    }, [effect, weapon]);

    useEffect(() => {
        let isCancelled = false;
        
        const init = async () => {
            if (!containerRef.current || appRef.current) return;
            
            const app = new PIXI.Application();
            await app.init({ width: 600, height: 400, backgroundColor: 0x0f172a, antialias: false });
            
            if (isCancelled) {
                app.destroy();
                return;
            }

            containerRef.current.innerHTML = '';
            app.canvas.style.width = '100%';
            app.canvas.style.height = '100%';
            containerRef.current.appendChild(app.canvas);
            appRef.current = app;

            // -- Scene --
            const ground = new PIXI.Graphics();
            ground.moveTo(0, 300).lineTo(600, 300).stroke({width: 4, color: 0x334155});
            app.stage.addChild(ground);

            const casterContainer = new PIXI.Container();
            casterContainer.x = 150; casterContainer.y = 280;
            casterContainer.scale.set(1.5);
            app.stage.addChild(casterContainer);

            const targetContainer = new PIXI.Container();
            targetContainer.x = 450; targetContainer.y = 280;
            targetContainer.scale.set(1.5);
            targetContainer.scale.x = -1.5;
            app.stage.addChild(targetContainer);

            const drawDummy = (g: PIXI.Graphics, color: number) => {
                g.rect(-10, -30, 20, 30).fill(color);
                g.circle(0, -40, 10).fill(color);
            };

            const casterG = new PIXI.Graphics();
            drawDummy(casterG, 0x3b82f6);
            casterContainer.addChild(casterG);

            const weaponG = new PIXI.Graphics();
            casterContainer.addChild(weaponG);

            const targetG = new PIXI.Graphics();
            drawDummy(targetG, 0xef4444);
            targetContainer.addChild(targetG);

            // Animation Loop
            let frame = 0;
            const animate = () => {
                if (!app.stage) return;
                frame++;
                
                const wConfig: AppearanceConfig = { weapon: weaponRef.current, themeColor: '#ffffff', head: 'BALD', body: 'VEST' };
                drawWeapon(weaponG, wConfig);
                weaponG.x = 5; weaponG.y = -20;
                if (wConfig.weapon === 'BOW') { weaponG.x = 10; weaponG.y = -15; }

                if (frame % 180 === 30) {
                    const eff = effectRef.current;
                    const visual = eff.visual || { color: '#ffffff', animationType: 'CAST' };
                    const animType = visual.animationType || 'CAST';
                    const color = parseInt((visual.color || '#ffffff').replace('#', '0x'));

                    if (animType === 'THRUST') {
                         const startX = casterContainer.x;
                         const targetX = targetContainer.x - 80;
                         let t = 0;
                         const tick = () => {
                             t++;
                             if (t < 20) {
                                 casterContainer.x += (targetX - startX) / 20;
                             } else if (t === 20) {
                                 createSlashEffect(app, targetContainer.x, targetContainer.y);
                                 createParticles(app, targetContainer.x, targetContainer.y - 30, 0xff0000, 5);
                             } else if (t > 30 && t < 50) {
                                 casterContainer.x += (startX - casterContainer.x) * 0.2;
                             } else if (t >= 50) {
                                 casterContainer.x = startX;
                                 app.ticker.remove(tick);
                             }
                         };
                         app.ticker.add(tick);

                    } else if (animType === 'THROW') {
                        weaponG.visible = false;
                        const clone = new PIXI.Graphics();
                        drawWeapon(clone, wConfig);
                        clone.x = casterContainer.x; clone.y = casterContainer.y - 40;
                        app.stage.addChild(clone);
                        
                        const startX = casterContainer.x;
                        const tx = targetContainer.x;
                        let t = 0;
                        
                        const tick = () => {
                            t++;
                            if (t < 30) {
                                const progress = t / 30;
                                clone.x = startX + (tx - startX) * progress;
                                clone.y = (casterContainer.y - 40) - Math.sin(progress * Math.PI) * 100 + (progress * 40); 
                                clone.rotation += 0.5;
                            } else if (t === 30) {
                                clone.rotation = 2.5;
                                clone.y = targetContainer.y;
                                createParticles(app, tx, targetContainer.y - 20, color, 5);
                            } else if (t > 30 && t < 60) {
                                casterContainer.x += (tx - 40 - casterContainer.x) * 0.1;
                            } else if (t === 60) {
                                clone.destroy();
                                weaponG.visible = true;
                            } else if (t > 70 && t < 100) {
                                casterContainer.x += (startX - casterContainer.x) * 0.1;
                            } else if (t >= 100) {
                                casterContainer.x = startX;
                                app.ticker.remove(tick);
                            }
                        };
                        app.ticker.add(tick);

                    } else {
                        createMagicEffect(app, casterContainer.x, casterContainer.y - 40, color);
                        
                        if (eff.type.includes('DAMAGE')) {
                             const shape = visual.shape || 'CIRCLE';
                             const traj = eff.type === 'DAMAGE_MAGIC' ? 'LINEAR' : 'PARABOLIC';
                             createProjectile(
                                 app, 
                                 casterContainer.x + 20, casterContainer.y - 40, 
                                 targetContainer.x - 10, targetContainer.y - 40,
                                 color, 100, traj, shape, 
                                 () => {
                                     createParticles(app, targetContainer.x, targetContainer.y - 40, color, 5);
                                 }
                             );
                        } else {
                            const isSelf = eff.target === 'SELF';
                            const tx = isSelf ? casterContainer.x : targetContainer.x;
                            const ty = isSelf ? casterContainer.y : targetContainer.y;
                            const dir = eff.type === 'INCREASE_STAT' ? 'UP' : 'DOWN';
                            createAuraEffect(app, tx, ty, color, dir);
                        }
                    }
                }
            };
            app.ticker.add(animate);
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

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-slate-900 border-4 border-slate-600 shadow-2xl p-4 w-[95vw] max-w-[640px] relative" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-white font-bold retro-font flex items-center gap-2"><IconEye size={20}/> 特效预览</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><IconX size={20}/></button>
                </div>
                <div ref={containerRef} className="w-full aspect-[3/2] border-4 border-slate-800 bg-black overflow-hidden mx-auto"></div>
                <div className="text-center text-xs text-slate-500 mt-2 font-mono">预览动画每 3 秒循环一次</div>
            </div>
        </div>
    );
};

const CharacterEditor: React.FC<Props> = ({ onSave, existing, onBack }) => {
    const [char, setChar] = useState<CharacterConfig>(existing || {
        id: generateId(),
        name: '新角色',
        avatarColor: '#1e293b', 
        stats: JSON.parse(JSON.stringify(INITIAL_STATS)),
        skills: []
    });

    const [activeTab, setActiveTab] = useState<'CORE' | 'VISUAL'>('CORE');
    const [previewEffect, setPreviewEffect] = useState<{effect: Effect, weapon: WeaponType} | null>(null);
    const [hoveredStat, setHoveredStat] = useState<StatType | null>(null);

    useEffect(() => {
        const role = classifyHero(char);
        if (char.role !== role) {
            setChar(prev => ({ ...prev, role }));
        }
        if (!char.appearance) {
             const defaultApp = getDefaultAppearance(role, '#3b82f6'); 
             setChar(prev => ({ ...prev, appearance: defaultApp }));
        }
    }, [char.stats]);

    useEffect(() => {
        if (char.appearance?.themeColor) {
            const contrast = generateContrastingColor(char.appearance.themeColor);
            if (char.avatarColor !== contrast) {
                setChar(prev => ({ ...prev, avatarColor: contrast }));
            }
        }
    }, [char.appearance?.themeColor]);

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
                        visual: { color: '#ef4444', shape: 'ORB', animationType: 'CAST' }
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
        if (!char.appearance) return;
        onSave(char);
    };

    const exportConfig = () => {
        try {
            const json = JSON.stringify(char);
            const bytes = new TextEncoder().encode(json);
            const b64 = btoa(String.fromCodePoint(...bytes));
            
            const blob = new Blob([b64], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${char.name.replace(/\s/g, '_')}.code`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Export failed", e);
            alert("导出失败");
        }
    };

    return (
        <div className="h-full flex flex-col overflow-y-auto lg:overflow-hidden bg-slate-900 text-white p-4 relative">
            {previewEffect && (
                <SkillVisualPreview 
                    effect={previewEffect.effect} 
                    weapon={previewEffect.weapon} 
                    onClose={() => setPreviewEffect(null)} 
                />
            )}

            {/* Global Hover Tooltip for Stats to avoid clipping (Desktop only) */}
            {hoveredStat && (
                <div 
                    className="hidden lg:block fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000] w-[600px] bg-slate-900 text-white border-4 border-slate-500 shadow-[0_0_20px_rgba(0,0,0,0.8)] pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-200"
                >
                    <div className="flex items-stretch">
                        <div className="bg-slate-800 p-4 flex items-center justify-center border-r-4 border-slate-600">
                             {getStatIcon(hoveredStat)}
                        </div>
                        <div className="p-4">
                            <div className="font-bold text-yellow-400 mb-1 retro-font text-lg flex items-center gap-2">
                                {hoveredStat}
                            </div>
                            <div className="text-slate-300 leading-relaxed font-mono text-sm">
                                {STAT_DESCRIPTIONS[hoveredStat] || "暂无描述"}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <header className="flex flex-col md:flex-row justify-between items-center mb-6 border-b-4 border-slate-700 pb-4 bg-slate-900 shrink-0 gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <button onClick={onBack} className="pixel-btn pixel-btn-secondary border-2">
                        <IconBack size={20} />
                    </button>
                    <input 
                        value={char.name} 
                        onChange={e => setChar({...char, name: e.target.value})}
                        className="flex-1 md:flex-none bg-slate-950 text-2xl font-bold border-b-4 border-slate-700 focus:border-blue-500 outline-none transition-all px-2 py-1 retro-font min-w-0"
                        placeholder="角色名称"
                    />
                    
                    <RoleBadge role={char.role || 'WARRIOR'} className="hidden md:flex" />
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <button onClick={exportConfig} className="flex-1 md:flex-none pixel-btn pixel-btn-secondary border-2 flex items-center justify-center gap-2 px-4 py-2 font-bold">
                        <IconDownload size={18} /> 导出
                    </button>
                    <button onClick={handleSave} className="flex-1 md:flex-none pixel-btn pixel-btn-primary border-2 flex items-center justify-center gap-2 px-4 py-2 font-bold">
                        <IconSave size={18} /> 保存
                    </button>
                </div>
            </header>

            {/* TABS */}
            <div className="flex gap-4 mb-4 border-b-4 border-slate-800 shrink-0">
                <button 
                    onClick={() => setActiveTab('CORE')}
                    className={`pb-2 px-4 font-bold text-sm transition-colors relative flex items-center gap-2 ${activeTab === 'CORE' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <IconBolt size={16}/> 核心配置
                    {activeTab === 'CORE' && <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-400"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('VISUAL')}
                    className={`pb-2 px-4 font-bold text-sm transition-colors relative flex items-center gap-2 ${activeTab === 'VISUAL' ? 'text-purple-400' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <IconEye size={16}/> 外观定制
                    {activeTab === 'VISUAL' && <div className="absolute bottom-0 left-0 w-full h-1 bg-purple-400"></div>}
                </button>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row overflow-visible lg:overflow-hidden min-h-0">
                
                {/* --- CORE PANEL (Stats & Skills) --- */}
                {activeTab === 'CORE' && (
                <div className="w-full h-full flex flex-col lg:flex-row gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20 lg:pb-0">
                    
                    {/* COL 1: STATS */}
                    <div className="w-full lg:w-[45%] flex flex-col pixel-border bg-slate-800 overflow-hidden lg:min-w-[400px]">
                        <div className="bg-slate-900 p-3 border-b-4 border-slate-700 z-10">
                            <h3 className="text-sm font-bold text-slate-300 mb-2 flex items-center gap-2 retro-font">
                                <IconShield size={14}/> 基础属性
                            </h3>
                            <div className="flex gap-4">
                                <div className="flex-1 bg-slate-950 p-2 border-2 border-slate-700 flex flex-col items-center">
                                    <span className="text-[10px] text-slate-400 uppercase tracking-widest">Fixed Points</span>
                                    <div className={`text-sm font-mono font-bold ${usedBase > MAX_BASE_POINTS ? 'text-red-500' : 'text-white'}`}>
                                        {usedBase}/{MAX_BASE_POINTS}
                                    </div>
                                </div>
                                <div className="flex-1 bg-slate-950 p-2 border-2 border-slate-700 flex flex-col items-center">
                                    <span className="text-[10px] text-slate-400 uppercase tracking-widest">Percent Points</span>
                                    <div className={`text-sm font-mono font-bold ${usedPerc > MAX_PERCENT_POINTS ? 'text-red-500' : 'text-purple-400'}`}>
                                        {usedPerc}/{MAX_PERCENT_POINTS}%
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Grid Header */}
                        <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-4 px-4 py-2 bg-slate-900 border-b-4 border-slate-800">
                            <span className="text-[10px] text-slate-500 font-bold uppercase">属性 (Stat)</span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase text-center">固定值 (Base)</span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase text-center">百分比 (%)</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-slate-900/50 max-h-[400px] lg:max-h-full">
                            {Object.values(StatType)
                                .filter(stat => !DYNAMIC_STATS.includes(stat)) 
                                .map(stat => {
                                const isPercentOnly = ONLY_PERCENT_STATS.includes(stat);
                                const isBaseOnly = ONLY_BASE_STATS.includes(stat);
                                
                                return (
                                    <div 
                                        key={stat} 
                                        className="group relative grid grid-cols-[1.5fr_1fr_1fr] gap-4 items-center bg-slate-800 p-2 border-2 border-slate-700 hover:border-blue-500 hover:bg-slate-700 transition-colors"
                                        onMouseEnter={() => setHoveredStat(stat)}
                                        onMouseLeave={() => setHoveredStat(null)}
                                        onClick={() => { if(window.innerWidth < 1024) alert(`${stat}: ${STAT_DESCRIPTIONS[stat]}`); }}
                                    >
                                        <label className={`text-xs font-bold truncate pl-2 flex items-center gap-2 ${stat === StatType.SPEED ? 'text-yellow-400' : 'text-slate-300'}`}>
                                            {getStatIcon(stat)}
                                            {stat}
                                        </label>
                                        
                                        {!isPercentOnly ? (
                                            <input 
                                                type="number" 
                                                className="w-full bg-slate-950 border-2 border-slate-600 p-2 text-center outline-none font-mono text-sm text-yellow-100 focus:border-blue-500 h-10"
                                                value={char.stats.base[stat]}
                                                onChange={(e) => handleStatChange('base', stat, parseInt(e.target.value) || 0)}
                                                onFocus={(e) => e.target.select()}
                                                min={0}
                                            />
                                        ) : <div className="w-full h-10 bg-slate-900/50 border-2 border-dashed border-slate-800 opacity-50"></div>}
                                        
                                        {!isBaseOnly ? (
                                            <input 
                                                type="number" 
                                                className="w-full bg-slate-950 border-2 border-slate-600 p-2 text-center outline-none font-mono text-sm text-purple-300 focus:border-purple-500 h-10"
                                                value={char.stats.percent[stat]}
                                                onChange={(e) => handleStatChange('percent', stat, parseInt(e.target.value) || 0)}
                                                onFocus={(e) => e.target.select()}
                                                min={0}
                                            />
                                        ) : <div className="w-full h-10 bg-slate-900/50 border-2 border-dashed border-slate-800 opacity-50"></div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* COL 2: SKILLS */}
                    <div className="flex-1 flex flex-col pixel-border bg-slate-800 overflow-hidden min-w-[300px] h-[600px] lg:h-auto">
                         <div className="flex justify-between items-center p-3 border-b-4 border-slate-700 bg-slate-900 z-10">
                            <h3 className="text-lg font-bold text-green-400 flex items-center gap-2 retro-font">
                                <IconBolt size={20} /> 技能逻辑
                            </h3>
                            <button 
                                onClick={addSkill} 
                                disabled={char.skills.length >= 3}
                                className={`pixel-btn text-xs border-2 ${char.skills.length >= 3 ? 'bg-slate-700 text-slate-500 border-slate-800 cursor-not-allowed' : 'pixel-btn-success'}`}
                            >
                                <IconPlus size={14} /> 新建
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {char.skills.map((skill, idx) => (
                                <SkillBlock 
                                    key={skill.id} 
                                    skill={skill}
                                    stats={char.stats}
                                    weapon={char.appearance?.weapon || 'SWORD'}
                                    onPreview={(eff) => setPreviewEffect({ effect: eff, weapon: char.appearance?.weapon || 'SWORD' })}
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
                                    <IconBolt size={48} className="opacity-20"/>
                                    <p className="retro-font">点击上方按钮添加技能</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                )}

                {/* --- VISUAL PANEL --- */}
                {activeTab === 'VISUAL' && char.appearance && (
                    <div className="w-full h-full flex flex-col lg:flex-row gap-8 p-4 lg:p-8 animate-in fade-in slide-in-from-right duration-300 items-start overflow-y-auto">
                        {/* Preview Box */}
                        <div className="w-full lg:w-1/3 flex flex-col items-center gap-6">
                            <div className="text-xl font-bold text-white retro-font">形象卡片</div>
                            <div className="relative">
                                {/* Using HeroAvatar as the static visual representation */}
                                <div className="p-2 rounded-none shadow-[8px_8px_0_0_rgba(0,0,0,0.5)] bg-slate-800 border-4 border-slate-600">
                                    <div className="overflow-hidden border-2 border-slate-900">
                                        <HeroAvatar appearance={char.appearance} size={256} bgColor={char.avatarColor} />
                                    </div>
                                </div>
                                
                                <div className="absolute -bottom-6 -right-4 bg-slate-900 border-2 border-slate-700 px-3 py-1 text-xs text-slate-400 shadow-lg font-mono">
                                    背景自动计算
                                </div>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="flex-1 w-full pixel-border bg-slate-800 p-6">
                            <h3 className="text-lg font-bold text-purple-400 mb-6 flex items-center gap-2 retro-font">
                                <IconEdit size={20}/> 个性化定制
                            </h3>

                            <div className="space-y-6">
                                {/* Separated Color Pickers */}
                                <div className="p-4 bg-slate-900 border-2 border-slate-700">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-bold text-slate-300">装备配色 (Theme)</label>
                                        <div className="flex items-center gap-4">
                                            <input 
                                                type="color" 
                                                value={char.appearance.themeColor}
                                                onChange={(e) => setChar({ ...char, appearance: { ...char.appearance!, themeColor: e.target.value } })}
                                                className="w-12 h-10 border-2 border-slate-500 cursor-pointer bg-slate-800 p-1"
                                            />
                                            <span className="font-mono text-slate-400">{char.appearance.themeColor}</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500">
                                            影响武器、盔甲颜色。卡片背景色将自动根据此颜色生成对比色。
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-300 flex items-center gap-2"><IconSkull size={16}/> 头部外观</label>
                                        <select 
                                            className="w-full bg-slate-900 border-2 border-slate-600 p-2 text-white outline-none focus:border-purple-500 font-mono h-10"
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
                                        <label className="text-sm font-bold text-slate-300 flex items-center gap-2"><IconShield size={16}/> 身体护甲</label>
                                        <select 
                                            className="w-full bg-slate-900 border-2 border-slate-600 p-2 text-white outline-none focus:border-purple-500 font-mono h-10"
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
                                        <label className="text-sm font-bold text-slate-300 flex items-center gap-2"><IconSword size={16}/> 武器类型</label>
                                        <select 
                                            className="w-full bg-slate-900 border-2 border-slate-600 p-2 text-white outline-none focus:border-purple-500 font-mono h-10"
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
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const SkillBlock: React.FC<{ skill: Skill, stats: CharacterStats, weapon: WeaponType, onPreview: (effect: Effect) => void, onChange: (s: Skill) => void, onDelete: () => void }> = ({ skill, stats, weapon, onPreview, onChange, onDelete }) => {
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
                            <div className="flex flex-wrap items-center gap-1.5 pl-4 relative border-l-2 border-slate-800 ml-2">
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-0.5 bg-slate-800"></div>
                                <span className="text-green-600 font-mono text-[10px] font-bold px-1.5 py-0.5 bg-green-950/20 border border-green-900/50">DO</span>
                                
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
                                                className={`${styles.variable} text-[10px] py-0.5`}
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

export default CharacterEditor;
