// Personnel : recrutement, carrière, horaires, affectations, fatigue et satisfaction.
import { LAST_NAMES, ROLES, ROLE_LIST, STAFF_FIRST, FIRST_NAMES } from './data';
import { canAfford, spend } from './economy';
import { makeLook, moveAgent, setTarget, staffEff, WALK_SPEED } from './inmates';
import { chance, clamp, note, pick, rint, rnd } from './rng';
import { anyActive, getRuntime, hasResearch, onDuty } from './rooms';
import type { GameState, Role, Shift, Staff } from './types';

export function generateStaff(s: GameState, role: Role): Staff {
  const def = ROLES[role];
  const skill = rint(s, 30, 85);
  return {
    id: s.nextId++, first: pick(s, chance(s, 0.5) ? STAFF_FIRST : FIRST_NAMES), last: pick(s, LAST_NAMES), age: rint(s, 23, 58), look: makeLook(s),
    x: s.gate.x + 0.5, y: s.gate.y + 0.5, px: s.gate.x + 0.5, py: s.gate.y + 0.5, tr: 0, tx: 0, ty: 0, at: true,
    role, skill, salary: Math.round(def.salary * (0.8 + skill / 220)), fatigue: rint(s, 0, 20), satisfaction: rint(s, 55, 75), xp: rint(s, 0, 8), rank: 1,
    shift: def.shift, room: 0, leaveUntil: 0, trainUntil: 0, away: true, patrolAt: 0,
  };
}

export function refreshCandidates(s: GameState, count = 7) {
  s.candidates = [];
  const needed = ROLE_LIST.filter((r) => !s.staff.some((st) => st.role === r.role)).map((r) => r.role);
  for (let k = 0; k < count; k++) {
    const role = k < 2 ? 'guard' : needed.length && chance(s, 0.6) ? needed.splice(Math.floor(rnd(s) * needed.length), 1)[0] : pick(s, ROLE_LIST).role;
    s.candidates.push(generateStaff(s, role));
  }
}

export const hireFee = (c: Staff) => c.salary * 2;

export function hire(s: GameState, candidateId: number): string | null {
  const c = s.candidates.find((x) => x.id === candidateId);
  if (!c) return 'Candidat indisponible.';
  if (!canAfford(s, hireFee(c))) return 'Fonds insuffisants pour les frais de recrutement.';
  spend(s, 'salaires', hireFee(c));
  s.candidates = s.candidates.filter((x) => x !== c);
  // Les surveillants sont répartis sur les trois services.
  if (c.role === 'guard') {
    const count = (sh: Shift) => s.staff.filter((st) => st.role === 'guard' && st.shift === sh).length;
    c.shift = (['matin', 'soir', 'nuit'] as Shift[]).sort((a, b) => count(a) - count(b))[0];
  }
  s.staff.push(c);
  s.staffVer++;
  autoAssign(s);
  note(s, 'good', `${c.first} ${c.last} rejoint l'équipe (${ROLES[c.role].name}).`);
  return null;
}

export function fire(s: GameState, id: number): string | null {
  const st = s.staff.find((x) => x.id === id);
  if (!st) return 'Employé introuvable.';
  spend(s, 'salaires', st.salary * 5);
  s.staff = s.staff.filter((x) => x !== st);
  for (const o of s.staff) o.satisfaction = clamp(o.satisfaction - 3);
  s.staffVer++;
  note(s, 'warn', `${st.first} ${st.last} est licencié (indemnité : ${Math.round(st.salary * 5)} €).`);
  return null;
}

export const trainCost = (st: Staff) => 350 + st.rank * 150;
export function train(s: GameState, id: number): string | null {
  const st = s.staff.find((x) => x.id === id);
  if (!st) return 'Employé introuvable.';
  if (st.trainUntil > s.time) return 'Déjà en formation.';
  if (st.skill >= 100) return 'Compétence maximale atteinte.';
  if (!canAfford(s, trainCost(st))) return 'Fonds insuffisants.';
  spend(s, 'formations', trainCost(st));
  const fast = (getRuntime(s).byType.get('meeting') ?? []).some((r) => getRuntime(s).status.get(r.id)?.ok);
  st.trainUntil = s.time + (fast ? 720 : 1440);
  st.skill = clamp(st.skill + 8);
  st.satisfaction = clamp(st.satisfaction + 4);
  s.staffVer++;
  return null;
}
export function raise(s: GameState, id: number): string | null {
  const st = s.staff.find((x) => x.id === id);
  if (!st) return 'Employé introuvable.';
  st.salary = Math.round(st.salary * 1.08);
  st.satisfaction = clamp(st.satisfaction + 12);
  return null;
}
export const promoteXp = (st: Staff) => st.rank * 10;
export function promote(s: GameState, id: number): string | null {
  const st = s.staff.find((x) => x.id === id);
  if (!st) return 'Employé introuvable.';
  if (st.rank >= 3) return 'Échelon maximal atteint.';
  if (st.xp < promoteXp(st)) return `Expérience insuffisante (${Math.floor(st.xp)}/${promoteXp(st)} jours).`;
  st.rank++;
  st.salary = Math.round(st.salary * 1.12);
  st.skill = clamp(st.skill + 5);
  st.satisfaction = clamp(st.satisfaction + 15);
  note(s, 'good', `${st.first} ${st.last} est promu à l'échelon ${st.rank}.`);
  return null;
}
export function grantLeave(s: GameState, id: number, days = 3): string | null {
  const st = s.staff.find((x) => x.id === id);
  if (!st) return 'Employé introuvable.';
  if (st.leaveUntil > s.time) return 'Déjà en congé.';
  st.leaveUntil = s.time + days * 1440;
  st.satisfaction = clamp(st.satisfaction + 10);
  s.staffVer++;
  return null;
}
export function setShift(s: GameState, id: number, shift: Shift) {
  const st = s.staff.find((x) => x.id === id);
  if (st) { st.shift = shift; s.staffVer++; }
}
export function assign(s: GameState, id: number, roomId: number): string | null {
  const st = s.staff.find((x) => x.id === id);
  if (!st) return 'Employé introuvable.';
  if (roomId) {
    const r = s.rooms.find((x) => x.id === roomId);
    if (!r || !ROLES[st.role].rooms.includes(r.type)) return 'Affectation incompatible avec ce métier.';
  }
  st.room = roomId;
  s.staffVer++;
  return null;
}

/** Affecte le personnel sans poste aux salles qui en ont besoin. Les surveillants restants patrouillent. */
export function autoAssign(s: GameState) {
  const count = new Map<number, number>();
  for (const st of s.staff) {
    if (st.room && !s.rooms.some((r) => r.id === st.room)) st.room = 0;
    if (st.room) count.set(st.room, (count.get(st.room) ?? 0) + 1);
  }
  let changed = false;
  for (const st of s.staff) {
    if (st.room) continue;
    const types = ROLES[st.role].rooms;
    let best = 0, bestN = 99;
    for (const r of s.rooms) {
      const ti = types.indexOf(r.type);
      if (ti < 0) continue;
      const n = (count.get(r.id) ?? 0) + ti * 0.5;
      // Un seul surveillant fixe par poste : les autres assurent les rondes.
      if ((st.role === 'guard' || st.role === 'lead') && (count.get(r.id) ?? 0) >= 1) continue;
      if (n < bestN) { best = r.id; bestN = n; }
    }
    if (best) { st.room = best; count.set(best, (count.get(best) ?? 0) + 1); changed = true; }
  }
  if (changed) s.staffVer++;
}

export function updateStaff(s: GameState, dt: number) {
  const rt = getRuntime(s);
  const rest = anyActive(s, 'staffroom');
  const coffee = rest && s.furn.some((f) => f.type === 'coffee' && !f.broken);
  const meeting = (rt.byType.get('meeting') ?? []).some((r) => rt.status.get(r.id)?.ok);
  const rh = hasResearch(s, 'rh');
  const guardLoad = s.sec.coverage < 0.6 ? 1.35 : 1;
  for (const st of s.staff) {
    const duty = onDuty(s, st);
    if (duty) {
      const k = 0.045 * (rest ? 0.75 : 1) * (coffee ? 0.92 : 1) * (rh ? 0.8 : 1) * (st.role === 'guard' ? guardLoad : 1);
      st.fatigue = clamp(st.fatigue + k * dt);
      st.xp += dt / 1440;
      st.skill = clamp(st.skill + 0.0004 * dt);
      if (st.away) { st.away = false; st.x = st.px = s.gate.x + 0.5; st.y = st.py = s.gate.y + 0.5; st.tr = 0; st.at = true; }
      if (st.room && rt.rooms.has(st.room)) { if (st.tr !== st.room) setTarget(s, rt, st, st.room); }
      else if (s.time >= st.patrolAt && s.rooms.length) {
        // Ronde : le surveillant passe de salle en salle, en priorité là où se trouvent des détenus.
        st.patrolAt = s.time + rint(s, 20, 45);
        const busy = s.rooms.filter((r) => (rt.occ.get(r.id) ?? 0) > 0);
        setTarget(s, rt, st, pick(s, busy.length ? busy : s.rooms).id);
      }
    } else {
      st.fatigue = clamp(st.fatigue - (st.leaveUntil > s.time ? 0.14 : 0.08) * dt);
      if (!st.away) {
        if (st.tr !== -1) setTarget(s, rt, st, -1);
        else if (st.at) st.away = true;
      }
    }
    const market = ROLES[st.role].salary * (0.8 + st.skill / 220);
    const target = 55 + clamp((st.salary / market - 1) * 100, -25, 25) - Math.max(0, st.fatigue - 50) * 0.6 + (rest ? 6 : -4) + (meeting ? 3 : 0) + (rh ? 5 : 0) - s.sec.tension * 0.15 + (st.rank - 1) * 3;
    st.satisfaction = clamp(st.satisfaction + (clamp(target) - st.satisfaction) * 0.0012 * dt);
  }
}

export function moveStaff(s: GameState) {
  const rt = getRuntime(s);
  for (const st of s.staff) if (!st.away) moveAgent(s, rt, st, WALK_SPEED * 1.15);
}

export function dailyStaff(s: GameState) {
  for (const st of [...s.staff]) {
    if (st.satisfaction < 18 && chance(s, 0.2)) {
      s.staff = s.staff.filter((x) => x !== st);
      s.staffVer++;
      note(s, 'bad', `${st.first} ${st.last} (${ROLES[st.role].name}) démissionne, épuisé par ses conditions de travail.`);
    }
  }
  refreshCandidates(s, s.events.cooldown.penurie > s.time ? 2 : 7);
  autoAssign(s);
}

export const guardsOnDuty = (s: GameState) => s.staff.filter((st) => (st.role === 'guard' || st.role === 'lead') && onDuty(s, st));
export const avgSatisfaction = (s: GameState) => (s.staff.length ? s.staff.reduce((a, st) => a + st.satisfaction, 0) / s.staff.length : 0);
