// Données dérivées de la carte (grilles, chemins, état des salles).
// Rien ici n'est sauvegardé : tout est reconstruit à la demande depuis GameState.
import { FURN, ROOMS, SHIFTS } from './data';
import type { Furn, GameState, Room, RoomType, Side, Staff } from './types';

export const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N, E, S, O
export const SIDE_IDX: Record<Side, number> = { N: 0, E: 1, S: 2, W: 3 };

export interface RoomStatus { ok: boolean; problems: string[]; capacity: number; staff: number[] }
export interface Runtime {
  mv: number; sv: number; w: number; h: number;
  roomAt: Int32Array; pass: Uint8Array;
  flows: Map<number, Int16Array>;
  rooms: Map<number, Room>; byType: Map<RoomType, Room[]>;
  furnAt: Map<number, Furn>; furnByRoom: Map<number, Furn[]>;
  freeTiles: Map<number, number[]>;
  status: Map<number, RoomStatus>;
  active: Map<number, boolean>;
  occ: Map<number, number>;
}

const cache = new WeakMap<GameState, Runtime>();

export function hasResearch(s: GameState, id: string) { return s.research.done.includes(id); }

export function onDuty(s: GameState, st: Staff): boolean {
  if (st.leaveUntil > s.time || st.trainUntil > s.time) return false;
  const h = (s.time % 1440) / 60;
  const sh = SHIFTS[st.shift];
  return sh.from < sh.to ? h >= sh.from && h < sh.to : h >= sh.from || h < sh.to;
}

export function getRuntime(s: GameState): Runtime {
  let rt = cache.get(s);
  if (!rt || rt.mv !== s.mapVersion) {
    rt = build(s);
    cache.set(s, rt);
  }
  if (rt.sv !== s.staffVer) {
    rt.sv = s.staffVer;
    computeStatuses(s, rt);
    refreshActive(s, rt);
  }
  return rt;
}

function build(s: GameState): Runtime {
  const { w, h } = s.map;
  const rt: Runtime = {
    mv: s.mapVersion, sv: -1, w, h,
    roomAt: new Int32Array(w * h), pass: new Uint8Array(w * h), flows: new Map(),
    rooms: new Map(), byType: new Map(), furnAt: new Map(), furnByRoom: new Map(), freeTiles: new Map(),
    status: new Map(), active: new Map(), occ: new Map(),
  };
  for (const r of s.rooms) {
    rt.rooms.set(r.id, r);
    if (!rt.byType.has(r.type)) rt.byType.set(r.type, []);
    rt.byType.get(r.type)!.push(r);
    rt.furnByRoom.set(r.id, []);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) rt.roomAt[y * w + x] = r.id;
  }
  for (const f of s.furn) {
    const idx = f.y * w + f.x;
    rt.furnAt.set(idx, f);
    const rid = rt.roomAt[idx];
    if (rid) rt.furnByRoom.get(rid)!.push(f);
  }
  for (const r of s.rooms) {
    const free: number[] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!rt.furnAt.has(y * w + x)) free.push(y * w + x);
    rt.freeTiles.set(r.id, free);
  }
  // Grille de passage : un bit par direction.
  const wall = new Uint8Array(w * h);
  for (const i of s.walls) wall[i] = 1;
  const doorSet = new Set<number>();
  for (const d of s.doors) {
    const k = SIDE_IDX[d.side];
    doorSet.add((d.y * w + d.x) * 4 + k);
    const nx = d.x + DIRS[k][0], ny = d.y + DIRS[k][1];
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) doorSet.add((ny * w + nx) * 4 + ((k + 2) % 4));
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (wall[i]) continue;
    let bits = 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (wall[j]) continue;
      if (rt.roomAt[i] === rt.roomAt[j] || doorSet.has(i * 4 + k)) bits |= 1 << k;
    }
    rt.pass[i] = bits;
  }
  for (const i of s.inmates) if (i.tr > 0) rt.occ.set(i.tr, (rt.occ.get(i.tr) ?? 0) + 1);
  return rt;
}

export function countFurn(list: Furn[], types: string[], withBroken = false) {
  let n = 0;
  for (const f of list) if (types.includes(f.type) && (withBroken || !f.broken)) n++;
  return n;
}

export function roomCapacity(room: Room, furn: Furn[]): number {
  const c = (t: string) => countFurn(furn, [t]);
  const area = room.w * room.h;
  switch (room.type) {
    case 'cell': return Math.min(1, c('bed') + c('bunk'));
    case 'dorm': return Math.min(Math.floor(area / 2), c('bed') + 2 * c('bunk'));
    case 'isolation': return c('bed');
    case 'canteen': return c('ctable') * 4;
    case 'showers': return c('shower') * 3;
    case 'infirmary': return c('medbed');
    case 'consult': return c('couch') * 2;
    case 'laundry': return c('washer') * 2;
    case 'classroom': return c('schooldesk') * 2;
    case 'library': return c('shelf') * 5;
    case 'workshop': return c('bench') * 2;
    case 'training': return c('trainstation') * 2;
    case 'gym': return c('weights') * 3;
    case 'common': return Math.floor(area / 1.5);
    case 'yard': return area;
    case 'kitchen': return c('stove') * 40;
    default: return Math.floor(area / 2);
  }
}

export function hasDoor(s: GameState, r: Room): boolean {
  const w = s.map.w;
  const rt = cache.get(s);
  for (const d of s.doors) {
    if (d.x >= r.x && d.x < r.x + r.w && d.y >= r.y && d.y < r.y + r.h) return true;
    // porte posée depuis la salle voisine
    const k = SIDE_IDX[d.side];
    const nx = d.x + DIRS[k][0], ny = d.y + DIRS[k][1];
    if (nx >= r.x && nx < r.x + r.w && ny >= r.y && ny < r.y + r.h && (!rt || rt.roomAt[d.y * w + d.x] !== r.id)) return true;
  }
  return false;
}

function computeStatuses(s: GameState, rt: Runtime) {
  rt.status.clear();
  for (const r of s.rooms) {
    const def = ROOMS[r.type];
    const furn = rt.furnByRoom.get(r.id) ?? [];
    const problems: string[] = [];
    if (!hasDoor(s, r)) problems.push('Aucune porte');
    if (r.w * r.h < def.minW * def.minH) problems.push(`Surface insuffisante (min. ${def.minW}×${def.minH})`);
    for (const q of def.req) {
      const n = countFurn(furn, q.types);
      if (n < q.n) problems.push(`Mobilier manquant : ${FURN[q.types[0]].name}${q.n > 1 ? ` ×${q.n}` : ''}`);
    }
    if (def.research && !hasResearch(s, def.research)) problems.push('Recherche requise');
    const staff = s.staff.filter((st) => st.room === r.id).map((st) => st.id);
    if (def.staff && !s.staff.some((st) => st.room === r.id && def.staff!.includes(st.role))) problems.push('Personnel requis : ' + def.staff.map((x) => ROLE_NAME[x]).join(' ou '));
    if (r.broken) problems.push('En panne');
    rt.status.set(r.id, { ok: problems.length === 0, problems, capacity: roomCapacity(r, furn), staff });
  }
}
const ROLE_NAME: Record<string, string> = { guard: 'Surveillant', lead: 'Responsable d\'équipe', doctor: 'Médecin', psych: 'Psychologue', cook: 'Cuisinier', tech: 'Technicien', admin: 'Agent administratif', trainer: 'Formateur', reinsertion: 'Responsable de réinsertion' };

/** Une salle est « active » si elle est opérationnelle et que le personnel requis est en service. */
export function refreshActive(s: GameState, rt = getRuntime(s)) {
  rt.active.clear();
  const present = new Map<number, boolean>();
  for (const st of s.staff) if (st.room && onDuty(s, st)) present.set(st.room * 16 + ROLE_ORDER.indexOf(st.role), true);
  for (const r of s.rooms) {
    const st = rt.status.get(r.id);
    let ok = !!st?.ok;
    const def = ROOMS[r.type];
    if (ok && def.staff) {
      ok = def.staff.some((role) => present.get(r.id * 16 + ROLE_ORDER.indexOf(role)));
      if (!ok && r.type === 'infirmary' && hasResearch(s, 'telemed')) ok = true;
    }
    rt.active.set(r.id, ok);
  }
}
const ROLE_ORDER = ['guard', 'lead', 'doctor', 'psych', 'cook', 'tech', 'admin', 'trainer', 'reinsertion'];

export const isActive = (s: GameState, roomId: number) => getRuntime(s).active.get(roomId) === true;
export const anyActive = (s: GameState, type: RoomType) => (getRuntime(s).byType.get(type) ?? []).some((r) => getRuntime(s).active.get(r.id));
export const activeRooms = (s: GameState, type: RoomType) => (getRuntime(s).byType.get(type) ?? []).filter((r) => getRuntime(s).active.get(r.id));

/** Champ de distance (BFS) vers une salle (id > 0) ou vers le portail (-1). Mis en cache par version de carte. */
export function flowTo(s: GameState, key: number): Int16Array | null {
  const rt = getRuntime(s);
  let f = rt.flows.get(key);
  if (f) return f;
  const { w, h } = rt;
  f = new Int16Array(w * h).fill(-1);
  const queue: number[] = [];
  if (key === -1) {
    const g = s.gate.y * w + s.gate.x;
    f[g] = 0; queue.push(g);
  } else {
    const r = rt.rooms.get(key);
    if (!r) return null;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { f[y * w + x] = 0; queue.push(y * w + x); }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % w, y = (i - x) / w;
    const bits = rt.pass[i];
    for (let k = 0; k < 4; k++) {
      if (!(bits & (1 << k))) continue;
      const j = (y + DIRS[k][1]) * w + x + DIRS[k][0];
      if (f[j] === -1) { f[j] = f[i] + 1; queue.push(j); }
    }
  }
  rt.flows.set(key, f);
  return f;
}

/** Capacité d'hébergement totale (places en cellules opérationnelles). */
export function totalCapacity(s: GameState): number {
  const rt = getRuntime(s);
  let n = 0;
  for (const r of s.rooms) if (r.type === 'cell' || r.type === 'dorm') { const st = rt.status.get(r.id); if (st?.ok) n += st.capacity; }
  return n;
}
