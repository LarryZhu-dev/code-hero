import { CharacterConfig } from "../types";

const STORAGE_KEY = 'cw_heroes_v1';

export const StorageService = {
    getAll: (): CharacterConfig[] => {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Failed to load heroes", e);
            return [];
        }
    },

    save: (char: CharacterConfig) => {
        const list = StorageService.getAll();
        const index = list.findIndex(c => c.id === char.id);
        if (index >= 0) {
            list[index] = char;
        } else {
            list.push(char);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    },

    delete: (id: string) => {
        const list = StorageService.getAll().filter(c => c.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    },

    get: (id: string): CharacterConfig | undefined => {
        return StorageService.getAll().find(c => c.id === id);
    }
};