export enum StatType {
    HP = '生命值',
    AD = '攻击力',
    AP = '法术强度',
    ARMOR = '护甲',
    MR = '魔抗',
    CRIT_RATE = '暴击率',
    CRIT_DMG = '暴击伤害',
    ARMOR_PEN_FLAT = '固定物穿',
    ARMOR_PEN_PERC = '百分比物穿',
    MAGIC_PEN_FLAT = '固定法穿',
    MAGIC_PEN_PERC = '百分比法穿',
    SPEED = '移动速度',
    LIFESTEAL = '生命偷取',
    OMNIVAMP = '全能吸血',
    TENACITY = '韧性',
    MANA = '法力值',
    MANA_REGEN = '法力回复',
}

export interface CharacterStats {
    base: Record<StatType, number>;
    percent: Record<StatType, number>;
}

export type Operator = '>' | '<' | '==' | '>=' | '<=' | '!=';
export type TargetType = 'SELF' | 'ENEMY';
export type VariableSource = 'HP' | 'HP%' | 'MANA' | 'MANA%' | 'TURN' | 'LAST_DMG_TAKEN';

export interface Condition {
    sourceTarget: TargetType;
    variable: VariableSource;
    operator: Operator;
    value: number;
}

export type EffectType = 'DAMAGE_PHYSICAL' | 'DAMAGE_MAGIC' | 'HEAL' | 'GAIN_MANA' | 'BUFF_STAT';

export interface Effect {
    type: EffectType;
    target: TargetType;
    // Formulas are strings like "SELF.AD * 1.5 + 50"
    valueFormula: string; 
    manaCost: number;
}

export interface Skill {
    id: string;
    name: string;
    isPassive: boolean;
    conditions: Condition[];
    effects: Effect[];
}

export interface CharacterConfig {
    id: string;
    name: string;
    avatarColor: string; // Hex code for placeholder
    stats: CharacterStats;
    skills: Skill[];
}

export interface BattleState {
    turn: number;
    log: string[];
    p1: BattleEntity;
    p2: BattleEntity;
    activePlayerId: string;
    phase: 'WAITING' | 'ACTION_SELECTION' | 'EXECUTING' | 'FINISHED';
    winnerId?: string;
    timeLeft: number;
}

export interface BattleEntity {
    id: string;
    config: CharacterConfig;
    currentHp: number;
    currentMana: number;
    buffs: any[]; // Simplified for now
}

export const INITIAL_STATS: CharacterStats = {
    base: Object.values(StatType).reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as any),
    percent: Object.values(StatType).reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as any),
};

// Initialize minimal viable stats to prevent division by zero errors
INITIAL_STATS.base[StatType.HP] = 100;
INITIAL_STATS.base[StatType.SPEED] = 10;
INITIAL_STATS.base[StatType.CRIT_DMG] = 150; // 150% default
