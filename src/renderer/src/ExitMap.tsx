// A dotted world map with a pin per exit: where the team's proxies come out, and what the profiles there are doing.
// Land dots are a 2.4° grid of Natural Earth's 110m land (public domain), from latitude 76 down to -56.
import { useState } from 'react';
import LAND from './land.json';

export type PinState = 'run' | 'boot' | 'bad' | 'warn' | 'idle';
export interface Pin { key: string; lat: number; lon: number; state: PinState; title: string; lines: string[] }
// A line between two exits (two profiles that look related, or one that moved).
export interface Link { from: { lat: number; lon: number }; to: { lat: number; lon: number }; level: 'warn' | 'bad' }

const W = 560, H = 196;
const at = (lon: number, lat: number) => [((lon + 180) / 360) * W, ((76 - Math.max(-56, Math.min(76, lat))) / 132) * H] as const;
const DOTS = (LAND as [number, number][]).map(([lon, lat]) => at(lon, lat));

export function ExitMap({ pins, links = [], label, onPick }: { pins: Pin[]; links?: Link[]; label: string; onPick?(key: string): void }){
  const [hover, setHover] = useState<Pin | null>(null);
  const spot = hover && at(hover.lon, hover.lat);
  return (
    <div className="exit-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <g className="land">{DOTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.3} />)}</g>
        {links.map((l, i) => {
          const [x1, y1] = at(l.from.lon, l.from.lat), [x2, y2] = at(l.to.lon, l.to.lat);
          // An arc that bows upward, more for longer lines.
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.min(60, Math.hypot(x2 - x1, y2 - y1) / 3) - 6;
          return <path key={i} className={`link ${l.level}`} d={`M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`} />;
        })}
        {pins.map(p => {
          const [x, y] = at(p.lon, p.lat);
          return (
            <g key={p.key} className={`pin ${p.state}`} transform={`translate(${x} ${y})`} tabIndex={onPick ? 0 : undefined} role={onPick ? 'button' : undefined} aria-label={`${p.title}: ${p.lines.join(', ')}`}
              onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(h => (h === p ? null : h))} onFocus={() => setHover(p)} onBlur={() => setHover(null)}
              onClick={() => onPick?.(p.key)} onKeyDown={e => { if (e.key === 'Enter') onPick?.(p.key); }}>
              {(p.state === 'run' || p.state === 'boot') && <circle className="halo" r={11} />}
              <circle className="dot" r={3.8} />
            </g>
          );
        })}
      </svg>
      {hover && spot && (
        <div className="map-tip" style={{ left: `${(spot[0] / W) * 100}%`, top: `${(spot[1] / H) * 100}%` }} role="tooltip">
          <b>{hover.title}</b>
          {hover.lines.slice(0, 4).map(l => <span key={l}>{l}</span>)}
          {hover.lines.length > 4 && <span>+{hover.lines.length - 4}</span>}
        </div>
      )}
    </div>
  );
}
