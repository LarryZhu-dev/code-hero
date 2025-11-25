import * as PIXI from 'pixi.js';
import { VisualShape } from '../types';

export const createParticles = (
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
            if (!p.parent) return;
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

export const createSlashEffect = (app: PIXI.Application, x: number, y: number) => {
    const g = new PIXI.Graphics();
    g.position.set(x, y - 40);
    g.scale.set(1, 0); 
    
    g.arc(0, 0, 40, Math.PI * 0.8, Math.PI * 2.2);
    g.stroke({ width: 8, color: 0xffffff });
    
    app.stage.addChild(g);

    let frame = 0;
    const animate = () => {
        if (!g.parent) return;
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

export const createMagicEffect = (app: PIXI.Application, x: number, y: number, color: number) => {
    const g = new PIXI.Graphics();
    g.position.set(x, y - 40);
    app.stage.addChild(g);

    let frame = 0;
    const animate = () => {
        if (!g.parent) return;
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

export const createStarBarrage = (app: PIXI.Application, startX: number, startY: number, endX: number, endY: number, color: number, onComplete: () => void) => {
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
                if (!g.parent) return;
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
                        if (!trail.parent) return;
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

export const createFallingSquares = (app: PIXI.Application, targetX: number, targetY: number, color: number, onComplete: () => void) => {
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
                if (!g.parent) return;
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

export const createLaserBeam = (app: PIXI.Application, startX: number, startY: number, endX: number, endY: number, color: number, onComplete: () => void) => {
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
        if (!container.parent) return;
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

export const createOrbProjectile = (
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
        if (!g.parent) return;
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
                if (!p.parent) return;
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

export const createProjectile = (
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

export const createAuraEffect = (
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