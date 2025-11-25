
import React, { useState, useEffect } from 'react';
import { CharacterConfig, INITIAL_STATS, WeaponType } from '../types';
import { StorageService } from '../services/storage';
import { classifyHero } from '../utils/heroSystem';
import HeroAvatar from './HeroAvatar';
import { IconBack, IconDownload, IconEdit, IconPlus, IconTrash, IconSword, RoleBadge } from './PixelIcons';

interface Props {
    onSelect: (char: CharacterConfig) => void;
    onEdit: (char: CharacterConfig) => void;
    onBack: () => void;
    mode?: 'MANAGE' | 'SELECT'; // 'MANAGE' shows edit/delete, 'SELECT' just clicks to pick
}

const WEAPON_NAMES: Record<WeaponType, string> = {
    SWORD: '长剑',
    STAFF: '法杖',
    AXE: '战斧',
    HAMMER: '战锤',
    DAGGER: '匕首',
    BOW: '长弓',
    SPEAR: '长矛'
};

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15);
};

const CharacterList: React.FC<Props> = ({ onSelect, onEdit, onBack, mode = 'MANAGE' }) => {
    const [heroes, setHeroes] = useState<CharacterConfig[]>([]);

    useEffect(() => {
        // Ensure every hero has a role calculated for display
        const allHeroes = StorageService.getAll().map(h => {
            if (!h.role) {
                return { ...h, role: classifyHero(h) };
            }
            return h;
        });
        setHeroes(allHeroes);
    }, []);

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('确定要删除这个角色吗？')) {
            StorageService.delete(id);
            setHeroes(StorageService.getAll());
        }
    };

    const handleCreate = () => {
        const newChar: CharacterConfig = {
            id: generateId(),
            name: `英雄 #${Math.floor(Math.random() * 1000)}`,
            avatarColor: '#' + Math.floor(Math.random()*16777215).toString(16),
            stats: JSON.parse(JSON.stringify(INITIAL_STATS)),
            skills: []
        };
        onEdit(newChar);
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const text = await file.text();
                try {
                    const binString = atob(text);
                    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
                    const json = new TextDecoder().decode(bytes);
                    
                    const char = JSON.parse(json);
                    char.id = generateId();
                    char.role = classifyHero(char); // Re-classify on import
                    StorageService.save(char);
                    setHeroes(StorageService.getAll());
                } catch (err) {
                    console.error(err);
                    alert('无效的配置文件或编码错误');
                }
            }
        };
        input.click();
    };

    return (
        <div className="h-full w-full p-8 bg-slate-900 flex flex-col">
            <div className="flex justify-between items-center mb-8 shrink-0">
                <h2 className="text-3xl font-bold text-white retro-font drop-shadow-md">
                    {mode === 'MANAGE' ? '英雄名册' : '选择出战英雄'}
                </h2>
                {mode === 'MANAGE' && (
                    <div className="flex gap-4">
                        <button onClick={handleImport} className="pixel-btn pixel-btn-secondary border-2 flex items-center justify-center gap-2">
                            <IconDownload size={16} /> 导入
                        </button>
                        <button onClick={handleCreate} className="pixel-btn pixel-btn-primary border-2 flex items-center justify-center gap-2">
                            <IconPlus size={16} /> 新建角色
                        </button>
                    </div>
                )}
            </div>

            {heroes.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
                    <IconSword size={64} className="opacity-20" />
                    <p className="retro-font">暂无英雄，请创建或导入</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto pb-20 custom-scrollbar p-4">
                    {heroes.map(hero => {
                        const weaponName = hero.appearance?.weapon ? WEAPON_NAMES[hero.appearance.weapon] : '长剑';
                        
                        return (
                            <div 
                                key={hero.id} 
                                onClick={() => onSelect(hero)}
                                className={`pixel-border bg-slate-800 p-6 transition-all cursor-pointer flex flex-col gap-3 group relative active:translate-y-1 active:shadow-none shadow-[4px_4px_0_0_rgba(0,0,0,0.5)] border-4 ${mode === 'SELECT' ? 'hover:border-green-500' : 'hover:border-slate-500'}`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="border-4 border-slate-900 bg-slate-950 p-1 shrink-0">
                                        <HeroAvatar appearance={hero.appearance!} size={64} bgColor={hero.avatarColor} />
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">定位</div>
                                        <RoleBadge role={hero.role || 'WARRIOR'} />
                                    </div>
                                </div>
                                
                                <div className="min-w-0">
                                    <h3 className="font-bold text-lg text-white group-hover:text-yellow-300 transition-colors truncate retro-font">{hero.name}</h3>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono mt-2">
                                        <span className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 border border-slate-600 whitespace-nowrap">
                                            {weaponName}
                                        </span>
                                        <span className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 border border-slate-600 whitespace-nowrap">
                                            {hero.skills.length} 技能
                                        </span>
                                    </div>
                                </div>

                                {mode === 'MANAGE' && (
                                    <div className="flex gap-2 mt-auto pt-4 border-t-2 border-slate-700/50">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onEdit(hero); }}
                                            className="flex-1 pixel-btn pixel-btn-secondary py-1 text-xs flex items-center justify-center gap-2 border-2 hover:bg-slate-600"
                                        >
                                            <IconEdit size={12} /> 编辑
                                        </button>
                                        <button 
                                            onClick={(e) => handleDelete(hero.id, e)}
                                            className="pixel-btn pixel-btn-danger py-1 px-3 flex items-center justify-center border-2 hover:bg-red-500"
                                        >
                                            <IconTrash size={12} />
                                        </button>
                                    </div>
                                )}
                                
                                {/* Overlay for Select Mode */}
                                {mode === 'SELECT' && (
                                    <div className="absolute inset-0 bg-black/20 hidden group-hover:flex items-center justify-center pointer-events-none">
                                        <div className="bg-green-600 text-white px-4 py-2 font-bold retro-font border-2 border-green-400 shadow-lg">
                                            选择此英雄
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            
            <button onClick={onBack} className="mt-4 self-start pixel-btn pixel-btn-secondary border-2 flex items-center justify-center gap-2">
                <IconBack size={16}/> {mode === 'MANAGE' ? '返回主菜单' : '取消选择'}
            </button>
        </div>
    );
};

export default CharacterList;
