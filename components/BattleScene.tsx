

import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { BattleState, StatType, BattleEvent, VisualShape, AppearanceConfig } from '../types';
import { getTotalStat } from '../utils/gameEngine';
import { drawBody, drawWeapon, getDefaultAppearance, classifyHero } from '../utils/heroSystem';
import { createProjectile, createParticles, createSlashEffect, createMagicEffect, createAuraEffect } from '../utils/visualEffects';

interface Props {
    gameState: BattleState;
    onAnimationsComplete?: () => void;
    onEntityClick?: (id: string) => void;
}

// Map stats to distinct colors
const STAT_COLORS: Partial<Record<StatType, number>> = {
    [StatType.HP]: 0xef4444, // Red
    [StatType.MANA]: 0x3b82f6, // Blue
    [StatType.AD]: 0xf97316, // Orange
    [StatType.AP]: 0xa855f7, // Purple
    [StatType.ARMOR]: 0xeab308, // Yellow
    [StatType.MR]: 0x06b6d4, // Cyan
    [StatType.SPEED]: 0x10b981, // Emerald
    [StatType.CRIT_RATE]: 0xec4899, // Pink
    [StatType.CRIT_DMG]: 0xbe185d, // Dark Pink
};

// Extend window interface for TS
declare global {
    interface Window {
        __CW_PIXI_APP__?: PIXI.Application | null;
        __CW_PIXI_INIT_PROMISE__?: Promise<PIXI.Application> | null;
    }
}

// Helper to safely destroy an app instance without crashing
const safeDestroy = (app: PIXI.Application | undefined | null) => {
    if (!app) return;
    try {
        if (app.renderer) {
            app.destroy({ removeView: true, texture: true, context: true });
        } else {
            console.warn("PIXI Cleanup: Skipping destroy() because renderer is missing.");
        }
    } catch (e) {
        console.warn("PIXI Cleanup: Safe destroy failed", e);
    }
};

// Singleton PIXI Application instance using window to survive HMR.
const getPixiApp = async () => {
    const w = window;

    if (w.__CW_PIXI_APP__) {
        if (w.__CW_PIXI_APP__.renderer) {
            return w.__CW_PIXI_APP__;
        }
        console.warn("Found zombie PIXI App. Cleaning up...");
        safeDestroy(w.__CW_PIXI_APP__);
        w.__CW_PIXI_APP__ = null;
    }

    if (w.__CW_PIXI_INIT_PROMISE__) {
        try {
            return await w.__CW_PIXI_INIT_PROMISE__;
        } catch (e) {
            w.__CW_PIXI_INIT_PROMISE__ = null;
        }
    }

    w.__CW_PIXI_INIT_PROMISE__ = (async () => {
        const app = new PIXI.Application();
        try {
            await app.init({ 
                width: 800, 
                height: 400, 
                backgroundColor: 0x0f172a, // Slate-900
                antialias: false,
            });
            w.__CW_PIXI_APP__ = app;
            return app;
        } catch (e) {
            console.error("Failed to init PIXI App", e);
            w.__CW_PIXI_INIT_PROMISE__ = null;
            w.__CW_PIXI_APP__ = null;
            safeDestroy(app);
            throw e;
        }
    })();
    return w.__CW_PIXI_INIT_PROMISE__;
};

// --- Procedural Pixel Art Assets ---

class PixelEntity {
    container: PIXI.Container;
    characterGroup: PIXI.Container;
    bodyGroup: PIXI.Container;
    handGroup: PIXI.Container;
    graphics: PIXI.Graphics; // Body Graphics
    weaponGraphics: PIXI.Graphics; // Weapon Graphics
    shadow: PIXI.Graphics;
    hpBar: PIXI.Container;
    
    // Stats
    maxHp: number;
    maxMana: number;
    currentHp: number;
    currentMana: number;
    targetHp: number;
    targetMana: number;
    appearance: AppearanceConfig;
    isFacingLeft: boolean;

    // Animation State
    animOffset: number = Math.random() * 100;
    
    constructor(
        appearance: AppearanceConfig, 
        x: number, 
        y: number, 
        maxHp: number, 
        maxMana: number, 
        isFacingLeft: boolean,
        id: string,
        onClick?: (id: string) => void
    ) {
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;

        if (onClick) {
            this.container.eventMode = 'static';
            this.container.cursor = 'pointer';
            this.container.on('pointerdown', () => onClick(id));
        }

        this.maxHp = maxHp;
        this.maxMana = maxMana;
        this.currentHp = maxHp;
        this.currentMana = maxMana;
        this.targetHp = maxHp;
        this.targetMana = maxMana;
        this.appearance = appearance;
        this.isFacingLeft = isFacingLeft;

        // Shadow
        this.shadow = new PIXI.Graphics();
        this.shadow.ellipse(0, 0, 30, 8);
        this.shadow.fill({ color: 0x000000, alpha: 0.3 });
        this.shadow.y = 10;
        this.container.addChild(this.shadow);

        // Character Group (for flipping)
        this.characterGroup = new PIXI.Container();
        this.characterGroup.scale.x = isFacingLeft ? -1 : 1;
        this.container.addChild(this.characterGroup);

        // Body Group
        this.bodyGroup = new PIXI.Container();
        this.characterGroup.addChild(this.bodyGroup);

        // Hand/Arm Group (Pivot at shoulder roughly)
        this.handGroup = new PIXI.Container();
        this.handGroup.x = -2 * 4; // Shoulder x
        this.handGroup.y = -9 * 4; // Shoulder y
        this.characterGroup.addChild(this.handGroup);

        // Graphics initialization
        this.graphics = new PIXI.Graphics(); 
        this.bodyGroup.addChild(this.graphics);
        
        this.weaponGraphics = new PIXI.Graphics();
        this.handGroup.addChild(this.weaponGraphics);
        
        this.drawCharacter();

        // HP Bar Group
        this.hpBar = new PIXI.Container();
        this.hpBar.y = -100; // Position above head
        this.container.addChild(this.hpBar);
        this.updateBars();
    }

    drawCharacter() {
        drawBody(this.graphics, this.appearance);
        drawWeapon(this.weaponGraphics, this.appearance);
        
        // Adjust weapon position/rotation baseline
        // Rotate sword slightly forward by default
        if (this.appearance.weapon === 'SWORD' || this.appearance.weapon === 'AXE' || this.appearance.weapon === 'HAMMER') {
            this.weaponGraphics.rotation = 0.5;
            this.weaponGraphics.x = 2 * 4;
        } else if (this.appearance.weapon === 'BOW') {
             this.weaponGraphics.x = 4 * 4;
        }
    }

    setWeaponVisible(visible: boolean) {
        this.weaponGraphics.visible = visible;
    }

    updateBars() {
        const barWidth = 80;
        const barHeight = 8;
        const g = new PIXI.Graphics();
        
        // --- HP BAR ---
        const visualMaxHp = Math.max(this.maxHp, this.currentHp);
        
        g.rect(-barWidth/2 - 2, 0 - 2, barWidth + 4, barHeight + 4).fill(0x000000);
        g.rect(-barWidth/2, 0, barWidth, barHeight).fill(0x334155);
        
        const hpPct = visualMaxHp > 0 ? Math.max(0, this.currentHp / visualMaxHp) : 0;
        g.rect(-barWidth/2, 0, barWidth * hpPct, barHeight).fill(0xef4444);

        if (visualMaxHp > 0) {
            const tickStep = 100;
            const maxTicks = 2000;
            let ticksDrawn = 0;
            for (let v = tickStep; v < visualMaxHp && ticksDrawn < maxTicks; v += tickStep) {
                const x = (v / visualMaxHp) * barWidth - (barWidth / 2);
                const isMajor = v % 1000 === 0;
                const h = isMajor ? barHeight : barHeight * 0.5;
                g.rect(x, 0, 1, h).fill({ color: 0x000000, alpha: 0.5 });
                ticksDrawn++;
            }
        }

        // --- MANA BAR ---
        g.rect(-barWidth/2 - 2, 12 - 2, barWidth + 4, 4 + 4).fill(0x000000);
        g.rect(-barWidth/2, 12, barWidth, 4).fill(0x334155);
        const visualMaxMana = Math.max(this.maxMana, this.currentMana);
        const mpPct = visualMaxMana > 0 ? Math.max(0, this.currentMana / visualMaxMana) : 0;
        g.rect(-barWidth/2, 12, barWidth * mpPct, 4).fill(0x3b82f6);

        this.hpBar.removeChildren();
        this.hpBar.addChild(g);
    }

    animateIdle(time: number) {
        const yOffset = Math.sin((time + this.animOffset) * 0.1) * 4;
        this.characterGroup.y = -24 + yOffset;
        this.shadow.scale.set(1 + Math.sin((time + this.animOffset) * 0.1) * 0.1);
        
        const wType = this.appearance.weapon;
        if (wType === 'STAFF' || wType === 'BOW') {
            this.handGroup.rotation = Math.sin((time + this.animOffset) * 0.05) * 0.1;
        } else {
             this.handGroup.rotation = Math.sin((time + this.animOffset) * 0.1) * 0.05;
        }
    }

    async animateAttack() {
        const startRot = this.handGroup.rotation;
        const wType = this.appearance.weapon;
        
        if (wType === 'STAFF') {
            for(let i=0; i<10; i++) {
                this.handGroup.rotation -= 0.1; 
                await new Promise(r => setTimeout(r, 16));
            }
            await new Promise(r => setTimeout(r, 100));
             for(let i=0; i<10; i++) {
                this.handGroup.rotation += 0.1; 
                await new Promise(r => setTimeout(r, 16));
            }
        } else if (wType === 'BOW') {
             for(let i=0; i<10; i++) {
                this.handGroup.x -= 2; // Pull back
                await new Promise(r => setTimeout(r, 16));
            }
            await new Promise(r => setTimeout(r, 100));
            this.handGroup.x += 20; // Release
            await new Promise(r => setTimeout(r, 16));
        } else {
            // Melee Swing
            for(let i=0; i<5; i++) {
                this.handGroup.rotation -= 0.2;
                await new Promise(r => setTimeout(r, 16));
            }
            for(let i=0; i<5; i++) {
                this.handGroup.rotation += 0.5;
                await new Promise(r => setTimeout(r, 16));
            }
             for(let i=0; i<10; i++) {
                this.handGroup.rotation = startRot + (startRot - this.handGroup.rotation) * (i/10);
                await new Promise(r => setTimeout(r, 16));
            }
        }
        this.handGroup.rotation = startRot;
        if (wType === 'BOW') this.handGroup.x = -2 * 4; // Reset
    }

    async animateCast() {
        const startRot = this.handGroup.rotation;
        for(let i=0; i<15; i++) {
            this.handGroup.rotation -= 0.15;
            await new Promise(r => setTimeout(r, 16));
        }
        await new Promise(r => setTimeout(r, 200));
         for(let i=0; i<15; i++) {
            this.handGroup.rotation += 0.15;
            await new Promise(r => setTimeout(r, 16));
        }
        this.handGroup.rotation = startRot;
    }
}

const BattleScene: React.FC<Props> = ({ gameState, onAnimationsComplete, onEntityClick }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const visualsRef = useRef<{ p1: PixelEntity; p2: PixelEntity } | null>(null);
    const tickerFuncRef = useRef<((ticker: PIXI.Ticker) => void) | null>(null);

    // --- Init Scene ---
    useEffect(() => {
        let isCancelled = false;
        
        const init = async () => {
            if (isCancelled || !containerRef.current) return;

            try {
                const app = await getPixiApp();
                
                if (isCancelled) {
                    return;
                }
                
                appRef.current = app;

                if (app.canvas.parentElement !== containerRef.current) {
                    if (app.canvas.parentElement) {
                        app.canvas.parentElement.removeChild(app.canvas);
                    }
                    containerRef.current.appendChild(app.canvas);
                }

                app.stage.removeChildren().forEach(c => c.destroy({ children: true }));

                // -- Background --
                const bg = new PIXI.Graphics();
                
                // Grid Floor
                bg.rect(0, 250, 800, 150).fill(0x1e293b);
                // Horizon Line
                bg.moveTo(0, 250).lineTo(800, 250).stroke({ width: 2, color: 0x475569 });
                
                // Perspective Grid Lines
                for (let i = 0; i <= 800; i+= 80) {
                    bg.moveTo(i, 250).lineTo((i - 400) * 3 + 400, 400).stroke({ width: 1, color: 0x334155 });
                }
                // Horizontal Grid Lines
                for (let i = 250; i <= 400; i+= 30) {
                    bg.moveTo(0, i).lineTo(800, i).stroke({ width: 1, color: 0x334155 });
                }
                app.stage.addChild(bg);

                // -- Characters --
                const maxHp1 = getTotalStat(gameState.p1, StatType.HP);
                const maxMana1 = getTotalStat(gameState.p1, StatType.MANA);
                
                // Use default appearance if missing (migration safety)
                const role1 = classifyHero(gameState.p1.config);
                const app1 = gameState.p1.config.appearance || getDefaultAppearance(role1, gameState.p1.config.avatarColor);
                
                const v1 = new PixelEntity(app1, 200, 300, maxHp1, maxMana1, false, gameState.p1.id, onEntityClick);
                
                const maxHp2 = getTotalStat(gameState.p2, StatType.HP);
                const maxMana2 = getTotalStat(gameState.p2, StatType.MANA);
                
                const role2 = classifyHero(gameState.p2.config);
                const app2 = gameState.p2.config.appearance || getDefaultAppearance(role2, gameState.p2.config.avatarColor);

                const v2 = new PixelEntity(app2, 600, 300, maxHp2, maxMana2, true, gameState.p2.id, onEntityClick);

                // Sync initial state
                v1.currentHp = gameState.p1.currentHp;
                v1.targetHp = gameState.p1.currentHp;
                v1.currentMana = gameState.p1.currentMana;
                v1.targetMana = gameState.p1.currentMana;
                v1.updateBars();

                v2.currentHp = gameState.p2.currentHp;
                v2.targetHp = gameState.p2.currentHp;
                v2.currentMana = gameState.p2.currentMana;
                v2.targetMana = gameState.p2.currentMana;
                v2.updateBars();

                app.stage.addChild(v1.container);
                app.stage.addChild(v2.container);

                visualsRef.current = { p1: v1, p2: v2 };

                // -- Game Loop --
                let time = 0;
                const tick = () => {
                    time++;
                    if (visualsRef.current) {
                        const { p1, p2 } = visualsRef.current;
                        
                        // Idle Animation
                        p1.animateIdle(time);
                        p2.animateIdle(time);

                        // Lerp Stats
                        const lerp = (curr: number, target: number) => {
                            if (Math.abs(target - curr) < 0.5) return target;
                            return curr + (target - curr) * 0.1;
                        };

                        p1.currentHp = lerp(p1.currentHp, p1.targetHp);
                        p1.currentMana = lerp(p1.currentMana, p1.targetMana);
                        p1.updateBars();

                        p2.currentHp = lerp(p2.currentHp, p2.targetHp);
                        p2.currentMana = lerp(p2.currentMana, p2.targetMana);
                        p2.updateBars();
                    }
                };
                app.ticker.add(tick);
                tickerFuncRef.current = tick;
            } catch (err) {
                console.error("Error setting up PIXI scene:", err);
            }
        };

        init();

        return () => {
            isCancelled = true;
            if (appRef.current) {
                const app = appRef.current;
                
                if (tickerFuncRef.current) {
                    app.ticker.remove(tickerFuncRef.current);
                    tickerFuncRef.current = null;
                }

                app.stage.removeChildren().forEach(c => c.destroy({ children: true }));
                
                if (containerRef.current && containerRef.current.contains(app.canvas)) {
                    containerRef.current.removeChild(app.canvas);
                }

                appRef.current = null;
                visualsRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- State Sync ---
    useEffect(() => {
        if (!visualsRef.current) return;
        const { p1, p2 } = visualsRef.current;
        
        p1.maxHp = getTotalStat(gameState.p1, StatType.HP);
        p1.maxMana = getTotalStat(gameState.p1, StatType.MANA);
        p2.maxHp = getTotalStat(gameState.p2, StatType.HP);
        p2.maxMana = getTotalStat(gameState.p2, StatType.MANA);

        if (gameState.phase !== 'EXECUTING') {
            p1.targetHp = gameState.p1.currentHp;
            p1.targetMana = gameState.p1.currentMana;
            p2.targetHp = gameState.p2.currentHp;
            p2.targetMana = gameState.p2.currentMana;
        }
    }, [gameState]);

    // --- Event Processing ---
    useEffect(() => {
        if (gameState.phase !== 'EXECUTING') return;

        const safetyTimer = setTimeout(() => {
            if (onAnimationsComplete) onAnimationsComplete();
        }, 8000); 

        const processAnimations = async () => {
            let attempts = 0;
            while ((!appRef.current || !visualsRef.current) && attempts < 10) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
            }
            if (!appRef.current || !visualsRef.current) return;

            if (!gameState.events || gameState.events.length === 0) return;

            const { p1, p2 } = visualsRef.current;
            const app = appRef.current;

            const getEntity = (id: string) => {
                if (id === gameState.p1.id) return p1;
                if (id === gameState.p2.id) return p2;
                return null;
            };

            const spawnText = (text: string, x: number, y: number, color: string = '#ffffff') => {
                const style = new PIXI.TextStyle({
                    fontFamily: '"Fusion Pixel", "Press Start 2P", cursive',
                    fontSize: 20,
                    fill: color,
                    stroke: { color: '#000000', width: 4 },
                    align: 'center',
                    dropShadow: {
                         color: '#000000',
                         blur: 2,
                         angle: Math.PI / 6,
                         distance: 2,
                     },
                });
                const basicText = new PIXI.Text({ text, style });
                basicText.x = x - basicText.width / 2;
                basicText.y = y - 100;
                basicText.resolution = 2; 
                app.stage.addChild(basicText);

                let velY = -3;
                let opacity = 1.0;
                const animateText = () => {
                    basicText.y += velY;
                    velY += 0.15; 
                    
                    if (velY > 0) opacity -= 0.05;
                    basicText.alpha = opacity;

                    if (opacity <= 0) {
                        if (basicText.parent) app.stage.removeChild(basicText);
                        basicText.destroy();
                    } else if (basicText.parent) {
                        requestAnimationFrame(animateText);
                    }
                };
                requestAnimationFrame(animateText);
            };

            for (const evt of gameState.events) {
                const source = evt.sourceId ? getEntity(evt.sourceId) : null;
                const target = evt.targetId ? getEntity(evt.targetId) : null;

                const pause = evt.type === 'TEXT' ? 50 : 300;
                
                if (evt.type === 'PROJECTILE' && source && target) {
                    await new Promise<void>(resolve => {
                        const isMagic = evt.projectileType === 'MAGIC';
                        
                        const customColor = evt.visual?.color ? parseInt(evt.visual.color.replace('#', '0x')) : null;
                        const customShape = evt.visual?.shape || 'CIRCLE';
                        
                        const defaultColor = isMagic ? 0x3b82f6 : 0xef4444;
                        const color = customColor !== null ? customColor : defaultColor;
                        
                        const value = evt.value || 100;
                        const trajectory = isMagic ? 'LINEAR' : 'PARABOLIC';
                        
                        createProjectile(
                            app, 
                            source.container.x + (source.isFacingLeft ? -20 : 20), 
                            source.container.y - 40, 
                            target.container.x, 
                            target.container.y - 30, 
                            color, 
                            value, 
                            trajectory,
                            customShape,
                            resolve
                        );
                    });
                    await new Promise(r => setTimeout(r, 50));
                    continue; 
                }

                await new Promise(r => setTimeout(r, pause));

                if (evt.type === 'ATTACK_MOVE' && source && target) {
                    const startX = source.container.x;
                    const endX = target.container.x > startX ? target.container.x - 80 : target.container.x + 80;
                    
                    for (let i = 0; i < 8; i++) {
                        source.container.x += (endX - startX) / 8;
                        await new Promise(r => setTimeout(r, 16));
                    }
                    
                    source.animateAttack();

                    createSlashEffect(app, target.container.x, target.container.y);
                    
                    await new Promise(r => setTimeout(r, 100));
                    source.container.x = startX;
                } 
                else if (evt.type === 'SKILL_EFFECT' && source) {
                    spawnText(evt.skillName || 'CAST', source.container.x, source.container.y - 40, '#fbbf24');
                    const animType = evt.visual?.animationType || 'CAST';

                    if (animType === 'THRUST') {
                        // Check if Ranged weapon (Bow/Staff) -> Then use Ranged Thrust (Shoot in place)
                        // Otherwise Melee Thrust (Dash + Hit)
                        const wType = source.appearance.weapon;
                        const isRanged = wType === 'BOW' || wType === 'STAFF';

                        if (isRanged) {
                            source.animateAttack();
                            // Spawn projectile logic
                            const startX = source.container.x + (source.isFacingLeft ? -20 : 20);
                            const startY = source.container.y - 40;
                            const endX = target ? target.container.x : startX + (source.isFacingLeft ? -200 : 200);
                            const endY = target ? target.container.y - 30 : startY;

                            if (wType === 'BOW') {
                                await new Promise<void>(resolve => {
                                    createProjectile(app, startX, startY, endX, endY, 0x94a3b8, 100, 'LINEAR', 'CIRCLE', resolve);
                                });
                            } else {
                                await new Promise<void>(resolve => {
                                    createProjectile(app, startX, startY, endX, endY, 0xa855f7, 100, 'LINEAR', 'ORB', resolve);
                                });
                            }
                        } else {
                            // Melee Thrust
                            if (target) {
                                const startX = source.container.x;
                                const endX = target.container.x > startX ? target.container.x - 60 : target.container.x + 60;
                                // Dash
                                for (let i = 0; i < 5; i++) {
                                    source.container.x += (endX - startX) / 5;
                                    await new Promise(r => setTimeout(r, 16));
                                }
                                source.animateAttack();
                                createSlashEffect(app, target.container.x, target.container.y);
                                await new Promise(r => setTimeout(r, 100));
                                source.container.x = startX;
                            } else {
                                source.animateAttack();
                            }
                        }

                    } else if (animType === 'THROW') {
                        if (target) {
                            // 1. Hide real weapon
                            source.setWeaponVisible(false);

                            // 2. Create Clone
                            const weaponClone = new PIXI.Graphics();
                            drawWeapon(weaponClone, source.appearance);
                            weaponClone.x = source.container.x;
                            weaponClone.y = source.container.y - 30;
                            app.stage.addChild(weaponClone);

                            const targetX = target.container.x;
                            const targetY = target.container.y - 10; // Ground level

                            // 3. Throw Arc
                            const steps = 30;
                            const dx = targetX - weaponClone.x;
                            const dy = targetY - weaponClone.y;
                            const startX = weaponClone.x;
                            const startY = weaponClone.y;
                            
                            for (let i = 1; i <= steps; i++) {
                                const t = i / steps;
                                weaponClone.x = startX + dx * t;
                                weaponClone.y = startY + dy * t - Math.sin(t * Math.PI) * 100; // Arc height
                                weaponClone.rotation += 0.5;
                                await new Promise(r => setTimeout(r, 16));
                            }
                            
                            // 4. Hit Effect
                            createParticles(app, targetX, targetY - 20, 0xffffff, 5, 'EXPLOSION');
                            
                            // 5. Weapon stuck in ground
                            weaponClone.rotation = 2.5; // Stuck angle
                            weaponClone.y = targetY;

                            // 6. Character runs to weapon
                            const runnerStartX = source.container.x;
                            const distToWeapon = targetX > runnerStartX ? targetX - 40 : targetX + 40;
                            
                            for (let i = 0; i < 20; i++) {
                                source.container.x += (distToWeapon - runnerStartX) / 20;
                                await new Promise(r => setTimeout(r, 16));
                            }

                            // 7. Pick up
                            weaponClone.destroy();
                            source.setWeaponVisible(true);
                            await new Promise(r => setTimeout(r, 200));

                            // 8. Run back
                            for (let i = 0; i < 20; i++) {
                                source.container.x += (runnerStartX - source.container.x) * 0.2; // Ease out
                                await new Promise(r => setTimeout(r, 16));
                            }
                            source.container.x = runnerStartX;

                        } else {
                            source.animateAttack();
                        }

                    } else {
                        // Default Cast
                        source.animateCast();
                        createMagicEffect(app, source.container.x, source.container.y, 0xfbbf24);
                    }
                    await new Promise(r => setTimeout(r, 200));
                }
                else if (evt.type === 'DAMAGE' && target) {
                    if (evt.value) target.targetHp -= evt.value;
                    spawnText(evt.value?.toString() || '', target.container.x, target.container.y, evt.color || '#ef4444');
                    
                    const particleCount = Math.min(20, Math.floor((evt.value || 0) / 50) + 5);
                    createParticles(app, target.container.x, target.container.y, 0xef4444, particleCount, 'EXPLOSION');

                    const originalTint = target.graphics.tint;
                    target.graphics.tint = 0xff0000;
                    
                    const baseX = target.container.x;
                    for(let i=0; i<6; i++) {
                        target.container.x = baseX + (Math.random() - 0.5) * 20;
                        await new Promise(r => setTimeout(r, 30));
                    }
                    target.container.x = baseX;
                    target.graphics.tint = 0xffffff;
                }
                else if (evt.type === 'HEAL' && target) {
                    if (evt.value) target.targetHp += evt.value;
                    spawnText(`+${evt.value}`, target.container.x, target.container.y, '#4ade80');
                    
                    const customColor = evt.visual?.color ? parseInt(evt.visual.color.replace('#', '0x')) : 0x4ade80;
                    createAuraEffect(app, target.container.x, target.container.y, customColor, 'UP');
                }
                else if (evt.type === 'MANA' && target) {
                     if (evt.value) {
                         target.targetMana += evt.value;
                         const val = evt.value;
                         const text = val > 0 ? `+${val} MP` : `${val} MP`;
                         spawnText(text, target.container.x, target.container.y, '#3b82f6');
                     }
                }
                else if (evt.type === 'STAT_CHANGE' && target) {
                    let colorHex = '#ffffff';
                    let particleColor = 0xffffff;
                    
                    if (evt.visual?.color) {
                        colorHex = evt.visual.color;
                        particleColor = parseInt(colorHex.replace('#', '0x'));
                    } else if (evt.stat) {
                        const c = STAT_COLORS[evt.stat] || 0xffffff;
                        particleColor = c;
                        colorHex = '#' + c.toString(16).padStart(6, '0');
                    }
                    
                    spawnText(evt.text || 'STAT', target.container.x, target.container.y - 20, colorHex);
                    
                    if (evt.value && evt.value < 0) {
                        createAuraEffect(app, target.container.x, target.container.y, particleColor, 'DOWN');
                    } else {
                        createAuraEffect(app, target.container.x, target.container.y, particleColor, 'UP');
                    }
                }
            }
            
            await new Promise(r => setTimeout(r, 500));
        };

        processAnimations()
            .then(() => {
                clearTimeout(safetyTimer);
                if (onAnimationsComplete) onAnimationsComplete();
            })
            .catch(err => {
                console.error("Animation Error:", err);
                clearTimeout(safetyTimer);
                if (onAnimationsComplete) onAnimationsComplete();
            });

        return () => clearTimeout(safetyTimer);
    }, [gameState.phase, gameState.events, gameState.p1.id, gameState.p2.id, onAnimationsComplete]);

    return (
        <div ref={containerRef} className="border-4 border-slate-700 rounded-lg shadow-2xl bg-slate-900 overflow-hidden relative" style={{ width: 800, height: 400 }}>
        </div>
    );
};

export default BattleScene;
