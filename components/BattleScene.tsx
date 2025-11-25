
import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { BattleState, StatType, BattleEvent, VisualShape, AppearanceConfig } from '../types';
import { getTotalStat } from '../utils/gameEngine';
import { drawBody, drawWeapon, getDefaultAppearance, classifyHero } from '../utils/heroSystem';

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

// --- Effects Helpers ---

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
            p.rotation += 0.1;

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

const createSlashEffect = (app: PIXI.Application, x: number, y: number) => {
    const g = new PIXI.Graphics();
    g.position.set(x, y - 40);
    g.scale.set(1, 0); 
    
    g.arc(0, 0, 40, Math.PI * 0.8, Math.PI * 2.2);
    g.stroke({ width: 8, color: 0xffffff });
    
    app.stage.addChild(g);

    let frame = 0;
    const animate = () => {
        frame++;
        if (frame < 5) {
            g.scale.y = frame / 5;
        } else {
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

// --- NEW SPECIALIZED EFFECTS ---

// 1. Star Barrage: Multiple stars flying in curves
const createStarBarrage = (app: PIXI.Application, startX: number, startY: number, endX: number, endY: number, color: number, onComplete: () => void) => {
    const starCount = 10; 
    let activeStars = starCount;

    for (let i = 0; i < starCount; i++) {
        setTimeout(() => {
            if (!app.stage) return; // Safety
            const g = new PIXI.Graphics();
            const size = 6 + Math.random() * 8;
            g.star(0, 0, 5, size, size * 0.4).fill(color); 
            g.x = startX;
            g.y = startY;
            app.stage.addChild(g);

            // Control points for bezier curve
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            const cpX = midX + (Math.random() - 0.5) * 400; // Wide spread
            const cpY = midY + (Math.random() - 1.0) * 300; // Arching up/down

            let t = 0;
            const duration = 45 + Math.random() * 20; 

            const animate = () => {
                t += 1 / duration;
                if (t >= 1) {
                    if (g.parent) app.stage.removeChild(g);
                    g.destroy();
                    createParticles(app, endX, endY, color, 3, 'EXPLOSION'); // Mini explosion
                    activeStars--;
                    if (activeStars === 0) onComplete();
                    return;
                }
                
                // Quadratic Bezier
                const invT = 1 - t;
                g.x = invT * invT * startX + 2 * invT * t * cpX + t * t * endX;
                g.y = invT * invT * startY + 2 * invT * t * cpY + t * t * endY;
                
                g.rotation += 0.3; 
                g.scale.set(1 - (t * 0.3));

                // Trail particles
                if (Math.random() > 0.5) {
                    const trail = new PIXI.Graphics();
                    trail.circle(0,0, 2).fill({color, alpha: 0.5});
                    trail.x = g.x; trail.y = g.y;
                    app.stage.addChild(trail);
                    // Fade trail
                    const fade = () => {
                        trail.alpha -= 0.1;
                        if(trail.alpha <= 0) { trail.destroy(); } else requestAnimationFrame(fade);
                    }
                    requestAnimationFrame(fade);
                }

                requestAnimationFrame(animate);
            };
            requestAnimationFrame(animate);

        }, i * 60); 
    }
};

// 2. Falling Squares: Rain down from the sky
const createFallingSquares = (app: PIXI.Application, targetX: number, targetY: number, color: number, onComplete: () => void) => {
    const count = 8;
    let landed = 0;

    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            if (!app.stage) return;
            const g = new PIXI.Graphics();
            const size = 15 + Math.random() * 25;
            
            // Draw square with inner detail
            g.rect(-size/2, -size/2, size, size).fill(color);
            g.rect(-size/4, -size/4, size/2, size/2).fill({color: 0xffffff, alpha: 0.4});
            
            // Start high above
            const startX = targetX + (Math.random() - 0.5) * 150;
            const startY = targetY - 400 - (Math.random() * 200);
            
            g.x = startX;
            g.y = startY;
            g.rotation = Math.random() * Math.PI;
            app.stage.addChild(g);

            let vy = 0;
            const gravity = 0.8;
            
            const animate = () => {
                vy += gravity;
                g.y += vy;
                g.rotation += 0.05;
                // Lerp X towards target
                g.x += (targetX - g.x) * 0.02;

                if (g.y >= targetY - 20) { 
                    if (g.parent) app.stage.removeChild(g);
                    g.destroy();
                    createParticles(app, g.x, targetY, color, 6, 'EXPLOSION');
                    landed++;
                    if (landed === count) onComplete();
                } else {
                    requestAnimationFrame(animate);
                }
            };
            requestAnimationFrame(animate);
        }, i * 120);
    }
};

// 3. Laser Beam: Rapid fade out glow
const createLaserBeam = (app: PIXI.Application, startX: number, startY: number, endX: number, endY: number, color: number, onComplete: () => void) => {
    const container = new PIXI.Container();
    app.stage.addChild(container);

    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const angle = Math.atan2(dy, dx);

    container.x = startX;
    container.y = startY;
    container.rotation = angle;

    const beam = new PIXI.Graphics();
    container.addChild(beam);

    // Initial Flash at source
    createParticles(app, startX, startY, color, 10, 'EXPLOSION');
    // Hit Flash
    createParticles(app, endX, endY, color, 15, 'EXPLOSION');

    let frames = 0;
    const duration = 20; // Fast

    const animate = () => {
        frames++;
        const progress = frames / duration;
        
        if (progress >= 1) {
            container.destroy({children: true});
            onComplete();
            return;
        }

        const width = 20 * (1 - progress); // Tapering over time
        
        beam.clear();
        // Core
        beam.moveTo(0, 0).lineTo(dist, 0).stroke({ width: width * 0.4, color: 0xffffff, cap: 'round', alpha: 1 - progress });
        // Glow
        beam.moveTo(0, 0).lineTo(dist, 0).stroke({ width: width, color: color, cap: 'round', alpha: (1 - progress) * 0.7 });
        // Outer Haze
        beam.moveTo(0, 0).lineTo(dist, 0).stroke({ width: width * 2, color: color, cap: 'round', alpha: (1 - progress) * 0.3 });

        requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
};

// 4. Default Projectile (Orb/Circle) with enhanced Trail
const createOrbProjectile = (
    app: PIXI.Application, 
    startX: number, 
    startY: number, 
    endX: number, 
    endY: number, 
    color: number, 
    value: number, 
    trajectory: 'LINEAR' | 'PARABOLIC',
    shape: VisualShape = 'CIRCLE',
    onComplete: () => void
) => {
    const g = new PIXI.Graphics();
    app.stage.addChild(g);

    // Size scaling
    const size = Math.min(30, 8 + Math.log(Math.max(1, value)) * 2);
    
    // Draw projectile based on remaining shapes (ORB / CIRCLE / others fall back here)
    if (shape === 'ORB') {
        g.circle(0, 0, size).fill(color);
        g.circle(0, 0, size * 1.5).stroke({ width: 2, color: color, alpha: 0.6 });
        // Glow center
        g.circle(0, 0, size * 0.5).fill({ color: 0xffffff, alpha: 0.8 });
    } else {
        // Circle default
        g.circle(0, 0, size).fill(color);
        g.circle(0, 0, size * 1.5).fill({ color: color, alpha: 0.3 });
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
    
    const animate = () => {
        progress += 1;
        const ratio = Math.min(1, progress / duration);
        
        if (trajectory === 'LINEAR') {
             g.x = startX + dx * ratio;
             g.y = startY + dy * ratio;
             g.rotation += 0.2;
        } else {
             g.x = startX + dx * ratio;
             g.y = startY + dy * ratio - Math.sin(ratio * Math.PI) * 80; // Arc
             g.rotation += 0.2;
        }

        // Enhanced Trail: Spawn particles
        if (progress % 2 === 0) {
            const p = new PIXI.Graphics();
            if (shape === 'ORB') {
                p.circle(0, 0, size * 0.5).fill({ color: color, alpha: 0.6 });
            } else {
                p.circle(0, 0, size * 0.6).fill({ color: color, alpha: 0.5 });
            }
            
            // Random offset
            const offset = (Math.random() - 0.5) * 10;
            p.x = g.x + offset;
            p.y = g.y + offset;
            app.stage.addChild(p);

            const trailFade = () => {
                p.alpha -= 0.05;
                p.scale.x *= 0.9;
                p.scale.y *= 0.9;
                if (p.alpha <= 0) {
                    p.destroy();
                } else {
                    requestAnimationFrame(trailFade);
                }
            };
            requestAnimationFrame(trailFade);
        }

        if (ratio >= 1) {
            if (g.parent) app.stage.removeChild(g);
            g.destroy();
            onComplete();
        } else {
            requestAnimationFrame(animate);
        }
    };
    requestAnimationFrame(animate);
};

// Dispatcher Function
const createProjectile = (
    app: PIXI.Application, 
    startX: number, 
    startY: number, 
    endX: number, 
    endY: number, 
    color: number, 
    value: number, 
    trajectory: 'LINEAR' | 'PARABOLIC',
    shape: VisualShape = 'CIRCLE',
    onHit: () => void
) => {
    if (shape === 'STAR') {
        createStarBarrage(app, startX, startY, endX, endY, color, onHit);
        return;
    }
    if (shape === 'SQUARE') {
        createFallingSquares(app, endX, endY, color, onHit);
        return;
    }
    if (shape === 'BEAM') {
        createLaserBeam(app, startX, startY, endX, endY, color, onHit);
        return;
    }

    // Default to Orb/Circle logic
    createOrbProjectile(app, startX, startY, endX, endY, color, value, trajectory, shape, onHit);
};

const createAuraEffect = (
    app: PIXI.Application,
    x: number,
    y: number,
    color: number,
    direction: 'UP' | 'DOWN'
) => {
    const particleCount = 20;
    
    for(let i = 0; i < particleCount; i++) {
        setTimeout(() => {
            if (!app.stage) return; 
            const p = new PIXI.Graphics();
            
            p.circle(0,0, 4).fill({ color, alpha: 0.8 });
            
            const offsetX = (Math.random() - 0.5) * 40;
            const startY = direction === 'UP' ? y : y - 80;
            
            p.x = x + offsetX;
            p.y = startY;
            app.stage.addChild(p);

            const speed = (Math.random() * 2 + 1) * (direction === 'UP' ? -1 : 1);
            let alpha = 1.0;

            const animate = () => {
                if (!p.parent) return;
                p.y += speed;
                p.y += Math.sin(p.x * 0.1) * 0.5;
                alpha -= 0.02;
                p.alpha = alpha;
                
                if (alpha <= 0) {
                    if (p.parent) app.stage.removeChild(p);
                    p.destroy();
                } else {
                    requestAnimationFrame(animate);
                }
            };
            requestAnimationFrame(animate);

        }, i * 50); 
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
                    if (evt.skillName === '普通攻击') {
                        source.animateAttack(); 
                    } else {
                        source.animateCast();
                    }
                    createMagicEffect(app, source.container.x, source.container.y, 0xfbbf24);
                    await new Promise(r => setTimeout(r, 400));
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
