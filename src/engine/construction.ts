// Construction : salles, portes, mobilier, murs. Chaque opération renvoie
// `null` en cas de succès ou un message d'erreur lisible par le joueur.
import { FURN, ROOMS } from './data';
import { canAfford, earn, spend } from './economy';
import { DIRS, SIDE_IDX, getRuntime, hasResearch } from './rooms';
import type { Door, Furn, FurnType, GameState, Room, RoomType, Side } from './types';

export const DOOR_COST = 80;
export const WALL_COST = 25;
export const REFUND = 0.3;

const touch = (s: GameState) => { s.mapVersion++; };
const inMap = (s: GameState, x: number, y: number) => x >= 0 && y >= 0 && x < s.map.w && y < s.map.h;

export const roomCost = (type: RoomType, w: number, h: number) => ROOMS[type].cost * w * h;

export function checkRoom(s: GameState, type: RoomType, x: number, y: number, w: number, h: number, ignoreId = 0): string | null {
  const def = ROOMS[type];
  if (def.research && !hasResearch(s, def.research)) return 'Recherche requise.';
  if (x < 1 || y < 1 || x + w > s.map.w - 1 || y + h > s.map.h - 1) return 'Hors du terrain.';
  if (Math.min(w, h) < Math.min(def.minW, def.minH) || Math.max(w, h) < Math.max(def.minW, def.minH)) return `Taille minimale : ${def.minW}×${def.minH}.`;
  const rt = getRuntime(s);
  const walls = new Set(s.walls);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = yy * s.map.w + xx;
    if (rt.roomAt[i] && rt.roomAt[i] !== ignoreId) return 'Emplacement déjà occupé par une salle.';
    if (walls.has(i)) return 'Un mur occupe cet emplacement.';
    if (xx === s.gate.x && yy === s.gate.y) return 'Le portail d\'entrée doit rester dégagé.';
    if (!rt.roomAt[i] && rt.furnAt.has(i)) return 'Un équipement occupe cet emplacement.';
  }
  return null;
}

export function buildRoom(s: GameState, type: RoomType, x: number, y: number, w: number, h: number, free = false): string | null {
  const err = checkRoom(s, type, x, y, w, h);
  if (err) return err;
  const cost = roomCost(type, w, h);
  if (!free) { if (!canAfford(s, cost)) return 'Fonds insuffisants.'; spend(s, 'construction', cost); }
  s.rooms.push({ id: s.nextId++, type, x, y, w, h });
  touch(s);
  return null;
}

const inRoom = (r: Room, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function pruneDoors(s: GameState) {
  touch(s);
  const rt = getRuntime(s);
  s.doors = s.doors.filter((d) => {
    const k = SIDE_IDX[d.side];
    const nx = d.x + DIRS[k][0], ny = d.y + DIRS[k][1];
    if (!inMap(s, nx, ny)) return false;
    const a = rt.roomAt[d.y * s.map.w + d.x], b = rt.roomAt[ny * s.map.w + nx];
    return a !== b;
  });
  touch(s);
}

export function demolishRoom(s: GameState, id: number): string | null {
  const r = s.rooms.find((x) => x.id === id);
  if (!r) return 'Salle introuvable.';
  let refund = roomCost(r.type, r.w, r.h) * REFUND;
  s.furn = s.furn.filter((f) => { if (inRoom(r, f.x, f.y)) { refund += FURN[f.type].cost * REFUND; return false; } return true; });
  s.rooms = s.rooms.filter((x) => x !== r);
  for (const i of s.inmates) { if (i.cell === id) i.cell = 0; if (i.tr === id) { i.tr = 0; i.at = true; i.until = 0; } }
  for (const st of s.staff) { if (st.room === id) st.room = 0; if (st.tr === id) { st.tr = 0; st.at = true; } }
  s.staffVer++;
  pruneDoors(s);
  earn(s, 'divers', refund);
  return null;
}

/** Agrandit (delta > 0) ou réduit (delta < 0) une salle d'une rangée sur le côté donné. */
export function resizeRoom(s: GameState, id: number, side: Side, delta: 1 | -1): string | null {
  const r = s.rooms.find((x) => x.id === id);
  if (!r) return 'Salle introuvable.';
  let { x, y, w, h } = r;
  if (side === 'N') { y -= delta; h += delta; } else if (side === 'S') h += delta; else if (side === 'W') { x -= delta; w += delta; } else w += delta;
  if (w < 1 || h < 1) return 'Salle trop petite.';
  const err = checkRoom(s, r.type, x, y, w, h, id);
  if (err) return err;
  const nr = { ...r, x, y, w, h };
  if (s.furn.some((f) => inRoom(r, f.x, f.y) && !inRoom(nr, f.x, f.y))) return 'Déplacez d\'abord le mobilier de la zone retirée.';
  const diff = roomCost(r.type, w, h) - roomCost(r.type, r.w, r.h);
  if (diff > 0) { if (!canAfford(s, diff)) return 'Fonds insuffisants.'; spend(s, 'construction', diff); } else earn(s, 'divers', -diff * REFUND);
  // Les portes de l'ancien pourtour suivent le mur déplacé quand c'est possible.
  for (const d of s.doors) {
    if (!inRoom(r, d.x, d.y) || d.side !== side) continue;
    if (side === 'N') d.y = y; else if (side === 'S') d.y = y + h - 1; else if (side === 'W') d.x = x; else d.x = x + w - 1;
  }
  r.x = x; r.y = y; r.w = w; r.h = h;
  pruneDoors(s);
  return null;
}

export function checkDoor(s: GameState, x: number, y: number, side: Side): string | null {
  if (!inMap(s, x, y)) return 'Hors du terrain.';
  const k = SIDE_IDX[side];
  const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
  if (!inMap(s, nx, ny)) return 'Hors du terrain.';
  const rt = getRuntime(s);
  const a = rt.roomAt[y * s.map.w + x], b = rt.roomAt[ny * s.map.w + nx];
  if (!a && !b) return 'Une porte se pose sur le mur d\'une salle.';
  if (a === b) return 'Une porte se pose sur un mur, pas à l\'intérieur.';
  if (s.walls.includes(ny * s.map.w + nx) || s.walls.includes(y * s.map.w + x)) return 'Un mur bloque ce passage.';
  if (findDoor(s, x, y, side)) return 'Il y a déjà une porte ici.';
  return null;
}
export function findDoor(s: GameState, x: number, y: number, side: Side): Door | undefined {
  const k = SIDE_IDX[side];
  const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
  const opp = (['N', 'E', 'S', 'W'] as Side[])[(k + 2) % 4];
  return s.doors.find((d) => (d.x === x && d.y === y && d.side === side) || (d.x === nx && d.y === ny && d.side === opp));
}
export function addDoor(s: GameState, x: number, y: number, side: Side, free = false): string | null {
  const err = checkDoor(s, x, y, side);
  if (err) return err;
  if (!free) { if (!canAfford(s, DOOR_COST)) return 'Fonds insuffisants.'; spend(s, 'construction', DOOR_COST); }
  s.doors.push({ x, y, side });
  touch(s);
  return null;
}
export function removeDoor(s: GameState, x: number, y: number, side: Side): string | null {
  const d = findDoor(s, x, y, side);
  if (!d) return 'Aucune porte ici.';
  s.doors = s.doors.filter((q) => q !== d);
  touch(s);
  return null;
}

export function checkFurn(s: GameState, type: FurnType, x: number, y: number, ignoreId = 0): string | null {
  if (!inMap(s, x, y)) return 'Hors du terrain.';
  const def = FURN[type];
  if (def.research && !hasResearch(s, def.research)) return 'Recherche requise.';
  const rt = getRuntime(s);
  const i = y * s.map.w + x;
  const other = rt.furnAt.get(i);
  if (other && other.id !== ignoreId) return 'Case déjà occupée.';
  if (s.walls.includes(i)) return 'Un mur occupe cette case.';
  if (x === s.gate.x && y === s.gate.y) return 'Le portail doit rester dégagé.';
  const rid = rt.roomAt[i];
  if (def.anywhere) return null;
  if (!rid) return 'Ce mobilier se place dans une salle.';
  const room = rt.rooms.get(rid)!;
  if (!ROOMS[room.type].furn.includes(type)) return `Non adapté à : ${ROOMS[room.type].name}.`;
  return null;
}
export function addFurn(s: GameState, type: FurnType, x: number, y: number, free = false): string | null {
  const err = checkFurn(s, type, x, y);
  if (err) return err;
  const cost = FURN[type].cost;
  if (!free) { if (!canAfford(s, cost)) return 'Fonds insuffisants.'; spend(s, 'equipements', cost); }
  s.furn.push({ id: s.nextId++, type, x, y });
  touch(s);
  return null;
}
export function moveFurn(s: GameState, id: number, x: number, y: number): string | null {
  const f = s.furn.find((q) => q.id === id);
  if (!f) return 'Équipement introuvable.';
  const err = checkFurn(s, f.type, x, y, id);
  if (err) return err;
  f.x = x; f.y = y;
  touch(s);
  return null;
}
export function removeFurn(s: GameState, id: number): string | null {
  const f = s.furn.find((q) => q.id === id);
  if (!f) return 'Équipement introuvable.';
  s.furn = s.furn.filter((q) => q !== f);
  earn(s, 'divers', FURN[f.type].cost * REFUND * (f.broken ? 0.3 : 1));
  touch(s);
  return null;
}
export const repairCost = (f: Furn) => Math.round(FURN[f.type].cost * 0.4);
export function repairFurn(s: GameState, id: number): string | null {
  const f = s.furn.find((q) => q.id === id);
  if (!f || !f.broken) return 'Rien à réparer.';
  if (!canAfford(s, repairCost(f))) return 'Fonds insuffisants.';
  spend(s, 'entretien', repairCost(f));
  f.broken = false;
  touch(s);
  return null;
}
export const ROOM_REPAIR = 450;
export function repairRoom(s: GameState, id: number): string | null {
  const r = s.rooms.find((q) => q.id === id);
  if (!r || !r.broken) return 'Rien à réparer.';
  if (!canAfford(s, ROOM_REPAIR)) return 'Fonds insuffisants.';
  spend(s, 'entretien', ROOM_REPAIR);
  r.broken = false;
  touch(s);
  return null;
}

export function checkWall(s: GameState, x: number, y: number): string | null {
  if (!inMap(s, x, y)) return 'Hors du terrain.';
  const rt = getRuntime(s);
  const i = y * s.map.w + x;
  if (rt.roomAt[i]) return 'Les salles ont déjà leurs murs.';
  if (s.walls.includes(i)) return 'Il y a déjà un mur.';
  if (rt.furnAt.has(i)) return 'Case occupée.';
  if (x === s.gate.x && y === s.gate.y) return 'Le portail doit rester dégagé.';
  return null;
}
export function addWall(s: GameState, x: number, y: number, free = false): string | null {
  const err = checkWall(s, x, y);
  if (err) return err;
  if (!free) { if (!canAfford(s, WALL_COST)) return 'Fonds insuffisants.'; spend(s, 'construction', WALL_COST); }
  s.walls.push(y * s.map.w + x);
  touch(s);
  return null;
}
export function removeWall(s: GameState, x: number, y: number): string | null {
  const i = y * s.map.w + x;
  if (!s.walls.includes(i)) return 'Aucun mur ici.';
  s.walls = s.walls.filter((q) => q !== i);
  touch(s);
  return null;
}

/** Meuble automatiquement une salle (établissements préconstruits et bouton « Équiper »). */
export function autoFurnish(s: GameState, room: Room, free = true): number {
  const def = ROOMS[room.type];
  const rt = getRuntime(s);
  const taken = new Set<number>(s.doors.map((d) => d.y * s.map.w + d.x));
  let spent = 0;
  for (const [type, count] of def.auto(room.w * room.h)) {
    let need = count - (rt.furnByRoom.get(room.id) ?? []).filter((f) => f.type === type).length;
    for (let y = room.y; y < room.y + room.h && need > 0; y++) for (let x = room.x; x < room.x + room.w && need > 0; x++) {
      const i = y * s.map.w + x;
      if (taken.has(i) || rt.furnAt.has(i)) continue;
      const cost = FURN[type].cost;
      if (!free) { if (!canAfford(s, cost)) { touch(s); return spent; } spend(s, 'equipements', cost); }
      s.furn.push({ id: s.nextId++, type, x, y });
      taken.add(i); need--; spent += cost;
    }
  }
  touch(s);
  return spent;
}
export function autoFurnishCost(s: GameState, room: Room): number {
  const rt = getRuntime(s);
  let c = 0;
  for (const [type, count] of ROOMS[room.type].auto(room.w * room.h)) c += Math.max(0, count - (rt.furnByRoom.get(room.id) ?? []).filter((f) => f.type === type).length) * FURN[type].cost;
  return c;
}
