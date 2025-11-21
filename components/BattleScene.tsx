import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { BattleState, StatType } from '../types';
import { getTotalStat } from '../utils/gameEngine';

interface Props {
    gameState: BattleState;
}

const BattleScene: React.FC<Props> = ({ gameState }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const spritesRef = useRef<{ p1: PIXI.Graphics; p2: PIXI.Graphics; p1Bar: PIXI.Graphics; p2Bar: PIXI.Graphics }>({} as any);

    useEffect(() => {
        if (!containerRef.current) return;

        const initPixi = async () => {
            const app = new PIXI.Application();
            await app.init({ 
                width: 800, 
                height: 400, 
                backgroundColor: 0x1a202c,
                preference: 'webgl'
            });
            
            if (containerRef.current) {
                containerRef.current.appendChild(app.canvas);
            }
            appRef.current = app;

            // Draw Background (Dungeon Tile style placeholder)
            const floor = new PIXI.Graphics();
            floor.rect(0, 300, 800, 100);
            floor.fill(0x334155);
            app.stage.addChild(floor);

            // Create Player 1 (Left)
            const p1 = new PIXI.Graphics();
            p1.rect(-25, -50, 50, 100); // Anchor center-ish
            p1.fill(parseInt(gameState.p1.config.avatarColor.replace('#', '0x')));
            p1.x = 200;
            p1.y = 320;
            app.stage.addChild(p1);

            // Create Player 2 (Right)
            const p2 = new PIXI.Graphics();
            p2.rect(-25, -50, 50, 100);
            p2.fill(parseInt(gameState.p2.config.avatarColor.replace('#', '0x')));
            p2.x = 600;
            p2.y = 320;
            app.stage.addChild(p2);

            // Health Bars
            const p1Bar = new PIXI.Graphics();
            const p2Bar = new PIXI.Graphics();
            app.stage.addChild(p1Bar);
            app.stage.addChild(p2Bar);

            spritesRef.current = { p1, p2, p1Bar, p2Bar };
        };

        initPixi();

        return () => {
            if (appRef.current) {
                appRef.current.destroy(true, { children: true });
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Update loop
    useEffect(() => {
        if (!appRef.current) return;

        const { p1Bar, p2Bar, p1, p2 } = spritesRef.current;

        const drawHealth = (bar: PIXI.Graphics, x: number, current: number, max: number, mana: number, maxMana: number) => {
            bar.clear();
            // Back
            bar.roundRect(x - 60, 200, 120, 20, 4);
            bar.fill(0x000000);
            
            // HP
            const hpPct = Math.max(0, current / max);
            bar.roundRect(x - 60, 200, 120 * hpPct, 12, 4);
            bar.fill(0xe11d48);

            // Mana
            const manaPct = Math.max(0, mana / maxMana);
            bar.roundRect(x - 60, 214, 120 * manaPct, 6, 4);
            bar.fill(0x3b82f6);
        };

        const maxHp1 = getTotalStat(gameState.p1, StatType.HP);
        const maxMana1 = getTotalStat(gameState.p1, StatType.MANA);
        drawHealth(p1Bar, 200, gameState.p1.currentHp, maxHp1, gameState.p1.currentMana, maxMana1);

        const maxHp2 = getTotalStat(gameState.p2, StatType.HP);
        const maxMana2 = getTotalStat(gameState.p2, StatType.MANA);
        drawHealth(p2Bar, 600, gameState.p2.currentHp, maxHp2, gameState.p2.currentMana, maxMana2);

        // Simple Hit Animation Logic (If HP dropped significantly, shake)
        // Omitted for brevity in prototype, standard would be checking delta state
        
    }, [gameState]);

    return <div ref={containerRef} className="border-4 border-slate-700 rounded-lg shadow-2xl" />;
};

export default BattleScene;