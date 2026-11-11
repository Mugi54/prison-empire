// Création d'une nouvelle partie : établissements de départ, scénarios, bac à sable.
import { DEFAULT_REGIME } from './data';
import { addDoor, addWall, autoFurnish, buildRoom } from './construction';
import { emptyLedger } from './economy';
import { addInmate, assignCells } from './inmates';
import { clamp, rint, rnd } from './rng';
import { getRuntime, totalCapacity } from './rooms';
import { autoAssign, generateStaff, refreshCandidates } from './staff';
import type { GameState, Mode, Role, RoomType, Rules, Shift } from './types';

export const SAVE_VERSION = 2;

type RoomSpec = [RoomType, number, number, number];
export interface Preset {
  id: string; name: string; tagline: string; desc: string; issues: string[];
  budget: number; funding: number; map: [number, number]; inmates: number; intakeRate: number;
  rooms: RoomSpec[]; staff: [Role, number][];
  tweak?: (s: GameState) => void;
}

export const PRESETS: Preset[] = [
  { id: 'petite', name: 'Maison d\'arrêt de Val-Clair', tagline: 'Petite prison régionale', desc: 'Un établissement à taille humaine, calme, idéal pour apprendre le métier.',
    issues: ['Dotation modeste', 'Aucun équipement de réinsertion', 'Peu de marge pour s\'agrandir sans investir'],
    budget: 60000, funding: 1250, map: [40, 30], inmates: 12, intakeRate: 2,
    rooms: [['cell', 2, 3, 12], ['dorm', 4, 4, 1], ['showers', 3, 2, 1], ['canteen', 5, 4, 1], ['kitchen', 3, 3, 1], ['infirmary', 3, 3, 1], ['common', 4, 4, 1], ['yard', 7, 6, 1], ['office', 3, 3, 1], ['staffroom', 3, 3, 1], ['guardpost', 2, 2, 1], ['technical', 2, 2, 1], ['intake', 3, 2, 1]],
    staff: [['guard', 5], ['doctor', 1], ['cook', 1], ['tech', 1], ['admin', 1]] },
  { id: 'classique', name: 'Centre de détention des Tilleuls', tagline: 'Établissement classique', desc: 'Un centre équilibré, correctement doté, avec un début d\'offre de réinsertion.',
    issues: ['Effectifs de surveillance justes', 'Atelier sous-utilisé', 'Attentes élevées des autorités'],
    budget: 120000, funding: 1900, map: [48, 38], inmates: 30, intakeRate: 3,
    rooms: [['cell', 2, 3, 24], ['dorm', 5, 4, 2], ['showers', 4, 3, 1], ['toilets', 3, 2, 1], ['canteen', 7, 5, 1], ['kitchen', 4, 3, 1], ['infirmary', 4, 4, 1], ['common', 5, 4, 1], ['yard', 9, 7, 1], ['library', 4, 3, 1], ['workshop', 5, 4, 1], ['laundry', 3, 3, 1], ['office', 4, 3, 1], ['staffroom', 4, 3, 1], ['archives', 3, 2, 1], ['guardpost', 2, 2, 2], ['technical', 3, 2, 1], ['intake', 3, 3, 1]],
    staff: [['guard', 8], ['lead', 1], ['doctor', 1], ['cook', 2], ['tech', 1], ['admin', 2]] },
  { id: 'sousfinancee', name: 'Prison de Rochebrune', tagline: 'Prison sous-financée', desc: 'Un établissement vétuste, oublié des budgets. Tout est à reconstruire, avec presque rien.',
    issues: ['Trésorerie très faible et dotation insuffisante', 'Équipements dégradés, pas de médecin', 'Personnel démotivé, détenus mécontents'],
    budget: 22000, funding: 450, map: [44, 34], inmates: 28, intakeRate: 2,
    rooms: [['cell', 2, 3, 16], ['dorm', 5, 4, 2], ['showers', 3, 2, 1], ['canteen', 5, 4, 1], ['kitchen', 3, 3, 1], ['infirmary', 3, 3, 1], ['yard', 7, 6, 1], ['office', 3, 3, 1], ['guardpost', 2, 2, 1], ['technical', 2, 2, 1], ['intake', 3, 2, 1]],
    staff: [['guard', 6], ['cook', 1], ['tech', 1], ['admin', 1]],
    tweak: (s) => {
      for (const f of s.furn) if (rnd(s) < 0.14 && f.type !== 'generator') f.broken = true;
      for (const st of s.staff) { st.satisfaction = rint(s, 28, 45); st.fatigue = rint(s, 30, 60); }
      for (const i of s.inmates) { i.mental = rint(s, 28, 50); i.needs.hygiene = rint(s, 25, 55); i.needs.leisure = rint(s, 15, 45); }
      s.policies.maintenance = 0; s.policies.food = 0; s.reputation = 30; s.authority = 40; s.sec.climate = 40; s.sec.tension = 45;
    } },
  { id: 'grande', name: 'Centre pénitentiaire de Grand-Fort', tagline: 'Établissement à forte capacité', desc: 'Une machine lourde : beaucoup de détenus, beaucoup de flux, et un encadrement insuffisant.',
    issues: ['Sous-effectif chronique de surveillants', 'Tension élevée dès le départ', 'Charges fixes considérables'],
    budget: 200000, funding: 2300, map: [62, 46], inmates: 72, intakeRate: 5,
    rooms: [['cell', 2, 3, 40], ['dorm', 6, 4, 5], ['showers', 5, 3, 2], ['toilets', 3, 3, 1], ['canteen', 9, 6, 1], ['kitchen', 5, 3, 1], ['infirmary', 5, 4, 1], ['common', 6, 5, 1], ['yard', 11, 8, 1], ['classroom', 5, 4, 1], ['workshop', 6, 4, 1], ['laundry', 4, 3, 1], ['office', 4, 3, 1], ['staffroom', 4, 3, 1], ['archives', 3, 2, 1], ['guardpost', 2, 2, 3], ['technical', 3, 3, 1], ['intake', 4, 3, 1]],
    staff: [['guard', 11], ['lead', 1], ['doctor', 1], ['cook', 2], ['tech', 2], ['admin', 2], ['trainer', 1]],
    tweak: (s) => { s.sec.tension = 50; s.sec.contraband = 30; for (const i of s.inmates) i.mental = rint(s, 35, 65); } },
];
export const presetDef = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

export interface SandboxConfig {
  budget: number; size: 'S' | 'M' | 'L'; inmates: number; difficulty: number; funding: number;
  events: boolean; eventFreq: number; incidents: boolean; bankruptcy: boolean; intake: boolean; unlimitedMoney: boolean;
}
export const DEFAULT_SANDBOX: SandboxConfig = { budget: 150000, size: 'M', inmates: 0, difficulty: 1, funding: 1, events: true, eventFreq: 1, incidents: true, bankruptcy: false, intake: true, unlimitedMoney: false };
export const SIZES: Record<string, [number, number]> = { S: [36, 28], M: [50, 38], L: [68, 52] };

export interface NewGameConfig { mode: Mode; title?: string; preset?: string; scenario?: string; sandbox?: SandboxConfig; seed?: number }

function baseState(mode: Mode, seed: number, w: number, h: number, rules: Rules): GameState {
  return {
    version: SAVE_VERSION, title: 'Prison Empire', mode, preset: '', scenario: '', rng: seed | 0, nextId: 1,
    time: 6 * 60, speed: 1, map: { w, h }, gate: { x: Math.floor(w / 2), y: h - 1 }, mapVersion: 1, staffVer: 1,
    rooms: [], doors: [], furn: [], walls: [], inmates: [], staff: [], candidates: [],
    regime: [...DEFAULT_REGIME],
    finance: { balance: 0, today: emptyLedger(), history: [], loans: [], grants: [], contracts: [], deficitDays: 0, positiveDays: 0, baseFunding: 1000, fundingCut: { factor: 1, until: 0 }, workMinutes: 0 },
    sec: { coverage: 1, tension: 20, climate: 55, contraband: 10, lockdownUntil: 0, safetyBase: 65, laxity: 0, incidentsToday: 0, incidentLog: [], pendingRefusals: [], collectiveCount: 0, lastTensionAlert: -9999, lastShakedown: -9999, covAcc: 0, covCnt: 0 },
    incidents: [],
    events: { active: [], history: [], cooldown: {}, nextInspection: 10, lastInspection: -1 },
    research: { done: [], active: '', progress: 0 },
    reputation: 50, authority: 55,
    rules, policies: { food: 1, maintenance: 1 },
    career: { mission: 0, grade: 0, initialCapacity: 0 },
    outcome: '', outcomeText: '', outcomeSeen: false,
    totals: { released: 0, reinserted: 0, deaths: 0, arrivals: 0 },
    stats: [], notes: [], pendingArrivals: 0,
  };
}

const defaultRules = (): Rules => ({ difficulty: 1, fundingMul: 1, events: true, eventFreq: 1, incidents: true, bankruptcy: true, intake: true, intakeRate: 3, overcrowdPush: 0, unlimitedMoney: false });

/** Dispose les salles en rangées desservies par des allées, puis clôture l'ensemble. */
function layout(s: GameState, specs: RoomSpec[]) {
  const list: [RoomType, number, number][] = [];
  for (const [t, w, h, n] of specs) for (let k = 0; k < n; k++) list.push([t, w, h]);
  const maxX = s.map.w - 3;
  const place = (apply: boolean) => {
    let x = 3, y = 3, rowH = 0, bx = 0, by = 0, prev: RoomType | '' = '';
    for (const [t, w, h] of list) {
      const gap = prev === t && (t === 'cell' || t === 'isolation') ? 0 : prev ? 1 : 0;
      if (x + gap + w > maxX) { x = 3; y += rowH + 2; rowH = 0; } else x += gap;
      if (apply) { buildRoom(s, t, x, y, w, h, true); addDoor(s, x + Math.floor(w / 2), y + h - 1, 'S', true); }
      x += w; rowH = Math.max(rowH, h); bx = Math.max(bx, x); by = Math.max(by, y + h); prev = t;
    }
    return { bx, by };
  };
  const dry = place(false);
  s.map.h = Math.max(s.map.h, dry.by + 6);
  s.gate = { x: 0, y: 0 };
  s.mapVersion++;
  const { bx, by } = place(true);
  for (const r of [...s.rooms]) autoFurnish(s, r, true);
  const x0 = 1, y0 = 1, x1 = Math.min(s.map.w - 2, bx + 1), y1 = by + 2;
  const gx = Math.floor((x0 + x1) / 2);
  s.gate = { x: gx, y: y1 + 1 };
  for (let x = x0; x <= x1; x++) { addWall(s, x, y0, true); if (x !== gx && x !== gx + 1) addWall(s, x, y1, true); }
  for (let y = y0 + 1; y < y1; y++) { addWall(s, x0, y, true); addWall(s, x1, y, true); }
}

function populate(s: GameState, inmates: number, staff: [Role, number][]) {
  const shifts: Shift[] = ['matin', 'soir', 'nuit'];
  let g = 0;
  for (const [role, n] of staff) for (let k = 0; k < n; k++) {
    const st = generateStaff(s, role);
    if (role === 'guard') st.shift = shifts[g++ % 3];
    s.staff.push(st);
  }
  s.staffVer++;
  autoAssign(s);
  for (let k = 0; k < inmates; k++) addInmate(s, false);
  assignCells(s);
  for (const i of s.inmates) {
    const r = getRuntime(s).rooms.get(i.cell);
    if (r) { i.x = i.px = r.x + r.w / 2; i.y = i.py = r.y + r.h / 2; }
    i.served = Math.floor(rnd(s) * i.sentence * 0.7);
    i.log = [{ t: s.time, m: `Présent à votre prise de fonction. Écroué pour ${i.crime}.` }];
    i.act = 'sleep';
  }
  // Quelques relations préexistantes.
  for (let k = 0; k < inmates; k++) {
    const a = s.inmates[Math.floor(rnd(s) * s.inmates.length)], b = s.inmates[Math.floor(rnd(s) * s.inmates.length)];
    if (a && b && a !== b) { const v = rint(s, -60, 70); a.rel[b.id] = v; b.rel[a.id] = v; }
  }
  s.totals.arrivals = 0;
  refreshCandidates(s);
}

export function applyPreset(s: GameState, p: Preset) {
  s.preset = p.id;
  s.finance.balance = p.budget;
  s.finance.baseFunding = p.funding;
  s.rules.intakeRate = p.intakeRate;
  layout(s, p.rooms);
  populate(s, p.inmates, p.staff);
  p.tweak?.(s);
  getRuntime(s);
  s.career.initialCapacity = totalCapacity(s);
}

/** Établissement de base généré pour un bac à sable démarrant avec des détenus. */
function sandboxRooms(n: number): { rooms: RoomSpec[]; staff: [Role, number][] } {
  const cells = Math.ceil(n * 0.6), dorms = Math.ceil((n - cells) / 6);
  return {
    rooms: [['cell', 2, 3, cells], ['dorm', 5, 4, dorms], ['showers', 4, 3, Math.ceil(n / 40)], ['canteen', Math.min(12, 4 + Math.ceil(n / 12)), 5, 1], ['kitchen', 4, 3, 1], ['infirmary', 4, 3, 1], ['yard', 8, 6, 1], ['office', 3, 3, 1], ['staffroom', 3, 3, 1], ['guardpost', 2, 2, 1], ['technical', 2, 2, Math.ceil(n / 80)], ['intake', 3, 2, 1]],
    staff: [['guard', Math.max(3, Math.ceil(n / 4))], ['doctor', 1], ['cook', Math.ceil(n / 40)], ['tech', 1], ['admin', 1]],
  };
}

import { SCENARIOS } from './progression';

export function newGame(cfg: NewGameConfig): GameState {
  const seed = cfg.seed ?? (Date.now() ^ (Math.random() * 0x7fffffff));
  if (cfg.mode === 'sandbox') {
    const c = cfg.sandbox ?? DEFAULT_SANDBOX;
    const [w, h] = SIZES[c.size] ?? SIZES.M;
    const rules: Rules = { ...defaultRules(), difficulty: c.difficulty, fundingMul: [0.7, 1, 1.4][c.funding] ?? 1, events: c.events, eventFreq: c.eventFreq, incidents: c.incidents, bankruptcy: c.bankruptcy, intake: c.intake, unlimitedMoney: c.unlimitedMoney };
    const s = baseState('sandbox', seed, w, h, rules);
    s.title = cfg.title || 'Bac à sable';
    s.finance.balance = c.budget;
    s.finance.baseFunding = 1500;
    if (c.inmates > 0) { const g = sandboxRooms(c.inmates); layout(s, g.rooms); populate(s, c.inmates, g.staff); }
    else refreshCandidates(s);
    getRuntime(s);
    s.career.initialCapacity = totalCapacity(s);
    return s;
  }
  if (cfg.mode === 'scenario') {
    const sc = SCENARIOS.find((x) => x.id === cfg.scenario) ?? SCENARIOS[0];
    const p = presetDef(sc.preset);
    const s = baseState('scenario', seed, p.map[0], p.map[1], defaultRules());
    s.scenario = sc.id;
    s.title = cfg.title || sc.name;
    applyPreset(s, p);
    sc.setup(s);
    s.reputation = clamp(s.reputation); s.authority = clamp(s.authority);
    getRuntime(s);
    return s;
  }
  const p = presetDef(cfg.preset ?? 'petite');
  const s = baseState('career', seed, p.map[0], p.map[1], defaultRules());
  s.title = cfg.title || p.name;
  applyPreset(s, p);
  return s;
}
