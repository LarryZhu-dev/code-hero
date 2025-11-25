
import React, { useState, useEffect } from 'react';
import { CharacterConfig, INITIAL_STATS, StatType, Skill, Effect, ONLY_PERCENT_STATS, ONLY_BASE_STATS, DYNAMIC_STATS, AppearanceConfig, HeadType, BodyType, WeaponType, STAT_DESCRIPTIONS } from '../types';
import { classifyHero, getDefaultAppearance, drawWeapon } from '../utils/heroSystem';
import { generateContrastingColor } from '../utils/colorUtils';
import HeroAvatar from './HeroAvatar';
import { 
    IconBack, IconBolt, IconDownload, IconEdit, IconEye, IconPlus, IconSave, IconShield, IconSword, IconSkull, RoleBadge
} from './PixelIcons';
import { StatIcon } from './StatIcon';
import SkillVisualPreview from './SkillVisualPreview';
import SkillBlock from './SkillBlock';

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
                             <StatIcon stat={hoveredStat} size={18} />
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

                        {/* Grid Header - Responsive */}
                        <div className="flex flex-row bg-slate-900 border-b-4 border-slate-800">
                             {/* Mobile/Default Header */}
                             <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-4 px-4 py-2 w-full xl:w-1/2">
                                <span className="text-[10px] text-slate-500 font-bold uppercase">属性 (Stat)</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase text-center">固定值 (Base)</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase text-center">百分比 (%)</span>
                             </div>
                             {/* Desktop Second Column Header */}
                             <div className="hidden xl:grid grid-cols-[1.5fr_1fr_1fr] gap-4 px-4 py-2 w-1/2 border-l-4 border-slate-800">
                                <span className="text-[10px] text-slate-500 font-bold uppercase">属性 (Stat)</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase text-center">固定值 (Base)</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase text-center">百分比 (%)</span>
                             </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-900/50 max-h-[400px] lg:max-h-full no-scrollbar">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-2">
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
                                                <StatIcon stat={stat} size={18} />
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

                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar no-scrollbar">
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
                    <div className="w-full h-full flex flex-col lg:flex-row gap-8 p-4 lg:p-8 animate-in fade-in slide-in-from-right duration-300 items-start overflow-y-auto no-scrollbar">
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

export default CharacterEditor;
