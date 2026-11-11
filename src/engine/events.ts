// Événements dynamiques : chaque événement n'apparaît que si l'état réel de
// l'établissement le justifie (fonction `weight`), et propose plusieurs décisions.
import { canAfford, earn, spend } from './economy';
import { sanitaryCoverage } from './inmates';
import { chance, clamp, note, pick, rnd } from './rng';
import { anyActive, getRuntime, totalCapacity } from './rooms';
import { avgSatisfaction } from './staff';
import type { GameState } from './types';

const avgNeed = (s: GameState, k: 'food' | 'hygiene' | 'health' | 'safety' | 'leisure') => (s.inmates.length ? s.inmates.reduce((a, i) => a + i.needs[k], 0) / s.inmates.length : 100);
const avgMental = (s: GameState) => (s.inmates.length ? s.inmates.reduce((a, i) => a + i.mental, 0) / s.inmates.length : 70);

/** Note d'inspection sur 100, entièrement calculée depuis l'état du jeu. */
export function inspectionScore(s: GameState): { total: number; lines: [string, number, number][] } {
  const n = s.inmates.length, cap = totalCapacity(s);
  const rt = getRuntime(s);
  const lines: [string, number, number][] = [
    ['Occupation des places', 20, n <= cap ? 20 : Math.max(0, 20 - ((n - cap) / Math.max(1, cap)) * 60)],
    ['Hygiène', 15, (avgNeed(s, 'hygiene') / 100) * 15],
    ['Alimentation', 10, (avgNeed(s, 'food') / 100) * 10],
    ['Santé', 10, (avgNeed(s, 'health') / 100) * 10],
    ['Sécurité', 15, s.sec.coverage * 10 + (s.sec.tension < 40 ? 5 : s.sec.tension < 60 ? 2 : 0)],
    ['Tenue des archives', 10, (rt.byType.get('archives') ?? []).some((r) => rt.status.get(r.id)?.ok) ? 10 : 2],
    ['Incidents des 7 derniers jours', 10, Math.max(0, 10 - s.sec.incidentLog.length * 0.8)],
    ['Gestion financière', 10, s.finance.balance >= 0 ? (s.finance.deficitDays ? 6 : 10) : 0],
  ];
  return { total: Math.round(lines.reduce((a, l) => a + l[2], 0)), lines };
}

function applyInspection(s: GameState, bonus: number): string {
  const sc = Math.min(100, inspectionScore(s).total + bonus);
  s.events.lastInspection = sc;
  if (sc >= 75) { earn(s, 'subventions', 4000); s.authority = clamp(s.authority + 8); s.reputation = clamp(s.reputation + 4); return `Note obtenue : ${sc}/100. Rapport élogieux, prime de 4 000 € et confiance renforcée des autorités.`; }
  if (sc >= 50) { s.authority = clamp(s.authority + 1); return `Note obtenue : ${sc}/100. Rapport correct assorti de recommandations.`; }
  s.authority = clamp(s.authority - 10); s.reputation = clamp(s.reputation - 5); spend(s, 'divers', 2000);
  return `Note obtenue : ${sc}/100. Rapport sévère : amende de 2 000 € et mise en demeure.`;
}

export interface Choice { label: string; desc: string; can?: (s: GameState) => string | null; run: (s: GameState) => string }
export interface EventDef { id: string; title: string; cooldown: number; weight: (s: GameState) => number; text: (s: GameState) => string; choices: Choice[] }

const need = (amount: number) => (s: GameState) => (canAfford(s, amount) ? null : 'Fonds insuffisants');

export const EVENTS: EventDef[] = [
  { id: 'inspection', title: 'Inspection administrative', cooldown: 12, weight: () => 0,
    text: (s) => `Une mission d'inspection se présente à l'établissement. Estimation actuelle de vos services : ${inspectionScore(s).total}/100.`,
    choices: [
      { label: 'Préparer activement la visite', desc: 'Grand nettoyage et mise à jour des dossiers (1 200 €, fatigue du personnel) : +8 points.', can: need(1200), run: (s) => { spend(s, 'divers', 1200); s.staff.forEach((st) => { st.fatigue = clamp(st.fatigue + 8); }); return applyInspection(s, 8); } },
      { label: 'Jouer la transparence', desc: 'Les inspecteurs voient l\'établissement tel qu\'il est. Petit bonus de confiance.', run: (s) => { s.authority = clamp(s.authority + 1); return applyInspection(s, 0); } },
      { label: 'Limiter l\'accès à certaines zones', desc: '+4 points apparents, mais 40 % de risque que la manœuvre soit relevée.', run: (s) => { if (chance(s, 0.4)) { s.authority = clamp(s.authority - 6); return 'La manœuvre est relevée dans le rapport. ' + applyInspection(s, -6); } return applyInspection(s, 4); } },
    ] },
  { id: 'reglementation', title: 'Nouvelle réglementation', cooldown: 20, weight: (s) => (s.inmates.length > 5 ? 1 : 0),
    text: () => 'Une circulaire impose de nouvelles normes d\'équipement et de traçabilité dans tous les établissements pénitentiaires.',
    choices: [
      { label: 'Se mettre en conformité immédiatement', desc: 'Coût : 2 500 €. Les autorités apprécient.', can: need(2500), run: (s) => { spend(s, 'equipements', 2500); s.authority = clamp(s.authority + 5); return 'Mise en conformité réalisée. Votre réactivité est remarquée.'; } },
      { label: 'Demander un délai', desc: 'Aucun coût immédiat, relation avec les autorités dégradée.', run: (s) => { s.authority = clamp(s.authority - 4); return 'Délai accordé du bout des lèvres.'; } },
      { label: 'Mise en conformité progressive', desc: 'Surcoût d\'entretien de 150 €/jour pendant 10 jours.', run: (s) => { s.finance.grants.push({ name: 'Mise en conformité', perDay: -150, until: s.time + 10 * 1440 }); return 'Un plan de mise en conformité étalé est validé.'; } },
    ] },
  { id: 'budget', title: 'Réduction budgétaire', cooldown: 25, weight: (s) => (s.authority < 45 ? 2 : s.finance.balance > 60000 ? 1.5 : 0.4),
    text: (s) => `Le ministère annonce une baisse de 15 % de votre financement public pendant 10 jours${s.finance.balance > 60000 ? ', au vu de votre trésorerie confortable' : ''}.`,
    choices: [
      { label: 'Accepter', desc: 'Financement public −15 % pendant 10 jours.', run: (s) => { s.finance.fundingCut = { factor: 0.85, until: s.time + 10 * 1440 }; s.authority = clamp(s.authority + 2); return 'La réduction s\'applique dès aujourd\'hui.'; } },
      { label: 'Négocier', desc: 'Chances de succès liées à votre réputation et à vos relations avec les autorités.', run: (s) => { if (rnd(s) * 100 < (s.reputation + s.authority) / 2) { s.finance.fundingCut = { factor: 0.95, until: s.time + 10 * 1440 }; return 'Votre argumentaire convainc : la baisse est ramenée à 5 %.'; } s.finance.fundingCut = { factor: 0.85, until: s.time + 10 * 1440 }; return 'La négociation échoue : la baisse de 15 % est maintenue.'; } },
      { label: 'Alerter la presse', desc: 'Peut faire reculer le ministère, mais tend durablement la relation.', run: (s) => { s.authority = clamp(s.authority - 8); s.reputation = clamp(s.reputation + 2); if (chance(s, 0.5)) return 'Sous la pression médiatique, la mesure est abandonnée. La tutelle ne l\'oubliera pas.'; s.finance.fundingCut = { factor: 0.85, until: s.time + 10 * 1440 }; return 'La polémique retombe vite : la baisse est maintenue.'; } },
    ] },
  { id: 'conditions', title: 'Demande d\'amélioration des conditions de vie', cooldown: 12, weight: (s) => (s.inmates.length >= 6 && avgMental(s) < 50 ? 3 : 0),
    text: (s) => `Une pétition circule en détention : le moral moyen n'est que de ${Math.round(avgMental(s))} %. Les détenus demandent de meilleures conditions de vie.`,
    choices: [
      { label: 'Lancer un plan d\'amélioration', desc: 'Coût : 2 000 €. Moral et climat nettement améliorés.', can: need(2000), run: (s) => { spend(s, 'divers', 2000); s.inmates.forEach((i) => { i.mental = clamp(i.mental + 10); i.needs.leisure = clamp(i.needs.leisure + 20); }); s.sec.climate = clamp(s.sec.climate + 6); return 'Le plan est accueilli favorablement.'; } },
      { label: 'Accorder des gestes symboliques', desc: 'Coût : 500 €. Effet modeste.', can: need(500), run: (s) => { spend(s, 'divers', 500); s.inmates.forEach((i) => { i.mental = clamp(i.mental + 4); }); s.sec.climate = clamp(s.sec.climate + 2); return 'Quelques améliorations sont concédées.'; } },
      { label: 'Refuser', desc: 'Aucun coût. La tension augmente.', run: (s) => { s.sec.tension = clamp(s.sec.tension + 10); s.sec.climate = clamp(s.sec.climate - 5); return 'Le refus est mal vécu en détention.'; } },
    ] },
  { id: 'penurie', title: 'Recrutement difficile', cooldown: 15, weight: (s) => (avgSatisfaction(s) < 55 || s.reputation < 40 ? 1.5 : 0.3),
    text: () => 'Le métier attire peu et votre établissement n\'a pas bonne presse auprès des candidats : les candidatures se raréfient pour 5 jours.',
    choices: [
      { label: 'Financer une campagne de recrutement', desc: 'Coût : 1 500 €. Le vivier de candidats reste normal.', can: need(1500), run: (s) => { spend(s, 'divers', 1500); return 'La campagne maintient le flux de candidatures.'; } },
      { label: 'Faire avec', desc: '2 candidats par jour seulement pendant 5 jours.', run: (s) => { s.events.cooldown.penurie = s.time + 5 * 1440; s.candidates = s.candidates.slice(0, 2); return 'Le vivier de candidats se réduit.'; } },
    ] },
  { id: 'absence', title: 'Absence de personnel', cooldown: 6, weight: (s) => (s.staff.length >= 3 ? (s.staff.some((st) => st.fatigue > 70) ? 3 : 0.5) : 0),
    text: (s) => { const st = [...s.staff].sort((a, b) => b.fatigue - a.fatigue)[0]; return `${st.first} ${st.last} est en arrêt pour épuisement (fatigue : ${Math.round(st.fatigue)} %). Son poste est vacant pour 2 jours.`; },
    choices: [
      { label: 'Recourir à un intérimaire', desc: 'Coût : 600 €. Le service est assuré.', can: need(600), run: (s) => { spend(s, 'salaires', 600); const st = [...s.staff].sort((a, b) => b.fatigue - a.fatigue)[0]; st.fatigue = clamp(st.fatigue - 40); return 'Un intérimaire assure le remplacement pendant que l\'agent se repose.'; } },
      { label: 'Répartir la charge sur l\'équipe', desc: 'Gratuit : fatigue de tous +8, agent absent 2 jours.', run: (s) => { const st = [...s.staff].sort((a, b) => b.fatigue - a.fatigue)[0]; st.leaveUntil = s.time + 2880; s.staff.forEach((o) => { if (o !== st) o.fatigue = clamp(o.fatigue + 8); }); s.staffVer++; return 'Les collègues compensent, non sans grogne.'; } },
      { label: 'Laisser le poste vacant', desc: 'Agent absent 2 jours, aucune compensation.', run: (s) => { const st = [...s.staff].sort((a, b) => b.fatigue - a.fatigue)[0]; st.leaveUntil = s.time + 2880; s.staffVer++; return 'Le poste reste vacant pendant deux jours.'; } },
    ] },
  { id: 'sanitaire', title: 'Problème sanitaire', cooldown: 10, weight: (s) => (s.inmates.length >= 6 && (avgNeed(s, 'hygiene') < 45 || sanitaryCoverage(s) < 0.7) ? 3 : 0),
    text: (s) => `Plusieurs cas de gale sont signalés. Hygiène moyenne : ${Math.round(avgNeed(s, 'hygiene'))} %, couverture sanitaire : ${Math.round(sanitaryCoverage(s) * 100)} %.`,
    choices: [
      { label: 'Campagne de traitement complète', desc: 'Coût : 1 800 €. Épidémie enrayée.', can: need(1800), run: (s) => { spend(s, 'sante', 1800); s.inmates.forEach((i) => { i.needs.hygiene = clamp(i.needs.hygiene + 25); }); return 'Le traitement collectif enraye l\'épidémie.'; } },
      { label: 'Traiter uniquement les cas déclarés', desc: 'Coût : 500 €. Quelques malades supplémentaires.', can: need(500), run: (s) => { spend(s, 'sante', 500); for (let k = 0; k < Math.ceil(s.inmates.length * 0.08); k++) pick(s, s.inmates).sick = true; return 'Les cas déclarés sont traités, mais la contagion se poursuit un peu.'; } },
      { label: 'Ne rien faire', desc: 'L\'épidémie s\'étend, la réputation en souffre.', run: (s) => { for (let k = 0; k < Math.ceil(s.inmates.length * 0.25); k++) { const i = pick(s, s.inmates); i.sick = true; i.needs.health = clamp(i.needs.health - 10); } s.reputation = clamp(s.reputation - 3); return 'L\'épidémie se propage dans la détention.'; } },
    ] },
  { id: 'media', title: 'Événement médiatique', cooldown: 14, weight: (s) => (s.inmates.length >= 6 ? 1 : 0),
    text: () => 'Une équipe de télévision prépare un reportage sur les conditions de détention et demande à tourner dans vos murs.',
    choices: [
      { label: 'Ouvrir les portes', desc: 'Le reportage montrera la réalité : bénéfique si le moral et la sécurité sont bons, désastreux sinon.', run: (s) => { const q = avgMental(s) * 0.6 + s.sec.coverage * 40; const d = Math.round((q - 55) / 4); s.reputation = clamp(s.reputation + d); return d >= 0 ? `Le reportage est favorable (réputation +${d}).` : `Le reportage est accablant (réputation ${d}).`; } },
      { label: 'Refuser le tournage', desc: 'Légère perte de réputation : « qu\'ont-ils à cacher ? »', run: (s) => { s.reputation = clamp(s.reputation - 2); return 'Le refus alimente quelques soupçons.'; } },
      { label: 'Encadrer par une agence de communication', desc: 'Coût : 1 500 €. Réputation +3 garantie.', can: need(1500), run: (s) => { spend(s, 'divers', 1500); s.reputation = clamp(s.reputation + 3); return 'Un reportage maîtrisé met en avant vos réussites.'; } },
    ] },
  { id: 'subvention', title: 'Appel à projets « Réinsertion »', cooldown: 18, weight: (s) => (s.inmates.length && s.inmates.filter((i) => i.program !== 'none').length / s.inmates.length >= 0.3 ? 2 : 0),
    text: (s) => `La région remarque que ${Math.round((s.inmates.filter((i) => i.program !== 'none').length / s.inmates.length) * 100)} % de vos détenus suivent un programme et vous invite à candidater à une subvention.`,
    choices: [
      { label: 'Monter un dossier complet', desc: 'Coût : 600 €. Subvention de 450 €/jour pendant 10 jours.', can: need(600), run: (s) => { spend(s, 'divers', 600); s.finance.grants.push({ name: 'Subvention régionale', perDay: 450, until: s.time + 10 * 1440 }); return 'Dossier retenu : 450 €/jour pendant 10 jours.'; } },
      { label: 'Dossier simplifié', desc: 'Gratuit. Subvention de 200 €/jour pendant 10 jours.', run: (s) => { s.finance.grants.push({ name: 'Subvention régionale', perDay: 200, until: s.time + 10 * 1440 }); return 'Dossier accepté : 200 €/jour pendant 10 jours.'; } },
      { label: 'Décliner', desc: 'Aucun effet.', run: () => 'Vous ne donnez pas suite.' },
    ] },
  { id: 'greve', title: 'Préavis de grève', cooldown: 15, weight: (s) => (s.staff.length >= 4 && avgSatisfaction(s) < 38 ? 4 : 0),
    text: (s) => `La satisfaction moyenne du personnel est tombée à ${Math.round(avgSatisfaction(s))} %. Les syndicats déposent un préavis de grève.`,
    choices: [
      { label: 'Accorder une prime exceptionnelle', desc: 'Coût : 3 jours de masse salariale. Satisfaction +15.', can: (s) => need(s.staff.reduce((a, st) => a + st.salary, 0) * 3)(s), run: (s) => { spend(s, 'salaires', s.staff.reduce((a, st) => a + st.salary, 0) * 3); s.staff.forEach((st) => { st.satisfaction = clamp(st.satisfaction + 15); }); return 'La prime désamorce le conflit.'; } },
      { label: 'Promettre des améliorations', desc: 'Satisfaction +6 ; sans salle du personnel active, l\'effet sera de courte durée.', run: (s) => { s.staff.forEach((st) => { st.satisfaction = clamp(st.satisfaction + 6); }); return anyActive(s, 'staffroom') ? 'Les agents acceptent d\'attendre.' : 'Les agents restent sceptiques : aucune salle de repos n\'existe.'; } },
      { label: 'Rester ferme', desc: 'Un tiers du personnel absent pendant 24 h.', run: (s) => { s.staff.forEach((st, k) => { if (k % 3 === 0) st.leaveUntil = s.time + 1440; }); s.staffVer++; s.reputation = clamp(s.reputation - 2); return 'La grève a lieu : un tiers des effectifs est absent pour 24 heures.'; } },
    ] },
];
export const eventDef = (id: string) => EVENTS.find((e) => e.id === id)!;

export function triggerEvent(s: GameState, id: string) {
  const def = eventDef(id);
  s.events.active.push({ id: s.nextId++, def: id, t: s.time, deadline: s.time + 24 * 60 });
  s.events.cooldown[id] = s.time + def.cooldown * 1440;
  note(s, 'warn', `Événement : ${def.title}. Une décision est attendue.`);
}

export function chooseEvent(s: GameState, activeId: number, choiceIdx: number): string | null {
  const a = s.events.active.find((x) => x.id === activeId);
  if (!a) return 'Événement déjà traité.';
  const def = eventDef(a.def);
  const c = def.choices[choiceIdx];
  if (!c) return 'Choix inconnu.';
  const blocked = c.can?.(s);
  if (blocked) return blocked;
  const result = c.run(s);
  s.events.active = s.events.active.filter((x) => x !== a);
  s.events.history.push({ t: s.time, title: def.title, choice: c.label, result });
  if (s.events.history.length > 60) s.events.history.shift();
  note(s, 'info', `${def.title} — ${result}`);
  return null;
}

export function hourlyEvents(s: GameState) {
  const hour = Math.floor((s.time % 1440) / 60);
  const day = Math.floor(s.time / 1440) + 1;
  // Échéance : sans réponse, le dernier choix possible (le plus passif) s'applique.
  for (const a of [...s.events.active]) {
    if (s.time < a.deadline) continue;
    const def = eventDef(a.def);
    let idx = def.choices.length - 1;
    while (idx > 0 && def.choices[idx].can?.(s)) idx--;
    chooseEvent(s, a.id, idx);
  }
  if (hour === 10 && day >= s.events.nextInspection && !s.events.active.some((a) => a.def === 'inspection')) {
    s.events.nextInspection = day + 14;
    triggerEvent(s, 'inspection');
    return;
  }
  if (!s.rules.events || hour < 8 || hour > 18 || s.events.active.length >= 2) return;
  if (!chance(s, 0.045 * s.rules.eventFreq)) return;
  const pool: [EventDef, number][] = [];
  let total = 0;
  for (const e of EVENTS) {
    if ((s.events.cooldown[e.id] ?? 0) > s.time || s.events.active.some((a) => a.def === e.id)) continue;
    const w = e.weight(s);
    if (w > 0) { pool.push([e, w]); total += w; }
  }
  if (!pool.length) return;
  let r = rnd(s) * total;
  for (const [e, w] of pool) { r -= w; if (r <= 0) { triggerEvent(s, e.id); return; } }
}
