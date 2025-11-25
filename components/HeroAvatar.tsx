
import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { AppearanceConfig } from '../types';
import { drawBody, drawWeapon } from '../utils/heroSystem';

interface HeroAvatarProps {
    appearance: AppearanceConfig;
    size?: number;
    className?: string;
    bgColor?: string;
}

const HeroAvatar: React.FC<HeroAvatarProps> = ({ appearance, size = 64, className = '', bgColor }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);

    useEffect(() => {
        let isCancelled = false;
        
        const init = async () => {
            if (!containerRef.current || appRef.current) return;

            const app = new PIXI.Application();
            await app.init({ 
                width: size * 2, // Double resolution for crisp pixels
                height: size * 2, 
                backgroundColor: bgColor ? parseInt(bgColor.replace('#', '0x')) : 0x1e293b, 
                antialias: false,
                backgroundAlpha: bgColor ? 1 : 0
            });
            
            if (isCancelled) {
                app.destroy();
                return;
            }

            if (containerRef.current) {
                containerRef.current.appendChild(app.canvas);
                app.canvas.style.width = '100%';
                app.canvas.style.height = '100%';
            }
            appRef.current = app;

            const container = new PIXI.Container();
            // Center roughly
            container.x = size; 
            container.y = size * 1.2; 
            
            // Scale to fit
            const scale = size / 50; 
            container.scale.set(scale);

            app.stage.addChild(container);

            const bodyG = new PIXI.Graphics();
            drawBody(bodyG, appearance);
            container.addChild(bodyG);

            const weaponG = new PIXI.Graphics();
            drawWeapon(weaponG, appearance);
            // Position weapon relative to body "hand"
            weaponG.x = 8;
            weaponG.y = -20;
            if (appearance.weapon === 'BOW') {
                weaponG.x = 20;
                weaponG.y = -10;
            }
            weaponG.rotation = 0.5;
            container.addChild(weaponG);
            
            app.render();
            // We can stop the ticker since it's a static image
            app.ticker.stop();
        };

        init();

        return () => {
            isCancelled = true;
            if (appRef.current) {
                appRef.current.destroy({ removeView: true });
                appRef.current = null;
            }
        };
    }, [appearance, size, bgColor]);

    return (
        <div 
            ref={containerRef} 
            className={`overflow-hidden rounded-lg ${className}`} 
            style={{ width: size, height: size, background: bgColor || 'transparent' }}
        ></div>
    );
};

export default HeroAvatar;
