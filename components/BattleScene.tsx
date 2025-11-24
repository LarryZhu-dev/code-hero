
import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { BattleState, StatType, BattleEvent } from '../types';
import { getTotalStat } from '../utils/gameEngine';

interface Props {
    gameState: BattleState;
    onAnimationsComplete?: () => void;
}

// Helper interface for global window object
interface WindowWithPixi extends Window {
    __PIXI_APP__?: PIXI.Application;
    __PIXI_INIT_PROMISE__?: Promise<PIXI.Application>;
}

// Global Singleton for PIXI Application
const getPixiApp = async () => {
    const win = window as unknown as WindowWithPixi;
    // 1. If App exists, return it
    if (win.__PIXI_APP__) return win.__PIXI_APP__;
    // 2. If initialization is in progress, wait for it
    if (win.__PIXI_INIT_PROMISE__) return win.__PIXI_INIT_PROMISE__;

    // 3. Start initialization
    win.__PIXI_INIT_PROMISE__ = (async () => {
        try {
            const app = new PIXI.Application();
            await app.init({ 
                width: 800, 
                height: 400, 
                backgroundColor: 0x1a202c,
                preference: 'webgl',
                antialias: true
            });
            win.__PIXI_APP__ = app;
            return app;
        } catch (e) {
            console.error("PixiJS Init Failed:", e);
            // Recovery attempt: check if app exists despite error (race condition)
            if (win.__PIXI_APP__) return win.__PIXI_APP__;
            throw e;
        }
    })();

    return win.__PIXI_INIT_PROMISE__;
};

// Visual Entity Management
class VisualEntity {
    container: PIXI.Container;
    sprite: PIXI.Graphics;
    hpBar: PIXI.Graphics;
    maxHp: number = 100;
    maxMana: number = 100;
    currentHp: number = 100;
    currentMana: number = 100;
    targetHp: number = 100;
    targetMana: number = 100;
    
    constructor(color: string, x: number, y: number, maxHp: number, maxMana: number) {
        this.container = new PIXI.Container();
        this.container.x = x;
        this.container.y = y;

        this.maxHp = maxHp;
        this.maxMana = maxMana;
        this.currentHp = maxHp;
        this.currentMana = maxMana;
        this.targetHp = maxHp;
        this.targetMana = maxMana;

        // Character Sprite
        this.sprite = new PIXI.Graphics();
        this.sprite.rect(-25, -50, 50, 100);
        this.sprite.fill(parseInt(color.replace('#', '0x')));
        this.container.addChild(this.sprite);

        // HP Bar
        this.hpBar = new PIXI.Graphics();
        this.container.addChild(this.hpBar);
        this.updateBars();
    }

    updateBars() {
        const bar = this.hpBar;
        bar.clear();
        
        // HP Back
        bar.roundRect(-60, 60, 120, 16, 4);
        bar.fill(0x000000);
        
        // HP Front (Lerp currentHp)
        const hpPct = this.maxHp > 0 ? Math.max(0, this.currentHp / this.maxHp) : 0;
        bar.roundRect(-60, 60, 120 * hpPct, 16, 4);
        bar.fill(0xe11d48);

        // Mana Back
        bar.roundRect(-60, 80, 120, 8, 4);
        bar.fill(0x000000);

        // Mana Front
        const manaPct = this.maxMana > 0 ? Math.max(0, this.currentMana / this.maxMana) : 0;
        bar.roundRect(-60, 80, 120 * manaPct, 8, 4);
        bar.fill(0x3b82f6);
    }
}

const BattleScene: React.FC<Props> = ({ gameState, onAnimationsComplete }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const visualsRef = useRef<{ p1: VisualEntity; p2: VisualEntity } | null>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const tickerRef = useRef<PIXI.Ticker | null>(null);

    // Initialize Scene
    useEffect(() => {
        let isMounted = true;
        
        const init = async () => {
            const app = await getPixiApp();
            if (!isMounted) return;
            appRef.current = app;

            if (containerRef.current && !containerRef.current.contains(app.canvas)) {
                containerRef.current.appendChild(app.canvas);
            }

            app.stage.removeChildren();

            // Background
            const floor = new PIXI.Graphics();
            floor.rect(0, 300, 800, 100);
            floor.fill(0x334155);
            app.stage.addChild(floor);

            // Init Visual Entities
            const maxHp1 = getTotalStat(gameState.p1, StatType.HP);
            const maxMana1 = getTotalStat(gameState.p1, StatType.MANA);
            const v1 = new VisualEntity(gameState.p1.config.avatarColor, 200, 300, maxHp1, maxMana1);
            v1.currentHp = gameState.p1.currentHp;
            v1.currentMana = gameState.p1.currentMana;
            v1.targetHp = gameState.p1.currentHp;
            v1.targetMana = gameState.p1.currentMana;
            
            const maxHp2 = getTotalStat(gameState.p2, StatType.HP);
            const maxMana2 = getTotalStat(gameState.p2, StatType.MANA);
            const v2 = new VisualEntity(gameState.p2.config.avatarColor, 600, 300, maxHp2, maxMana2);
            v2.currentHp = gameState.p2.currentHp;
            v2.currentMana = gameState.p2.currentMana;
            v2.targetHp = gameState.p2.currentHp;
            v2.targetMana = gameState.p2.currentMana;

            app.stage.addChild(v1.container);
            app.stage.addChild(v2.container);

            visualsRef.current = { p1: v1, p2: v2 };

            // Ticker for smooth bar updates
            const ticker = new PIXI.Ticker();
            ticker.add(() => {
                if (visualsRef.current) {
                    const { p1, p2 } = visualsRef.current;
                    // Lerp HP
                    p1.currentHp += (p1.targetHp - p1.currentHp) * 0.1;
                    p1.currentMana += (p1.targetMana - p1.currentMana) * 0.1;
                    p1.updateBars();

                    p2.currentHp += (p2.targetHp - p2.currentHp) * 0.1;
                    p2.currentMana += (p2.targetMana - p2.currentMana) * 0.1;
                    p2.updateBars();
                }
            });
            ticker.start();
            tickerRef.current = ticker;
        };

        init();

        return () => {
            isMounted = false;
            if (tickerRef.current) {
                tickerRef.current.stop();
                tickerRef.current.destroy();
            }
            // Do NOT destroy the app here, just clean stage for next use
            getPixiApp().then(app => app.stage.removeChildren());
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once on mount

    // Animation Processor
    useEffect(() => {
        // Only run when phase is EXECUTING
        if (gameState.phase !== 'EXECUTING') return;

        // Safety timeout: Ensure we move to next turn even if animations fail
        const safetyTimer = setTimeout(() => {
            console.warn("Animation Sequence Timed Out - Forcing Next Turn");
            if (onAnimationsComplete) onAnimationsComplete();
        }, 4000);

        const processAnimations = async () => {
            if (!visualsRef.current || !appRef.current) {
                console.warn("Visuals not ready, skipping animation");
                return;
            }
            
            // If no events to animate, finish immediately
            if (!gameState.events || gameState.events.length === 0) {
                return;
            }

            const { p1, p2 } = visualsRef.current;
            const app = appRef.current;

            const getEntity = (id: string) => {
                if (id === gameState.p1.id) return p1;
                if (id === gameState.p2.id) return p2;
                return null;
            };

            // Helper: Floating Text
            const spawnText = (text: string, x: number, y: number, color: string = '#ffffff') => {
                const style = new PIXI.TextStyle({
                    fontFamily: 'Courier New', // Fallback font
                    fontSize: 24,
                    fontWeight: 'bold',
                    fill: color,
                    stroke: '#000000',
                    strokeThickness: 4,
                });
                const basicText = new PIXI.Text({ text, style });
                basicText.x = x - basicText.width / 2;
                basicText.y = y - 100;
                app.stage.addChild(basicText);

                // Animate text up and fade
                let elapsed = 0;
                const duration = 60; // frames
                const animateText = () => {
                    elapsed++;
                    basicText.y -= 1;
                    basicText.alpha = 1 - (elapsed / duration);
                    if (elapsed < duration && basicText.parent) {
                        requestAnimationFrame(animateText);
                    } else if (basicText.parent) {
                        app.stage.removeChild(basicText);
                        basicText.destroy();
                    }
                };
                requestAnimationFrame(animateText);
            };

            // Process Events sequentially
            for (const evt of gameState.events) {
                const source = evt.sourceId ? getEntity(evt.sourceId) : null;
                const target = evt.targetId ? getEntity(evt.targetId) : null;

                // Delay between events for pacing
                await new Promise(r => setTimeout(r, 250));

                if (evt.type === 'ATTACK_MOVE' && source && target) {
                    const originalX = source.container.x;
                    const targetX = target.container.x;
                    const direction = targetX > originalX ? 1 : -1;
                    const lungeDist = 50 * direction;
                    
                    // Lunge
                    for (let i = 0; i < 5; i++) {
                        source.container.x += lungeDist / 5;
                        await new Promise(r => setTimeout(r, 16));
                    }
                    // Return
                    for (let i = 0; i < 5; i++) {
                        source.container.x -= lungeDist / 5;
                        await new Promise(r => setTimeout(r, 16));
                    }
                    source.container.x = originalX;
                } 
                else if (evt.type === 'SKILL_EFFECT' && source) {
                    spawnText(evt.skillName || 'Skill', source.container.x, source.container.y, '#fbbf24');
                    // Pulse Effect
                    source.sprite.tint = 0xffff00;
                    await new Promise(r => setTimeout(r, 150));
                    source.sprite.tint = 0xffffff;
                }
                else if (evt.type === 'DAMAGE' && target) {
                    if (evt.value) target.targetHp -= evt.value;
                    spawnText(`-${evt.value} ${evt.text || ''}`, target.container.x, target.container.y, evt.color || '#ef4444');
                    
                    // Shake
                    const startX = target.container.x;
                    target.container.x = startX + 10;
                    await new Promise(r => setTimeout(r, 50));
                    target.container.x = startX - 10;
                    await new Promise(r => setTimeout(r, 50));
                    target.container.x = startX;
                    
                    // Flash Red
                    target.sprite.tint = 0xff0000;
                    await new Promise(r => setTimeout(r, 100));
                    target.sprite.tint = 0xffffff;
                }
                else if (evt.type === 'HEAL' && target) {
                    if (evt.value) target.targetHp += evt.value;
                    spawnText(`+${evt.value}`, target.container.x, target.container.y, '#4ade80');
                    target.sprite.tint = 0x4ade80;
                    await new Promise(r => setTimeout(r, 150));
                    target.sprite.tint = 0xffffff;
                }
                else if (evt.type === 'MANA' && target) {
                     if (evt.value) target.targetMana += evt.value;
                }
                else if (evt.type === 'TEXT' && (target || source)) {
                    const ent = target || source;
                    if (ent && evt.text) {
                        spawnText(evt.text, ent.container.x, ent.container.y - 40, '#94a3b8');
                    }
                }
            }
            
            // Wait for final bar tween
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

    return <div ref={containerRef} className="border-4 border-slate-700 rounded-lg shadow-2xl bg-black" />;
};

export default BattleScene;
