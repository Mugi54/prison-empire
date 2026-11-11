// Arbre de recherche : quatre branches, prérequis, coût et durée.
import { canAfford, spend } from './economy';
import { note } from './rng';
import { getRuntime, onDuty } from './rooms';
import type { GameState } from './types';

export type Branch = 'securite' | 'administration' | 'medecine' | 'reinsertion';
export const BRANCHES: { id: Branch; name: string; color: string }[] = [
  { id: 'securite', name: 'Sécurité', color: '#5b8fd6' },
  { id: 'administration', name: 'Administration', color: '#d6a45b' },
  { id: 'medecine', name: 'Médecine', color: '#5bd6b4' },
  { id: 'reinsertion', name: 'Réinsertion', color: '#b98ae0' },
];
export interface ResearchDef { id: string; branch: Branch; name: string; desc: string; cost: number; hours: number; req: string[]; col: number; row: number }
const D = (id: string, branch: Branch, name: string, desc: string, cost: number, hours: number, req: string[], col: number, row: number): ResearchDef => ({ id, branch, name, desc, cost, hours, req, col, row });

export const RESEARCH: ResearchDef[] = [
  D('rondes', 'securite', 'Protocoles de ronde', 'Les surveillants couvrent 20 % de détenus en plus.', 3000, 24, [], 0, 0),
  D('video', 'securite', 'Vidéosurveillance', 'Débloque la salle de contrôle et les caméras.', 6000, 36, ['rondes'], 1, 0),
  D('desescalade', 'securite', 'Désescalade', 'Formation des équipes : 35 % de bagarres en moins.', 5000, 36, ['rondes'], 1, 1),
  D('centre', 'securite', 'Supervision centralisée', 'Chaque caméra surveille deux fois plus de détenus.', 12000, 60, ['video'], 2, 0),
  D('portiques', 'securite', 'Détection des objets interdits', 'Débloque le portique de détection pour la zone d\'accès.', 8000, 48, ['video'], 2, 1),

  D('numerique', 'administration', 'Gestion numérique', 'Coûts d\'entretien réduits de 15 %.', 3000, 24, [], 0, 0),
  D('achats', 'administration', 'Achats groupés', 'Coût de la nourriture réduit de 15 %.', 5000, 36, ['numerique'], 1, 0),
  D('rh', 'administration', 'Ressources humaines', 'Fatigue du personnel réduite de 20 %, satisfaction améliorée.', 5000, 36, ['numerique'], 1, 1),
  D('energie', 'administration', 'Optimisation énergétique', 'Électricité et eau : −25 %.', 8000, 48, ['achats'], 2, 0),
  D('contrats', 'administration', 'Contrats institutionnels', 'Débloque les contrats avancés (formation, restauration).', 9000, 48, ['rh'], 2, 1),

  D('soins', 'medecine', 'Protocoles de soins', 'Guérison 40 % plus rapide à l\'infirmerie.', 3000, 24, [], 0, 0),
  D('prevention', 'medecine', 'Prévention sanitaire', 'Deux fois moins de maladies, évolution plus lente.', 5000, 36, ['soins'], 1, 0),
  D('psy', 'medecine', 'Suivi psychologique renforcé', 'Consultations 50 % plus efficaces.', 6000, 36, ['soins'], 1, 1),
  D('urgences', 'medecine', 'Unité d\'urgence', 'Les urgences non traitées sont rarement fatales.', 10000, 60, ['prevention'], 2, 0),
  D('telemed', 'medecine', 'Télémédecine', 'L\'infirmerie reste active sans médecin en service.', 8000, 48, ['psy'], 2, 1),

  D('enseignement', 'reinsertion', 'Enseignement adapté', 'Progression en classe et en formation : +40 %.', 3000, 24, [], 0, 0),
  D('formation', 'reinsertion', 'Formation professionnelle', 'Débloque l\'espace de formation et son programme.', 6000, 36, ['enseignement'], 1, 0),
  D('perso', 'reinsertion', 'Programmes individualisés', 'Débloque le parcours individualisé (+30 % de progression).', 7000, 48, ['enseignement'], 1, 1),
  D('qualif', 'reinsertion', 'Ateliers qualifiants', 'Revenus des ateliers +40 %, savoir-faire +30 %.', 9000, 48, ['formation'], 2, 0),
  D('partenariats', 'reinsertion', 'Partenariats employeurs', 'Réinsertion réussie plus fréquente, subvention de 300 €/jour.', 12000, 60, ['perso'], 2, 1),
];
export const researchDef = (id: string) => RESEARCH.find((r) => r.id === id);

export function researchState(s: GameState, id: string): 'done' | 'active' | 'available' | 'locked' {
  if (s.research.done.includes(id)) return 'done';
  if (s.research.active === id) return 'active';
  const d = researchDef(id)!;
  return d.req.every((r) => s.research.done.includes(r)) ? 'available' : 'locked';
}

const officeOk = (s: GameState) => (getRuntime(s).byType.get('office') ?? []).some((r) => getRuntime(s).status.get(r.id)?.ok);

export function startResearch(s: GameState, id: string): string | null {
  const d = researchDef(id);
  if (!d) return 'Recherche inconnue.';
  const st = researchState(s, id);
  if (st === 'done') return 'Recherche déjà terminée.';
  if (st === 'locked') return 'Prérequis non remplis.';
  if (s.research.active) return 'Une recherche est déjà en cours.';
  if (!officeOk(s)) return 'Des bureaux opérationnels sont nécessaires pour lancer une recherche.';
  if (!canAfford(s, d.cost)) return 'Fonds insuffisants.';
  spend(s, 'recherche', d.cost);
  s.research.active = id; s.research.progress = 0;
  return null;
}

/** Vitesse de recherche : 1 + 12 % par agent administratif en service (max +60 %), nulle sans bureaux. */
export function researchSpeed(s: GameState): number {
  if (!officeOk(s)) return 0;
  const admins = s.staff.filter((st) => st.role === 'admin' && onDuty(s, st)).length;
  return 1 + Math.min(0.6, admins * 0.12);
}

export function researchProgress(s: GameState, minutes: number) {
  const d = researchDef(s.research.active);
  if (!d) return;
  s.research.progress += (minutes / 60) * researchSpeed(s);
  if (s.research.progress >= d.hours) {
    s.research.done.push(d.id);
    s.research.active = ''; s.research.progress = 0;
    s.staffVer++; // certaines salles deviennent opérationnelles
    note(s, 'good', `Recherche terminée : ${d.name}.`);
  }
}
