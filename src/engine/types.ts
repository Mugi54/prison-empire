// Types centraux du moteur. L'état de jeu (GameState) est un objet JSON pur :
// il peut être sérialisé tel quel pour les sauvegardes.

export type Mode = 'career' | 'scenario' | 'sandbox';
export type Side = 'N' | 'E' | 'S' | 'W';

export type RoomType =
  | 'cell' | 'dorm' | 'isolation' | 'common' | 'yard'
  | 'canteen' | 'kitchen' | 'infirmary' | 'consult' | 'laundry' | 'showers' | 'toilets'
  | 'office' | 'staffroom' | 'meeting' | 'archives'
  | 'classroom' | 'library' | 'workshop' | 'training' | 'gym'
  | 'guardpost' | 'control' | 'technical' | 'intake';

export type FurnType =
  | 'bed' | 'bunk' | 'toilet' | 'ctable' | 'stove' | 'medbed' | 'desk' | 'couch' | 'sofa' | 'tv'
  | 'washer' | 'shower' | 'schooldesk' | 'shelf' | 'bench' | 'trainstation' | 'weights' | 'hoop'
  | 'benchseat' | 'console' | 'camera' | 'generator' | 'locker' | 'coffee' | 'filecab'
  | 'meetingtable' | 'scanner';

export type Role = 'guard' | 'lead' | 'doctor' | 'psych' | 'cook' | 'tech' | 'admin' | 'trainer' | 'reinsertion';
export type Shift = 'matin' | 'soir' | 'nuit' | 'journee';
export type Slot = 'sleep' | 'hygiene' | 'meal' | 'work' | 'free' | 'lockup';
export type Program = 'none' | 'work' | 'education' | 'training' | 'therapy' | 'sport' | 'perso';
export type Personality = 'calme' | 'sociable' | 'introverti' | 'impulsif' | 'anxieux' | 'ambitieux' | 'discipline';
export type NeedKey = 'food' | 'sleep' | 'hygiene' | 'health' | 'leisure' | 'social' | 'activity' | 'safety';
export type Needs = Record<NeedKey, number>;

export interface Room { id: number; type: RoomType; x: number; y: number; w: number; h: number; broken?: boolean }
export interface Door { x: number; y: number; side: Side }
export interface Furn { id: number; type: FurnType; x: number; y: number; broken?: boolean }

export interface Look { skin: number; hair: number; style: number; beard: boolean }

export interface Agent {
  id: number; first: string; last: string; age: number; look: Look;
  x: number; y: number; px: number; py: number;
  /** salle cible : >0 identifiant de salle, 0 aucune, -1 portail d'entrée */
  tr: number; tx: number; ty: number; at: boolean;
}

export interface Inmate extends Agent {
  personality: Personality;
  profile: string;
  crime: string;
  background: string;
  sentence: number; served: number; arrived: number;
  needs: Needs;
  mental: number;
  risk: number;
  skills: { education: number; craft: number; social: number };
  program: Program;
  rel: Record<number, number>;
  log: { t: number; m: string }[];
  cell: number;
  act: string;
  slot: Slot | '';
  until: number;
  isoUntil: number;
  sick: boolean;
  emerg: boolean;
}

export interface Staff extends Agent {
  role: Role;
  skill: number; salary: number; fatigue: number; satisfaction: number; xp: number; rank: number;
  shift: Shift; room: number; leaveUntil: number; trainUntil: number; away: boolean; patrolAt: number;
}

export interface Ledger { inc: Record<string, number>; exp: Record<string, number> }
export interface DayRecord extends Ledger { day: number; balance: number }
export interface Loan { id: number; amount: number; remaining: number; daily: number }
export interface Grant { name: string; perDay: number; until: number }

export interface Finance {
  balance: number;
  today: Ledger;
  history: DayRecord[];
  loans: Loan[];
  grants: Grant[];
  contracts: { id: string; failDays: number }[];
  deficitDays: number;
  positiveDays: number;
  baseFunding: number;
  fundingCut: { factor: number; until: number };
  workMinutes: number;
}

export type IncidentType = 'fight' | 'vandalism' | 'refusal' | 'medical' | 'breakdown' | 'collective' | 'tension';
export interface Incident {
  id: number; type: IncidentType; t: number; deadline: number;
  title: string; text: string;
  inmates: number[]; room: number; furn: number;
  status: 'open' | 'resolved'; choice?: string; result?: string;
}

export interface Security {
  coverage: number; tension: number; climate: number; contraband: number;
  lockdownUntil: number; safetyBase: number; laxity: number;
  incidentsToday: number; incidentLog: number[]; pendingRefusals: number[]; collectiveCount: number; lastTensionAlert: number; lastShakedown: number; covAcc: number; covCnt: number;
}

export interface ActiveEvent { id: number; def: string; t: number; deadline: number }
export interface EventRecord { t: number; title: string; choice: string; result: string }
export interface Note { id: number; t: number; kind: 'info' | 'good' | 'warn' | 'bad'; m: string }

export interface StatRecord {
  day: number; inmates: number; capacity: number; mental: number; needs: number; tension: number; coverage: number;
  reputation: number; authority: number; balance: number; incidents: number; reinsertion: number; staffSat: number;
}

export interface Rules {
  difficulty: number;       // multiplicateur général (0.75 facile, 1 normal, 1.3 difficile)
  fundingMul: number;
  events: boolean; eventFreq: number;
  incidents: boolean;
  bankruptcy: boolean;
  intake: boolean; intakeRate: number; overcrowdPush: number;
  unlimitedMoney: boolean;
}

export interface Policies { food: 0 | 1 | 2; maintenance: 0 | 1 | 2 }

export interface GameState {
  version: number;
  title: string;
  mode: Mode;
  preset: string;
  scenario: string;
  rng: number;
  nextId: number;
  time: number;            // minutes écoulées depuis le jour 1 à 00:00
  speed: number;           // 0 pause, 1..3
  map: { w: number; h: number };
  gate: { x: number; y: number };
  mapVersion: number;
  staffVer: number;
  rooms: Room[]; doors: Door[]; furn: Furn[]; walls: number[];
  inmates: Inmate[]; staff: Staff[]; candidates: Staff[];
  regime: Slot[];
  finance: Finance;
  sec: Security;
  incidents: Incident[];
  events: { active: ActiveEvent[]; history: EventRecord[]; cooldown: Record<string, number>; nextInspection: number; lastInspection: number };
  research: { done: string[]; active: string; progress: number };
  reputation: number;
  authority: number;
  rules: Rules;
  policies: Policies;
  career: { mission: number; grade: number; initialCapacity: number };
  outcome: '' | 'won' | 'lost';
  outcomeText: string;
  outcomeSeen: boolean;
  totals: { released: number; reinserted: number; deaths: number; arrivals: number };
  stats: StatRecord[];
  notes: Note[];
  pendingArrivals: number;
}
