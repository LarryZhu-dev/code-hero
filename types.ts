

export enum StatType {
    HP = '最大生命值',
    AD = '攻击力',
    AP = '法术强度',
    ARMOR = '护甲',
    MR = '魔抗',
    SPEED = '移动速度',
    CRIT_RATE = '暴击率',
    CRIT_DMG = '暴击伤害',
    ARMOR_PEN_FLAT = '固定物穿',
    ARMOR_PEN_PERC = '百分比物穿',
    MAGIC_PEN_FLAT = '固定法穿',
    MAGIC_PEN_PERC = '百分比法穿',
    LIFESTEAL = '生命偷取',
    OMNIVAMP = '全能吸血',
    TENACITY = '韧性',
    MANA = '最大法力值',
    MANA_REGEN = '法力回复',
    // Dynamic Stats (Calculated in runtime, not set in config)
    CURRENT_HP = '当前生命值',
    CURRENT_HP_PERC = '当前生命百分比',
    HP_LOST = '已损生命值',
    HP_LOST_PERC = '已损生命百分比',
    CURRENT_MANA = '当前法力值',
}

// Stats that are calculated dynamically and should not be edited in the character stats panel
export const DYNAMIC_STATS = [
    StatType.CURRENT_HP,
    StatType.CURRENT_HP_PERC,
    StatType.HP_LOST,
    StatType.HP_LOST_PERC,
    StatType.CURRENT_MANA
];

// Stats that CANNOT have percentage points allocated (Raw numbers only)
export const ONLY_BASE_STATS = [
    StatType.HP,
    StatType.AD,
    StatType.AP,
    StatType.ARMOR,
    StatType.MR,
    StatType.SPEED,
    StatType.MANA,
    StatType.ARMOR_PEN_FLAT,
    StatType.MAGIC_PEN_FLAT,
    StatType.TENACITY,
    ...DYNAMIC_STATS // Dynamic stats don't use base/percent config logic anyway
];

// Stats that CANNOT have base points allocated (Percentages only)
export const ONLY_PERCENT_STATS = [
    StatType.CRIT_DMG,
    StatType.LIFESTEAL,
    StatType.OMNIVAMP,
    StatType.CRIT_RATE,
    StatType.ARMOR_PEN_PERC,
    StatType.MAGIC_PEN_PERC,
    StatType.MANA_REGEN,
    ...DYNAMIC_STATS
];

export interface CharacterStats {
    base: Record<StatType, number>;
    percent: Record<StatType, number>;
}

export type Operator = '>' | '<' | '==' | '>=' | '<=' | '!=';
export type TargetType = 'SELF' | 'ENEMY';
export type VariableSource = 'HP' | 'HP%' | 'MANA' | 'MANA%' | 'TURN' | 'LAST_DMG_TAKEN' | 'HP_LOST' | 'HP_LOST%';

export interface Condition {
    sourceTarget: TargetType;
    variable: VariableSource;
    operator: Operator;
    value: number;
}

export type EffectType = 'DAMAGE_PHYSICAL' | 'DAMAGE_MAGIC' | 'INCREASE_STAT' | 'DECREASE_STAT';
export type FormulaOp = '+' | '-' | '*' | '/';

export interface FormulaFactor {
    target: TargetType;
    stat: StatType;
}

export interface Formula {
    factorA: FormulaFactor;
    operator: FormulaOp;
    factorB: FormulaFactor;
}

export type VisualShape = 'CIRCLE' | 'SQUARE' | 'STAR' | 'BEAM' | 'ORB';

export interface EffectVisual {
    color: string; // Hex Code
    shape?: VisualShape; // Only for Projectiles
}

export interface Effect {
    type: EffectType;
    target: TargetType;
    targetStat?: StatType; // Required for INCREASE_STAT / DECREASE_STAT
    formula: Formula; 
    visual?: EffectVisual; // Custom visual config
}

export interface SkillLogic {
    condition?: Condition; // Optional: If undefined, treats as "Always True"
    effect: Effect;
}

export interface Skill {
    id: string;
    name: string;
    isPassive: boolean;
    logic: SkillLogic[];
}

export interface CharacterConfig {
    id: string;
    name: string;
    avatarColor: string; // Hex code for placeholder
    stats: CharacterStats;
    skills: Skill[];
}

export type BattleMode = 'LOCAL_BOT' | 'ONLINE_PVP';

// Animation Events
export type BattleEventType = 'ATTACK_MOVE' | 'SKILL_EFFECT' | 'DAMAGE' | 'HEAL' | 'MANA' | 'TEXT' | 'DEATH' | 'PROJECTILE' | 'STAT_CHANGE';

export interface BattleEvent {
    type: BattleEventType;
    sourceId?: string;
    targetId?: string;
    value?: number;
    text?: string;
    color?: string; // Hex string for floating text color
    skillName?: string;
    projectileType?: 'PHYSICAL' | 'MAGIC';
    stat?: StatType;
    visual?: EffectVisual; // Carried over from Effect
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
    mode: BattleMode;
    roomId?: string;
    events: BattleEvent[]; // Queue of events to animate
}

export interface BattleEntity {
    id: string;
    config: CharacterConfig;
    currentHp: number;
    currentMana: number;
    maxHp: number;
    maxMana: number;
    buffs: any[]; // Simplified for now
}

export const INITIAL_STATS: CharacterStats = {
    base: Object.values(StatType).reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as any),
    percent: Object.values(StatType).reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as any),
};