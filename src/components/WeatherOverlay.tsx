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
  // Keep mode in a ref and trigger wake-up if transitioning from clear
  const modeRef = useRef<WeatherMode>(mode);
  const wakeUpRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    modeRef.current = mode;
    if (wakeUpRef.current) {
      wakeUpRef.current();
    }
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const safeCtx = ctx; // narrowed, non-null alias for use inside nested functions

    let animId: number | null = null;
    let isRunning = false;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // ── Particle state (allocated once, reused across mode changes) ────────
    const RAIN_COUNT = 90;
    const DUST_COUNT = 35;

    const rainDrops: RainDrop[] = [];
    const ripples: SplashRipple[] = [];

    const dustMotes: DustMote[] = [];
    const mistPuffs: MistPuff[] = [];

    function initParticles(w: number, h: number) {
      rainDrops.length = 0;
      for (let i = 0; i < RAIN_COUNT; i++) {
        rainDrops.push({
          x: Math.random() * (w + 120) - 60,
          y: Math.random() * h,
          len: 14 + Math.random() * 20,
          speed: 15 + Math.random() * 11,
          opacity: 0.22 + Math.random() * 0.4,
          thickness: 0.7 + Math.random() * 0.9,
        });
      }

      dustMotes.length = 0;
      for (let i = 0; i < DUST_COUNT; i++) {
        dustMotes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 1.2 + Math.random() * 3,
          vx: 0.18 + Math.random() * 0.55,
          vy: (Math.random() - 0.5) * 0.3,
          baseOpacity: 0.16 + Math.random() * 0.38,
          pulsePhase: Math.random() * Math.PI * 2,
          isWarm: Math.random() > 0.45,
        });
      }

      mistPuffs.length = 0;
      mistPuffs.push(
        { x: w * 0.15, y: h * 0.45, rx: 180, ry: 65, vx: 0.18, baseOpacity: 0.07 },
        { x: w * 0.55, y: h * 0.62, rx: 240, ry: 85, vx: 0.22, baseOpacity: 0.08 },
        { x: w * 0.85, y: h * 0.38, rx: 210, ry: 75, vx: 0.15, baseOpacity: 0.06 }
      );
    }

    // ── Resize: reset canvas size cleanly (avoid cumulative scale) ──────────
    function applyResize() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      // Set the backing-store size first, then the display size
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // Reset transform every time before re-applying scale
      safeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles(width, height);
    }

    applyResize();

    const resizeObserver = new ResizeObserver(() => {
      applyResize();
    });
    resizeObserver.observe(canvas);

    // ── Render loop ──────────────────────────────────────────────────────────
    let lastTime = performance.now();

    const startLoop = () => {
      if (isRunning) return;
      isRunning = true;
      lastTime = performance.now();
      animId = requestAnimationFrame(render);
    };

    wakeUpRef.current = startLoop;

    const render = (now: number) => {
      const currentMode = modeRef.current;

      // When weather is 'clear', clear canvas once and sleep completely (0% CPU/GPU)
      if (currentMode === 'clear') {
        safeCtx.clearRect(0, 0, width, height);
        isRunning = false;
        animId = null;
        return;
      }

      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      // Cap dt so a tab-switch / GC pause can't cause a huge jump
      const dt = Math.min(rawDt, 0.05);

      safeCtx.clearRect(0, 0, width, height);

      if (currentMode === 'rain') {
        const angleFactor = 0.3;
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = 'rgba(224,242,254,0.36)';

        // Batch all raindrop lines into a single path -> 1 GPU draw call instead of 110
        ctx.beginPath();
        for (let i = 0; i < rainDrops.length; i++) {
          const d = rainDrops[i];
          const step = d.speed * dt * 60;
          d.y += step;
          d.x += step * angleFactor;

          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - d.len * angleFactor, d.y - d.len);

          if (d.y > height * 0.42 && Math.random() < 0.025 && ripples.length < 24) {
            ripples.push({ x: d.x, y: d.y, r: 1.5, maxR: 5.5 + Math.random() * 4.5, opacity: 0.35 });
          }

          if (d.y > height + 40 || d.x > width + 60) {
            d.y = -30 - Math.random() * 30;
            d.x = Math.random() * (width + 100) - 80;
          }
        }
        ctx.stroke();

        // Ripples — drawn without shadow, cheap ellipses
        if (ripples.length > 0) {
          ctx.lineWidth = 1;
          for (let i = ripples.length - 1; i >= 0; i--) {
            const rip = ripples[i];
            rip.r += 12 * dt;
            rip.opacity -= 0.75 * dt;
            if (rip.opacity <= 0 || rip.r >= rip.maxR) { ripples.splice(i, 1); continue; }
            ctx.beginPath();
            ctx.ellipse(rip.x, rip.y, rip.r * 1.5, rip.r * 0.75, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(224,242,254,${Math.max(0, rip.opacity)})`;
            ctx.stroke();
          }
        }

        // Subtle wet-road vignette (single fillRect — very cheap)
        const rainVig = ctx.createLinearGradient(0, 0, 0, height);
        rainVig.addColorStop(0, 'rgba(186,214,240,0.07)');
        rainVig.addColorStop(1, 'rgba(148,180,215,0.10)');
        ctx.fillStyle = rainVig;
        ctx.fillRect(0, 0, width, height);

      } else if (currentMode === 'dust') {
        // Mist puffs — no shadow, cheap radial gradient ellipses
        for (let i = 0; i < mistPuffs.length; i++) {
          const puff = mistPuffs[i];
          puff.x += puff.vx * dt * 60;
          if (puff.x - puff.rx > width) puff.x = -puff.rx;

          const grad = ctx.createRadialGradient(puff.x, puff.y, 8, puff.x, puff.y, puff.rx);
          grad.addColorStop(0, `rgba(226,232,240,${puff.baseOpacity})`);
          grad.addColorStop(0.5, `rgba(215,225,235,${puff.baseOpacity * 0.5})`);
          grad.addColorStop(1, 'rgba(215,225,235,0)');

          ctx.save();
          ctx.scale(1, puff.ry / puff.rx);
          ctx.beginPath();
          ctx.arc(puff.x, (puff.y * puff.rx) / puff.ry, puff.rx, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.restore();
        }

        // Dust motes — NO ctx.shadowBlur (very expensive; replaced by larger radius)
        for (let i = 0; i < dustMotes.length; i++) {
          const m = dustMotes[i];
          m.pulsePhase += 1.6 * dt;
          m.x += m.vx * dt * 60;
          m.y += (m.vy + Math.sin(m.pulsePhase) * 0.22) * dt * 60;
          if (m.x > width + 20) m.x = -20;
          if (m.y < -20) m.y = height + 10;
          if (m.y > height + 20) m.y = -10;

          const alpha = Math.max(0.04, m.baseOpacity * (0.65 + 0.35 * Math.sin(m.pulsePhase)));
          // Draw a soft halo using two concentric circles instead of shadowBlur
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.r * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = m.isWarm
            ? `rgba(254,243,199,${alpha * 0.3})`
            : `rgba(203,213,225,${alpha * 0.25})`;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
          ctx.fillStyle = m.isWarm
            ? `rgba(254,243,199,${alpha})`
            : `rgba(241,245,249,${alpha})`;
          ctx.fill();
        }

        // Ground haze
        const dustHaze = ctx.createLinearGradient(0, height * 0.35, 0, height);
        dustHaze.addColorStop(0, 'rgba(212,222,216,0)');
        dustHaze.addColorStop(0.7, 'rgba(212,222,216,0.07)');
        dustHaze.addColorStop(1, 'rgba(195,208,201,0.12)');
        ctx.fillStyle = dustHaze;
        ctx.fillRect(0, 0, width, height);
      }
      // 'clear' → nothing drawn, canvas is already cleared

      animId = requestAnimationFrame(render);
    };

    startLoop();

    return () => {
      if (animId) cancelAnimationFrame(animId);
      wakeUpRef.current = null;
      resizeObserver.disconnect();
    };
  // Run once — mode changes are handled via modeRef, not by restarting the loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10 w-full h-full"
    />
  );
};
