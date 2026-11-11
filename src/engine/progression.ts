// Progression : missions de carrière, scénarios, réputation, relations avec les autorités, statistiques.
import { earn } from './economy';
import { inspectionScore } from './events';
import { addInmate, avgNeeds, reinsertionScore, unhoused } from './inmates';
import { clamp, note, rint } from './rng';
import { anyActive, getRuntime, totalCapacity } from './rooms';
import { avgSatisfaction } from './staff';
import type { GameState } from './types';

const avg = (s: GameState, f: (i: GameState['inmates'][0]) => number, empty = 0) => (s.inmates.length ? s.inmates.reduce((a, i) => a + f(i), 0) / s.inmates.length : empty);
export const avgMental = (s: GameState) => avg(s, (i) => i.mental, 70);
export const avgNeedsAll = (s: GameState) => avg(s, avgNeeds, 70);
export const avgReinsertion = (s: GameState) => avg(s, reinsertionScore, 0);
export const programRate = (s: GameState) => (s.inmates.length ? s.inmates.filter((i) => i.program !== 'none').length / s.inmates.length : 0);
export const occupancy = (s: GameState) => { const c = totalCapacity(s); return c ? s.inmates.length / c : s.inmates.length ? 9 : 0; };
export const allRoomsOk = (s: GameState) => s.rooms.length > 0 && s.rooms.every((r) => getRuntime(s).status.get(r.id)?.ok);
export const day = (s: GameState) => Math.floor(s.time / 1440) + 1;

// ───────────── Missions de carrière ─────────────
export interface Mission { title: string; desc: string; check: (s: GameState) => boolean; progress: (s: GameState) => string; reward: number; rewardText: string; grade?: boolean }
export const MISSIONS: Mission[] = [
  { title: 'Prise de fonction', desc: 'Chaque détenu doit disposer d\'une place d\'hébergement et la trésorerie doit être positive.', check: (s) => s.inmates.length > 0 && unhoused(s) === 0 && s.finance.balance > 0, progress: (s) => `${unhoused(s)} détenu(s) sans place`, reward: 5000, rewardText: '5 000 €' },
  { title: 'Les services essentiels', desc: 'Faites fonctionner une cantine, une cuisine, des douches et une infirmerie.', check: (s) => (['canteen', 'kitchen', 'showers', 'infirmary'] as const).every((t) => anyActive(s, t) || (getRuntime(s).byType.get(t) ?? []).some((r) => getRuntime(s).status.get(r.id)?.ok)), progress: (s) => `${(['canteen', 'kitchen', 'showers', 'infirmary'] as const).filter((t) => (getRuntime(s).byType.get(t) ?? []).some((r) => getRuntime(s).status.get(r.id)?.ok)).length}/4 services opérationnels`, reward: 8000, rewardText: '8 000 € · Catégorie supérieure', grade: true },
  { title: 'Sécurité maîtrisée', desc: 'Atteignez 80 % de couverture de sécurité avec une tension inférieure à 40 %.', check: (s) => s.sec.coverage >= 0.8 && s.sec.tension < 40, progress: (s) => `Couverture ${Math.round(s.sec.coverage * 100)} % · Tension ${Math.round(s.sec.tension)} %`, reward: 10000, rewardText: '10 000 €' },
  { title: 'Premiers programmes', desc: 'Inscrivez au moins 30 % des détenus à un programme de réinsertion.', check: (s) => programRate(s) >= 0.3, progress: (s) => `${Math.round(programRate(s) * 100)} % des détenus inscrits`, reward: 12000, rewardText: '12 000 € · Catégorie supérieure', grade: true },
  { title: 'Équilibre budgétaire', desc: 'Terminez 3 journées consécutives avec un résultat net positif.', check: (s) => s.finance.positiveDays >= 3, progress: (s) => `${Math.min(3, s.finance.positiveDays)}/3 jours bénéficiaires`, reward: 10000, rewardText: '10 000 €' },
  { title: 'Innovation', desc: 'Menez à bien 3 recherches.', check: (s) => s.research.done.length >= 3, progress: (s) => `${s.research.done.length}/3 recherches`, reward: 15000, rewardText: '15 000 € · Catégorie supérieure', grade: true },
  { title: 'Croissance', desc: 'Portez la capacité d\'accueil à 150 % de sa valeur initiale.', check: (s) => totalCapacity(s) >= Math.ceil(s.career.initialCapacity * 1.5), progress: (s) => `${totalCapacity(s)}/${Math.ceil(s.career.initialCapacity * 1.5)} places`, reward: 20000, rewardText: '20 000 €' },
  { title: 'Établissement modèle', desc: 'Atteignez 75 de réputation et un niveau moyen de réinsertion de 50 %.', check: (s) => s.reputation >= 75 && avgReinsertion(s) >= 50, progress: (s) => `Réputation ${Math.round(s.reputation)}/75 · Réinsertion ${Math.round(avgReinsertion(s))}/50`, reward: 50000, rewardText: '50 000 € · Titre de directeur émérite', grade: true },
];

function checkCareer(s: GameState) {
  const m = MISSIONS[s.career.mission];
  if (!m || !m.check(s)) return;
  earn(s, 'subventions', m.reward);
  s.career.mission++;
  if (m.grade) s.career.grade++;
  s.reputation = clamp(s.reputation + 2);
  note(s, 'good', `Mission accomplie : ${m.title}. Récompense : ${m.rewardText}.`);
  if (s.career.mission >= MISSIONS.length && !s.outcome) {
    s.outcome = 'won'; s.outcomeSeen = false;
    s.outcomeText = 'Votre établissement est cité en exemple par le ministère. Vous avez accompli toutes les missions de la carrière — vous pouvez continuer à le développer librement.';
  }
}

// ───────────── Scénarios ─────────────
export interface Goal { label: string; check: (s: GameState) => boolean; value: (s: GameState) => string }
export interface Scenario { id: string; name: string; desc: string; preset: string; days: number; setup: (s: GameState) => void; goals: Goal[]; fail: (s: GameState) => string | null; inspectionDay?: number }

export const SCENARIOS: Scenario[] = [
  { id: 'redressement', name: 'Redresser une prison déficitaire', preset: 'sousfinancee', days: 30,
    desc: 'Rochebrune est endettée et perd de l\'argent chaque jour. Ramenez la trésorerie à 20 000 € avec des comptes à l\'équilibre.',
    setup: (s) => { s.finance.balance = -8000; s.finance.loans.push({ id: s.nextId++, amount: 20000, remaining: 20000, daily: 800 }); s.finance.deficitDays = 2; },
    goals: [
      { label: 'Trésorerie d\'au moins 20 000 €', check: (s) => s.finance.balance >= 20000, value: (s) => `${Math.round(s.finance.balance).toLocaleString('fr-FR')} €` },
      { label: '3 jours bénéficiaires consécutifs', check: (s) => s.finance.positiveDays >= 3, value: (s) => `${Math.min(3, s.finance.positiveDays)}/3` },
    ],
    fail: () => null },
  { id: 'surpeuplee', name: 'Gérer un établissement surpeuplé', preset: 'classique', days: 25,
    desc: 'Les Tilleuls accueillent 50 % de détenus de plus que leur capacité. Ramenez l\'occupation sous 100 % sans perdre le contrôle.',
    setup: (s) => { const extra = Math.ceil(totalCapacity(s) * 1.5) - s.inmates.length; for (let k = 0; k < extra; k++) { const i = addInmate(s, true); i.x = i.px = 6 + (k % 20); i.y = i.py = 2.5; i.served = rint(s, 0, 10); } s.sec.tension = 55; s.rules.overcrowdPush = 1; },
    goals: [
      { label: 'Occupation inférieure ou égale à 100 %', check: (s) => occupancy(s) <= 1, value: (s) => `${Math.round(occupancy(s) * 100)} %` },
      { label: 'Tension inférieure à 45 %', check: (s) => s.sec.tension < 45, value: (s) => `${Math.round(s.sec.tension)} %` },
    ],
    fail: (s) => (s.sec.collectiveCount >= 3 ? 'Trois incidents collectifs ont éclaté : vous avez perdu le contrôle de la détention.' : null) },
  { id: 'conditions', name: 'Améliorer les conditions de détention', preset: 'sousfinancee', days: 20,
    desc: 'Un rapport accablant vient de paraître. Vous disposez d\'un budget exceptionnel pour redonner des conditions dignes aux détenus.',
    setup: (s) => { s.finance.balance = 70000; s.reputation = 20; },
    goals: [
      { label: 'Satisfaction moyenne des besoins ≥ 65 %', check: (s) => avgNeedsAll(s) >= 65, value: (s) => `${Math.round(avgNeedsAll(s))} %` },
      { label: 'État psychologique moyen ≥ 60 %', check: (s) => avgMental(s) >= 60, value: (s) => `${Math.round(avgMental(s))} %` },
    ],
    fail: (s) => (s.reputation < 8 ? 'La réputation de l\'établissement s\'est effondrée : le ministère vous retire le dossier.' : null) },
  { id: 'reorganisation', name: 'Réorganiser un établissement mal administré', preset: 'classique', days: 15,
    desc: 'Votre prédécesseur a laissé un établissement désorganisé : salles incomplètes, horaires absurdes, personnel à bout.',
    setup: (s) => {
      s.doors = s.doors.filter((_, k) => k % 6 !== 3); s.furn = s.furn.filter((f, k) => f.type === 'generator' || k % 5 !== 2); s.mapVersion++;
      for (const st of s.staff) { st.satisfaction = rint(s, 25, 45); st.fatigue = rint(s, 40, 75); if (st.role === 'guard') st.shift = 'matin'; }
      s.staffVer++;
    },
    goals: [
      { label: 'Toutes les salles opérationnelles', check: allRoomsOk, value: (s) => `${s.rooms.filter((r) => getRuntime(s).status.get(r.id)?.ok).length}/${s.rooms.length}` },
      { label: 'Satisfaction du personnel ≥ 60 %', check: (s) => avgSatisfaction(s) >= 60, value: (s) => `${Math.round(avgSatisfaction(s))} %` },
      { label: 'Couverture de sécurité moyenne ≥ 80 %', check: (s) => (s.stats.length ? s.stats[s.stats.length - 1].coverage >= 80 : false), value: (s) => `${s.stats.length ? Math.round(s.stats[s.stats.length - 1].coverage) : '—'} %` },
    ],
    fail: () => null },
  { id: 'inspection', name: 'Réussir une inspection institutionnelle', preset: 'petite', days: 12, inspectionDay: 10,
    desc: 'L\'inspection générale se présentera le 10e jour. Obtenez au moins 75/100.',
    setup: (s) => { s.events.nextInspection = 10; s.furn = s.furn.filter((f, k) => k % 7 !== 3 || f.type === 'generator'); s.mapVersion++; for (const i of s.inmates) i.needs.hygiene = rint(s, 30, 55); },
    goals: [{ label: 'Note d\'inspection ≥ 75/100', check: (s) => s.events.lastInspection >= 75, value: (s) => (s.events.lastInspection >= 0 ? `${s.events.lastInspection}/100` : `estimation ${inspectionScore(s).total}/100`) }],
    fail: (s) => (s.events.lastInspection >= 0 && s.events.lastInspection < 75 ? `L'inspection s'est conclue sur une note de ${s.events.lastInspection}/100, en dessous des 75 exigés.` : null) },
  { id: 'specialise', name: 'Développer un établissement spécialisé', preset: 'classique', days: 40,
    desc: 'Le ministère veut faire des Tilleuls un centre pilote de réinsertion. Transformez l\'établissement en conséquence.',
    setup: (s) => { s.finance.balance += 40000; },
    goals: [
      { label: '60 % des détenus inscrits à un programme', check: (s) => programRate(s) >= 0.6, value: (s) => `${Math.round(programRate(s) * 100)} %` },
      { label: 'Niveau moyen de réinsertion ≥ 45 %', check: (s) => avgReinsertion(s) >= 45, value: (s) => `${Math.round(avgReinsertion(s))} %` },
      { label: '2 recherches de la branche Réinsertion', check: (s) => ['enseignement', 'formation', 'perso', 'qualif', 'partenariats'].filter((r) => s.research.done.includes(r)).length >= 2, value: (s) => `${['enseignement', 'formation', 'perso', 'qualif', 'partenariats'].filter((r) => s.research.done.includes(r)).length}/2` },
    ],
    fail: () => null },
];
export const scenarioDef = (id: string) => SCENARIOS.find((x) => x.id === id);

function checkScenario(s: GameState) {
  const sc = scenarioDef(s.scenario);
  if (!sc || s.outcome) return;
  const failure = sc.fail(s);
  if (sc.goals.every((g) => g.check(s))) {
    s.outcome = 'won'; s.outcomeSeen = false;
    s.outcomeText = `Scénario réussi en ${day(s) - 1} jours : « ${sc.name} ». Vous pouvez poursuivre la partie librement.`;
  } else if (failure || day(s) > sc.days) {
    s.outcome = 'lost'; s.outcomeSeen = false;
    s.outcomeText = failure ?? `Le délai de ${sc.days} jours est écoulé sans que les objectifs soient atteints.`;
  }
}

// ───────────── Clôture quotidienne ─────────────
export function dailyProgress(s: GameState) {
  const n = s.inmates.length;
  const over = Math.max(0, occupancy(s) - 1);
  const success = s.totals.released ? s.totals.reinserted / s.totals.released : 0.5;
  const repTarget = clamp(avgMental(s) * 0.45 + avgNeedsAll(s) * 0.3 + success * 20 - over * 40 - Math.min(20, s.sec.incidentLog.length * 0.6) + 4);
  s.reputation = clamp(s.reputation + (repTarget - s.reputation) * (n ? 0.06 : 0));
  const insp = s.events.lastInspection >= 0 ? (s.events.lastInspection - 60) * 0.3 : 0;
  const authTarget = clamp(52 + (s.finance.balance >= 0 ? 8 : -15) + insp - over * 25 - s.totals.deaths * 3 + (s.rules.intake ? 3 : -10) + (s.reputation - 50) * 0.2);
  s.authority = clamp(s.authority + (authTarget - s.authority) * 0.05);

  const last = s.finance.history[s.finance.history.length - 1];
  s.stats.push({
    day: day(s) - 1, inmates: n, capacity: totalCapacity(s), mental: avgMental(s), needs: avgNeedsAll(s), tension: s.sec.tension, coverage: s.sec.covCnt ? (s.sec.covAcc / s.sec.covCnt) * 100 : s.sec.coverage * 100,
    reputation: s.reputation, authority: s.authority, balance: last ? last.balance : s.finance.balance, incidents: s.sec.incidentsToday, reinsertion: avgReinsertion(s), staffSat: avgSatisfaction(s),
  });
  s.sec.covAcc = 0; s.sec.covCnt = 0;
  if (s.stats.length > 120) s.stats.shift();
  if (s.mode === 'career') checkCareer(s);
  if (s.mode === 'scenario') checkScenario(s);
}
