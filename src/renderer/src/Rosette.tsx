// The guilloche rosette of the website, drawn once in the theme's colour; CSS turns it slowly (still when motion is
// reduced). Behind the login card and empty states.
import { useEffect, useRef } from 'react';

function ring(ctx: CanvasRenderingContext2D, c: number, R: number, amp: number, m: number, m2: number, lines: number, alpha: number){
  const N = 720, TAU = Math.PI * 2;
  ctx.globalAlpha = alpha;
  for (let j = 0; j < lines; j++){
    const ph = (j * TAU) / lines;
    ctx.beginPath();
    for (let i = 0; i <= N; i++){
      const t = (i / N) * TAU, r = R + amp * Math.sin(m * t + ph) + amp * 0.38 * Math.sin(m2 * t - 2 * ph);
      if (i) ctx.lineTo(c + r * Math.cos(t), c + r * Math.sin(t)); else ctx.moveTo(c + r * Math.cos(t), c + r * Math.sin(t));
    }
    ctx.stroke();
  }
}

export function Rosette({ size }: { size: number }){
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const el = ref.current;
      if (!el) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = el.height = Math.round(size * dpr);
      const ctx = el.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = getComputedStyle(el).getPropertyValue('--guilloche').trim();
      ctx.lineWidth = 0.6;
      const c = size / 2, R = size * 0.3;
      ring(ctx, c, R, R * 0.09, 16, 7, 26, 0.2);
      ring(ctx, c, R * 1.3, R * 0.05, 28, 11, 16, 0.13);
      ring(ctx, c, R * 0.62, R * 0.08, 12, 5, 14, 0.16);
    };
    draw();
    const dark = matchMedia('(prefers-color-scheme: dark)');
    dark.addEventListener('change', draw);
    return () => dark.removeEventListener('change', draw);
  }, [size]);
  return <canvas ref={ref} className="rosette" style={{ width: size, height: size }} aria-hidden="true" />;
}
