import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { BattleState, StatType, BattleEvent } from '../types';
import { getTotalStat } from '../utils/gameEngine';

interface Props {
    gameState: BattleState;
    onAnimationsComplete?: () => void;
}

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

    // Animation State
    animOffset: number = Math.random() * 100;
    
    constructor(colorHex: string, x: number, y: number, maxHp: number, maxMana: number, isFacingLeft: boolean) {
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;

        this.maxHp = maxHp;
        this.maxMana = maxMana;
        this.currentHp = maxHp;
        this.currentMana = maxMana;
        this.targetHp = maxHp;
        this.targetMana = maxHp;

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

        // Draw Pixel Character
        this.graphics = new PIXI.Graphics();
        this.drawCharacter(colorHex);
        this.characterGroup.addChild(this.graphics);

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
        
        const g = this.graphics;
        g.clear();

        // Pixel Scale
        const S = 4; 

        // Legs
        g.rect(-4 * S, 0, 3 * S, 6 * S).fill(dark); // Left Leg
        g.rect(1 * S, 0, 3 * S, 6 * S).fill(dark);  // Right Leg

        // Body
        g.rect(-5 * S, -8 * S, 10 * S, 8 * S).fill(hex); // Armor
        g.rect(-3 * S, -6 * S, 6 * S, 4 * S).fill(0xffffff); // Chest Highlight

        // Head
        g.rect(-4 * S, -14 * S, 8 * S, 6 * S).fill(skin); // Face
        g.rect(-4 * S, -16 * S, 8 * S, 4 * S).fill(hex); // Helmet Top
        g.rect(-5 * S, -15 * S, 1 * S, 6 * S).fill(hex); // Helmet Side L
        g.rect(4 * S, -15 * S, 1 * S, 6 * S).fill(hex); // Helmet Side R

        // Eyes
        g.rect(-2 * S, -12 * S, 1 * S, 1 * S).fill(0x000000);
        g.rect(1 * S, -12 * S, 1 * S, 1 * S).fill(0x000000);

        // Weapon (Sword)
        g.rect(6 * S, -6 * S, 2 * S, 10 * S).fill(0x94a3b8); // Blade
        g.rect(5 * S, 0 * S, 4 * S, 1 * S).fill(0x475569); // Guard
        g.rect(6.5 * S, 1 * S, 1 * S, 3 * S).fill(0x8b4513); // Hilt
    }

    updateBars() {
        const barWidth = 80;
        const barHeight = 8;
        const g = new PIXI.Graphics();
        
        // HP Background
        g.rect(-barWidth/2 - 2, 0 - 2, barWidth + 4, barHeight + 4).fill(0x000000);
        g.rect(-barWidth/2, 0, barWidth, barHeight).fill(0x334155);
        
        // HP Foreground
        const hpPct = this.maxHp > 0 ? Math.max(0, this.currentHp / this.maxHp) : 0;
        g.rect(-barWidth/2, 0, barWidth * hpPct, barHeight).fill(0xef4444);

        // Mana Background
        g.rect(-barWidth/2 - 2, 12 - 2, barWidth + 4, 4 + 4).fill(0x000000);
        
        // Mana Foreground
        const mpPct = this.maxMana > 0 ? Math.max(0, this.currentMana / this.maxMana) : 0;
        g.rect(-barWidth/2, 12, barWidth * mpPct, 4).fill(0x3b82f6);

        this.hpBar.removeChildren();
        this.hpBar.addChild(g);
    }

    animateIdle(time: number) {
        // Bobbing effect
        const yOffset = Math.sin((time + this.animOffset) * 0.1) * 4;
        this.characterGroup.y = -24 + yOffset; // Center anchor adjustment + bob
        this.shadow.scale.set(1 + Math.sin((time + this.animOffset) * 0.1) * 0.1);
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

const createParticles = (app: PIXI.Application, x: number, y: number, color: number, count: number = 5) => {
    for (let i = 0; i < count; i++) {
        const p = new PIXI.Graphics();
        p.rect(0, 0, 6, 6).fill(color);
        p.x = x;
        p.y = y - 30;
        app.stage.addChild(p);

        const vx = (Math.random() - 0.5) * 10;
        const vy = (Math.random() - 1) * 10;
        let life = 1.0;

        const animate = () => {
            p.x += vx;
            p.y += vy;
            life -= 0.05;
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

const BattleScene: React.FC<Props> = ({ gameState, onAnimationsComplete }) => {
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
                    // If component unmounted while we were initing, we don't need to do anything with the app
                    // because it is a singleton. Just don't attach listeners.
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
                // We use removeChildren to get the list, then destroy them to free GPU memory
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
                const v1 = new PixelEntity(gameState.p1.config.avatarColor, 200, 300, maxHp1, maxMana1, false);
                
                const maxHp2 = getTotalStat(gameState.p2, StatType.HP);
                const maxMana2 = getTotalStat(gameState.p2, StatType.MANA);
                const v2 = new PixelEntity(gameState.p2.config.avatarColor, 600, 300, maxHp2, maxMana2, true);

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
                
                // Stop ticker updates
                if (tickerFuncRef.current) {
                    app.ticker.remove(tickerFuncRef.current);
                    tickerFuncRef.current = null;
                }

                // Cleanup stage content (but do NOT destroy the app itself)
                app.stage.removeChildren().forEach(c => c.destroy({ children: true }));
                
                // Detach canvas from DOM
                if (containerRef.current && containerRef.current.contains(app.canvas)) {
                    containerRef.current.removeChild(app.canvas);
                }

                appRef.current = null;
                visualsRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount

    // --- Event Processing ---
    useEffect(() => {
        if (gameState.phase !== 'EXECUTING') return;

        const safetyTimer = setTimeout(() => {
            if (onAnimationsComplete) onAnimationsComplete();
        }, 5000);

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
                    fontFamily: '"Press Start 2P", cursive',
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
                await new Promise(r => setTimeout(r, pause));

                if (evt.type === 'ATTACK_MOVE' && source && target) {
                    const startX = source.container.x;
                    const endX = target.container.x > startX ? target.container.x - 80 : target.container.x + 80;
                    
                    // Dash
                    for (let i = 0; i < 8; i++) {
                        source.container.x += (endX - startX) / 8;
                        await new Promise(r => setTimeout(r, 16));
                    }
                    
                    // Slash visual
                    createSlashEffect(app, target.container.x, target.container.y);
                    
                    // Return
                    await new Promise(r => setTimeout(r, 100));
                    source.container.x = startX;
                } 
                else if (evt.type === 'SKILL_EFFECT' && source) {
                    spawnText(evt.skillName || 'CAST', source.container.x, source.container.y - 40, '#fbbf24');
                    // Charge Effect
                    createMagicEffect(app, source.container.x, source.container.y, 0xfbbf24);
                    await new Promise(r => setTimeout(r, 400));
                }
                else if (evt.type === 'DAMAGE' && target) {
                    if (evt.value) target.targetHp -= evt.value;
                    spawnText(evt.value?.toString() || '', target.container.x, target.container.y, evt.color || '#ef4444');
                    
                    // Particles
                    createParticles(app, target.container.x, target.container.y, 0xef4444, 8);

                    // Flash Red
                    const originalTint = target.characterGroup.tint;
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
                    createParticles(app, target.container.x, target.container.y, 0x4ade80, 5);
                }
                else if (evt.type === 'MANA' && target) {
                     if (evt.value) target.targetMana += evt.value;
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