
import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { Effect, WeaponType, AppearanceConfig } from '../types';
import { drawWeapon } from '../utils/heroSystem';
import { createProjectile, createParticles, createSlashEffect, createMagicEffect, createAuraEffect } from '../utils/visualEffects';
import { IconEye, IconX } from './PixelIcons';

interface Props {
    effect: Effect;
    weapon: WeaponType;
    onClose: () => void;
}

const SkillVisualPreview: React.FC<Props> = ({ effect, weapon, onClose }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const effectRef = useRef(effect);
    const weaponRef = useRef(weapon);

    useEffect(() => {
        effectRef.current = effect;
        weaponRef.current = weapon;
    }, [effect, weapon]);

    useEffect(() => {
        let isCancelled = false;
        
        const init = async () => {
            if (!containerRef.current || appRef.current) return;
            
            const app = new PIXI.Application();
            await app.init({ width: 600, height: 400, backgroundColor: 0x0f172a, antialias: false });
            
            if (isCancelled) {
                app.destroy();
                return;
            }

            containerRef.current.innerHTML = '';
            app.canvas.style.width = '100%';
            app.canvas.style.height = '100%';
            containerRef.current.appendChild(app.canvas);
            appRef.current = app;

            // -- Scene --
            const ground = new PIXI.Graphics();
            ground.moveTo(0, 300).lineTo(600, 300).stroke({width: 4, color: 0x334155});
            app.stage.addChild(ground);

            const casterContainer = new PIXI.Container();
            casterContainer.x = 150; casterContainer.y = 280;
            casterContainer.scale.set(1.5);
            app.stage.addChild(casterContainer);

            const targetContainer = new PIXI.Container();
            targetContainer.x = 450; targetContainer.y = 280;
            targetContainer.scale.set(1.5);
            targetContainer.scale.x = -1.5;
            app.stage.addChild(targetContainer);

            const drawDummy = (g: PIXI.Graphics, color: number) => {
                g.rect(-10, -30, 20, 30).fill(color);
                g.circle(0, -40, 10).fill(color);
            };

            const casterG = new PIXI.Graphics();
            drawDummy(casterG, 0x3b82f6);
            casterContainer.addChild(casterG);

            const weaponG = new PIXI.Graphics();
            casterContainer.addChild(weaponG);

            const targetG = new PIXI.Graphics();
            drawDummy(targetG, 0xef4444);
            targetContainer.addChild(targetG);

            // Animation Loop
            let frame = 0;
            const animate = () => {
                if (!app.stage) return;
                frame++;
                
                const wConfig: AppearanceConfig = { weapon: weaponRef.current, themeColor: '#ffffff', head: 'BALD', body: 'VEST' };
                drawWeapon(weaponG, wConfig);
                weaponG.x = 5; weaponG.y = -20;
                if (wConfig.weapon === 'BOW') { weaponG.x = 10; weaponG.y = -15; }

                if (frame % 180 === 30) {
                    const eff = effectRef.current;
                    const visual = eff.visual || { color: '#ffffff', animationType: 'CAST' };
                    const animType = visual.animationType || 'CAST';
                    const color = parseInt((visual.color || '#ffffff').replace('#', '0x'));

                    if (animType === 'THRUST') {
                         const startX = casterContainer.x;
                         const targetX = targetContainer.x - 80;
                         let t = 0;
                         const tick = () => {
                             t++;
                             if (t < 20) {
                                 casterContainer.x += (targetX - startX) / 20;
                             } else if (t === 20) {
                                 createSlashEffect(app, targetContainer.x, targetContainer.y);
                                 createParticles(app, targetContainer.x, targetContainer.y - 30, 0xff0000, 5);
                             } else if (t > 30 && t < 50) {
                                 casterContainer.x += (startX - casterContainer.x) * 0.2;
                             } else if (t >= 50) {
                                 casterContainer.x = startX;
                                 app.ticker.remove(tick);
                             }
                         };
                         app.ticker.add(tick);

                    } else if (animType === 'THROW') {
                        weaponG.visible = false;
                        const clone = new PIXI.Graphics();
                        drawWeapon(clone, wConfig);
                        clone.x = casterContainer.x; clone.y = casterContainer.y - 40;
                        app.stage.addChild(clone);
                        
                        const startX = casterContainer.x;
                        const tx = targetContainer.x;
                        let t = 0;
                        
                        const tick = () => {
                            t++;
                            if (t < 30) {
                                const progress = t / 30;
                                clone.x = startX + (tx - startX) * progress;
                                clone.y = (casterContainer.y - 40) - Math.sin(progress * Math.PI) * 100 + (progress * 40); 
                                clone.rotation += 0.5;
                            } else if (t === 30) {
                                clone.rotation = 2.5;
                                clone.y = targetContainer.y;
                                createParticles(app, tx, targetContainer.y - 20, color, 5);
                            } else if (t > 30 && t < 60) {
                                casterContainer.x += (tx - 40 - casterContainer.x) * 0.1;
                            } else if (t === 60) {
                                clone.destroy();
                                weaponG.visible = true;
                            } else if (t > 70 && t < 100) {
                                casterContainer.x += (startX - casterContainer.x) * 0.1;
                            } else if (t >= 100) {
                                casterContainer.x = startX;
                                app.ticker.remove(tick);
                            }
                        };
                        app.ticker.add(tick);

                    } else {
                        createMagicEffect(app, casterContainer.x, casterContainer.y - 40, color);
                        
                        if (eff.type.includes('DAMAGE')) {
                             const shape = visual.shape || 'CIRCLE';
                             const traj = eff.type === 'DAMAGE_MAGIC' ? 'LINEAR' : 'PARABOLIC';
                             createProjectile(
                                 app, 
                                 casterContainer.x + 20, casterContainer.y - 40, 
                                 targetContainer.x - 10, targetContainer.y - 40,
                                 color, 100, traj, shape, 
                                 () => {
                                     createParticles(app, targetContainer.x, targetContainer.y - 40, color, 5);
                                 }
                             );
                        } else {
                            const isSelf = eff.target === 'SELF';
                            const tx = isSelf ? casterContainer.x : targetContainer.x;
                            const ty = isSelf ? casterContainer.y : targetContainer.y;
                            const dir = eff.type === 'INCREASE_STAT' ? 'UP' : 'DOWN';
                            createAuraEffect(app, tx, ty, color, dir);
                        }
                    }
                }
            };
            app.ticker.add(animate);
        };
        init();

        return () => {
            isCancelled = true;
            if (appRef.current) {
                appRef.current.destroy({ removeView: true });
                appRef.current = null;
            }
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-slate-900 border-4 border-slate-600 shadow-2xl p-4 w-[95vw] max-w-[640px] relative" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-white font-bold retro-font flex items-center gap-2"><IconEye size={20}/> 特效预览</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><IconX size={20}/></button>
                </div>
                <div ref={containerRef} className="w-full aspect-[3/2] border-4 border-slate-800 bg-black overflow-hidden mx-auto"></div>
                <div className="text-center text-xs text-slate-500 mt-2 font-mono">预览动画每 3 秒循环一次</div>
            </div>
        </div>
    );
};

export default SkillVisualPreview;
