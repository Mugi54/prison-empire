// Composants d'interface réutilisables : icônes, jauges, graphiques, portraits.
import type { ReactNode } from 'react';
import type { Look } from '../engine/types';
import { HAIR, SKIN } from '../render/renderer';

const ICONS: Record<string, string> = {
  overview: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  build: 'M14 3l7 7-3 3-2-2-8 8H5v-3l8-8-2-2zM3 21h18',
  inmates: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0zM7 15v6M12 14v7M17 15v6',
  staff: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0zM9 3.5h6',
  security: 'M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5zM9 12l2 2 4-4',
  finance: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  research: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9',
  events: 'M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM10 19a2 2 0 0 0 4 0',
  stats: 'M3 17l5-6 4 3 5-8 4 5M3 21h18',
  money: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM15.5 8.5A4 4 0 1 0 15.5 15.5M7 11h6M7 13.5h6',
  bed: 'M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  star: 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  pause: 'M7 4v16M17 4v16',
  play: 'M6 4l14 8-14 8z',
  save: 'M5 3h12l4 4v14H3V3zM7 3v6h9V3M7 21v-7h10v7',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M5 5l14 14M19 5L5 19',
  door: 'M6 21V3h12v18M4 21h16M14.5 12v.5',
  wall: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v5M15 10v5M9 15v4',
  erase: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  move: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  target: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  check: 'M4 12l5 5L20 6',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6',
  heart: 'M12 20s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.5-8 11-8 11z',
  tower: 'M6 21V10l-2-1V5h3v2h2V5h6v2h2V5h3v4l-2 1v11zM10 21v-5a2 2 0 0 1 4 0v5',
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name] ?? ICONS.alert} />
    </svg>
  );
}

export const money = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`;
export const pct = (v: number) => `${Math.round(v)} %`;
export const barColor = (v: number) => (v >= 60 ? 'var(--good)' : v >= 35 ? 'var(--warn)' : 'var(--bad)');

export function Bar({ value, color, invert }: { value: number; color?: string; invert?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  return <div className="bar"><div className="bar-fill" style={{ width: `${v}%`, background: color ?? barColor(invert ? 100 - v : v) }} /></div>;
}
export function Meter({ label, value, invert, hint }: { label: string; value: number; invert?: boolean; hint?: string }) {
  return (
    <div className="meter" title={hint}>
      <div className="meter-head"><span>{label}</span><b>{pct(value)}</b></div>
      <Bar value={value} invert={invert} />
    </div>
  );
}
export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return <section className="section"><header><h3>{title}</h3>{right}</header>{children}</section>;
}
export function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
  return <div className="tabs">{tabs.map(([id, label]) => <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{label}</button>)}</div>;
}

/** Portrait procédural d'un personnage. */
export function Portrait({ look, uniform, size = 64 }: { look: Look; uniform: string; size?: number }) {
  const skin = SKIN[look.skin], hair = HAIR[look.hair];
  return (
    <svg className="portrait" width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" rx="10" fill="#22303b" />
      <path d="M8 64c0-14 10-20 24-20s24 6 24 20z" fill={uniform} />
      <path d="M26 44h12v6a6 6 0 0 1-12 0z" fill={skin} />
      <ellipse cx="32" cy="29" rx="12.5" ry="15" fill={skin} />
      <ellipse cx="19.5" cy="30" rx="2.2" ry="3.4" fill={skin} /><ellipse cx="44.5" cy="30" rx="2.2" ry="3.4" fill={skin} />
      {look.style === 0 && <path d="M19 27c-1-13 6-17 13-17s14 4 13 17c-2-6-5-9-13-9s-11 3-13 9z" fill={hair} />}
      {look.style === 1 && <path d="M19 28c-2-15 7-19 14-19 8 0 14 5 12 19-1-5-3-8-6-9-4 3-13 3-17 1-2 2-3 5-3 8z" fill={hair} />}
      {look.style === 2 && <path d="M18 31c-3-18 6-22 14-22s17 4 14 22c-1-7-3-11-5-12-5 2-13 2-18 0-3 2-4 6-5 12z" fill={hair} />}
      {look.style === 3 && <path d="M20 24c0-9 6-13 12-13s12 4 12 13c-3-5-7-7-12-7s-9 2-12 7z" fill={hair} opacity=".85" />}
      {look.beard && <path d="M21 34c1 9 5 12 11 12s10-3 11-12c-3 4-6 5-11 5s-8-1-11-5z" fill={hair} opacity=".8" />}
      <circle cx="27" cy="29" r="1.5" fill="#1b1f24" /><circle cx="37" cy="29" r="1.5" fill="#1b1f24" />
      <path d="M28 37q4 2 8 0" stroke="#7a4a3a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export interface Series { name: string; color: string; data: number[] }
export function LineChart({ series, height = 150, labels, unit = '' }: { series: Series[]; height?: number; labels?: (string | number)[]; unit?: string }) {
  const W = 380, H = height, pl = 44, pr = 8, pt = 10, pb = 20;
  const all = series.flatMap((s) => s.data);
  if (all.length < 2) return <div className="empty">Les courbes apparaîtront après la première journée complète.</div>;
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  if (min > 0 && min < (max - min) * 2) min = 0;
  const n = Math.max(...series.map((s) => s.data.length));
  const X = (i: number) => pl + (i / Math.max(1, n - 1)) * (W - pl - pr);
  const Y = (v: number) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const fmt = (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}k` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`) + unit;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        {[0, 0.5, 1].map((f) => { const v = min + (max - min) * f; return <g key={f}><line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke="rgba(255,255,255,.08)" /><text x={pl - 6} y={Y(v) + 3} textAnchor="end" className="tick">{fmt(v)}</text></g>; })}
        {min < 0 && max > 0 && <line x1={pl} x2={W - pr} y1={Y(0)} y2={Y(0)} stroke="rgba(255,255,255,.3)" strokeDasharray="3 3" />}
        {labels && [0, n - 1].map((i) => <text key={i} x={X(i)} y={H - 5} textAnchor={i ? 'end' : 'start'} className="tick">J{labels[i]}</text>)}
        {series.map((s) => <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={s.data.map((v, i) => `${X(i + n - s.data.length)},${Y(v)}`).join(' ')} />)}
      </svg>
      {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>}
    </div>
  );
}

export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <header><h2>{title}</h2>{onClose && <button className="ghost" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>}</header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
