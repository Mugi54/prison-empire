// Sauvegardes locales dans IndexedDB : plusieurs emplacements, sauvegarde automatique,
// et migration des anciennes versions de sauvegarde.
import { SAVE_VERSION } from '../engine/setup';
import type { GameState } from '../engine/types';

const DB_NAME = 'prison-empire';
const STORE = 'saves';
export const AUTO_SLOT = 'auto';
export const MANUAL_SLOTS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'];

export interface SaveMeta { slot: string; title: string; mode: string; savedAt: number; version: number; day: number; inmates: number; balance: number }
interface SaveRecord extends SaveMeta { data: GameState }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB est indisponible dans ce navigateur.'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'slot' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Ouverture de la base impossible.'));
  });
}
function run<T>(mode: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Erreur de sauvegarde.')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Sauvegarde interrompue.')); };
  }));
}

/** Met une sauvegarde au format courant. Chaque entrée fait passer de la version n à n+1. */
const MIGRATIONS: Record<number, (d: any) => void> = {
  1: (d) => { // v1 → v2 : moyenne de couverture quotidienne, file des refus
    d.sec.covAcc ??= 0; d.sec.covCnt ??= 0; d.sec.pendingRefusals ??= [];
  },
};
export function migrate(raw: any): GameState {
  if (!raw || typeof raw !== 'object' || typeof raw.version !== 'number' || !Array.isArray(raw.inmates) || !raw.finance) throw new Error('Sauvegarde illisible ou corrompue.');
  if (raw.version > SAVE_VERSION) throw new Error('Cette sauvegarde provient d\'une version plus récente du jeu.');
  const d = JSON.parse(JSON.stringify(raw));
  while (d.version < SAVE_VERSION) {
    const m = MIGRATIONS[d.version];
    if (!m) throw new Error(`Aucune migration disponible depuis la version ${d.version}.`);
    m(d);
    d.version++;
  }
  return d as GameState;
}

export async function saveGame(slot: string, s: GameState): Promise<SaveMeta> {
  const data: GameState = JSON.parse(JSON.stringify(s));
  const meta: SaveMeta = { slot, title: s.title, mode: s.mode, savedAt: Date.now(), version: s.version, day: Math.floor(s.time / 1440) + 1, inmates: s.inmates.length, balance: Math.round(s.finance.balance) };
  await run('readwrite', (st) => st.put({ ...meta, data } as SaveRecord));
  return meta;
}
export async function loadGame(slot: string): Promise<GameState> {
  const rec = await run<SaveRecord | undefined>('readonly', (st) => st.get(slot));
  if (!rec) throw new Error('Emplacement de sauvegarde vide.');
  return migrate(rec.data);
}
export async function listSaves(): Promise<SaveMeta[]> {
  const all = await run<SaveRecord[]>('readonly', (st) => st.getAll());
  return all.map(({ data: _d, ...meta }) => meta).sort((a, b) => b.savedAt - a.savedAt);
}
export async function deleteSave(slot: string): Promise<void> {
  await run('readwrite', (st) => st.delete(slot));
}
