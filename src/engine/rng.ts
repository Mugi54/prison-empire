import type { GameState } from './types';

/** Générateur pseudo-aléatoire déterministe (mulberry32) dont l'état vit dans la sauvegarde. */
export function rnd(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rint = (s: { rng: number }, a: number, b: number) => a + Math.floor(rnd(s) * (b - a + 1));
export const pick = <T>(s: { rng: number }, arr: readonly T[]): T => arr[Math.floor(rnd(s) * arr.length)];
export const chance = (s: { rng: number }, p: number) => rnd(s) < p;
export const clamp = (v: number, a = 0, b = 100) => (v < a ? a : v > b ? b : v);

export function note(s: GameState, kind: 'info' | 'good' | 'warn' | 'bad', m: string) {
  s.notes.push({ id: s.nextId++, t: s.time, kind, m });
  if (s.notes.length > 120) s.notes.splice(0, s.notes.length - 120);
}
