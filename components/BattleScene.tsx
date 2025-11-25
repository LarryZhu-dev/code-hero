

import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { BattleState, StatType, BattleEvent } from '../types';
import { getTotalStat } from '../utils/gameEngine';

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
        // PIXI v8.x destroy() can throw if this.renderer is undefined/null.
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

    // 1. Check existing global app
    if (w.__CW_PIXI_APP__) {
        // Check if renderer is valid (not destroyed)
        if (w.__CW_PIXI_APP__.renderer) {
            return w.__CW_PIXI_APP__;
        }
        // If app exists but renderer is dead, destroy it cleanly
        console.warn("Found zombie PIXI App. Cleaning up...");
        safeDestroy(w.__CW_PIXI_APP__);
        w.__CW_PIXI_APP__ = null;
    }

    // 2. Check in-progress initialization
    if (w.__CW_PIXI_INIT_PROMISE__) {
        try {
            return await w.__CW_PIXI_INIT_PROMISE__;
        } catch (e) {
            w.__CW_PIXI_INIT_PROMISE__ = null;
        }
    }

    // 3. Initialize new app
    w.__CW_PIXI_INIT_PROMISE__ = (async () => {
        const app = new PIXI.Application();
        try {
            await app.init({ 
                width: 800, 
                height: 400, 
                backgroundColor: 0x0f172a, // Slate-900
                antialias: false,
                // preference: 'webgl' // REMOVED: Causing "Extension type batcher already has a handler" in some environments
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
    graphics: PIXI.Graphics;
    shadow: PIXI.Graphics;
    hpBar: PIXI.Container;
    
    // Stats
    maxHp: number;
    maxMana: number;
    currentHp: number;
    currentMana: number;
    targetHp: number;
    targetMana: number;
    isMage: boolean;
    isFacingLeft: boolean;

    // Animation State
    animOffset: number = Math.random() * 100;
    
    constructor(
        colorHex: string, 
        x: number, 
        y: number, 
        maxHp: number, 
        maxMana: number, 
        isFacingLeft: boolean,
        id: string,
        isMage: boolean,
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
        this.isMage = isMage;
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

        // Main Graphics (Shared logic helper, drawing to body/hand separately)
        this.graphics = new PIXI.Graphics(); 
        
        this.drawCharacter(colorHex);

        // HP Bar Group
        this.hpBar = new PIXI.Container();
        this.hpBar.y = -100; // Position above head
        this.container.addChild(this.hpBar);
        this.updateBars();
    }

    drawCharacter(colorHex: string) {
        const hex = colorHex.startsWith('#') ? parseInt(colorHex.slice(1), 16) : 0x3b82f6;
        const dark = 0x1e293b;
        const skin = 0xffdbac;
        const S = 4; // Pixel Scale

        // Clear previous
        this.bodyGroup.removeChildren();
        this.handGroup.removeChildren();

        const bg = new PIXI.Graphics();
        this.bodyGroup.addChild(bg);

        // -- BODY DRAWING --
        // Legs
        bg.rect(-4 * S, 0, 3 * S, 6 * S).fill(dark); // Left Leg
        bg.rect(1 * S, 0, 3 * S, 6 * S).fill(dark);  // Right Leg

        if (this.isMage) {
            // ROBE Body
            bg.rect(-5 * S, -8 * S, 10 * S, 9 * S).fill(hex); 
            bg.rect(-2 * S, -8 * S, 4 * S, 9 * S).fill(0x334155); // Inner robe strip
            
            // Head (Hooded)
            bg.rect(-4 * S, -14 * S, 8 * S, 6 * S).fill(skin); // Face
            bg.rect(-5 * S, -16 * S, 10 * S, 4 * S).fill(hex); // Hat Brim
            bg.rect(-3 * S, -20 * S, 6 * S, 4 * S).fill(hex); // Hat Top
            bg.rect(-1 * S, -22 * S, 2 * S, 2 * S).fill(hex); // Hat Tip
        } else {
            // ARMOR Body
            bg.rect(-5 * S, -8 * S, 10 * S, 8 * S).fill(hex); 
            bg.rect(-3 * S, -6 * S, 6 * S, 4 * S).fill(0xffffff); // Chest Highlight
            
            // Head (Helmet)
            bg.rect(-4 * S, -14 * S, 8 * S, 6 * S).fill(skin); // Face
            bg.rect(-4 * S, -16 * S, 8 * S, 4 * S).fill(hex); // Helmet Top
            bg.rect(-5 * S, -15 * S, 1 * S, 6 * S).fill(hex); // Helmet Side L
            bg.rect(4 * S, -15 * S, 1 * S, 6 * S).fill(hex); // Helmet Side R
        }

        // Eyes (Common)
        bg.rect(-2 * S, -12 * S, 1 * S, 1 * S).fill(0x000000);
        bg.rect(1 * S, -12 * S, 1 * S, 1 * S).fill(0x000000);

        // -- HAND/WEAPON DRAWING --
        const hg = new PIXI.Graphics();
        this.handGroup.addChild(hg);

        if (this.isMage) {
            // Staff
            // Local coords relative to shoulder (-2*S, -9*S)
            // Hand
            hg.rect(0, 0, 3 * S, 3 * S).fill(skin);
            // Staff Handle
            hg.rect(1 * S, -6 * S, 1 * S, 14 * S).fill(0x8b4513);
            // Staff Gem
            hg.circle(1.5 * S, -6 * S, 2.5 * S).fill(0x3b82f6);
            hg.circle(1.5 * S, -6 * S, 1.5 * S).fill(0xbfdbfe); // Shine
        } else {
            // Sword
            // Hand
            hg.rect(0, 0, 3 * S, 3 * S).fill(skin);
            // Sword Logic
            hg.rect(1 * S, -6 * S, 2 * S, 10 * S).fill(0x94a3b8); // Blade
            hg.rect(0 * S, 0 * S, 4 * S, 1 * S).fill(0x475569); // Guard
            hg.rect(1.5 * S, 1 * S, 1 * S, 3 * S).fill(0x8b4513); // Hilt
            
            // Rotate sword slightly forward to look natural
            hg.rotation = 0.5;
            hg.x = 2 * S;
        }

        this.graphics = bg; // Reference for tinting
    }

    updateBars() {
        const barWidth = 80;
        const barHeight = 8;
        const g = new PIXI.Graphics();
        
        // --- HP BAR ---
        const visualMaxHp = Math.max(this.maxHp, this.currentHp);
        
        // HP Background
        g.rect(-barWidth/2 - 2, 0 - 2, barWidth + 4, barHeight + 4).fill(0x000000);
        g.rect(-barWidth/2, 0, barWidth, barHeight).fill(0x334155);
        
        // HP Foreground
        const hpPct = visualMaxHp > 0 ? Math.max(0, this.currentHp / visualMaxHp) : 0;
        g.rect(-barWidth/2, 0, barWidth * hpPct, barHeight).fill(0xef4444);

        // HP Ticks
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
        // Bobbing effect
        const yOffset = Math.sin((time + this.animOffset) * 0.1) * 4;
        this.characterGroup.y = -24 + yOffset;
        this.shadow.scale.set(1 + Math.sin((time + this.animOffset) * 0.1) * 0.1);
        
        // Idle Hand Movement
        if (this.isMage) {
            // Breathing with staff
            this.handGroup.rotation = Math.sin((time + this.animOffset) * 0.05) * 0.1;
        } else {
             this.handGroup.rotation = Math.sin((time + this.animOffset) * 0.1) * 0.05;
        }
    }

    async animateAttack() {
        const startRot = this.handGroup.rotation;
        
        if (this.isMage) {
            // Raise Staff
            for(let i=0; i<10; i++) {
                this.handGroup.rotation -= 0.1; 
                await new Promise(r => setTimeout(r, 16));
            }
            // Hold
            await new Promise(r => setTimeout(r, 100));
            // Lower
             for(let i=0; i<10; i++) {
                this.handGroup.rotation += 0.1; 
                await new Promise(r => setTimeout(r, 16));
            }
        } else {
            // Swing Sword
            // Wind up
            for(let i=0; i<5; i++) {
                this.handGroup.rotation -= 0.2;
                await new Promise(r => setTimeout(r, 16));
            }
            // Slash down
            for(let i=0; i<5; i++) {
                this.handGroup.rotation += 0.5;
                await new Promise(r => setTimeout(r, 16));
            }
            // Return
             for(let i=0; i<10; i++) {
                this.handGroup.rotation = startRot + (startRot - this.handGroup.rotation) * (i/10);
                await new Promise(r => setTimeout(r, 16));
            }
        }
        this.handGroup.rotation = startRot;
    }

    async animateCast() {
        const startRot = this.handGroup.rotation;
        // Raise hand/staff high
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

// --- Effects Helpers ---

const createSlashEffect = (app: PIXI.Application, x: number, y: number) => {
    const g = new PIXI.Graphics();
    g.position.set(x, y - 40);
    g.scale.set(1, 0); // Start thin
    
    // Draw a crescent
    g.arc(0, 0, 40, Math.PI * 0.8, Math.PI * 2.2);
    g.stroke({ width: 8, color: 0xffffff });
    
    app.stage.addChild(g);

    let frame = 0;
    const animate = () => {
        frame++;
        // Expand height
        if (frame < 5) {
            g.scale.y = frame / 5;
        }
        // Fade out
        else {
            g.alpha -= 0.1;
        }

        if (g.alpha <= 0) {
            if (g.parent) app.stage.removeChild(g);
            g.destroy();
        } else {
            requestAnimationFrame(animate);
        }
    };
    requestAnimationFrame(animate);
};

const createMagicEffect = (app: PIXI.Application, x: number, y: number, color: number) => {
    const g = new PIXI.Graphics();
    g.position.set(x, y - 40);
    app.stage.addChild(g);

    let frame = 0;
    const animate = () => {
        frame++;
        g.clear();
        
        // Rotating square
        const size = frame * 4;
        const alpha = 1 - (frame / 30);
        
        if (alpha <= 0) {
            if (g.parent) app.stage.removeChild(g);
            g.destroy();
            return;
        }

        g.rect(-size/2, -size/2, size, size).stroke({ width: 4, color: color, alpha });
        g.rotation += 0.2;

        requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
};

const createProjectile = (
    app: PIXI.Application, 
    startX: number, 
    startY: number, 
    endX: number, 
    endY: number, 
    color: number, 
    value: number, 
    trajectory: 'LINEAR' | 'PARABOLIC',
    onHit: () => void
) => {
    const g = new PIXI.Graphics();
    app.stage.addChild(g);

    // Size scaling: Base 8, grows with damage
    const size = Math.min(30, 8 + Math.log(Math.max(1, value)) * 2);
    
    // Draw projectile
    g.circle(0, 0, size).fill(color);
    // Glow
    g.circle(0, 0, size * 1.5).fill({ color: color, alpha: 0.3 });

    // If linear magic, add a tail
    if (trajectory === 'LINEAR') {
        g.circle(-size, 0, size * 0.8).fill({ color: color, alpha: 0.6 });
        g.circle(-size * 2, 0, size * 0.5).fill({ color: color, alpha: 0.3 });
    }

    g.x = startX;
    g.y = startY;

    // Animation
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = trajectory === 'LINEAR' ? 20 : 15;
    const duration = distance / speed;
    
    let progress = 0;
    
    // Trail container
    const trail: PIXI.Graphics[] = [];

    const animate = () => {
        progress += 1;
        const ratio = Math.min(1, progress / duration);
        
        if (trajectory === 'LINEAR') {
             g.x = startX + dx * ratio;
             g.y = startY + dy * ratio;
        } else {
             g.x = startX + dx * ratio;
             g.y = startY + dy * ratio - Math.sin(ratio * Math.PI) * 50; // Arc
        }

        // Create trail dot
        if (progress % 2 === 0) {
            const t = new PIXI.Graphics();
            t.circle(0, 0, size * 0.6).fill({ color: color, alpha: 0.5 });
            t.x = g.x;
            t.y = g.y;
            app.stage.addChild(t);
            trail.push(t);
        }

        // Update trail fade
        for (let i = trail.length - 1; i >= 0; i--) {
            trail[i].alpha -= 0.1;
            trail[i].scale.set(trail[i].scale.x * 0.9);
            if (trail[i].alpha <= 0) {
                if (trail[i].parent) app.stage.removeChild(trail[i]);
                trail[i].destroy();
                trail.splice(i, 1);
            }
        }

        if (ratio >= 1) {
            if (g.parent) app.stage.removeChild(g);
            g.destroy();
            // Cleanup remaining trail
            trail.forEach(t => { if(t.parent) t.parent.removeChild(t); t.destroy(); });
            onHit();
        } else {
            requestAnimationFrame(animate);
        }
    };
    requestAnimationFrame(animate);
};

const createParticles = (
    app: PIXI.Application, 
    x: number, 
    y: number, 
    color: number, 
    count: number = 5,
    type: 'EXPLOSION' | 'UP' | 'DOWN' = 'EXPLOSION'
) => {
    for (let i = 0; i < count; i++) {
        const p = new PIXI.Graphics();
        p.rect(0, 0, 6, 6).fill(color);
        p.x = x;
        p.y = y - 30;
        app.stage.addChild(p);

        let vx = (Math.random() - 0.5) * 10;
        let vy = (Math.random() - 1) * 10;
        
        if (type === 'UP') {
            vx = (Math.random() - 0.5) * 4;
            vy = -Math.random() * 5 - 2;
        } else if (type === 'DOWN') {
            vx = (Math.random() - 0.5) * 4;
            vy = Math.random() * 5 + 2;
        }

        let life = 1.0;

        const animate = () => {
            p.x += vx;
            p.y += vy;
            life -= 0.03;
            p.scale.set(life);

            if (life <= 0) {
                if (p.parent) app.stage.removeChild(p);
                p.destroy();
            } else {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    }
};

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

                // Attach Canvas (if not already attached to this container)
                if (app.canvas.parentElement !== containerRef.current) {
                    if (app.canvas.parentElement) {
                        app.canvas.parentElement.removeChild(app.canvas);
                    }
                    containerRef.current.appendChild(app.canvas);
                }

                // Clear previous stage
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
                // Check Mage Condition (AP >= 2 * AD)
                const p1AD = getTotalStat(gameState.p1, StatType.AD);
                const p1AP = getTotalStat(gameState.p1, StatType.AP);
                const p1IsMage = p1AP >= (p1AD * 2) && p1AP > 0;

                const v1 = new PixelEntity(gameState.p1.config.avatarColor, 200, 300, maxHp1, maxMana1, false, gameState.p1.id, p1IsMage, onEntityClick);
                
                const maxHp2 = getTotalStat(gameState.p2, StatType.HP);
                const maxMana2 = getTotalStat(gameState.p2, StatType.MANA);
                const p2AD = getTotalStat(gameState.p2, StatType.AD);
                const p2AP = getTotalStat(gameState.p2, StatType.AP);
                const p2IsMage = p2AP >= (p2AD * 2) && p2AP > 0;

                const v2 = new PixelEntity(gameState.p2.config.avatarColor, 600, 300, maxHp2, maxMana2, true, gameState.p2.id, p2IsMage, onEntityClick);

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

        // --- Cleanup ---
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
    }, []); // Only run once on mount

    // --- State Sync (For Regen/Non-Event changes) ---
    useEffect(() => {
        if (!visualsRef.current) return;
        const { p1, p2 } = visualsRef.current;
        
        // Sync Max Stats (in case of buffs)
        p1.maxHp = getTotalStat(gameState.p1, StatType.HP);
        p1.maxMana = getTotalStat(gameState.p1, StatType.MANA);
        p2.maxHp = getTotalStat(gameState.p2, StatType.HP);
        p2.maxMana = getTotalStat(gameState.p2, StatType.MANA);

        // Sync Current Stats (Target) - Only if not currently executing animations
        // This ensures passive regen (which happens at start of turn) is reflected visually
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
        }, 8000); // Increased safety timeout for projectile flight time

        const processAnimations = async () => {
            // Wait for app to be ready (async check)
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
                basicText.resolution = 2; // sharper text
                app.stage.addChild(basicText);

                let velY = -3;
                let opacity = 1.0;
                const animateText = () => {
                    basicText.y += velY;
                    velY += 0.15; // gravity
                    
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

                // Dynamic pause based on event type
                const pause = evt.type === 'TEXT' ? 50 : 300;
                
                // For Projectiles, we wait for impact (logic handled inside)
                if (evt.type === 'PROJECTILE' && source && target) {
                    await new Promise<void>(resolve => {
                        const isMagic = evt.projectileType === 'MAGIC';
                        const color = isMagic ? 0x3b82f6 : 0xef4444;
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
                            resolve
                        );
                    });
                    // Minimal pause after impact before damage number
                    await new Promise(r => setTimeout(r, 50));
                    continue; // Skip the generic pause
                }

                await new Promise(r => setTimeout(r, pause));

                if (evt.type === 'ATTACK_MOVE' && source && target) {
                    const startX = source.container.x;
                    const endX = target.container.x > startX ? target.container.x - 80 : target.container.x + 80;
                    
                    // Dash
                    for (let i = 0; i < 8; i++) {
                        source.container.x += (endX - startX) / 8;
                        await new Promise(r => setTimeout(r, 16));
                    }
                    
                    // Trigger hand animation (Melee Swing)
                    source.animateAttack();

                    // Slash visual
                    createSlashEffect(app, target.container.x, target.container.y);
                    
                    // Return
                    await new Promise(r => setTimeout(r, 100));
                    source.container.x = startX;
                } 
                else if (evt.type === 'SKILL_EFFECT' && source) {
                    spawnText(evt.skillName || 'CAST', source.container.x, source.container.y - 40, '#fbbf24');
                    // Trigger Cast Animation
                    if (evt.skillName === '普通攻击') {
                        source.animateAttack(); // Magic Basic Attack
                    } else {
                        source.animateCast();
                    }
                    
                    // Charge Effect
                    createMagicEffect(app, source.container.x, source.container.y, 0xfbbf24);
                    await new Promise(r => setTimeout(r, 400));
                }
                else if (evt.type === 'DAMAGE' && target) {
                    if (evt.value) target.targetHp -= evt.value;
                    spawnText(evt.value?.toString() || '', target.container.x, target.container.y, evt.color || '#ef4444');
                    
                    // Particles - Scaled by damage
                    const particleCount = Math.min(20, Math.floor((evt.value || 0) / 50) + 5);
                    createParticles(app, target.container.x, target.container.y, 0xef4444, particleCount, 'EXPLOSION');

                    // Flash Red
                    const originalTint = target.graphics.tint;
                    target.graphics.tint = 0xff0000;
                    
                    // Shake
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
                    // Upward green particles
                    createParticles(app, target.container.x, target.container.y, 0x4ade80, 8, 'UP');
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
                    // Floating text for stat change
                    let colorHex = '#ffffff';
                    let particleColor = 0xffffff;
                    
                    if (evt.stat) {
                        const c = STAT_COLORS[evt.stat] || 0xffffff;
                        particleColor = c;
                        colorHex = '#' + c.toString(16).padStart(6, '0');
                    }
                    
                    spawnText(evt.text || 'STAT', target.container.x, target.container.y - 20, colorHex);
                    
                    // Downward particles if decrease
                    if (evt.value && evt.value < 0) {
                        createParticles(app, target.container.x, target.container.y, particleColor, 5, 'DOWN');
                    } else {
                        createParticles(app, target.container.x, target.container.y, particleColor, 5, 'UP');
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