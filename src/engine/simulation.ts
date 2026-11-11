// Boucle de simulation : un « tick » = une minute de jeu. Totalement indépendante de l'interface.
import { MONTHS, WEEKDAYS } from './data';
import { accrue, closeDay } from './economy';
import { hourlyEvents } from './events';
import { WALK_SPEED, assignCells, dailyInmates, moveAgent, processArrivals, updateInmate } from './inmates';
import { dailyProgress } from './progression';
import { researchProgress } from './research';
import { getRuntime, refreshActive } from './rooms';
import { dailySecurity, hourlySecurity, securityPass } from './security';
import { autoAssign, dailyStaff, moveStaff, updateStaff } from './staff';
import type { GameState } from './types';

/** Minutes de jeu écoulées par seconde réelle à la vitesse ×1. */
export const MINUTES_PER_SECOND = 3;

export function tick(s: GameState) {
  s.time += 1;
  const m = s.time;
  const rt = getRuntime(s);
  if (m % 5 === 0) refreshActive(s, rt);

  // Déplacements : à chaque minute (peu coûteux). Besoins et décisions : par cinquième
  // de la population à chaque minute, pour lisser la charge jusqu'à 1 000 détenus.
  const inmates = s.inmates;
  for (let k = 0; k < inmates.length; k++) {
    const i = inmates[k];
    moveAgent(s, rt, i, WALK_SPEED);
    if ((i.id + m) % 5 === 0) updateInmate(s, i, 5);
  }
  moveStaff(s);

  if (m % 10 === 0) { updateStaff(s, 10); securityPass(s); s.sec.covAcc += s.sec.coverage; s.sec.covCnt++; }
  if (m % 60 === 0) {
    accrue(s, 60);
    researchProgress(s, 60);
    hourlySecurity(s);
    hourlyEvents(s);
    assignCells(s);
    autoAssign(s);
    if ((m % 1440) / 60 === 9) processArrivals(s);
  }
  if (m % 1440 === 0) {
    closeDay(s);
    dailyInmates(s);
    dailyStaff(s);
    dailyProgress(s);
    dailySecurity(s);
  }
}

export function advance(s: GameState, minutes: number) {
  for (let k = 0; k < minutes; k++) tick(s);
}

// ───────────── Horloge et calendrier ─────────────
export interface Clock { day: number; hour: number; minute: number; weekday: string; date: string; period: string; hhmm: string }
export function clock(time: number): Clock {
  const d = Math.floor(time / 1440);
  const hour = Math.floor((time % 1440) / 60), minute = time % 60;
  const month = Math.floor(d / 30) % 12, year = Math.floor(d / 360) + 1;
  const period = hour < 6 ? 'Nuit' : hour < 12 ? 'Matinée' : hour < 14 ? 'Mi-journée' : hour < 18 ? 'Après-midi' : hour < 22 ? 'Soirée' : 'Nuit';
  return {
    day: d + 1, hour, minute, weekday: WEEKDAYS[d % 7], period,
    date: `${WEEKDAYS[d % 7]} ${(d % 30) + 1} ${MONTHS[month]}, an ${year}`,
    hhmm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}
