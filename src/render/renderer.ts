// Rendu isométrique sur Canvas 2D. Lit l'état du jeu sans jamais le modifier.
import { FURN, ROLES, ROOMS } from '../engine/data';
import { DIRS, SIDE_IDX, getRuntime } from '../engine/rooms';
import type { Agent, FurnType, GameState, Inmate, Side, Staff } from '../engine/types';

export const TW = 64, TH = 32, ZS = 34;
export interface Camera { x: number; y: number; zoom: number }
export interface ViewState {
  tool: string;
  hover: { x: number; y: number } | null;
  hoverSide: Side;
  drag: { x0: number; y0: number; x1: number; y1: number } | null;
  valid: boolean;
  label: string;
  ghost: FurnType | null;
  selKind: string; selId: number;
  alpha: number;        // interpolation entre deux ticks
  now: number;          // secondes réelles (animations)
  showGrid: boolean;
}

export const toWorld = (x: number, y: number): [number, number] => [(x - y) * (TW / 2), (x + y) * (TH / 2)];
export function screenToTile(cam: Camera, w: number, h: number, sx: number, sy: number): [number, number] {
  const wx = (sx - w / 2) / cam.zoom + cam.x, wy = (sy - h / 2) / cam.zoom + cam.y;
  return [wy / TH + wx / TW, wy / TH - wx / TW];
}
export function tileToScreen(cam: Camera, w: number, h: number, x: number, y: number): [number, number] {
  const [wx, wy] = toWorld(x, y);
  return [(wx - cam.x) * cam.zoom + w / 2, (wy - cam.y) * cam.zoom + h / 2];
}

const shadeCache = new Map<string, string>();
export function shade(hex: string, f: number): string {
  const k = hex + f;
  let c = shadeCache.get(k);
  if (c) return c;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1))));
  c = `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  shadeCache.set(k, c);
  return c;
}

type Ctx = CanvasRenderingContext2D;
const px = (x: number, y: number) => (x - y) * (TW / 2);
const py = (x: number, y: number, z = 0) => (x + y) * (TH / 2) - z * ZS;

function quad(c: Ctx, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, fill: string) {
  c.fillStyle = fill;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.lineTo(x4, y4); c.closePath(); c.fill();
}

export function isoBox(c: Ctx, x: number, y: number, z: number, w: number, d: number, h: number, color: string) {
  const x2 = x + w, y2 = y + d, z2 = z + h;
  quad(c, px(x, y2), py(x, y2, z2), px(x2, y2), py(x2, y2, z2), px(x2, y2), py(x2, y2, z), px(x, y2), py(x, y2, z), shade(color, 0.8));
  quad(c, px(x2, y), py(x2, y, z2), px(x2, y2), py(x2, y2, z2), px(x2, y2), py(x2, y2, z), px(x2, y), py(x2, y, z), shade(color, 0.62));
  quad(c, px(x, y), py(x, y, z2), px(x2, y), py(x2, y, z2), px(x2, y2), py(x2, y2, z2), px(x, y2), py(x, y2, z2), color);
}

function tilePath(c: Ctx, x: number, y: number, w = 1, h = 1) {
  c.beginPath();
  c.moveTo(px(x, y), py(x, y)); c.lineTo(px(x + w, y), py(x + w, y)); c.lineTo(px(x + w, y + h), py(x + w, y + h)); c.lineTo(px(x, y + h), py(x, y + h));
  c.closePath();
}

// ───────────── Éléments statiques (reconstruits à chaque changement de carte) ─────────────
interface Item { k: number; t: number; x: number; y: number; a: number; b: string }
// t : 0 mur arrière N, 1 mur arrière O, 2 mur avant S, 3 mur avant E, 4 porte, 5 mobilier, 6 clôture
let staticItems: Item[] = [];
let staticKey = '';
const WALL = '#d3d6db', YARD_WALL = '#7d8f76';

function buildStatic(s: GameState) {
  const rt = getRuntime(s);
  const items: Item[] = [];
  const doorSet = new Set<number>();
  for (const d of s.doors) {
    const k = SIDE_IDX[d.side];
    doorSet.add((d.y * rt.w + d.x) * 4 + k);
    doorSet.add(((d.y + DIRS[k][1]) * rt.w + d.x + DIRS[k][0]) * 4 + ((k + 2) % 4));
  }
  const isDoor = (x: number, y: number, k: number) => doorSet.has((y * rt.w + x) * 4 + k);
  for (const r of s.rooms) {
    const col = r.type === 'yard' ? YARD_WALL : WALL;
    const low = r.type === 'yard' ? 1 : 0;
    for (let x = r.x; x < r.x + r.w; x++) {
      items.push({ k: x + r.y + 0.5, t: isDoor(x, r.y, 0) ? 4 : 0, x, y: r.y, a: low, b: col });
      const ys = r.y + r.h - 1;
      items.push({ k: x + ys + 1.5, t: isDoor(x, ys, 2) ? 4 : 2, x, y: ys, a: 2, b: col });
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      items.push({ k: r.x + y + 0.5, t: isDoor(r.x, y, 3) ? 4 : 1, x: r.x, y, a: low + 10, b: col });
      const xe = r.x + r.w - 1;
      items.push({ k: xe + y + 1.5, t: isDoor(xe, y, 1) ? 4 : 3, x: xe, y, a: 12, b: col });
    }
  }
  for (const f of s.furn) items.push({ k: f.x + f.y + 0.55, t: 5, x: f.x, y: f.y, a: f.broken ? 1 : 0, b: f.type });
  for (const i of s.walls) { const x = i % rt.w, y = Math.floor(i / rt.w); items.push({ k: x + y + 1, t: 6, x, y, a: 0, b: '' }); }
  items.sort((p, q) => p.k - q.k);
  staticItems = items;
}

const TH_BACK = 0.6, TH_FRONT = 0.14, TK = 0.1;
function drawItem(c: Ctx, it: Item) {
  const { x, y } = it;
  switch (it.t) {
    case 0: isoBox(c, x, y, 0, 1, TK, it.a ? 0.22 : TH_BACK, it.b); break;
    case 1: isoBox(c, x, y, 0, TK, 1, it.a === 11 ? 0.22 : TH_BACK, it.b); break;
    case 2: isoBox(c, x, y + 1 - TK, 0, 1, TK, TH_FRONT, it.b); break;
    case 3: isoBox(c, x + 1 - TK, y, 0, TK, 1, TH_FRONT, it.b); break;
    case 4: { // porte : deux montants et un seuil coloré
      const side = it.a % 10, alongX = it.a < 10;
      const h = side === 2 ? 0.3 : side === 1 ? 0.3 : TH_BACK;
      const D = '#e0a23c';
      if (alongX) {
        const yy = side === 2 ? y + 1 - TK : y;
        isoBox(c, x + 0.16, yy, 0, 0.68, TK, 0.02, D);
        isoBox(c, x, yy, 0, 0.16, TK, h, it.b); isoBox(c, x + 0.84, yy, 0, 0.16, TK, h, it.b);
        if (side !== 2) isoBox(c, x, yy, h, 1, TK, 0.06, D);
      } else {
        const xx = side === 2 ? x + 1 - TK : x;
        isoBox(c, xx, y + 0.16, 0, TK, 0.68, 0.02, D);
        isoBox(c, xx, y, 0, TK, 0.16, h, it.b); isoBox(c, xx, y + 0.84, 0, TK, 0.16, h, it.b);
        if (side !== 2) isoBox(c, xx, y, h, TK, 1, 0.06, D);
      }
      break;
    }
    case 5: drawFurn(c, it.b as FurnType, x, y, it.a === 1); break;
    case 6:
      isoBox(c, x + 0.3, y + 0.3, 0, 0.4, 0.4, 0.75, '#8d949c');
      isoBox(c, x, y + 0.42, 0.1, 1, 0.16, 0.5, '#aab1b9');
      isoBox(c, x + 0.42, y, 0.1, 0.16, 1, 0.5, '#aab1b9');
      break;
  }
}

export function drawFurn(c: Ctx, type: FurnType, x: number, y: number, broken = false) {
  for (const b of FURN[type].boxes) isoBox(c, x + b[0], y + b[1], b[2], b[3], b[4], b[5], broken ? shade(b[6].length === 7 ? b[6] : '#888888', 0.45) : b[6]);
  if (broken) {
    const cx = px(x + 0.5, y + 0.5), cy = py(x + 0.5, y + 0.5, 0.9);
    c.fillStyle = '#e5533d'; c.beginPath(); c.arc(cx, cy, 6, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', cx, cy + 0.5);
  }
}

// ───────────── Personnages ─────────────
export const SKIN = ['#f3d2b3', '#e6b990', '#cf9a6b', '#a9744a', '#7d5233', '#5a3a24'];
export const HAIR = ['#1d1a18', '#3d2b1f', '#6b4a2b', '#a8782f', '#8a8a8a', '#c9c2b8'];
const INMATE_COLOR = '#e8792b';

function drawAgent(c: Ctx, a: Agent, alpha: number, now: number, color: string, kind: number, selected: boolean, lod: boolean) {
  const fx = a.px + (a.x - a.px) * alpha, fy = a.py + (a.y - a.py) * alpha;
  const X = px(fx, fy), Y = py(fx, fy);
  if (lod) { c.fillStyle = color; c.fillRect(X - 3, Y - 10, 6, 10); return; }
  const moving = a.x !== a.px || a.y !== a.py;
  const inm = kind === 0 ? (a as Inmate) : null;
  if (selected) {
    c.strokeStyle = '#ffd166'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(X, Y, 11, 5.5, 0, 0, 7); c.stroke();
  }
  if (inm && inm.act === 'sleep' && inm.at) {
    // allongé sur son lit
    const yy = Y - 10;
    c.fillStyle = color; c.beginPath(); c.roundRect(X - 8, yy - 3, 15, 6, 3); c.fill();
    c.fillStyle = SKIN[a.look.skin]; c.beginPath(); c.arc(X - 9, yy - 1, 3.6, 0, 7); c.fill();
    if (Math.floor(now * 0.7 + a.id) % 3 === 0) { c.fillStyle = 'rgba(210,225,255,.8)'; c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.fillText('z', X - 4, yy - 9); }
    return;
  }
  const bob = moving ? -Math.abs(Math.sin(now * 9 + a.id)) * 1.6 : 0;
  const sway = moving ? Math.sin(now * 9 + a.id) * 1.4 : 0;
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(X, Y, 6.5, 3.2, 0, 0, 7); c.fill();
  const y0 = Y + bob;
  c.fillStyle = kind === 0 ? shade(color, 0.72) : '#2a3140';
  c.fillRect(X - 3.2 + sway * 0.4, y0 - 7, 2.6, 7); c.fillRect(X + 0.6 - sway * 0.4, y0 - 7, 2.6, 7);
  c.fillStyle = color; c.beginPath(); c.roundRect(X - 4.6, y0 - 17.5, 9.2, 11.5, 3); c.fill();
  c.fillStyle = shade(color, 0.8); c.fillRect(X + 1.4, y0 - 16, 3.2, 9);
  if (kind === 0) { c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(X - 4.6, y0 - 11.5, 9.2, 1.4); }
  c.fillStyle = SKIN[a.look.skin]; c.beginPath(); c.arc(X, y0 - 21.2, 4.3, 0, 7); c.fill();
  if (kind === 1 && ((a as Staff).role === 'guard' || (a as Staff).role === 'lead')) {
    c.fillStyle = '#1c2a44'; c.beginPath(); c.arc(X, y0 - 22.4, 4.5, Math.PI, 0); c.fill(); c.fillRect(X - 5.4, y0 - 22.8, 10.8, 1.5);
  } else if (a.look.style !== 4) {
    c.fillStyle = HAIR[a.look.hair]; c.beginPath(); c.arc(X, y0 - 22.2, 4.4, Math.PI * (a.look.style === 1 ? 0.9 : 1), Math.PI * (a.look.style === 2 ? 2.25 : 2)); c.fill();
  }
  if (inm) {
    if (inm.mental < 25 || inm.needs.health < 30 || inm.sick) {
      c.fillStyle = inm.needs.health < 30 || inm.sick ? '#57c7a5' : '#e5533d';
      c.beginPath(); c.arc(X + 6, y0 - 27, 2.6, 0, 7); c.fill();
    }
  }
}

// ───────────── Rendu d'une image ─────────────
export function render(c: Ctx, s: GameState, cam: Camera, W: number, H: number, dpr: number, v: ViewState) {
  const rt = getRuntime(s);
  const key = `${s.mapVersion}:${s.rooms.length}`;
  if (key !== staticKey || !staticItems) { buildStatic(s); staticKey = key; }
  const { w, h } = s.map;

  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#16222b'); g.addColorStop(1, '#0d1419');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const z = cam.zoom;
  c.setTransform(z * dpr, 0, 0, z * dpr, (W / 2 - cam.x * z) * dpr, (H / 2 - cam.y * z) * dpr);

  // Terrain : socle, herbe, quadrillage.
  quad(c, px(0, h), py(0, h), px(w, h), py(w, h), px(w, h), py(w, h) + 14, px(0, h), py(0, h) + 14, '#2a3b33');
  quad(c, px(w, 0), py(w, 0), px(w, h), py(w, h), px(w, h), py(w, h) + 14, px(w, 0), py(w, 0) + 14, '#22312b');
  tilePath(c, 0, 0, w, h); c.fillStyle = '#4d6b52'; c.fill();
  // zone intérieure (enceinte) légèrement plus claire, en damier discret
  if (z > 0.35) {
    c.fillStyle = 'rgba(255,255,255,.035)';
    c.beginPath();
    for (let y = 0; y < h; y++) for (let x = (y & 1); x < w; x += 2) { c.moveTo(px(x, y), py(x, y)); c.lineTo(px(x + 1, y), py(x + 1, y)); c.lineTo(px(x + 1, y + 1), py(x + 1, y + 1)); c.lineTo(px(x, y + 1), py(x, y + 1)); }
    c.fill();
  }
  if (v.showGrid && z > 0.3) {
    c.strokeStyle = 'rgba(255,255,255,.09)'; c.lineWidth = 1 / z;
    c.beginPath();
    for (let x = 0; x <= w; x++) { c.moveTo(px(x, 0), py(x, 0)); c.lineTo(px(x, h), py(x, h)); }
    for (let y = 0; y <= h; y++) { c.moveTo(px(0, y), py(0, y)); c.lineTo(px(w, y), py(w, y)); }
    c.stroke();
  }
  // Portail d'entrée et route d'accès
  tilePath(c, s.gate.x - 0.5, s.gate.y - 1, 3, h - s.gate.y + 1); c.fillStyle = '#5b6168'; c.fill();
  tilePath(c, s.gate.x, s.gate.y, 2, 1); c.fillStyle = '#e0a23c'; c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;

  // Sols des salles
  for (const r of s.rooms) {
    const def = ROOMS[r.type];
    const st = rt.status.get(r.id);
    tilePath(c, r.x, r.y, r.w, r.h);
    c.fillStyle = def.floor; c.fill();
    if (z > 0.45) {
      c.strokeStyle = 'rgba(0,0,0,.1)'; c.lineWidth = 1 / z; c.beginPath();
      for (let x = r.x + 1; x < r.x + r.w; x++) { c.moveTo(px(x, r.y), py(x, r.y)); c.lineTo(px(x, r.y + r.h), py(x, r.y + r.h)); }
      for (let y = r.y + 1; y < r.y + r.h; y++) { c.moveTo(px(r.x, y), py(r.x, y)); c.lineTo(px(r.x + r.w, y), py(r.x + r.w, y)); }
      c.stroke();
    }
    if (st && !st.ok) { tilePath(c, r.x, r.y, r.w, r.h); c.fillStyle = r.broken ? 'rgba(229,140,40,.33)' : 'rgba(210,60,50,.26)'; c.fill(); }
    // ombre portée des murs arrière
    c.fillStyle = 'rgba(0,0,0,.13)';
    tilePath(c, r.x, r.y, r.w, 0.35); c.fill(); tilePath(c, r.x, r.y, 0.35, r.h); c.fill();
    if (v.selKind === 'room' && v.selId === r.id) { tilePath(c, r.x, r.y, r.w, r.h); c.strokeStyle = '#ffd166'; c.lineWidth = 2.5 / z; c.stroke(); }
  }
  if (v.selKind === 'furn') { const f = s.furn.find((q) => q.id === v.selId); if (f) { tilePath(c, f.x, f.y); c.fillStyle = 'rgba(255,209,102,.45)'; c.fill(); } }

  // Fusion des éléments statiques triés et des personnages triés par profondeur.
  const lod = z < 0.42;
  const agents: { k: number; a: Agent; kind: number }[] = [];
  const al = v.alpha;
  for (const i of s.inmates) agents.push({ k: i.px + (i.x - i.px) * al + i.py + (i.y - i.py) * al, a: i, kind: 0 });
  for (const st of s.staff) if (!st.away) agents.push({ k: st.px + (st.x - st.px) * al + st.py + (st.y - st.py) * al, a: st, kind: 1 });
  agents.sort((p, q) => p.k - q.k);
  let ai = 0;
  const drawA = (e: { a: Agent; kind: number }) => {
    const col = e.kind === 0 ? ((e.a as Inmate).isoUntil > s.time ? '#9aa0a8' : INMATE_COLOR) : ROLES[(e.a as Staff).role].color;
    drawAgent(c, e.a, al, v.now, col, e.kind, (v.selKind === 'inmate' || v.selKind === 'staff') && v.selId === e.a.id, lod);
  };
  for (const it of staticItems) {
    while (ai < agents.length && agents[ai].k < it.k) drawA(agents[ai++]);
    drawItem(c, it);
  }
  while (ai < agents.length) drawA(agents[ai++]);

  // Étiquettes et alertes de salles
  if (z > 0.55) {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const r of s.rooms) {
      const st = rt.status.get(r.id);
      const cx = px(r.x + r.w / 2, r.y + r.h / 2), cy = py(r.x + r.w / 2, r.y + r.h / 2);
      if (st && !st.ok) {
        c.fillStyle = r.broken ? '#f0a03c' : '#e5533d';
        c.beginPath(); c.moveTo(cx, cy - 30); c.lineTo(cx + 9, cy - 14); c.lineTo(cx - 9, cy - 14); c.closePath(); c.fill();
        c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif'; c.fillText('!', cx, cy - 19.5);
      } else if (z > 0.8 && r.w * r.h >= 9 && r.type !== 'cell') {
        c.font = '600 9px system-ui, sans-serif';
        const name = ROOMS[r.type].name.toUpperCase();
        const tw = c.measureText(name).width + 10;
        c.fillStyle = 'rgba(14,20,27,.55)'; c.beginPath(); c.roundRect(cx - tw / 2, cy - 44, tw, 13, 6); c.fill();
        c.fillStyle = 'rgba(255,255,255,.88)'; c.fillText(name, cx, cy - 37);
      }
    }
  }

  // Aperçus de construction
  if (v.drag) {
    const x = Math.min(v.drag.x0, v.drag.x1), y = Math.min(v.drag.y0, v.drag.y1);
    const ww = Math.abs(v.drag.x1 - v.drag.x0) + 1, hh = Math.abs(v.drag.y1 - v.drag.y0) + 1;
    tilePath(c, x, y, ww, hh);
    c.fillStyle = v.valid ? 'rgba(80,220,150,.35)' : 'rgba(235,80,70,.4)'; c.fill();
    c.strokeStyle = v.valid ? '#5fe0a0' : '#ef5a4c'; c.lineWidth = 2 / z; c.stroke();
  } else if (v.hover && v.tool !== 'none') {
    const { x, y } = v.hover;
    const col = v.valid ? '#5fe0a0' : '#ef5a4c';
    if (v.tool === 'door') {
      const k = SIDE_IDX[v.hoverSide];
      const a: [number, number] = k === 0 ? [x, y] : k === 1 ? [x + 1, y] : k === 2 ? [x, y + 1] : [x, y];
      const b: [number, number] = k === 0 ? [x + 1, y] : k === 1 ? [x + 1, y + 1] : k === 2 ? [x + 1, y + 1] : [x, y + 1];
      c.strokeStyle = col; c.lineWidth = 5 / z; c.lineCap = 'round';
      c.beginPath(); c.moveTo(px(a[0], a[1]), py(a[0], a[1])); c.lineTo(px(b[0], b[1]), py(b[0], b[1])); c.stroke();
    } else {
      tilePath(c, x, y);
      c.fillStyle = v.tool === 'erase' ? 'rgba(235,80,70,.45)' : v.valid ? 'rgba(80,220,150,.35)' : 'rgba(235,80,70,.4)'; c.fill();
      c.strokeStyle = v.tool === 'erase' ? '#ef5a4c' : col; c.lineWidth = 2 / z; c.stroke();
      if (v.ghost) { c.globalAlpha = 0.7; drawFurn(c, v.ghost, x, y); c.globalAlpha = 1; }
    }
  }

  // Nuit : voile bleuté progressif
  const hour = (s.time % 1440) / 60;
  const night = hour < 5 ? 1 : hour < 7 ? (7 - hour) / 2 : hour < 19.5 ? 0 : hour < 22 ? (hour - 19.5) / 2.5 : 1;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (night > 0) { c.fillStyle = `rgba(12,22,58,${0.36 * night})`; c.fillRect(0, 0, W, H); }

  if (v.label && v.hover) {
    const [sx, sy] = tileToScreen(cam, W, H, v.hover.x + 0.5, v.hover.y + 0.5);
    c.font = '600 12px system-ui, sans-serif';
    const tw = c.measureText(v.label).width + 16;
    c.fillStyle = v.valid ? 'rgba(18,32,28,.92)' : 'rgba(60,20,18,.94)';
    c.beginPath(); c.roundRect(sx + 18, sy - 34, tw, 24, 6); c.fill();
    c.fillStyle = v.valid ? '#8ef0bf' : '#ffb0a6'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(v.label, sx + 26, sy - 22);
  }
}

/** Personnage le plus proche d'un point écran (pour la sélection au clic). */
export function pickAgent(s: GameState, cam: Camera, W: number, H: number, sx: number, sy: number): { kind: 'inmate' | 'staff'; id: number } | null {
  let best: { kind: 'inmate' | 'staff'; id: number } | null = null, bd = 16 * 16;
  const test = (a: Agent, kind: 'inmate' | 'staff') => {
    const [x, y] = tileToScreen(cam, W, H, a.x, a.y);
    const dx = x - sx, dy = y - 11 * cam.zoom - sy;
    const d = dx * dx + dy * dy;
    if (d < bd * Math.max(0.6, cam.zoom)) { bd = d / Math.max(0.6, cam.zoom); best = { kind, id: a.id }; }
  };
  for (const i of s.inmates) test(i, 'inmate');
  for (const st of s.staff) if (!st.away) test(st, 'staff');
  return best;
}
