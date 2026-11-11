import type { FurnType, NeedKey, Personality, Program, Role, RoomType, Shift, Slot } from './types';

// ───────────────────────── Salles ─────────────────────────
export type RoomCat = 'hebergement' | 'services' | 'administration' | 'reinsertion' | 'securite';
export const ROOM_CATS: { id: RoomCat; name: string }[] = [
  { id: 'hebergement', name: 'Hébergement' },
  { id: 'services', name: 'Services' },
  { id: 'administration', name: 'Administration' },
  { id: 'reinsertion', name: 'Réinsertion' },
  { id: 'securite', name: 'Sécurité et fonctionnement' },
];

export interface RoomDef {
  type: RoomType; name: string; cat: RoomCat; desc: string;
  cost: number; upkeep: number; minW: number; minH: number; floor: string;
  req: { types: FurnType[]; n: number }[];
  staff?: Role[];
  research?: string;
  furn: FurnType[];
  auto: (area: number) => [FurnType, number][];
}

const R = (d: RoomDef) => d;
export const ROOMS: Record<RoomType, RoomDef> = {
  cell: R({ type: 'cell', name: 'Cellule individuelle', cat: 'hebergement', desc: 'Héberge un détenu. Calme et sécurisante.', cost: 70, upkeep: 0.6, minW: 2, minH: 2, floor: '#8d93a0',
    req: [{ types: ['bed', 'bunk'], n: 1 }, { types: ['toilet'], n: 1 }], furn: ['bed', 'toilet', 'desk'], auto: () => [['bed', 1], ['toilet', 1]] }),
  dorm: R({ type: 'dorm', name: 'Cellule collective', cat: 'hebergement', desc: 'Héberge plusieurs détenus (1 place par lit, 2 par lit superposé). Économique mais moins rassurante.', cost: 55, upkeep: 0.6, minW: 3, minH: 3, floor: '#7f8794',
    req: [{ types: ['bed', 'bunk'], n: 2 }], furn: ['bed', 'bunk', 'toilet'], auto: (a) => [['bunk', Math.floor(a / 4)], ['toilet', 1]] }),
  isolation: R({ type: 'isolation', name: 'Quartier d\'isolement', cat: 'hebergement', desc: 'Quartier spécialisé : accueille les détenus sanctionnés ou à protéger. Réduit les récidives d\'incidents.', cost: 90, upkeep: 0.8, minW: 2, minH: 2, floor: '#6c6f7a',
    req: [{ types: ['bed'], n: 1 }, { types: ['toilet'], n: 1 }], furn: ['bed', 'toilet'], auto: () => [['bed', 1], ['toilet', 1]] }),
  common: R({ type: 'common', name: 'Salle commune', cat: 'hebergement', desc: 'Espace commun : loisirs et relations sociales pendant le temps libre.', cost: 50, upkeep: 0.5, minW: 3, minH: 3, floor: '#9a8f7c',
    req: [{ types: ['sofa'], n: 1 }], furn: ['sofa', 'tv', 'benchseat'], auto: (a) => [['sofa', Math.max(1, Math.floor(a / 8))], ['tv', 1], ['benchseat', 1]] }),
  yard: R({ type: 'yard', name: 'Cour de promenade', cat: 'hebergement', desc: 'Espace extérieur : activité physique, détente et relations sociales.', cost: 22, upkeep: 0.2, minW: 4, minH: 4, floor: '#b7a37c',
    req: [], furn: ['benchseat', 'hoop', 'weights'], auto: () => [['benchseat', 2], ['hoop', 1]] }),
  canteen: R({ type: 'canteen', name: 'Cantine', cat: 'services', desc: 'Les détenus y prennent leurs repas (4 places par table). Sans cantine, repas en cellule moins satisfaisants.', cost: 55, upkeep: 0.6, minW: 3, minH: 3, floor: '#a8b0a0',
    req: [{ types: ['ctable'], n: 1 }], furn: ['ctable', 'benchseat'], auto: (a) => [['ctable', Math.floor(a / 3)]] }),
  kitchen: R({ type: 'kitchen', name: 'Cuisine', cat: 'services', desc: 'Prépare les repas (40 repas par cuisinière). Sans cuisine active, repas froids de mauvaise qualité.', cost: 85, upkeep: 1, minW: 3, minH: 2, floor: '#c9cdd2',
    req: [{ types: ['stove'], n: 1 }], staff: ['cook'], furn: ['stove'], auto: (a) => [['stove', Math.max(1, Math.floor(a / 5))]] }),
  infirmary: R({ type: 'infirmary', name: 'Infirmerie', cat: 'services', desc: 'Soigne les détenus malades ou blessés (1 patient par lit médical).', cost: 100, upkeep: 1.2, minW: 3, minH: 3, floor: '#cfe3e0',
    req: [{ types: ['medbed'], n: 1 }], staff: ['doctor'], furn: ['medbed', 'desk'], auto: (a) => [['medbed', Math.max(1, Math.floor(a / 6))], ['desk', 1]] }),
  consult: R({ type: 'consult', name: 'Salle de consultation', cat: 'services', desc: 'Entretiens psychologiques : améliore l\'état psychologique et les compétences sociales.', cost: 80, upkeep: 0.8, minW: 2, minH: 2, floor: '#c5d3e6',
    req: [{ types: ['couch'], n: 1 }], staff: ['psych'], furn: ['couch', 'desk'], auto: () => [['couch', 1], ['desk', 1]] }),
  laundry: R({ type: 'laundry', name: 'Buanderie', cat: 'services', desc: 'Linge propre : ralentit la dégradation de l\'hygiène. Offre des postes de travail aux détenus.', cost: 65, upkeep: 0.9, minW: 3, minH: 2, floor: '#b3c4cf',
    req: [{ types: ['washer'], n: 1 }], furn: ['washer'], auto: (a) => [['washer', Math.max(1, Math.floor(a / 4))]] }),
  showers: R({ type: 'showers', name: 'Douches', cat: 'services', desc: 'Restaure l\'hygiène (3 détenus par douche et par créneau).', cost: 70, upkeep: 0.9, minW: 2, minH: 2, floor: '#9fc3cf',
    req: [{ types: ['shower'], n: 1 }], furn: ['shower'], auto: (a) => [['shower', Math.max(1, Math.floor(a / 2))]] }),
  toilets: R({ type: 'toilets', name: 'Sanitaires', cat: 'services', desc: 'Sanitaires collectifs : indispensables aux cellules collectives sans WC. Limite les problèmes sanitaires.', cost: 60, upkeep: 0.8, minW: 2, minH: 2, floor: '#a9c1c4',
    req: [{ types: ['toilet'], n: 1 }], furn: ['toilet'], auto: (a) => [['toilet', Math.max(1, Math.floor(a / 2))]] }),
  office: R({ type: 'office', name: 'Bureaux', cat: 'administration', desc: 'Accueille l\'administration. Nécessaire à la recherche ; les agents administratifs l\'accélèrent.', cost: 75, upkeep: 0.6, minW: 3, minH: 2, floor: '#a58f76',
    req: [{ types: ['desk'], n: 1 }], furn: ['desk', 'filecab'], auto: (a) => [['desk', Math.max(1, Math.floor(a / 5))]] }),
  staffroom: R({ type: 'staffroom', name: 'Salle du personnel', cat: 'administration', desc: 'Salle de repos : réduit la fatigue et améliore la satisfaction du personnel.', cost: 65, upkeep: 0.5, minW: 3, minH: 2, floor: '#96876f',
    req: [{ types: ['locker'], n: 1 }], furn: ['locker', 'coffee', 'sofa'], auto: () => [['locker', 2], ['coffee', 1]] }),
  meeting: R({ type: 'meeting', name: 'Salle de réunion', cat: 'administration', desc: 'Formations internes deux fois plus rapides et meilleure cohésion des équipes.', cost: 70, upkeep: 0.5, minW: 3, minH: 3, floor: '#8f7f6d',
    req: [{ types: ['meetingtable'], n: 1 }], furn: ['meetingtable'], auto: () => [['meetingtable', 1]] }),
  archives: R({ type: 'archives', name: 'Archives', cat: 'administration', desc: 'Dossiers à jour : meilleurs résultats aux inspections et relations facilitées avec les autorités.', cost: 60, upkeep: 0.4, minW: 2, minH: 2, floor: '#84776a',
    req: [{ types: ['filecab'], n: 1 }], furn: ['filecab', 'desk'], auto: (a) => [['filecab', Math.max(1, Math.floor(a / 3))]] }),
  classroom: R({ type: 'classroom', name: 'Salle de classe', cat: 'reinsertion', desc: 'Programme d\'enseignement (2 élèves par table). Développe l\'instruction.', cost: 70, upkeep: 0.6, minW: 3, minH: 3, floor: '#b9a77d',
    req: [{ types: ['schooldesk'], n: 2 }], staff: ['trainer'], furn: ['schooldesk', 'desk'], auto: (a) => [['schooldesk', Math.max(2, Math.floor(a / 3))]] }),
  library: R({ type: 'library', name: 'Bibliothèque', cat: 'reinsertion', desc: 'Loisir calme qui développe aussi l\'instruction (5 lecteurs par rayonnage).', cost: 65, upkeep: 0.5, minW: 3, minH: 2, floor: '#a98b62',
    req: [{ types: ['shelf'], n: 1 }], furn: ['shelf', 'schooldesk'], auto: (a) => [['shelf', Math.max(1, Math.floor(a / 4))]] }),
  workshop: R({ type: 'workshop', name: 'Atelier', cat: 'reinsertion', desc: 'Travail pénitentiaire : génère des revenus et développe le savoir-faire (2 postes par établi).', cost: 80, upkeep: 0.9, minW: 3, minH: 3, floor: '#8a8f84',
    req: [{ types: ['bench'], n: 1 }], furn: ['bench'], auto: (a) => [['bench', Math.max(1, Math.floor(a / 5))]] }),
  training: R({ type: 'training', name: 'Espace de formation', cat: 'reinsertion', desc: 'Formation professionnelle qualifiante (2 stagiaires par poste).', cost: 90, upkeep: 0.9, minW: 3, minH: 3, floor: '#93a08a', research: 'formation',
    req: [{ types: ['trainstation'], n: 1 }], staff: ['trainer'], furn: ['trainstation'], auto: (a) => [['trainstation', Math.max(1, Math.floor(a / 5))]] }),
  gym: R({ type: 'gym', name: 'Espace d\'activités', cat: 'reinsertion', desc: 'Activités sportives collectives (3 détenus par appareil).', cost: 60, upkeep: 0.6, minW: 3, minH: 3, floor: '#7f9aa3',
    req: [{ types: ['weights'], n: 1 }], furn: ['weights', 'benchseat'], auto: (a) => [['weights', Math.max(1, Math.floor(a / 4))]] }),
  guardpost: R({ type: 'guardpost', name: 'Poste de surveillance', cat: 'securite', desc: 'Renforce la couverture de sécurité quand un surveillant y est affecté.', cost: 70, upkeep: 0.5, minW: 2, minH: 2, floor: '#5f7391',
    req: [{ types: ['desk'], n: 1 }], staff: ['guard', 'lead'], furn: ['desk', 'locker'], auto: () => [['desk', 1]] }),
  control: R({ type: 'control', name: 'Salle de contrôle', cat: 'securite', desc: 'Active les caméras de vidéosurveillance et les alarmes.', cost: 110, upkeep: 1.2, minW: 2, minH: 2, floor: '#4f6584', research: 'video',
    req: [{ types: ['console'], n: 1 }], staff: ['guard', 'lead'], furn: ['console', 'desk'], auto: () => [['console', 1]] }),
  technical: R({ type: 'technical', name: 'Local technique', cat: 'securite', desc: 'Alimente les réseaux (250 cases de bâtiment par armoire). Limite fortement les pannes.', cost: 80, upkeep: 1, minW: 2, minH: 2, floor: '#6b6f66',
    req: [{ types: ['generator'], n: 1 }], staff: ['tech'], furn: ['generator'], auto: () => [['generator', 1]] }),
  intake: R({ type: 'intake', name: 'Zone d\'accès contrôlé', cat: 'securite', desc: 'Contrôle des entrées et du greffe : freine fortement l\'introduction d\'objets interdits.', cost: 85, upkeep: 0.7, minW: 2, minH: 2, floor: '#667b78',
    req: [{ types: ['desk'], n: 1 }], staff: ['guard', 'admin'], furn: ['desk', 'scanner', 'locker'], auto: () => [['desk', 1]] }),
};
export const ROOM_LIST = Object.values(ROOMS);

// ───────────────────────── Mobilier ─────────────────────────
/** boîte isométrique : [dx, dy, dz, largeur, profondeur, hauteur, couleur] */
export type Box = [number, number, number, number, number, number, string];
export interface FurnDef { type: FurnType; name: string; cost: number; upkeep: number; power: number; desc: string; boxes: Box[]; anywhere?: boolean; research?: string }
const F = (type: FurnType, name: string, cost: number, upkeep: number, power: number, desc: string, boxes: Box[], extra: Partial<FurnDef> = {}): FurnDef => ({ type, name, cost, upkeep, power, desc, boxes, ...extra });

export const FURN: Record<FurnType, FurnDef> = {
  bed: F('bed', 'Lit', 150, 0.5, 0, '1 place de couchage.', [[0.12, 0.1, 0, 0.76, 0.8, 0.16, '#6b5846'], [0.12, 0.1, 0.16, 0.76, 0.8, 0.08, '#dfe4ea'], [0.16, 0.14, 0.24, 0.68, 0.2, 0.05, '#ffffff'], [0.12, 0.5, 0.24, 0.76, 0.4, 0.02, '#e08a3c']]),
  bunk: F('bunk', 'Lit superposé', 260, 0.8, 0, '2 places de couchage.', [[0.12, 0.1, 0, 0.76, 0.8, 0.14, '#55606e'], [0.12, 0.1, 0.14, 0.76, 0.8, 0.07, '#dfe4ea'], [0.12, 0.1, 0.21, 0.06, 0.06, 0.4, '#55606e'], [0.82, 0.84, 0.21, 0.06, 0.06, 0.4, '#55606e'], [0.12, 0.1, 0.58, 0.76, 0.8, 0.06, '#55606e'], [0.12, 0.1, 0.64, 0.76, 0.8, 0.07, '#dfe4ea'], [0.12, 0.5, 0.71, 0.76, 0.4, 0.02, '#e08a3c']]),
  toilet: F('toilet', 'WC', 120, 0.6, 0, 'Sanitaire. Obligatoire en cellule.', [[0.32, 0.36, 0, 0.36, 0.4, 0.22, '#e9eef2'], [0.32, 0.22, 0, 0.36, 0.14, 0.42, '#d5dde3']]),
  ctable: F('ctable', 'Table de réfectoire', 180, 0.4, 0, '4 places de repas.', [[0.2, 0.2, 0, 0.08, 0.08, 0.26, '#59616b'], [0.72, 0.72, 0, 0.08, 0.08, 0.26, '#59616b'], [0.1, 0.25, 0.26, 0.8, 0.5, 0.05, '#c9b38b'], [0.1, 0.06, 0.12, 0.8, 0.14, 0.04, '#7b8794'], [0.1, 0.8, 0.12, 0.8, 0.14, 0.04, '#7b8794']]),
  stove: F('stove', 'Cuisinière', 600, 2, 6, 'Permet de préparer 40 repas par service.', [[0.1, 0.12, 0, 0.8, 0.7, 0.42, '#b8bfc7'], [0.16, 0.2, 0.42, 0.3, 0.26, 0.03, '#2b2f36'], [0.54, 0.2, 0.42, 0.3, 0.26, 0.03, '#2b2f36'], [0.1, 0.12, 0.42, 0.8, 0.06, 0.2, '#8d96a0']]),
  medbed: F('medbed', 'Lit médical', 700, 2, 2, 'Accueille 1 patient.', [[0.14, 0.1, 0.18, 0.72, 0.8, 0.06, '#9aa7b1'], [0.14, 0.1, 0.24, 0.72, 0.8, 0.08, '#f4f8fa'], [0.18, 0.14, 0.32, 0.64, 0.2, 0.05, '#bfe6e0'], [0.16, 0.12, 0, 0.06, 0.06, 0.18, '#6d7882'], [0.78, 0.82, 0, 0.06, 0.06, 0.18, '#6d7882']]),
  desk: F('desk', 'Bureau', 250, 0.4, 1, 'Poste de travail administratif.', [[0.12, 0.25, 0, 0.1, 0.5, 0.3, '#6f5a43'], [0.78, 0.25, 0, 0.1, 0.5, 0.3, '#6f5a43'], [0.1, 0.22, 0.3, 0.8, 0.56, 0.05, '#a9895f'], [0.4, 0.3, 0.35, 0.24, 0.06, 0.18, '#2c3440']]),
  couch: F('couch', 'Fauteuil d\'entretien', 300, 0.4, 0, 'Nécessaire aux consultations.', [[0.2, 0.2, 0, 0.6, 0.6, 0.2, '#4e7fa6'], [0.2, 0.2, 0.2, 0.6, 0.14, 0.26, '#3f6c90']]),
  sofa: F('sofa', 'Canapé', 220, 0.3, 0, 'Détente collective.', [[0.08, 0.25, 0, 0.84, 0.5, 0.18, '#a5583f'], [0.08, 0.25, 0.18, 0.84, 0.14, 0.2, '#8d4732']]),
  tv: F('tv', 'Téléviseur', 350, 0.5, 2, 'Renforce les loisirs en salle commune.', [[0.3, 0.3, 0, 0.4, 0.3, 0.3, '#4a4037'], [0.14, 0.34, 0.3, 0.72, 0.08, 0.42, '#15191f'], [0.17, 0.42, 0.34, 0.66, 0.01, 0.34, '#4fb7d6']]),
  washer: F('washer', 'Machine à laver', 800, 2.5, 8, '2 postes de travail en buanderie.', [[0.14, 0.14, 0, 0.72, 0.66, 0.5, '#e6eaee'], [0.3, 0.8, 0.14, 0.4, 0.02, 0.26, '#5e8fb3']]),
  shower: F('shower', 'Douche', 200, 1, 1, '3 détenus par créneau.', [[0.1, 0.1, 0, 0.8, 0.8, 0.03, '#dfe9ee'], [0.44, 0.12, 0.03, 0.08, 0.08, 0.66, '#9aa7b1'], [0.38, 0.12, 0.66, 0.2, 0.26, 0.04, '#7c8a95']]),
  schooldesk: F('schooldesk', 'Table d\'étude', 160, 0.3, 0, '2 places d\'étude.', [[0.14, 0.3, 0, 0.08, 0.4, 0.26, '#59616b'], [0.78, 0.3, 0, 0.08, 0.4, 0.26, '#59616b'], [0.1, 0.26, 0.26, 0.8, 0.44, 0.04, '#d8c08e'], [0.2, 0.78, 0.1, 0.6, 0.14, 0.04, '#7b8794']]),
  shelf: F('shelf', 'Rayonnage de livres', 240, 0.3, 0, '5 lecteurs par rayonnage.', [[0.08, 0.3, 0, 0.84, 0.34, 0.7, '#7a5a3a'], [0.12, 0.64, 0.1, 0.76, 0.01, 0.14, '#c9503f'], [0.12, 0.64, 0.3, 0.76, 0.01, 0.14, '#3f8fc9'], [0.12, 0.64, 0.5, 0.76, 0.01, 0.14, '#e0b84a']]),
  bench: F('bench', 'Établi', 500, 1.5, 4, '2 postes de travail en atelier.', [[0.1, 0.2, 0, 0.8, 0.6, 0.32, '#5d6670'], [0.08, 0.18, 0.32, 0.84, 0.64, 0.05, '#b08b55'], [0.6, 0.3, 0.37, 0.2, 0.2, 0.14, '#c9503f']]),
  trainstation: F('trainstation', 'Poste de formation', 650, 1.5, 4, '2 stagiaires par poste.', [[0.1, 0.24, 0, 0.8, 0.52, 0.3, '#48607a'], [0.08, 0.22, 0.3, 0.84, 0.56, 0.04, '#cfd6dd'], [0.3, 0.3, 0.34, 0.4, 0.06, 0.26, '#1d232b'], [0.33, 0.36, 0.38, 0.34, 0.01, 0.2, '#6fd0a8']]),
  weights: F('weights', 'Appareil de musculation', 400, 0.8, 0, '3 détenus par appareil.', [[0.2, 0.3, 0, 0.6, 0.4, 0.12, '#30363d'], [0.44, 0.3, 0.12, 0.1, 0.1, 0.5, '#8d96a0'], [0.14, 0.32, 0.5, 0.72, 0.08, 0.06, '#c9503f']]),
  hoop: F('hoop', 'Panier de basket', 300, 0.3, 0, 'Activité physique dans la cour.', [[0.45, 0.45, 0, 0.1, 0.1, 0.95, '#6d7882'], [0.25, 0.5, 0.75, 0.5, 0.04, 0.3, '#f1f3f5'], [0.4, 0.54, 0.74, 0.2, 0.16, 0.03, '#e2622f']]),
  benchseat: F('benchseat', 'Banc', 80, 0.1, 0, 'Assise simple.', [[0.1, 0.36, 0, 0.08, 0.28, 0.16, '#55606e'], [0.82, 0.36, 0, 0.08, 0.28, 0.16, '#55606e'], [0.06, 0.34, 0.16, 0.88, 0.32, 0.04, '#b89868']]),
  console: F('console', 'Console de surveillance', 900, 3, 8, 'Cœur de la salle de contrôle.', [[0.08, 0.2, 0, 0.84, 0.5, 0.34, '#39485c'], [0.1, 0.22, 0.34, 0.8, 0.08, 0.34, '#161b22'], [0.13, 0.3, 0.38, 0.34, 0.01, 0.26, '#46c2a8'], [0.53, 0.3, 0.38, 0.34, 0.01, 0.26, '#4fb7d6']]),
  camera: F('camera', 'Caméra', 450, 1.5, 2, 'Surveille 5 détenus si la salle de contrôle est active.', [[0.46, 0.46, 0, 0.08, 0.08, 0.8, '#59616b'], [0.36, 0.4, 0.8, 0.3, 0.2, 0.14, '#e9eef2'], [0.6, 0.46, 0.84, 0.08, 0.08, 0.06, '#c9503f']], { anywhere: true, research: 'video' }),
  generator: F('generator', 'Armoire électrique', 1200, 4, 0, 'Alimente 250 cases de bâtiment.', [[0.12, 0.2, 0, 0.76, 0.56, 0.62, '#6f7f6a'], [0.2, 0.76, 0.3, 0.2, 0.01, 0.2, '#e0b84a'], [0.5, 0.76, 0.1, 0.3, 0.01, 0.4, '#4b5748']]),
  locker: F('locker', 'Casier', 90, 0.1, 0, 'Vestiaire du personnel.', [[0.2, 0.3, 0, 0.6, 0.36, 0.72, '#5a7697'], [0.24, 0.66, 0.4, 0.5, 0.01, 0.24, '#44607f']]),
  coffee: F('coffee', 'Machine à café', 300, 0.8, 2, 'Améliore le repos du personnel.', [[0.25, 0.3, 0, 0.5, 0.4, 0.34, '#6b5846'], [0.3, 0.34, 0.34, 0.4, 0.3, 0.3, '#22272e'], [0.36, 0.64, 0.4, 0.28, 0.01, 0.12, '#e2622f']]),
  filecab: F('filecab', 'Armoire d\'archives', 200, 0.2, 0, 'Classement des dossiers.', [[0.16, 0.26, 0, 0.68, 0.44, 0.66, '#8d8f7a'], [0.2, 0.7, 0.1, 0.6, 0.01, 0.14, '#6d6f5c'], [0.2, 0.7, 0.3, 0.6, 0.01, 0.14, '#6d6f5c'], [0.2, 0.7, 0.5, 0.6, 0.01, 0.12, '#6d6f5c']]),
  meetingtable: F('meetingtable', 'Table de réunion', 400, 0.3, 0, 'Nécessaire à la salle de réunion.', [[0.42, 0.42, 0, 0.16, 0.16, 0.28, '#4a4037'], [0.04, 0.16, 0.28, 0.92, 0.68, 0.05, '#7a5a3a']]),
  scanner: F('scanner', 'Portique de détection', 1500, 3, 4, 'Divise par deux l\'entrée d\'objets interdits.', [[0.14, 0.4, 0, 0.1, 0.2, 0.8, '#7c8a95'], [0.76, 0.4, 0, 0.1, 0.2, 0.8, '#7c8a95'], [0.14, 0.4, 0.8, 0.72, 0.2, 0.08, '#46c2a8']], { research: 'portiques' }),
};

// ───────────────────────── Personnel ─────────────────────────
export interface RoleDef { role: Role; name: string; salary: number; desc: string; rooms: RoomType[]; shift: Shift; color: string }
export const ROLES: Record<Role, RoleDef> = {
  guard: { role: 'guard', name: 'Surveillant', salary: 110, desc: 'Assure la sécurité, les rondes et les postes de surveillance.', rooms: ['guardpost', 'control', 'intake'], shift: 'matin', color: '#3f6fb0' },
  lead: { role: 'lead', name: 'Responsable d\'équipe', salary: 150, desc: 'Encadre les surveillants : +8 % d\'efficacité par responsable en service.', rooms: ['guardpost', 'control', 'office'], shift: 'journee', color: '#25477a' },
  doctor: { role: 'doctor', name: 'Médecin', salary: 260, desc: 'Fait fonctionner l\'infirmerie.', rooms: ['infirmary'], shift: 'journee', color: '#f1f5f7' },
  psych: { role: 'psych', name: 'Psychologue', salary: 190, desc: 'Assure les consultations et les médiations.', rooms: ['consult'], shift: 'journee', color: '#9b7fd1' },
  cook: { role: 'cook', name: 'Cuisinier', salary: 100, desc: 'Prépare les repas en cuisine.', rooms: ['kitchen'], shift: 'journee', color: '#e8e2d2' },
  tech: { role: 'tech', name: 'Technicien', salary: 120, desc: 'Entretient les réseaux et répare les pannes.', rooms: ['technical'], shift: 'journee', color: '#d7a531' },
  admin: { role: 'admin', name: 'Agent administratif', salary: 105, desc: 'Accélère la recherche et tient le greffe.', rooms: ['office', 'archives', 'intake'], shift: 'journee', color: '#8b6f55' },
  trainer: { role: 'trainer', name: 'Formateur', salary: 130, desc: 'Anime les salles de classe et les espaces de formation.', rooms: ['classroom', 'training'], shift: 'journee', color: '#3c9c78' },
  reinsertion: { role: 'reinsertion', name: 'Responsable de réinsertion', salary: 150, desc: 'Renforce tous les programmes et permet les parcours individualisés.', rooms: ['office', 'consult'], shift: 'journee', color: '#2f8f9c' },
};
export const ROLE_LIST = Object.values(ROLES);

export const SHIFTS: Record<Shift, { name: string; from: number; to: number }> = {
  matin: { name: 'Matin (6h–14h)', from: 6, to: 14 },
  soir: { name: 'Après-midi (14h–22h)', from: 14, to: 22 },
  nuit: { name: 'Nuit (22h–6h)', from: 22, to: 6 },
  journee: { name: 'Journée (7h–19h)', from: 7, to: 19 },
};

// ───────────────────────── Détenus ─────────────────────────
export const NEED_LABEL: Record<NeedKey, string> = { food: 'Nourriture', sleep: 'Sommeil', hygiene: 'Hygiène', health: 'Santé', leisure: 'Loisirs', social: 'Relations sociales', activity: 'Activités', safety: 'Sécurité ressentie' };
export const NEED_KEYS = Object.keys(NEED_LABEL) as NeedKey[];
export const PERSONALITY: Record<Personality, { name: string; desc: string }> = {
  calme: { name: 'Calme', desc: 'Rarement impliqué dans des conflits.' },
  sociable: { name: 'Sociable', desc: 'Se lie facilement, mais supporte mal l\'isolement.' },
  introverti: { name: 'Introverti', desc: 'Peu de besoins sociaux, mal à l\'aise dans la foule.' },
  impulsif: { name: 'Impulsif', desc: 'Réagit vivement : conflits et refus plus fréquents.' },
  anxieux: { name: 'Anxieux', desc: 'Très sensible au sentiment d\'insécurité.' },
  ambitieux: { name: 'Ambitieux', desc: 'Progresse vite en formation, s\'ennuie sans activité.' },
  discipline: { name: 'Discipliné', desc: 'Respecte le règlement et les horaires.' },
};
export const PERSONALITIES = Object.keys(PERSONALITY) as Personality[];
export const PROFILES = ['Coopératif', 'Réservé', 'Meneur', 'Influençable', 'Instable', 'Solitaire'];
export const CRIMES = ['vol aggravé', 'escroquerie', 'cambriolage', 'recel', 'fraude fiscale', 'abus de confiance', 'conduite sans permis en récidive', 'dégradations volontaires', 'trafic de marchandises', 'faux et usage de faux', 'violences', 'détournement de fonds'];
export const BACKGROUNDS = ['Première incarcération.', 'Déjà condamné une fois.', 'Parcours scolaire interrompu tôt.', 'Ancien artisan sans emploi stable.', 'Récidiviste, plusieurs séjours en détention.', 'Sans antécédent, situation familiale stable.', 'Ancien employé de bureau, lourdement endetté.', 'A grandi en foyer, peu de soutien extérieur.'];
export const PROGRAMS: Record<Program, { name: string; desc: string; rooms: RoomType[] }> = {
  none: { name: 'Aucun programme', desc: 'Temps libre pendant les périodes d\'activité.', rooms: [] },
  work: { name: 'Travail', desc: 'Atelier ou buanderie : revenus pour l\'établissement, savoir-faire pour le détenu.', rooms: ['workshop', 'laundry'] },
  education: { name: 'Enseignement', desc: 'Cours en salle de classe.', rooms: ['classroom'] },
  training: { name: 'Formation professionnelle', desc: 'Formation qualifiante en espace de formation.', rooms: ['training'] },
  therapy: { name: 'Accompagnement psychologique', desc: 'Entretiens réguliers en salle de consultation.', rooms: ['consult'] },
  sport: { name: 'Activités collectives', desc: 'Sport et activités de groupe.', rooms: ['gym', 'yard'] },
  perso: { name: 'Programme individualisé', desc: 'Parcours adapté chaque jour au profil du détenu (+30 % de progression).', rooms: [] },
};
export const ACT_LABEL: Record<string, string> = {
  sleep: 'Dort', eat: 'Prend son repas', shower: 'Se douche', work: 'Travaille', class: 'Suit un cours', training: 'En formation',
  therapy: 'En consultation', sport: 'Fait du sport', leisure: 'Se détend', social: 'Discute', yard: 'En promenade', cell: 'En cellule',
  infirmary: 'À l\'infirmerie', isolation: 'À l\'isolement', idle: 'Attend', arrive: 'Arrive dans l\'établissement', refuse: 'Refuse l\'activité',
};
export const SLOT_LABEL: Record<Slot, string> = { sleep: 'Sommeil', hygiene: 'Hygiène', meal: 'Repas', work: 'Activités', free: 'Temps libre', lockup: 'Cellule' };
export const SLOT_COLOR: Record<Slot, string> = { sleep: '#31476b', hygiene: '#3f9fb8', meal: '#d08a3a', work: '#4c9a6a', free: '#b9a04a', lockup: '#6b6f7a' };
export const DEFAULT_REGIME: Slot[] = ['sleep', 'sleep', 'sleep', 'sleep', 'sleep', 'sleep', 'hygiene', 'meal', 'work', 'work', 'work', 'work', 'meal', 'work', 'work', 'work', 'work', 'free', 'meal', 'free', 'free', 'lockup', 'sleep', 'sleep'];

export const FIRST_NAMES = ['Lucas', 'Hugo', 'Karim', 'Mehdi', 'Thomas', 'Julien', 'Nicolas', 'Antoine', 'Yanis', 'Kevin', 'Bruno', 'Sofiane', 'Maxime', 'Pierre', 'Marc', 'David', 'Samir', 'Romain', 'Florian', 'Mathieu', 'Cédric', 'Loïc', 'Adrien', 'Ibrahim', 'Jordan', 'Fabien', 'Rayan', 'Olivier', 'Sébastien', 'Mickaël', 'Tony', 'Alexis', 'Bastien', 'Damien', 'Émile', 'Gaël', 'Ismaël', 'Jérôme', 'Léo', 'Nathan', 'Paul', 'Quentin', 'Rémi', 'Steve', 'Théo', 'Victor', 'William', 'Xavier', 'Yann', 'Zakaria'];
export const STAFF_FIRST = ['Claire', 'Sophie', 'Nadia', 'Julie', 'Camille', 'Laura', 'Inès', 'Marie', 'Élodie', 'Sarah', 'Hélène', 'Aurélie', 'Patrick', 'Stéphane', 'Laurent', 'Éric', 'Vincent', 'Christophe', 'Alain', 'Denis', 'Farid', 'Guillaume', 'Benoît', 'Franck'];
export const LAST_NAMES = ['Martin', 'Bernard', 'Dubois', 'Durand', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Lefebvre', 'Leroy', 'Roux', 'David', 'Bertrand', 'Morel', 'Fournier', 'Girard', 'Bonnet', 'Dupont', 'Lambert', 'Fontaine', 'Rousseau', 'Vincent', 'Muller', 'Faure', 'André', 'Mercier', 'Blanc', 'Guérin', 'Boyer', 'Garnier', 'Chevalier', 'François', 'Legrand', 'Gauthier', 'Garcia', 'Perrin', 'Robin', 'Clément', 'Morin', 'Nicolas', 'Henry', 'Roussel', 'Mathieu', 'Benali', 'Haddad', 'Diallo', 'Traoré', 'Nguyen', 'Da Silva', 'Kowalski'];

export const FOOD_POLICY = [{ name: 'Économique', cost: 8, q: 0.6 }, { name: 'Standard', cost: 12, q: 0.85 }, { name: 'De qualité', cost: 18, q: 1.1 }];
export const MAINT_POLICY = [{ name: 'Minimal', cost: 0.6, risk: 2.2 }, { name: 'Normal', cost: 1, risk: 1 }, { name: 'Renforcé', cost: 1.5, risk: 0.45 }];

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
