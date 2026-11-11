// Contrôleur : relie le moteur (pur), la boucle temps réel, les sauvegardes et React.
import { useSyncExternalStore } from 'react';
import { MINUTES_PER_SECOND, tick } from '../engine/simulation';
import type { FurnType, GameState, RoomType } from '../engine/types';
import type { Camera } from '../render/renderer';
import { toWorld } from '../render/renderer';
import { AUTO_SLOT, loadGame, saveGame } from '../save/db';

export type Tool =
  | { kind: 'none' } | { kind: 'room'; type: RoomType } | { kind: 'furn'; type: FurnType }
  | { kind: 'door' } | { kind: 'wall' } | { kind: 'erase' } | { kind: 'move'; id: number };
export type Selection = { kind: 'inmate' | 'staff' | 'room' | 'furn'; id: number } | null;
export interface Toast { id: number; kind: string; m: string; until: number }

class Controller {
  state: GameState | null = null;
  ver = 0;
  tool: Tool = { kind: 'none' };
  sel: Selection = null;
  panel = '';
  toasts: Toast[] = [];
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  alpha = 0;
  follow = false;
  lastSave = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private acc = 0;
  private last = 0;
  private lastBump = 0;
  private lastNote = 0;
  private lastDay = 0;
  private toastId = 1;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.ver;
  bump = () => { this.ver++; this.listeners.forEach((f) => f()); };

  start(s: GameState) {
    this.stop();
    this.state = s;
    this.tool = { kind: 'none' }; this.sel = null; this.panel = 'overview'; this.toasts = [];
    this.lastNote = s.notes.length ? s.notes[s.notes.length - 1].id : 0;
    this.lastDay = Math.floor(s.time / 1440);
    this.centerCamera();
    this.acc = 0; this.last = performance.now();
    this.timer = setInterval(this.frame, 40);
    this.bump();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.state = null;
    this.bump();
  }
  centerCamera() {
    const s = this.state;
    if (!s) return;
    let x0 = s.map.w / 2, y0 = s.map.h / 2;
    if (s.rooms.length) {
      const xs = s.rooms.map((r) => r.x + r.w / 2), ys = s.rooms.map((r) => r.y + r.h / 2);
      x0 = (Math.min(...xs) + Math.max(...xs)) / 2; y0 = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    const [wx, wy] = toWorld(x0, y0);
    this.cam = { x: wx, y: wy, zoom: 0.85 };
  }

  /** Boucle de simulation : indépendante de l'affichage et des menus ouverts. */
  private frame = () => {
    const s = this.state;
    if (!s) return;
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (s.speed > 0 && !(s.outcome && !s.outcomeSeen)) {
      this.acc += dt * MINUTES_PER_SECOND * s.speed;
      let steps = Math.floor(this.acc);
      this.acc -= steps;
      if (steps > 40) steps = 40; // garde-fou si l'onglet a été ralenti
      try { for (let k = 0; k < steps; k++) tick(s); }
      catch (e) { console.error(e); s.speed = 0; this.toast('bad', 'Erreur de simulation : le jeu a été mis en pause. ' + (e as Error).message); }
      this.alpha = this.acc;
      const d = Math.floor(s.time / 1440);
      if (d !== this.lastDay) { this.lastDay = d; void this.save(AUTO_SLOT, true); }
    } else this.alpha = 1;
    for (const n of s.notes) {
      if (n.id <= this.lastNote) continue;
      this.lastNote = n.id;
      if (n.kind !== 'info') this.toast(n.kind, n.m, false);
    }
    const before = this.toasts.length;
    this.toasts = this.toasts.filter((t) => t.until > now);
    if (now - this.lastBump > 250 || before !== this.toasts.length) { this.lastBump = now; this.bump(); }
  };

  toast(kind: string, m: string, bump = true) {
    this.toasts = [...this.toasts.slice(-3), { id: this.toastId++, kind, m, until: performance.now() + 6000 }];
    if (bump) this.bump();
  }

  /** Exécute une action de jeu ; affiche l'erreur éventuelle renvoyée par le moteur. */
  act(fn: (s: GameState) => string | null | void, okMsg?: string): boolean {
    const s = this.state;
    if (!s) return false;
    let err: string | null | void;
    try { err = fn(s); } catch (e) { console.error(e); err = 'Action impossible : ' + (e as Error).message; }
    if (err) this.toast('bad', err, false); else if (okMsg) this.toast('good', okMsg, false);
    this.bump();
    return !err;
  }

  setTool(t: Tool) { this.tool = t; this.bump(); }
  select(sel: Selection) { this.sel = sel; this.follow = false; this.bump(); }
  setPanel(p: string) { this.panel = this.panel === p ? '' : p; if (this.panel !== 'build') this.tool = { kind: 'none' }; this.bump(); }
  setSpeed(v: number) { if (this.state) { this.state.speed = v; this.bump(); } }

  focusTile(x: number, y: number) { const [wx, wy] = toWorld(x, y); this.cam.x = wx; this.cam.y = wy; if (this.cam.zoom < 0.9) this.cam.zoom = 1; }

  async save(slot: string, silent = false) {
    const s = this.state;
    if (!s) return;
    try {
      await saveGame(slot, s);
      this.lastSave = Date.now();
      if (!silent) this.toast('good', 'Partie sauvegardée.');
    } catch (e) { this.toast('bad', 'Échec de la sauvegarde : ' + (e as Error).message); }
  }
  async load(slot: string) {
    try { this.start(await loadGame(slot)); return true; }
    catch (e) { this.toast('bad', 'Chargement impossible : ' + (e as Error).message); return false; }
  }
}

export const ctl = new Controller();
export function useCtl() { useSyncExternalStore(ctl.subscribe, ctl.snapshot); return ctl; }

if (typeof window !== 'undefined') {
  // Sauvegarde automatique quand l'onglet est masqué ou fermé.
  document.addEventListener('visibilitychange', () => { if (document.hidden && ctl.state) void ctl.save(AUTO_SLOT, true); });
  (window as any).__ctl = ctl;
  (window as any).__tick = tick; // accès console pour le débogage et les tests de bout en bout
}
