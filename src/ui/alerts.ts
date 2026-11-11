import * as E from '../engine';

/** Alertes calculées depuis l'état réel de l'établissement. */
export function computeAlerts(s: E.GameState): { level: 'bad' | 'warn'; text: string; panel: string }[] {
  const out: { level: 'bad' | 'warn'; text: string; panel: string }[] = [];
  const rt = E.getRuntime(s);
  const un = E.unhoused(s);
  if (un) out.push({ level: 'bad', text: `${un} détenu(s) sans place d'hébergement`, panel: 'build' });
  const open = s.incidents.filter((i) => i.status === 'open').length;
  if (open) out.push({ level: 'bad', text: `${open} incident(s) en attente de décision`, panel: 'security' });
  if (s.events.active.length) out.push({ level: 'warn', text: `${s.events.active.length} événement(s) en attente de décision`, panel: 'events' });
  const ko = s.rooms.filter((r) => !rt.status.get(r.id)?.ok).length;
  if (ko) out.push({ level: 'warn', text: `${ko} salle(s) non opérationnelle(s)`, panel: 'build' });
  if (s.finance.balance < 0) out.push({ level: 'bad', text: `Trésorerie négative depuis ${s.finance.deficitDays} jour(s)`, panel: 'finance' });
  if (s.sec.tension > 55) out.push({ level: s.sec.tension > 75 ? 'bad' : 'warn', text: `Tension élevée (${Math.round(s.sec.tension)} %)`, panel: 'security' });
  if (s.inmates.length && s.sec.coverage < 0.6) out.push({ level: 'warn', text: `Couverture de sécurité faible (${Math.round(s.sec.coverage * 100)} %)`, panel: 'security' });
  const sick = s.inmates.filter((i) => i.sick || i.needs.health < 35).length;
  if (sick) out.push({ level: 'warn', text: `${sick} détenu(s) malade(s) ou blessé(s)`, panel: 'inmates' });
  const tired = s.staff.filter((st) => st.fatigue > 75).length;
  if (tired) out.push({ level: 'warn', text: `${tired} employé(s) épuisé(s)`, panel: 'staff' });
  if (s.sec.lockdownUntil > s.time) out.push({ level: 'warn', text: 'Confinement général en cours', panel: 'security' });
  return out;
}

