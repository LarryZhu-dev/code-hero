import React, { useState, useEffect } from 'react';
import { CharacterConfig, INITIAL_STATS } from '../types';
import { StorageService } from '../services/storage';
import { Plus, Trash2, Edit, Play, Swords, Download } from 'lucide-react';

interface Props {
    onSelect: (char: CharacterConfig) => void;
    onEdit: (char: CharacterConfig) => void;
    onBack: () => void;
}

// Helper for generating IDs
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15);
};

const CharacterList: React.FC<Props> = ({ onSelect, onEdit, onBack }) => {
    const [heroes, setHeroes] = useState<CharacterConfig[]>([]);

    useEffect(() => {
        setHeroes(StorageService.getAll());
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
                    // Fix: Decode Base64 -> Binary String -> Uint8Array -> UTF-8 String
                    const binString = atob(text);
                    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
                    const json = new TextDecoder().decode(bytes);
                    
                    const char = JSON.parse(json);
                    // Assign new ID to avoid collision
                    char.id = generateId();
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
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold text-white retro-font">英雄名册</h2>
                <div className="flex gap-3">
                    <button onClick={handleImport} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-all">
                        <Download size={16} /> 导入
                    </button>
                    <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold transition-all shadow-lg">
                        <Plus size={16} /> 新建角色
                    </button>
                </div>
            </div>

            {heroes.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
                    <Swords size={64} className="opacity-20" />
                    <p>暂无英雄，请创建或导入</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-20 custom-scrollbar">
                    {heroes.map(hero => (
                        <div 
                            key={hero.id} 
                            onClick={() => onSelect(hero)}
                            className="group bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-blue-500 hover:bg-slate-800/80 transition-all cursor-pointer relative overflow-hidden shadow-lg"
                        >
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-16 h-16 rounded-lg shadow-lg" style={{backgroundColor: hero.avatarColor}}></div>
                                <div>
                                    <h3 className="font-bold text-lg text-white group-hover:text-blue-300 transition-colors">{hero.name}</h3>
                                    <div className="text-xs text-slate-400 flex gap-2">
                                        <span>Skills: {hero.skills.length}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-2 opacity-40 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onEdit(hero); }}
                                    className="flex-1 py-2 bg-slate-700 hover:bg-blue-600 rounded text-xs font-bold flex items-center justify-center gap-1"
                                >
                                    <Edit size={12} /> 编辑
                                </button>
                                <button 
                                    onClick={(e) => handleDelete(hero.id, e)}
                                    className="w-8 bg-slate-700 hover:bg-red-600 rounded flex items-center justify-center"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                            
                            <div className="absolute top-0 right-0 p-2">
                                <div className="w-8 h-8 rounded-full bg-blue-600/0 group-hover:bg-blue-600 flex items-center justify-center transition-all transform scale-0 group-hover:scale-100">
                                    <Play size={16} className="text-white ml-1" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            <button onClick={onBack} className="mt-auto self-start text-slate-500 hover:text-white transition-colors">
                &larr; 返回主菜单
            </button>
        </div>
    );
};

export default CharacterList;