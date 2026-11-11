// Détenus : génération, besoins, décisions de routine, relations sociales, arrivées et libérations.
import { BACKGROUNDS, CRIMES, FIRST_NAMES, FOOD_POLICY, LAST_NAMES, PERSONALITIES, PROFILES, PROGRAMS } from './data';
import { chance, clamp, note, pick, rint, rnd } from './rng';
import { DIRS, Runtime, anyActive, flowTo, getRuntime, hasResearch, totalCapacity } from './rooms';
import type { Agent, GameState, Inmate, NeedKey, Program, Room, RoomType, Slot } from './types';

export const WALK_SPEED = 1.6; // cases par minute de jeu

export function ilog(s: GameState, i: Inmate, m: string) {
  i.log.push({ t: s.time, m });
  if (i.log.length > 40) i.log.shift();
}

export function makeLook(s: GameState) {
  return { skin: rint(s, 0, 5), hair: rint(s, 0, 5), style: rint(s, 0, 4), beard: chance(s, 0.3) };
}

export function generateInmate(s: GameState): Inmate {
  const personality = pick(s, PERSONALITIES);
  const sentence = rint(s, 10, 70);
  const base = () => rint(s, 55, 90);
  return {
    id: s.nextId++, first: pick(s, FIRST_NAMES), last: pick(s, LAST_NAMES), age: rint(s, 19, 62), look: makeLook(s),
    x: s.gate.x + 0.5, y: s.gate.y + 0.5, px: s.gate.x + 0.5, py: s.gate.y + 0.5, tr: 0, tx: 0, ty: 0, at: true,
    personality, profile: pick(s, PROFILES), crime: pick(s, CRIMES), background: pick(s, BACKGROUNDS),
    sentence, served: 0, arrived: s.time,
    needs: { food: base(), sleep: base(), hygiene: base(), health: rint(s, 60, 100), leisure: base(), social: base(), activity: base(), safety: base() },
    mental: rint(s, 45, 80),
    risk: clamp(rint(s, 10, 60) + (personality === 'impulsif' ? 25 : personality === 'calme' || personality === 'discipline' ? -10 : 0)),
    skills: { education: rint(s, 5, 45), craft: rint(s, 5, 45), social: rint(s, 10, 50) },
    program: 'none', rel: {}, log: [], cell: 0, act: 'arrive', slot: '', until: 0, isoUntil: 0, sick: false, emerg: false,
  };
}

export function addInmate(s: GameState, assign = true): Inmate {
  const i = generateInmate(s);
  s.inmates.push(i);
  s.totals.arrivals++;
  ilog(s, i, `Écroué pour ${i.crime} (peine : ${i.sentence} jours).`);
  if (assign) assignCells(s);
  return i;
}

/** Attribue une place aux détenus sans cellule valide. */
export function assignCells(s: GameState) {
  const rt = getRuntime(s);
  const used = new Map<number, number>();
  for (const i of s.inmates) {
    const st = i.cell ? rt.status.get(i.cell) : undefined;
    if (!st || !st.ok || (used.get(i.cell) ?? 0) >= st.capacity) { i.cell = 0; continue; }
    used.set(i.cell, (used.get(i.cell) ?? 0) + 1);
  }
  const housing = s.rooms.filter((r) => (r.type === 'cell' || r.type === 'dorm') && rt.status.get(r.id)?.ok);
  for (const i of s.inmates) {
    if (i.cell) continue;
    // Les profils anxieux ou introvertis reçoivent en priorité une cellule individuelle.
    const preferCell = i.personality === 'anxieux' || i.personality === 'introverti';
    const freeOf = (pred: (r: Room) => boolean) => housing.find((r) => (used.get(r.id) ?? 0) < rt.status.get(r.id)!.capacity && pred(r));
    const best = (preferCell ? freeOf((r) => r.type === 'cell') : freeOf((r) => r.type === 'dorm')) ?? freeOf(() => true);
    if (best) { i.cell = best.id; used.set(best.id, (used.get(best.id) ?? 0) + 1); ilog(s, i, 'Affecté à une nouvelle place d\'hébergement.'); }
  }
}
export const unhoused = (s: GameState) => s.inmates.reduce((n, i) => n + (i.cell ? 0 : 1), 0);

// ───────────── Déplacements ─────────────
export function setTarget(s: GameState, rt: Runtime, a: Agent, roomId: number, tile?: number, countOcc = false) {
  if (a.tr === roomId && tile === undefined) return;
  if (countOcc && a.tr !== roomId) {
    if (a.tr > 0) rt.occ.set(a.tr, Math.max(0, (rt.occ.get(a.tr) ?? 1) - 1));
    if (roomId > 0) rt.occ.set(roomId, (rt.occ.get(roomId) ?? 0) + 1);
  }
  a.tr = roomId;
  a.at = false;
  if (roomId === -1) { a.tx = s.gate.x + 0.5; a.ty = s.gate.y + 0.5; return; }
  if (roomId === 0) { a.at = true; return; }
  const room = rt.rooms.get(roomId);
  if (!room) { a.tr = 0; a.at = true; return; }
  let t = tile;
  if (t === undefined) {
    const free = rt.freeTiles.get(roomId)!;
    t = free.length ? free[Math.floor(rnd(s) * free.length)] : room.y * rt.w + room.x;
  }
  a.tx = (t % rt.w) + 0.3 + rnd(s) * 0.4;
  a.ty = Math.floor(t / rt.w) + 0.3 + rnd(s) * 0.4;
}

export function moveAgent(s: GameState, rt: Runtime, a: Agent, budget: number) {
  a.px = a.x; a.py = a.y;
  if (a.at || a.tr === 0) return;
  const flow = flowTo(s, a.tr);
  if (!flow) { a.tr = 0; a.at = true; return; }
  for (let guard = 0; guard < 8 && budget > 0; guard++) {
    const cx = Math.floor(a.x), cy = Math.floor(a.y);
    const idx = cy * rt.w + cx;
    const d = cx < 0 || cy < 0 || cx >= rt.w || cy >= rt.h ? -1 : flow[idx];
    let gx = a.tx, gy = a.ty;
    if (d < 0) { a.x = a.tx; a.y = a.ty; a.at = true; return; } // inaccessible : on ne bloque jamais un personnage
    if (d > 0) {
      const bits = rt.pass[idx];
      const start = a.id & 3;
      for (let q = 0; q < 4; q++) {
        const k = (start + q) & 3;
        if (!(bits & (1 << k))) continue;
        const j = (cy + DIRS[k][1]) * rt.w + cx + DIRS[k][0];
        if (flow[j] === d - 1) { gx = cx + DIRS[k][0] + 0.5; gy = cy + DIRS[k][1] + 0.5; break; }
      }
    }
    const dx = gx - a.x, dy = gy - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= budget) {
      a.x = gx; a.y = gy; budget -= dist;
      if (d === 0) { a.at = true; return; }
    } else { a.x += (dx / dist) * budget; a.y += (dy / dist) * budget; budget = 0; }
  }
}

// ───────────── Décisions ─────────────
function findRoom(s: GameState, rt: Runtime, types: RoomType[], i: Inmate): Room | null {
  for (const t of types) {
    let best: Room | null = null, bestLoad = 1;
    for (const r of rt.byType.get(t) ?? []) {
      if (!rt.active.get(r.id)) continue;
      const cap = rt.status.get(r.id)!.capacity;
      const occ = (rt.occ.get(r.id) ?? 0) - (i.tr === r.id ? 1 : 0);
      const load = cap > 0 ? occ / cap : 1;
      if (load < bestLoad) { best = r; bestLoad = load; }
    }
    if (best) return best;
  }
  return null;
}

function go(s: GameState, rt: Runtime, i: Inmate, room: Room | null | undefined, act: string, minutes = 30) {
  i.act = act;
  i.until = s.time + minutes;
  if (!room) { if (i.tr !== 0) setTarget(s, rt, i, 0, undefined, true); return; }
  if (i.tr === room.id) return;
  let tile: number | undefined;
  if (room.id === i.cell || room.type === 'isolation' || room.type === 'infirmary') {
    const beds = (rt.furnByRoom.get(room.id) ?? []).filter((f) => f.type === 'bed' || f.type === 'bunk' || f.type === 'medbed');
    if (beds.length) { const b = beds[i.id % beds.length]; tile = b.y * rt.w + b.x; }
  }
  setTarget(s, rt, i, room.id, tile, true);
}

function goCell(s: GameState, rt: Runtime, i: Inmate, act: string, minutes = 30) {
  const cell = i.cell ? rt.rooms.get(i.cell) : null;
  if (cell) return go(s, rt, i, cell, act, minutes);
  // Sans place attribuée : le détenu s'installe où il peut.
  go(s, rt, i, findRoom(s, rt, ['common', 'yard', 'canteen'], i) ?? (i.tr > 0 ? rt.rooms.get(i.tr) : null), act, minutes);
}

function effectiveProgram(s: GameState, i: Inmate): Program {
  if (i.program !== 'perso') return i.program;
  if (i.mental < 45 && anyActive(s, 'consult')) return 'therapy';
  if (i.skills.education <= i.skills.craft && anyActive(s, 'classroom')) return 'education';
  if (anyActive(s, 'training')) return 'training';
  if (anyActive(s, 'workshop') || anyActive(s, 'laundry')) return 'work';
  return anyActive(s, 'classroom') ? 'education' : 'sport';
}

const PROGRAM_ACT: Record<string, string> = { work: 'work', education: 'class', training: 'training', therapy: 'therapy', sport: 'sport' };

function freeTime(s: GameState, rt: Runtime, i: Inmate) {
  const n = i.needs;
  const opts: [number, RoomType[], string][] = [
    [n.leisure, i.personality === 'introverti' ? ['library', 'common', 'yard'] : ['common', 'library', 'yard'], 'leisure'],
    [n.social - (i.personality === 'sociable' ? 15 : 0), ['yard', 'common'], 'social'],
    [n.activity - (i.personality === 'ambitieux' ? 10 : 0), ['gym', 'yard'], 'sport'],
  ];
  if (n.hygiene < 45) opts.push([n.hygiene - 20, ['showers'], 'shower']);
  opts.sort((a, b) => a[0] - b[0]);
  for (const [, types, act] of opts) {
    const r = findRoom(s, rt, types, i);
    if (r) return go(s, rt, i, r, r.type === 'yard' && act !== 'sport' ? 'yard' : act, 40);
  }
  goCell(s, rt, i, 'cell');
}

function decide(s: GameState, rt: Runtime, i: Inmate, slot: Slot) {
  const t = s.time;
  if (i.isoUntil > t) {
    const iso = findRoom(s, rt, ['isolation'], i);
    return iso ? go(s, rt, i, iso, 'isolation', 60) : goCell(s, rt, i, 'isolation', 60);
  }
  if (s.sec.lockdownUntil > t) return goCell(s, rt, i, slot === 'sleep' ? 'sleep' : 'cell');
  if ((i.needs.health < 35 || i.sick) && (slot !== 'sleep' || i.needs.health < 20)) {
    const inf = findRoom(s, rt, ['infirmary'], i);
    if (inf) return go(s, rt, i, inf, 'infirmary', 60);
  }
  switch (slot) {
    case 'sleep': return goCell(s, rt, i, 'sleep', 60);
    case 'lockup': return goCell(s, rt, i, 'cell', 60);
    case 'hygiene': {
      const r = i.needs.hygiene < 92 ? findRoom(s, rt, ['showers'], i) : null;
      return r ? go(s, rt, i, r, 'shower', 25) : goCell(s, rt, i, 'cell', 20);
    }
    case 'meal': {
      if (i.needs.food > 96) return freeTime(s, rt, i);
      const r = findRoom(s, rt, ['canteen'], i);
      return r ? go(s, rt, i, r, 'eat', 45) : goCell(s, rt, i, 'eat', 45);
    }
    case 'work': {
      const p = effectiveProgram(s, i);
      if (p === 'none') return freeTime(s, rt, i);
      // Refus d'activité : dépend du moral, de la personnalité et du climat.
      if (i.act !== PROGRAM_ACT[p] && i.mental < 32 && i.personality !== 'discipline') {
        const pr = (0.1 + (32 - i.mental) / 100) * (i.personality === 'impulsif' ? 1.8 : 1) * (1 + s.sec.laxity / 50);
        if (chance(s, pr)) {
          ilog(s, i, `Refuse de participer au programme « ${PROGRAMS[p].name} ».`);
          s.sec.pendingRefusals.push(i.id); // traité par le module sécurité
          return goCell(s, rt, i, 'refuse', 120);
        }
      }
      const r = findRoom(s, rt, PROGRAMS[p].rooms, i);
      if (!r) return freeTime(s, rt, i);
      return go(s, rt, i, r, PROGRAM_ACT[p], p === 'therapy' ? 60 : 90);
    }
    default: return freeTime(s, rt, i);
  }
}

const add = (i: Inmate, k: NeedKey, v: number) => { i.needs[k] = clamp(i.needs[k] + v); };

/** Qualité des repas servis : politique alimentaire × état réel de la cuisine. */
export function mealQuality(s: GameState): number {
  const rt = getRuntime(s);
  let cap = 0;
  for (const r of rt.byType.get('kitchen') ?? []) if (rt.active.get(r.id)) cap += rt.status.get(r.id)!.capacity;
  const cover = s.inmates.length ? Math.min(1, cap / s.inmates.length) : 1;
  return FOOD_POLICY[s.policies.food].q * (0.55 + 0.45 * cover);
}

/** Part des besoins sanitaires couverte (WC de cellule + sanitaires collectifs). */
export function sanitaryCoverage(s: GameState): number {
  if (!s.inmates.length) return 1;
  const rt = getRuntime(s);
  let places = 0;
  for (const f of s.furn) {
    if (f.type !== 'toilet' || f.broken) continue;
    const rid = rt.roomAt[f.y * rt.w + f.x];
    const type = rt.rooms.get(rid)?.type;
    places += type === 'toilets' ? 8 : type === 'dorm' ? 4 : 1;
  }
  return Math.min(1, places / s.inmates.length);
}

export const reinsertionScore = (i: Inmate) => ((i.skills.education + i.skills.craft + i.skills.social) / 3) * 0.7 + i.mental * 0.3;
export const avgNeeds = (i: Inmate) => { const n = i.needs; return (n.food + n.sleep + n.hygiene + n.health + n.leisure + n.social + n.activity + n.safety) / 8; };

interface Ctx { meal: number; sanitary: number; laundry: boolean; heal: number; teach: number; therapy: number; reins: number; diff: number }
let ctx: Ctx | null = null, ctxTime = -1, ctxState: GameState | null = null;
function getCtx(s: GameState): Ctx {
  if (ctx && ctxTime === s.time && ctxState === s) return ctx;
  const effOf = (role: string) => {
    const l = s.staff.filter((st) => st.role === role && st.leaveUntil <= s.time);
    return l.length ? l.reduce((a, st) => a + staffEff(st), 0) / l.length : 0.6;
  };
  ctx = {
    meal: mealQuality(s), sanitary: sanitaryCoverage(s), laundry: anyActive(s, 'laundry'),
    heal: effOf('doctor') * (hasResearch(s, 'soins') ? 1.4 : 1),
    teach: effOf('trainer') * (hasResearch(s, 'enseignement') ? 1.4 : 1),
    therapy: effOf('psych') * (hasResearch(s, 'psy') ? 1.5 : 1),
    reins: 1 + Math.min(0.4, s.staff.filter((st) => st.role === 'reinsertion').length * 0.15),
    diff: s.rules.difficulty,
  };
  ctxTime = s.time; ctxState = s;
  return ctx;
}
export const staffEff = (st: { skill: number; fatigue: number; satisfaction: number }) =>
  (0.4 + (st.skill / 100) * 0.8) * (1 - Math.max(0, st.fatigue - 50) / 80) * (0.7 + st.satisfaction / 200);

export function updateInmate(s: GameState, i: Inmate, dt: number) {
  const rt = getRuntime(s);
  const c = getCtx(s);
  const n = i.needs;
  const slot = s.regime[Math.floor((s.time % 1440) / 60)];
  const room = i.at && i.tr > 0 ? rt.rooms.get(i.tr) : undefined;
  const active = room ? rt.active.get(room.id) === true : false;
  const p = i.personality;
  const d = c.diff;

  // 1. Usure naturelle des besoins.
  add(i, 'food', -0.08 * dt * d * (i.act === 'sleep' ? 0.6 : 1));
  if (i.act !== 'sleep') add(i, 'sleep', -0.085 * dt);
  add(i, 'hygiene', -0.04 * dt * d * (c.sanitary < 1 ? 1.2 + (1 - c.sanitary) : 1) * (c.laundry ? 0.8 : 1));
  add(i, 'leisure', -0.06 * dt * d);
  add(i, 'social', -0.05 * dt * (p === 'sociable' ? 1.5 : p === 'introverti' ? 0.5 : 1));
  add(i, 'activity', -0.055 * dt * d * (p === 'ambitieux' ? 1.3 : 1));
  let dh = 0.012;
  if (n.food < 15) dh -= 0.06;
  if (n.hygiene < 15) dh -= 0.035;
  if (n.sleep < 10) dh -= 0.03;
  if (i.sick) dh -= 0.05 * (hasResearch(s, 'prevention') ? 0.6 : 1);
  add(i, 'health', dh * dt);

  // 2. Effets de l'activité en cours, uniquement une fois sur place.
  const gain = (p === 'ambitieux' ? 1.4 : 1) * c.reins * (i.program === 'perso' ? 1.3 : 1);
  if (i.at) {
    switch (i.act) {
      case 'sleep': {
        const inCell = room && room.id === i.cell;
        const crowd = inCell && (rt.occ.get(room!.id) ?? 0) > rt.status.get(room!.id)!.capacity;
        add(i, 'sleep', (inCell ? (crowd ? 0.17 : 0.25) : 0.12) * dt);
        break;
      }
      case 'eat': {
        const canteen = room?.type === 'canteen';
        add(i, 'food', c.meal * (canteen ? 2 : 1.5) * dt);
        if (canteen) add(i, 'social', 0.12 * dt);
        break;
      }
      case 'shower': if (active) add(i, 'hygiene', 2.6 * dt); break;
      case 'work':
        if (active) { add(i, 'activity', 0.3 * dt); i.skills.craft = clamp(i.skills.craft + 0.012 * dt * gain * (hasResearch(s, 'qualif') ? 1.3 : 1)); s.finance.workMinutes += dt; }
        break;
      case 'class': if (active) { add(i, 'activity', 0.28 * dt); i.skills.education = clamp(i.skills.education + 0.016 * dt * gain * c.teach); } break;
      case 'training': if (active) { add(i, 'activity', 0.28 * dt); i.skills.craft = clamp(i.skills.craft + 0.02 * dt * gain * c.teach); i.skills.education = clamp(i.skills.education + 0.005 * dt * gain); } break;
      case 'therapy': if (active) { i.mental = clamp(i.mental + 0.14 * dt * c.therapy); i.skills.social = clamp(i.skills.social + 0.012 * dt * gain); add(i, 'social', 0.1 * dt); i.risk = clamp(i.risk - 0.01 * dt); } break;
      case 'sport': add(i, 'activity', 0.5 * dt); add(i, 'social', 0.1 * dt); add(i, 'health', 0.01 * dt); i.skills.social = clamp(i.skills.social + 0.003 * dt * gain); break;
      case 'leisure':
        if (room?.type === 'library') { add(i, 'leisure', 0.45 * dt); i.skills.education = clamp(i.skills.education + 0.004 * dt * gain); }
        else { const tv = room ? (rt.furnByRoom.get(room.id) ?? []).some((f) => f.type === 'tv' && !f.broken) : false; add(i, 'leisure', (tv ? 0.5 : 0.35) * dt); add(i, 'social', 0.2 * dt); }
        break;
      case 'social': add(i, 'social', 0.32 * dt); add(i, 'leisure', 0.18 * dt); break;
      case 'yard': add(i, 'leisure', 0.3 * dt); add(i, 'social', 0.2 * dt); add(i, 'activity', 0.2 * dt); break;
      case 'infirmary':
        if (active) { add(i, 'health', 0.5 * dt * c.heal); if (n.health > 70 && i.sick) { i.sick = false; ilog(s, i, 'Guéri après un passage à l\'infirmerie.'); } if (n.health > 50) i.emerg = false; }
        break;
      case 'isolation': add(i, 'social', -0.06 * dt); add(i, 'leisure', -0.03 * dt); i.risk = clamp(i.risk - 0.02 * dt); break;
      case 'cell': case 'refuse': add(i, 'leisure', 0.03 * dt); break;
    }
  }

  // 3. Sécurité ressentie et état psychologique.
  let target = s.sec.safetyBase + (p === 'anxieux' ? -15 : p === 'calme' ? 6 : 0) + (i.cell ? 0 : -20);
  if (i.cell && rt.rooms.get(i.cell)?.type === 'cell') target += 8;
  for (const k in i.rel) if (i.rel[k] < -40) target -= 4;
  n.safety = clamp(n.safety + (clamp(target) - n.safety) * 0.012 * dt);
  const avg = avgNeeds(i);
  const min = Math.min(n.food, n.sleep, n.hygiene, n.health, n.safety);
  const mt = avg * 0.65 + min * 0.35;
  i.mental = clamp(i.mental + (mt - i.mental) * 0.004 * dt);

  // 4. Nouvelle décision si le créneau change ou si l'activité est terminée.
  if (i.slot !== slot || s.time >= i.until || (i.at && i.tr > 0 && !rt.rooms.has(i.tr))) {
    i.slot = slot;
    decide(s, rt, i, slot);
  }
}

// ───────────── Relations sociales ─────────────
export function relLabel(v: number) { return v >= 75 ? 'Alliance' : v >= 40 ? 'Amitié' : v <= -70 ? 'Conflit ouvert' : v <= -40 ? 'Rivalité' : v >= 15 ? 'Bonne entente' : v <= -15 ? 'Tension' : 'Neutre'; }

function setRel(a: Inmate, b: Inmate, v: number) {
  a.rel[b.id] = v;
  const keys = Object.keys(a.rel);
  if (keys.length > 8) {
    let weakest = keys[0];
    for (const k of keys) if (Math.abs(a.rel[+k]) < Math.abs(a.rel[+weakest])) weakest = k;
    delete a.rel[+weakest];
  }
}

const AFFINITY: Record<string, number> = { calme: 0.08, sociable: 0.14, introverti: -0.04, impulsif: -0.16, anxieux: -0.05, ambitieux: 0, discipline: 0.05 };

/** Interactions entre détenus présents dans une même salle. Renvoie les paires entrées en conflit. */
export function socialPass(s: GameState): [Inmate, Inmate][] {
  const byRoom = new Map<number, Inmate[]>();
  for (const i of s.inmates) {
    if (!i.at || i.tr <= 0 || i.act === 'sleep' || i.act === 'isolation') continue;
    let l = byRoom.get(i.tr);
    if (!l) byRoom.set(i.tr, (l = []));
    l.push(i);
  }
  const fights: [Inmate, Inmate][] = [];
  for (const list of byRoom.values()) {
    if (list.length < 2) continue;
    const k = Math.ceil(list.length / 5);
    for (let q = 0; q < k; q++) {
      const a = pick(s, list), b = pick(s, list);
      if (a === b) continue;
      const old = a.rel[b.id] ?? 0;
      let score = 0.58 + AFFINITY[a.personality] + AFFINITY[b.personality] + (a.personality === b.personality ? 0.06 : 0);
      score += ((a.mental + b.mental) / 2 - 50) / 180 + old / 350 - s.sec.tension / 450;
      let v: number;
      if (rnd(s) < score) {
        v = clamp(old + rint(s, 3, 8), -100, 100);
        a.needs.social = clamp(a.needs.social + 4); b.needs.social = clamp(b.needs.social + 4);
        a.skills.social = clamp(a.skills.social + 0.05); b.skills.social = clamp(b.skills.social + 0.05);
      } else {
        v = clamp(old - rint(s, 4, 10), -100, 100);
        if (v < -40) {
          const mult = (a.personality === 'impulsif' || b.personality === 'impulsif' ? 2 : 1) * (a.personality === 'calme' || a.personality === 'discipline' ? 0.5 : 1);
          const pf = 0.2 * mult * (1 - s.sec.coverage * 0.6) * (1 + s.sec.contraband / 100) * s.rules.difficulty * (hasResearch(s, 'desescalade') ? 0.65 : 1);
          if (chance(s, pf)) fights.push([a, b]);
        }
      }
      const cross = (th: number) => (old < th && v >= th) || (old > -th && v <= -th);
      if (cross(40)) {
        const m = v > 0 ? 'Se lie d\'amitié avec' : 'Entre en rivalité avec';
        ilog(s, a, `${m} ${b.first} ${b.last}.`); ilog(s, b, `${m} ${a.first} ${a.last}.`);
      } else if (old < 75 && v >= 75) { ilog(s, a, `Forme une alliance avec ${b.first} ${b.last}.`); ilog(s, b, `Forme une alliance avec ${a.first} ${a.last}.`); }
      setRel(a, b, v); setRel(b, a, v);
    }
  }
  return fights;
}

// ───────────── Cycle quotidien ─────────────
export function dailyInmates(s: GameState) {
  const hygieneAvg = s.inmates.length ? s.inmates.reduce((a, i) => a + i.needs.hygiene, 0) / s.inmates.length : 100;
  const sickP = 0.012 * (hygieneAvg < 40 ? 2.5 : 1) * (sanitaryCoverage(s) < 0.8 ? 1.6 : 1) * (hasResearch(s, 'prevention') ? 0.5 : 1) * s.rules.difficulty;
  const released: Inmate[] = [];
  for (const i of s.inmates) {
    i.served++;
    if (!i.sick && chance(s, sickP)) { i.sick = true; ilog(s, i, 'Tombe malade.'); }
    if (i.served >= i.sentence) released.push(i);
  }
  for (const i of released) releaseInmate(s, i);
  assignCells(s);
  // Programmation des arrivées du lendemain matin.
  if (s.rules.intake) {
    const free = totalCapacity(s) - s.inmates.length;
    const want = rint(s, 0, Math.max(1, Math.round(s.rules.intakeRate * (1 + 0.25 * s.career.grade))));
    s.pendingArrivals = Math.max(0, Math.min(want, free + Math.round(s.rules.overcrowdPush * Math.max(4, totalCapacity(s) * 0.05))));
  }
}

export function removeInmate(s: GameState, i: Inmate) {
  const rt = getRuntime(s);
  if (i.tr > 0) rt.occ.set(i.tr, Math.max(0, (rt.occ.get(i.tr) ?? 1) - 1));
  s.inmates = s.inmates.filter((x) => x !== i);
  for (const o of s.inmates) delete o.rel[i.id];
}

function releaseInmate(s: GameState, i: Inmate) {
  const pSuccess = clamp(reinsertionScore(i) / 100 + 0.1 + (hasResearch(s, 'partenariats') ? 0.2 : 0), 0.05, 0.97);
  s.totals.released++;
  if (chance(s, pSuccess)) { s.totals.reinserted++; s.reputation = clamp(s.reputation + 0.4); note(s, 'good', `${i.first} ${i.last} est libéré avec un projet de réinsertion solide.`); }
  else { s.reputation = clamp(s.reputation - 0.15); note(s, 'info', `${i.first} ${i.last} est libéré en fin de peine, sans projet abouti.`); }
  removeInmate(s, i);
}

export function processArrivals(s: GameState) {
  const n = s.pendingArrivals;
  if (n <= 0) return;
  s.pendingArrivals = 0;
  for (let k = 0; k < n; k++) addInmate(s);
  note(s, 'info', `${n} nouveau${n > 1 ? 'x' : ''} détenu${n > 1 ? 's' : ''} ${n > 1 ? 'arrivent' : 'arrive'} par transfert.`);
}

/** Répartit les détenus sans programme selon les places réellement disponibles. */
export function autoAssignPrograms(s: GameState): number {
  const rt = getRuntime(s);
  const cap: Record<string, number> = {};
  const used: Record<string, number> = {};
  for (const p of ['work', 'education', 'training', 'therapy', 'sport'] as Program[]) {
    cap[p] = 0; used[p] = 0;
    for (const t of PROGRAMS[p].rooms) for (const r of rt.byType.get(t) ?? []) if (rt.status.get(r.id)?.ok) cap[p] += t === 'yard' ? Math.floor(rt.status.get(r.id)!.capacity / 4) : t === 'consult' ? rt.status.get(r.id)!.capacity * 4 : rt.status.get(r.id)!.capacity;
  }
  for (const i of s.inmates) if (i.program !== 'none' && i.program !== 'perso') used[i.program]++;
  let n = 0;
  for (const i of s.inmates) {
    if (i.program !== 'none') continue;
    const order: Program[] = i.mental < 40 ? ['therapy', 'sport', 'work', 'education', 'training'] : i.skills.education < i.skills.craft ? ['education', 'training', 'work', 'sport', 'therapy'] : ['training', 'work', 'education', 'sport', 'therapy'];
    const p = order.find((q) => used[q] < cap[q]);
    if (p) { i.program = p; used[p]++; n++; ilog(s, i, `Inscrit au programme « ${PROGRAMS[p].name} ».`); }
  }
  return n;
}
export function setProgram(s: GameState, i: Inmate, p: Program): string | null {
  if (p === 'perso') {
    if (!hasResearch(s, 'perso')) return 'Recherche « Programmes individualisés » requise.';
    if (!s.staff.some((st) => st.role === 'reinsertion')) return 'Un responsable de réinsertion est nécessaire.';
  }
  if (p === 'training' && !hasResearch(s, 'formation')) return 'Recherche « Formation professionnelle » requise.';
  i.program = p; i.until = 0;
  ilog(s, i, p === 'none' ? 'Retiré de son programme.' : `Inscrit au programme « ${PROGRAMS[p].name} ».`);
  return null;
}
