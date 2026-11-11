// Sécurité : couverture, tension, objets interdits, incidents et réponses du joueur.
import { FURN, ROOMS } from './data';
import { repairCost } from './construction';
import { canAfford, spend } from './economy';
import { ilog, removeInmate, socialPass, staffEff, unhoused } from './inmates';
import { chance, clamp, note, pick, rint } from './rng';
import { activeRooms, anyActive, getRuntime, hasResearch, onDuty, totalCapacity } from './rooms';
import type { GameState, Incident, IncidentType, Inmate } from './types';

export const fullName = (i: { first: string; last: string }) => `${i.first} ${i.last}`;

export function computeCoverage(s: GameState): number {
  const n = s.inmates.length;
  if (!n) return 1;
  let guards = 0, leads = 0;
  for (const st of s.staff) {
    if (!onDuty(s, st)) continue;
    if (st.role === 'guard') guards += staffEff(st);
    else if (st.role === 'lead') { leads++; guards += staffEff(st) * 0.6; }
  }
  let cap = guards * 10 * (1 + Math.min(0.32, leads * 0.08)) * (hasResearch(s, 'rondes') ? 1.2 : 1);
  cap += activeRooms(s, 'guardpost').length * 6;
  if (anyActive(s, 'control')) cap += s.furn.filter((f) => f.type === 'camera' && !f.broken).length * (hasResearch(s, 'centre') ? 10 : 5);
  const slot = s.regime[Math.floor((s.time % 1440) / 60)];
  const need = n * (slot === 'sleep' || slot === 'lockup' || s.sec.lockdownUntil > s.time ? 0.5 : 1);
  return Math.min(1, cap / need);
}

export interface Option { id: string; label: string; desc: string; can?: (s: GameState, inc: Incident) => string | null }
const hasRole = (s: GameState, role: string) => s.staff.some((st) => st.role === role && st.leaveUntil <= s.time);

export const INCIDENT_LABEL: Record<IncidentType, string> = { fight: 'Conflit entre détenus', vandalism: 'Dégradation', refusal: 'Refus d\'activité', medical: 'Urgence médicale', breakdown: 'Panne', collective: 'Incident collectif', tension: 'Tensions sociales' };

export const OPTIONS: Record<IncidentType, Option[]> = {
  fight: [
    { id: 'separate', label: 'Séparer les détenus', desc: 'Intervention standard des surveillants. Efficace si la couverture est suffisante.' },
    { id: 'isolate', label: 'Placer à l\'isolement (24 h)', desc: 'Sanction ferme : calme la détention mais pèse sur le moral et le climat.' },
    { id: 'mediate', label: 'Organiser une médiation', desc: 'Apaise durablement la relation. Coût : 80 €.', can: (s) => (hasRole(s, 'psych') || hasRole(s, 'reinsertion') ? null : 'Psychologue ou responsable de réinsertion requis') },
    { id: 'ignore', label: 'Ne pas intervenir', desc: 'Aucun coût, mais blessures plus graves et sentiment d\'insécurité.' },
  ],
  vandalism: [
    { id: 'repair', label: 'Réparer immédiatement', desc: 'Remise en état payante (40 % du prix de l\'équipement).' },
    { id: 'tech', label: 'Confier aux techniciens', desc: 'Gratuit, mais augmente la fatigue de l\'équipe technique.', can: (s) => (hasRole(s, 'tech') ? null : 'Aucun technicien disponible') },
    { id: 'sanction', label: 'Réparer et sanctionner', desc: 'Réparation payante + isolement de l\'auteur : dissuasif, mais dégrade le climat.' },
    { id: 'ignore', label: 'Laisser en l\'état', desc: 'L\'équipement reste hors service.' },
  ],
  refusal: [
    { id: 'dialogue', label: 'Dialoguer', desc: 'Un personnel prend le temps d\'écouter : améliore souvent le moral et le climat.' },
    { id: 'sanction', label: 'Sanctionner', desc: 'Retrait de privilèges : rétablit la discipline, dégrade le moral.' },
    { id: 'ignore', label: 'Tolérer', desc: 'Aucun effet immédiat, mais les refus deviendront plus fréquents.' },
  ],
  medical: [
    { id: 'infirmary', label: 'Soins à l\'infirmerie', desc: 'Prise en charge interne. Coût : 150 €.', can: (s) => (anyActive(s, 'infirmary') ? null : 'Infirmerie active requise') },
    { id: 'hospital', label: 'Extraction vers l\'hôpital', desc: 'Sûr mais coûteux (900 €) et fatigant pour l\'escorte.' },
    { id: 'ignore', label: 'Attendre', desc: 'Risque vital réel : conséquences lourdes en cas de décès.' },
  ],
  breakdown: [
    { id: 'external', label: 'Faire appel à un prestataire', desc: 'Réparation immédiate. Coût : 450 €.' },
    { id: 'tech', label: 'Réparation en interne', desc: 'Gratuit, fatigue les techniciens.', can: (s) => (hasRole(s, 'tech') ? null : 'Aucun technicien disponible') },
    { id: 'ignore', label: 'Reporter', desc: 'La salle reste hors service jusqu\'à réparation.' },
  ],
  collective: [
    { id: 'negotiate', label: 'Négocier', desc: 'Engagements concrets (1 500 €) : apaise fortement, mais les autorités y voient une faiblesse.' },
    { id: 'force', label: 'Intervention en force', desc: 'Rétablit l\'ordre, au prix de blessés, du climat et de la réputation.', can: (s) => (s.sec.coverage >= 0.5 ? null : 'Couverture de sécurité insuffisante (50 % requis)') },
    { id: 'lockdown', label: 'Confinement général (12 h)', desc: 'Tout le monde en cellule : calme la situation, dégrade le moral.' },
  ],
  tension: [
    { id: 'dialogue', label: 'Réunir des représentants', desc: 'Écoute des revendications (200 €) : améliore le climat.' },
    { id: 'reinforce', label: 'Renforcer les rondes', desc: 'Dissuasif, mais fatigue les surveillants et crispe le climat.' },
    { id: 'ignore', label: 'Surveiller sans agir', desc: 'Aucun coût. La tension suit son cours.' },
  ],
};

function createIncident(s: GameState, type: IncidentType, title: string, text: string, inmates: number[] = [], room = 0, furn = 0, hours = 3): Incident {
  const inc: Incident = { id: s.nextId++, type, t: s.time, deadline: s.time + hours * 60, title, text, inmates, room, furn, status: 'open' };
  s.incidents.push(inc);
  if (s.incidents.length > 60) s.incidents.splice(0, s.incidents.length - 60);
  s.sec.incidentsToday++;
  s.sec.incidentLog.push(s.time);
  note(s, type === 'collective' || type === 'medical' ? 'bad' : 'warn', `${INCIDENT_LABEL[type]} : ${title}`);
  return inc;
}

const byId = (s: GameState, id: number) => s.inmates.find((i) => i.id === id);
const hurt = (i: Inmate, v: number) => { i.needs.health = clamp(i.needs.health - v); };
const allMental = (s: GameState, v: number) => { for (const i of s.inmates) i.mental = clamp(i.mental + v); };
const isolate = (s: GameState, i: Inmate, hours: number) => { i.isoUntil = s.time + hours * 60; i.until = 0; i.mental = clamp(i.mental - 5); ilog(s, i, `Placé à l'isolement pour ${hours} h.`); };

export function resolveIncident(s: GameState, id: number, optionId: string): string | null {
  const inc = s.incidents.find((x) => x.id === id);
  if (!inc || inc.status !== 'open') return 'Incident déjà traité.';
  const opt = OPTIONS[inc.type].find((o) => o.id === optionId);
  if (!opt) return 'Option inconnue.';
  const blocked = opt.can?.(s, inc);
  if (blocked) return blocked;
  const sec = s.sec;
  const people = inc.inmates.map((x) => byId(s, x)).filter((x): x is Inmate => !!x);
  let result = '';
  switch (inc.type) {
    case 'fight':
      if (optionId === 'separate') {
        if (sec.coverage >= 0.5) { result = 'Les surveillants séparent rapidement les protagonistes. Blessures légères.'; sec.climate = clamp(sec.climate - 1); }
        else { people.forEach((p) => hurt(p, 10)); sec.safetyBase = clamp(sec.safetyBase - 3); result = 'Faute d\'effectifs, l\'intervention tarde : les blessures sont plus sérieuses.'; }
      } else if (optionId === 'isolate') {
        people.forEach((p) => isolate(s, p, 24)); sec.climate = clamp(sec.climate - 2); sec.tension = clamp(sec.tension - 3);
        result = 'Les deux détenus sont placés à l\'isolement pour 24 heures.';
      } else if (optionId === 'mediate') {
        spend(s, 'divers', 80);
        if (people.length === 2) { const [a, b] = people; const v = clamp((a.rel[b.id] ?? -50) + 35, -100, 100); a.rel[b.id] = v; b.rel[a.id] = v; ilog(s, a, `Médiation avec ${fullName(b)}.`); ilog(s, b, `Médiation avec ${fullName(a)}.`); }
        sec.climate = clamp(sec.climate + 2);
        result = 'La médiation permet aux deux détenus de s\'expliquer. La relation s\'apaise.';
      } else { people.forEach((p) => hurt(p, rint(s, 12, 25))); sec.safetyBase = clamp(sec.safetyBase - 6); s.reputation = clamp(s.reputation - 1); result = 'Sans intervention, la bagarre dégénère. Plusieurs détenus se sentent en danger.'; }
      break;
    case 'vandalism': {
      const f = s.furn.find((x) => x.id === inc.furn);
      const author = people[0];
      if (optionId === 'repair' || optionId === 'sanction') {
        if (f && f.broken) { const c = repairCost(f); if (!canAfford(s, c)) return 'Fonds insuffisants.'; spend(s, 'entretien', c); f.broken = false; s.mapVersion++; }
        if (optionId === 'sanction' && author) { isolate(s, author, 12); author.risk = clamp(author.risk - 5); sec.climate = clamp(sec.climate - 2); sec.laxity = clamp(sec.laxity - 3); result = 'Équipement réparé, auteur sanctionné de 12 heures d\'isolement.'; }
        else result = 'L\'équipement est remis en état.';
      } else if (optionId === 'tech') {
        if (f) { f.broken = false; s.mapVersion++; }
        s.staff.filter((st) => st.role === 'tech').forEach((st) => { st.fatigue = clamp(st.fatigue + 12); });
        result = 'Les techniciens réparent l\'équipement sur leur temps de service.';
      } else { sec.laxity = clamp(sec.laxity + 3); result = 'L\'équipement reste hors service.'; }
      break;
    }
    case 'refusal': {
      const p = people[0];
      if (optionId === 'dialogue') {
        if (p && chance(s, 0.65)) { p.mental = clamp(p.mental + 8); p.until = 0; sec.climate = clamp(sec.climate + 1.5); result = 'L\'échange porte ses fruits : le détenu accepte de reprendre ses activités.'; }
        else { sec.climate = clamp(sec.climate + 0.5); result = 'Le détenu reste sur sa position, mais apprécie d\'avoir été écouté.'; }
      } else if (optionId === 'sanction') { if (p) { p.mental = clamp(p.mental - 8); p.needs.leisure = clamp(p.needs.leisure - 20); ilog(s, p, 'Sanctionné pour refus d\'activité.'); } sec.climate = clamp(sec.climate - 2); sec.laxity = clamp(sec.laxity - 4); result = 'Privilèges retirés. Le message est passé, non sans ressentiment.'; }
      else { sec.laxity = clamp(sec.laxity + 5); result = 'Le refus est toléré. D\'autres pourraient s\'en inspirer.'; }
      break;
    }
    case 'medical': {
      const p = people[0];
      if (!p) { result = 'Le détenu n\'est plus dans l\'établissement.'; break; }
      if (optionId === 'infirmary') { spend(s, 'sante', 150); p.needs.health = clamp(p.needs.health + 35); p.sick = false; p.emerg = false; ilog(s, p, 'Pris en charge en urgence à l\'infirmerie.'); result = 'Le détenu est stabilisé à l\'infirmerie.'; }
      else if (optionId === 'hospital') { spend(s, 'sante', 900); p.needs.health = 75; p.sick = false; p.emerg = false; s.staff.filter((st) => st.role === 'guard').slice(0, 2).forEach((st) => { st.fatigue = clamp(st.fatigue + 15); }); ilog(s, p, 'Hospitalisé puis réintégré.'); result = 'Le détenu est soigné à l\'hôpital et réintègre l\'établissement.'; }
      else if (chance(s, hasResearch(s, 'urgences') ? 0.05 : 0.35)) {
        s.totals.deaths++; s.reputation = clamp(s.reputation - 8); s.authority = clamp(s.authority - 6); allMental(s, -4); sec.climate = clamp(sec.climate - 5);
        removeInmate(s, p);
        result = `${fullName(p)} décède faute de soins. Une enquête administrative est ouverte.`;
        note(s, 'bad', result);
      } else { p.needs.health = clamp(p.needs.health + 12); p.emerg = false; result = 'L\'état du détenu se stabilise de lui-même, de justesse.'; }
      break;
    }
    case 'breakdown': {
      const r = s.rooms.find((x) => x.id === inc.room);
      if (optionId === 'external') { if (!canAfford(s, 450)) return 'Fonds insuffisants.'; spend(s, 'entretien', 450); if (r) r.broken = false; result = 'Le prestataire remet l\'installation en service.'; }
      else if (optionId === 'tech') { if (r) r.broken = false; s.staff.filter((st) => st.role === 'tech').forEach((st) => { st.fatigue = clamp(st.fatigue + 18); }); result = 'Vos techniciens réparent la panne.'; }
      else result = 'La réparation est reportée : la salle reste hors service.';
      s.mapVersion++;
      break;
    }
    case 'collective':
      if (optionId === 'negotiate') { spend(s, 'divers', 1500); allMental(s, 8); sec.tension = clamp(sec.tension - 25); sec.climate = clamp(sec.climate + 6); s.authority = clamp(s.authority - 3); result = 'Un accord est trouvé. Le calme revient, mais la tutelle juge la méthode coûteuse.'; }
      else if (optionId === 'force') { allMental(s, -7); sec.tension = clamp(sec.tension - 30); sec.climate = clamp(sec.climate - 10); s.reputation = clamp(s.reputation - 4); for (let k = 0; k < Math.min(4, s.inmates.length); k++) hurt(pick(s, s.inmates), rint(s, 10, 25)); result = 'L\'ordre est rétabli par la force. Plusieurs blessés ; la presse s\'en fait l\'écho.'; }
      else { sec.lockdownUntil = s.time + 720; allMental(s, -4); sec.tension = clamp(sec.tension - 15); result = 'Confinement général de 12 heures décrété.'; }
      break;
    case 'tension':
      if (optionId === 'dialogue') { spend(s, 'divers', 200); sec.climate = clamp(sec.climate + 4); sec.tension = clamp(sec.tension - 8); allMental(s, 2); result = 'Les représentants des détenus sont entendus. Le climat s\'améliore.'; }
      else if (optionId === 'reinforce') { s.staff.filter((st) => st.role === 'guard').forEach((st) => { st.fatigue = clamp(st.fatigue + 8); }); sec.tension = clamp(sec.tension - 10); sec.climate = clamp(sec.climate - 2); result = 'Les rondes sont renforcées. La tension retombe sous la contrainte.'; }
      else result = 'Vous laissez la situation évoluer.';
      break;
  }
  inc.status = 'resolved'; inc.choice = opt.label; inc.result = result;
  return null;
}

export function startLockdown(s: GameState, hours = 6) {
  s.sec.lockdownUntil = s.time + hours * 60;
  for (const i of s.inmates) { i.until = 0; i.mental = clamp(i.mental - 2); }
  note(s, 'warn', `Confinement général déclenché pour ${hours} h.`);
}
export function endLockdown(s: GameState) { s.sec.lockdownUntil = 0; for (const i of s.inmates) i.until = 0; note(s, 'info', 'Fin du confinement général.'); }

/** Fouille générale : retire des objets interdits au prix de la fatigue et du climat. */
export function shakedown(s: GameState): string | null {
  if (s.time - s.sec.lastShakedown < 1440) return 'Une fouille générale a déjà eu lieu il y a moins de 24 h.';
  const guards = s.staff.filter((st) => st.role === 'guard' && onDuty(s, st));
  if (guards.length < 2) return 'Au moins 2 surveillants en service sont nécessaires.';
  guards.forEach((st) => { st.fatigue = clamp(st.fatigue + 10); });
  const found = Math.round(s.sec.contraband * 0.6);
  s.sec.contraband = clamp(s.sec.contraband - found);
  s.sec.climate = clamp(s.sec.climate - 4);
  s.sec.lastShakedown = s.time;
  spend(s, 'securite', 150);
  note(s, 'info', `Fouille générale : niveau d'objets interdits réduit de ${found} points.`);
  return null;
}

/** Passe de sécurité (toutes les 10 minutes de jeu). */
export function securityPass(s: GameState) {
  const sec = s.sec;
  const n = s.inmates.length;
  sec.coverage = computeCoverage(s);
  const cap = totalCapacity(s);
  const over = n > 0 ? Math.max(0, (n - cap) / Math.max(1, n)) + unhoused(s) / n : 0;
  const avgMental = n ? s.inmates.reduce((a, i) => a + i.mental, 0) / n : 70;
  const target = clamp((100 - avgMental) * 0.75 + over * 60 + (1 - sec.coverage) * 22 + sec.contraband * 0.15 + (50 - sec.climate) * 0.3 - 12);
  sec.tension = clamp(sec.tension + (target - sec.tension) * 0.03);
  sec.safetyBase = clamp(sec.safetyBase + (clamp(35 + sec.coverage * 50 - sec.tension * 0.35 - over * 30 - sec.contraband * 0.1) - sec.safetyBase) * 0.05);
  sec.laxity = clamp(sec.laxity - 0.01);
  sec.climate = clamp(sec.climate + (55 - sec.climate) * 0.0008);

  const fights = socialPass(s);
  if (!s.rules.incidents) { sec.pendingRefusals = []; return; }

  for (const [a, b] of fights) {
    if (s.incidents.filter((x) => x.status === 'open' && x.type === 'fight').length >= 3) break;
    hurt(a, rint(s, 4, 10)); hurt(b, rint(s, 4, 10));
    ilog(s, a, `Bagarre avec ${fullName(b)}.`); ilog(s, b, `Bagarre avec ${fullName(a)}.`);
    const room = getRuntime(s).rooms.get(a.tr);
    createIncident(s, 'fight', `${fullName(a)} et ${fullName(b)}`, `Une altercation éclate ${room ? `(${ROOMS[room.type].name.toLowerCase()})` : ''} entre ${fullName(a)} et ${fullName(b)}, en rivalité depuis quelque temps.`, [a.id, b.id], a.tr);
  }
  for (const id of sec.pendingRefusals.splice(0)) {
    const i = byId(s, id);
    if (i && s.incidents.filter((x) => x.status === 'open' && x.type === 'refusal').length < 3)
      createIncident(s, 'refusal', fullName(i), `${fullName(i)} refuse de se rendre à son activité. Son moral est au plus bas (${Math.round(i.mental)} %).`, [i.id]);
  }
  // Dégradations
  if (n && chance(s, 0.0025 * (n / 30) * (0.3 + sec.tension / 50) * (1 - sec.coverage * 0.7) * s.rules.difficulty)) {
    const cands = s.inmates.filter((i) => i.at && i.tr > 0 && i.mental < 55 && i.act !== 'sleep');
    const i = cands.length ? pick(s, cands) : null;
    const fl = i ? (getRuntime(s).furnByRoom.get(i.tr) ?? []).filter((f) => !f.broken) : [];
    if (i && fl.length) {
      const f = pick(s, fl);
      f.broken = true; s.mapVersion++;
      ilog(s, i, `Dégrade un équipement (${FURN[f.type].name}).`);
      createIncident(s, 'vandalism', `${FURN[f.type].name} dégradé`, `${fullName(i)} a dégradé un équipement (${FURN[f.type].name.toLowerCase()}). Il est hors service.`, [i.id], i.tr, f.id, 6);
    }
  }
  // Urgences médicales
  for (const i of s.inmates) {
    if (i.needs.health < 18 && !i.emerg) {
      i.emerg = true;
      ilog(s, i, 'Urgence médicale.');
      createIncident(s, 'medical', fullName(i), `L'état de santé de ${fullName(i)} est critique (${Math.round(i.needs.health)} %). Une décision rapide s'impose.`, [i.id], 0, 0, 2);
    }
  }
  // Tensions et incidents collectifs
  const openCollective = s.incidents.some((x) => x.status === 'open' && (x.type === 'collective' || x.type === 'tension'));
  if (!openCollective && n >= 6) {
    if (sec.tension > 78 && chance(s, 0.06)) {
      sec.collectiveCount++;
      createIncident(s, 'collective', 'Mouvement collectif', 'Un groupe de détenus refuse de réintégrer les cellules et bloque une partie de la détention. La tension est à son comble.', [], 0, 0, 2);
    } else if (sec.tension > 55 && s.time - sec.lastTensionAlert > 1440) {
      sec.lastTensionAlert = s.time;
      createIncident(s, 'tension', 'Climat dégradé', 'Les surveillants signalent des attroupements, des regards hostiles et des rumeurs de mouvement. La tension monte dans la détention.', [], 0, 0, 6);
    }
  }
  // Échéances : sans décision, la réponse par défaut la moins coûteuse s'applique.
  for (const inc of s.incidents) {
    if (inc.status !== 'open' || s.time < inc.deadline) continue;
    let def = inc.type === 'fight' ? 'separate' : inc.type === 'collective' ? 'lockdown' : 'ignore';
    // Une urgence vitale est prise en charge d'office si c'est possible.
    if (inc.type === 'medical') def = anyActive(s, 'infirmary') ? 'infirmary' : canAfford(s, 900) ? 'hospital' : 'ignore';
    if ((inc.type === 'breakdown' || inc.type === 'vandalism') && hasRole(s, 'tech')) def = 'tech';
    resolveIncident(s, inc.id, def);
    inc.result = 'Sans décision de votre part : ' + inc.result;
  }
}

export function hourlySecurity(s: GameState) {
  if (!s.rules.incidents) return;
  // Pannes : dépendent de la politique d'entretien, du réseau technique et des techniciens.
  const tiles = s.rooms.reduce((a, r) => a + r.w * r.h, 0);
  if (!tiles) return;
  const gens = s.furn.filter((f) => f.type === 'generator' && !f.broken).length;
  const tech = anyActive(s, 'technical');
  const risk = [2.2, 1, 0.45][s.policies.maintenance] * (tiles > gens * 250 ? 2.5 : 1) * (tech ? 0.5 : 1) * s.rules.difficulty;
  if (chance(s, 0.0035 * risk * Math.min(3, tiles / 300))) {
    const cands = s.rooms.filter((r) => !r.broken && ['kitchen', 'showers', 'laundry', 'infirmary', 'workshop', 'control', 'toilets', 'canteen', 'training'].includes(r.type));
    if (cands.length) {
      const r = pick(s, cands);
      r.broken = true; s.mapVersion++;
      const kind = ['showers', 'toilets', 'laundry'].includes(r.type) ? 'Fuite d\'eau' : 'Panne électrique';
      createIncident(s, 'breakdown', `${kind} : ${ROOMS[r.type].name}`, `${kind} dans la salle « ${ROOMS[r.type].name} ». Elle est hors service jusqu'à réparation.`, [], r.id, 0, 8);
    }
  }
}

export function dailySecurity(s: GameState) {
  const sec = s.sec;
  // Objets interdits : entrent par les accès mal contrôlés, circulent si la surveillance est faible.
  let growth = 4 * s.rules.difficulty * (1.2 - sec.coverage);
  if (anyActive(s, 'intake')) growth *= 0.5;
  if (s.furn.some((f) => f.type === 'scanner' && !f.broken) && anyActive(s, 'intake')) growth *= 0.5;
  sec.contraband = clamp(sec.contraband + (s.inmates.length ? growth : 0) - 0.5);
  sec.incidentsToday = 0;
  sec.incidentLog = sec.incidentLog.filter((t) => s.time - t < 7 * 1440);
}
