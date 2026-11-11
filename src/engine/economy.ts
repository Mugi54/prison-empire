// Système économique : revenus et dépenses continus, clôture quotidienne, dettes, contrats.
import { FOOD_POLICY, FURN, MAINT_POLICY, ROOMS } from './data';
import { clamp, note } from './rng';
import { activeRooms, anyActive, countFurn, getRuntime, hasResearch, totalCapacity } from './rooms';
import type { GameState, Ledger } from './types';

export const INCOME_LABEL: Record<string, string> = { dotation: 'Financement public', capacite: 'Financement à la capacité', subventions: 'Subventions', production: 'Activités productives', contrats: 'Contrats institutionnels', emprunt: 'Emprunts', divers: 'Recettes diverses' };
export const EXPENSE_LABEL: Record<string, string> = { salaires: 'Salaires', nourriture: 'Nourriture', electricite: 'Électricité', eau: 'Eau', entretien: 'Entretien', sante: 'Santé', equipements: 'Équipements', construction: 'Construction', formations: 'Formations', securite: 'Sécurité', recherche: 'Recherche', dette: 'Remboursement de dette', divers: 'Dépenses diverses' };

export const emptyLedger = (): Ledger => ({ inc: {}, exp: {} });
export const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

export function earn(s: GameState, cat: string, amount: number) {
  if (amount <= 0) return;
  s.finance.balance += amount;
  s.finance.today.inc[cat] = (s.finance.today.inc[cat] ?? 0) + amount;
}
export function spend(s: GameState, cat: string, amount: number) {
  if (amount <= 0) return;
  if (!s.rules.unlimitedMoney) s.finance.balance -= amount;
  s.finance.today.exp[cat] = (s.finance.today.exp[cat] ?? 0) + amount;
}
export const canAfford = (s: GameState, amount: number) => s.rules.unlimitedMoney || s.finance.balance >= amount;

// ── Contrats institutionnels ──
export interface ContractDef { id: string; name: string; desc: string; perDay: number; research?: string; grade: number; check: (s: GameState) => string | null }
const workers = (s: GameState) => s.inmates.filter((i) => i.program === 'work').length;
export const CONTRACTS: ContractDef[] = [
  { id: 'linge', name: 'Linge hospitalier', desc: 'Blanchisserie pour l\'hôpital voisin.', perDay: 350, grade: 0,
    check: (s) => (!anyActive(s, 'laundry') ? 'Buanderie opérationnelle requise' : workers(s) < 3 ? 'Au moins 3 détenus au programme Travail' : null) },
  { id: 'mobilier', name: 'Mobilier administratif', desc: 'Fabrication de mobilier pour les administrations.', perDay: 600, grade: 1,
    check: (s) => { const b = activeRooms(s, 'workshop').reduce((n, r) => n + countFurn(getRuntime(s).furnByRoom.get(r.id) ?? [], ['bench']), 0); return b < 2 ? 'Atelier actif avec 2 établis requis' : workers(s) < 5 ? 'Au moins 5 détenus au programme Travail' : null; } },
  { id: 'certif', name: 'Formation certifiante régionale', desc: 'La région finance vos stagiaires.', perDay: 450, grade: 1, research: 'contrats',
    check: (s) => (!anyActive(s, 'training') ? 'Espace de formation actif requis' : s.inmates.filter((i) => i.program === 'training').length < 4 ? 'Au moins 4 détenus en formation' : null) },
  { id: 'repas', name: 'Repas pour collectivités', desc: 'Votre cuisine livre des repas aux collectivités.', perDay: 500, grade: 2, research: 'contrats',
    check: (s) => { const st = activeRooms(s, 'kitchen').reduce((n, r) => n + countFurn(getRuntime(s).furnByRoom.get(r.id) ?? [], ['stove']), 0); return st < 3 ? 'Cuisine active avec 3 cuisinières requise' : s.staff.filter((x) => x.role === 'cook').length < 2 ? 'Au moins 2 cuisiniers' : null; } },
];

export interface Rates { inc: Record<string, number>; exp: Record<string, number> }

/** Flux quotidiens courants, calculés depuis l'état réel de l'établissement. */
export function computeRates(s: GameState): Rates {
  const rt = getRuntime(s);
  const f = s.finance;
  const n = s.inmates.length;
  const inc: Record<string, number> = {};
  const exp: Record<string, number> = {};
  const cut = f.fundingCut.until > s.time ? f.fundingCut.factor : 1;
  inc.dotation = f.baseFunding * s.rules.fundingMul * cut * (1 + 0.08 * s.career.grade);
  inc.capacite = (totalCapacity(s) * 10 + n * 32) * s.rules.fundingMul;
  inc.subventions = f.grants.filter((g) => g.until > s.time && g.perDay > 0).reduce((a, g) => a + g.perDay, 0) + (hasResearch(s, 'partenariats') ? 300 : 0);
  exp.divers = f.grants.filter((g) => g.until > s.time && g.perDay < 0).reduce((a, g) => a - g.perDay, 0);
  inc.contrats = f.contracts.reduce((a, c) => { const d = CONTRACTS.find((x) => x.id === c.id); return a + (d && !d.check(s) ? d.perDay : 0); }, 0);

  exp.salaires = s.staff.reduce((a, st) => a + st.salary, 0);
  exp.nourriture = n * FOOD_POLICY[s.policies.food].cost * (hasResearch(s, 'achats') ? 0.85 : 1);
  let tiles = 0, upkeep = 0, power = 0, showers = 0, washers = 0, medbeds = 0, sec = 0;
  for (const r of s.rooms) { tiles += r.w * r.h; upkeep += r.w * r.h * ROOMS[r.type].upkeep; }
  for (const fu of s.furn) {
    const d = FURN[fu.type];
    upkeep += d.upkeep; power += d.power;
    if (fu.type === 'shower') showers++; else if (fu.type === 'washer') washers++; else if (fu.type === 'medbed') medbeds++;
    else if (fu.type === 'camera') sec += 8; else if (fu.type === 'console') sec += 20; else if (fu.type === 'scanner') sec += 25;
  }
  const energy = hasResearch(s, 'energie') ? 0.75 : 1;
  const gens = s.furn.filter((x) => x.type === 'generator' && !x.broken).length;
  const overload = tiles > 0 && tiles > gens * 250 ? 1.25 : 1; // réseau sous-dimensionné : surcoût
  exp.electricite = (tiles * 0.35 + power * 1.2) * energy * overload;
  exp.eau = (n * 1.6 + showers * 2 + washers * 3) * energy;
  exp.entretien = upkeep * MAINT_POLICY[s.policies.maintenance].cost * (hasResearch(s, 'numerique') ? 0.85 : 1);
  exp.sante = n * 1.5 + (rt.byType.get('infirmary')?.length ? medbeds * 15 : 0);
  exp.securite = sec + n * 0.5;
  exp.dette = f.loans.reduce((a, l) => a + Math.min(l.daily, l.remaining), 0);
  return { inc, exp };
}

/** Applique `minutes` de fonctionnement aux finances. */
export function accrue(s: GameState, minutes: number) {
  const r = computeRates(s);
  const k = minutes / 1440;
  for (const c in r.inc) earn(s, c, r.inc[c] * k);
  for (const c in r.exp) if (c !== 'dette') spend(s, c, r.exp[c] * k);
  for (const l of s.finance.loans) {
    const p = Math.min(l.remaining, l.daily * k);
    l.remaining -= p;
    spend(s, 'dette', p);
  }
  s.finance.loans = s.finance.loans.filter((l) => l.remaining > 0.5);
  // Activités productives : chaque heure de travail effectif d'un détenu rapporte.
  if (s.finance.workMinutes > 0) {
    const rate = 4.2 * (hasResearch(s, 'qualif') ? 1.4 : 1);
    earn(s, 'production', (s.finance.workMinutes / 60) * rate);
    s.finance.workMinutes = 0;
  }
  if (s.rules.unlimitedMoney && s.finance.balance < 100000) s.finance.balance = 100000;
}

export function takeLoan(s: GameState, amount: number): string | null {
  if (s.finance.loans.length >= 3) return 'Trois emprunts sont déjà en cours.';
  const total = amount * 1.15;
  s.finance.loans.push({ id: s.nextId++, amount, remaining: total, daily: total / 30 });
  earn(s, 'emprunt', amount);
  note(s, 'info', `Emprunt de ${Math.round(amount)} € contracté (remboursement sur 30 jours, 15 % d'intérêts).`);
  return null;
}
export function repayLoan(s: GameState, id: number): string | null {
  const l = s.finance.loans.find((x) => x.id === id);
  if (!l) return 'Emprunt introuvable.';
  if (!canAfford(s, l.remaining)) return 'Fonds insuffisants.';
  spend(s, 'dette', l.remaining);
  s.finance.loans = s.finance.loans.filter((x) => x !== l);
  return null;
}
export const totalDebt = (s: GameState) => s.finance.loans.reduce((a, l) => a + l.remaining, 0) + Math.max(0, -s.finance.balance);

export function signContract(s: GameState, id: string): string | null {
  const d = CONTRACTS.find((c) => c.id === id);
  if (!d) return 'Contrat inconnu.';
  if (s.finance.contracts.some((c) => c.id === id)) return 'Contrat déjà signé.';
  if (d.research && !hasResearch(s, d.research)) return 'Recherche « Contrats institutionnels » requise.';
  if (s.mode === 'career' && s.career.grade < d.grade) return `Catégorie d'établissement ${d.grade + 1} requise.`;
  const pb = d.check(s);
  if (pb) return pb;
  s.finance.contracts.push({ id, failDays: 0 });
  note(s, 'good', `Contrat signé : ${d.name} (+${d.perDay} €/jour).`);
  return null;
}
export function cancelContract(s: GameState, id: string) {
  s.finance.contracts = s.finance.contracts.filter((c) => c.id !== id);
  s.authority = clamp(s.authority - 2);
}

/** Clôture comptable de la journée + conséquences progressives d'un déficit prolongé. */
export function closeDay(s: GameState) {
  const f = s.finance;
  const day = Math.floor(s.time / 1440);
  const net = sum(f.today.inc) - sum(f.today.exp);
  f.history.push({ day, balance: f.balance, inc: f.today.inc, exp: f.today.exp });
  if (f.history.length > 90) f.history.shift();
  f.today = emptyLedger();
  f.positiveDays = net > 0 ? f.positiveDays + 1 : 0;
  f.grants = f.grants.filter((g) => g.until > s.time);

  for (const c of [...f.contracts]) {
    const d = CONTRACTS.find((x) => x.id === c.id)!;
    if (d.check(s)) {
      c.failDays++;
      if (c.failDays >= 3) {
        f.contracts = f.contracts.filter((x) => x !== c);
        s.authority = clamp(s.authority - 4); s.reputation = clamp(s.reputation - 2);
        note(s, 'bad', `Contrat « ${d.name} » résilié : conditions non tenues 3 jours de suite.`);
      } else note(s, 'warn', `Contrat « ${d.name} » non honoré aujourd'hui.`);
    } else c.failDays = 0;
  }

  if (f.balance < 0) {
    f.deficitDays++;
    const d = f.deficitDays;
    if (d === 1) note(s, 'warn', 'Trésorerie négative : des agios s\'appliquent chaque jour.');
    spend(s, 'divers', Math.abs(f.balance) * 0.01);
    if (d >= 3) { s.reputation = clamp(s.reputation - 1); s.authority = clamp(s.authority - 1.5); }
    if (d === 3) note(s, 'warn', 'Déficit prolongé : les autorités s\'inquiètent de votre gestion.');
    if (d >= 5) { for (const st of s.staff) st.satisfaction = clamp(st.satisfaction - 4); if (s.policies.food > 0) s.policies.food = 0; }
    if (d === 5) note(s, 'bad', 'Les fournisseurs exigent des économies : alimentation passée en « Économique », salaires versés en retard.');
    if (d === 8) note(s, 'bad', 'Dernier avertissement de la tutelle avant mise sous administration.');
    if (d >= 12 && s.rules.bankruptcy && !s.outcome) {
      s.outcome = 'lost'; s.outcomeSeen = false;
      s.outcomeText = 'Après douze jours de trésorerie négative, l\'établissement est placé sous administration provisoire. Vous êtes relevé de vos fonctions.';
    }
  } else if (f.deficitDays > 0) {
    f.deficitDays = Math.max(0, f.deficitDays - 2);
    if (f.deficitDays === 0) note(s, 'good', 'Les finances sont assainies.');
  }
}

/** Prévision simple : résultat net quotidien attendu au rythme actuel. */
export function forecast(s: GameState) {
  const r = computeRates(s);
  const last = s.finance.history[s.finance.history.length - 1];
  const prod = last?.inc.production ?? 0;
  const inc = sum(r.inc) + prod, exp = sum(r.exp);
  return { inc, exp, net: inc - exp, in7: s.finance.balance + (inc - exp) * 7, in30: s.finance.balance + (inc - exp) * 30 };
}
