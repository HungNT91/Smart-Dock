import React, { useEffect, useRef } from 'react';

export type WeatherMode = 'rain' | 'dust' | 'clear';

interface WeatherOverlayProps {
  mode: WeatherMode;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  opacity: number;
  thickness: number;
}

interface SplashRipple {
  x: number;
  y: number;
  r: number;
  maxR: number;
  opacity: number;
}

interface DustMote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  baseOpacity: number;
  pulsePhase: number;
  isWarm: boolean;
}

interface MistPuff {
  x: number;
  y: number;
  rx: number;
  ry: number;
  vx: number;
  baseOpacity: number;
}

export const WeatherOverlay: React.FC<WeatherOverlayProps> = ({ mode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.clientWidth);
    let height = (canvas.height = canvas.clientHeight);

    const handleResize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Rain State
    const rainDrops: RainDrop[] = [];
    const ripples: SplashRipple[] = [];
    const RAIN_COUNT = 130;

    for (let i = 0; i < RAIN_COUNT; i++) {
      rainDrops.push({
        x: Math.random() * (width + 120) - 60,
        y: Math.random() * height,
        len: 14 + Math.random() * 22,
        speed: 16 + Math.random() * 12,
        opacity: 0.25 + Math.random() * 0.45,
        thickness: 0.8 + Math.random() * 0.9,
      });
    }

    // Dust & Mist State
    const dustMotes: DustMote[] = [];
    const DUST_COUNT = 55;
    for (let i = 0; i < DUST_COUNT; i++) {
      dustMotes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1.2 + Math.random() * 3.2,
        vx: 0.2 + Math.random() * 0.65,
        vy: (Math.random() - 0.5) * 0.35,
        baseOpacity: 0.18 + Math.random() * 0.42,
        pulsePhase: Math.random() * Math.PI * 2,
        isWarm: Math.random() > 0.45,
      });
    }

    const mistPuffs: MistPuff[] = [
      { x: width * 0.15, y: height * 0.45, rx: 180, ry: 65, vx: 0.18, baseOpacity: 0.08 },
      { x: width * 0.55, y: height * 0.62, rx: 240, ry: 85, vx: 0.22, baseOpacity: 0.09 },
      { x: width * 0.85, y: height * 0.38, rx: 210, ry: 75, vx: 0.15, baseOpacity: 0.07 },
    ];

    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      ctx.clearRect(0, 0, width, height);

      if (mode === 'rain') {
        // --- 1. LIGHT RAIN WITH ISOMETRIC ANGLE & SPLASH RIPPLES ---
        // Slanted angle: dx = speed * 0.32, dy = speed
        const angleFactor = 0.32;

        ctx.lineCap = 'round';

        // Update and draw raindrops
        for (let i = 0; i < rainDrops.length; i++) {
          const d = rainDrops[i];
          d.y += d.speed * (dt * 60);
          d.x += d.speed * angleFactor * (dt * 60);

          // Draw slanted raindrop streak
          ctx.beginPath();
          ctx.lineWidth = d.thickness;
          ctx.strokeStyle = `rgba(224, 242, 254, ${d.opacity})`;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - d.len * angleFactor, d.y - d.len);
          ctx.stroke();

          // Chance to trigger splash ripple on ground (y > 40% height)
          if (d.y > height * 0.42 && Math.random() < 0.035 && ripples.length < 32) {
            ripples.push({
              x: d.x,
              y: d.y,
              r: 1.5,
              maxR: 6.5 + Math.random() * 5,
              opacity: 0.38,
            });
          }

          // Reset when drop leaves screen
          if (d.y > height + 40 || d.x > width + 60) {
            d.y = -30 - Math.random() * 30;
            d.x = Math.random() * (width + 100) - 80;
            d.speed = 16 + Math.random() * 12;
          }
        }

        // Update and draw ground water ripples (isometric ellipses)
        for (let i = ripples.length - 1; i >= 0; i--) {
          const rip = ripples[i];
          rip.r += 14 * dt;
          rip.opacity -= 0.85 * dt;

          if (rip.opacity <= 0 || rip.r >= rip.maxR) {
            ripples.splice(i, 1);
            continue;
          }

          ctx.beginPath();
          ctx.ellipse(rip.x, rip.y, rip.r * 1.6, rip.r * 0.8, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(224, 242, 254, ${Math.max(0, rip.opacity)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Subtle wet roadway sheen / light rain atmosphere
        const rainVignette = ctx.createLinearGradient(0, 0, 0, height);
        rainVignette.addColorStop(0, 'rgba(186, 214, 240, 0.08)');
        rainVignette.addColorStop(0.5, 'rgba(165, 195, 225, 0.05)');
        rainVignette.addColorStop(1, 'rgba(148, 180, 215, 0.12)');
        ctx.fillStyle = rainVignette;
        ctx.fillRect(0, 0, width, height);

      } else if (mode === 'dust') {
        // --- 2. ATMOSPHERIC LOGISTICS DUST & MIST / HAZE ---

        // 2a. Rolling volumetric low-altitude mist patches across the yard
        for (let i = 0; i < mistPuffs.length; i++) {
          const puff = mistPuffs[i];
          puff.x += puff.vx * (dt * 60);
          if (puff.x - puff.rx > width) {
            puff.x = -puff.rx;
          }

          const grad = ctx.createRadialGradient(
            puff.x,
            puff.y,
            10,
            puff.x,
            puff.y,
            puff.rx
          );
          grad.addColorStop(0, `rgba(226, 232, 240, ${puff.baseOpacity})`);
          grad.addColorStop(0.5, `rgba(215, 225, 235, ${puff.baseOpacity * 0.6})`);
          grad.addColorStop(1, 'rgba(215, 225, 235, 0)');

          ctx.save();
          ctx.scale(1, puff.ry / puff.rx);
          ctx.beginPath();
          ctx.arc(puff.x, (puff.y * puff.rx) / puff.ry, puff.rx, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.restore();
        }

        // 2b. Floating dust motes catching ambient industrial floodlights
        for (let i = 0; i < dustMotes.length; i++) {
          const m = dustMotes[i];
          m.pulsePhase += 1.8 * dt;
          m.x += m.vx * (dt * 60);
          m.y += (m.vy + Math.sin(m.pulsePhase) * 0.28) * (dt * 60);

          if (m.x > width + 20) m.x = -20;
          if (m.y < -20) m.y = height + 10;
          if (m.y > height + 20) m.y = -10;

          const currentOpacity = Math.max(
            0.05,
            m.baseOpacity * (0.7 + 0.3 * Math.sin(m.pulsePhase))
          );

          ctx.beginPath();
          ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
          ctx.fillStyle = m.isWarm
            ? `rgba(254, 243, 199, ${currentOpacity})`
            : `rgba(241, 245, 249, ${currentOpacity})`;
          ctx.shadowColor = m.isWarm ? 'rgba(251, 191, 36, 0.4)' : 'rgba(203, 213, 225, 0.3)';
          ctx.shadowBlur = m.r * 2;
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Atmospheric dusty haze gradient over the ground
        const dustHaze = ctx.createLinearGradient(0, height * 0.35, 0, height);
        dustHaze.addColorStop(0, 'rgba(212, 222, 216, 0)');
        dustHaze.addColorStop(0.7, 'rgba(212, 222, 216, 0.08)');
        dustHaze.addColorStop(1, 'rgba(195, 208, 201, 0.14)');
        ctx.fillStyle = dustHaze;
        ctx.fillRect(0, 0, width, height);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10 w-full h-full"
    />
  );
};
