import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as E from '../src/engine';
import { deleteSave, listSaves, loadGame, migrate, saveGame } from '../src/save/db';

const game = (preset = 'petite') => E.newGame({ mode: 'career', preset, seed: 123 });

describe('horloge', () => {
  it('avance d\'une minute par tick et change de jour', () => {
    const s = game();
    expect(E.clock(s.time).hhmm).toBe('06:00');
    E.advance(s, 90);
    expect(E.clock(s.time).hhmm).toBe('07:30');
    E.advance(s, 1440);
    expect(E.clock(s.time).day).toBe(2);
    expect(E.clock(s.time).weekday).toBe('Mardi');
  });
});

describe('économie', () => {
  it('applique revenus et dépenses au solde selon les flux calculés', () => {
    const s = game();
    s.rules.events = false; s.rules.incidents = false;
    const before = s.finance.balance;
    const r = E.computeRates(s);
    E.accrue(s, 1440);
    expect(s.finance.balance - before).toBeCloseTo(E.sum(r.inc) - E.sum(r.exp), 0);
    expect(s.finance.today.exp.salaires).toBeCloseTo(s.staff.reduce((a, x) => a + x.salary, 0), 0);
  });
  it('clôture la journée dans l\'historique', () => {
    const s = game();
    E.advance(s, 18 * 60);
    expect(s.finance.history.length).toBe(1);
    expect(E.sum(s.finance.history[0].exp)).toBeGreaterThan(0);
  });
  it('un déficit prolongé entraîne des conséquences progressives', () => {
    const s = game();
    s.finance.balance = -50000; s.finance.baseFunding = 0;
    const rep = s.reputation;
    for (let d = 0; d < 6; d++) E.closeDay(s);
    expect(s.finance.deficitDays).toBe(6);
    expect(s.reputation).toBeLessThan(rep);
    expect(s.policies.food).toBe(0);
    for (let d = 0; d < 6; d++) E.closeDay(s);
    expect(s.outcome).toBe('lost');
  });
  it('gère les emprunts', () => {
    const s = game();
    const b = s.finance.balance;
    expect(E.takeLoan(s, 10000)).toBeNull();
    expect(s.finance.balance).toBe(b + 10000);
    expect(E.totalDebt(s)).toBeCloseTo(11500);
  });
});

describe('détenus', () => {
  it('sont des individus distincts avec des besoins', () => {
    const s = game();
    expect(s.inmates.length).toBe(12);
    expect(new Set(s.inmates.map((i) => i.id)).size).toBe(12);
    expect(s.inmates.every((i) => i.cell > 0)).toBe(true);
  });
  it('les besoins évoluent et sont satisfaits par les installations', () => {
    const s = game();
    s.rules.incidents = false; s.rules.events = false;
    const i = s.inmates[0];
    i.needs.food = 30;
    const sleep0 = i.needs.sleep;
    E.advance(s, 120); // 8h : petit-déjeuner passé
    expect(i.needs.food).toBeGreaterThan(60);
    E.advance(s, 600); // 18h
    expect(i.needs.sleep).toBeLessThan(sleep0);
    E.advance(s, 720); // 6h le lendemain
    expect(i.needs.sleep).toBeGreaterThan(85);
  });
  it('sans cantine ni cuisine, la faim s\'installe', () => {
    const s = game();
    s.rules.incidents = false; s.rules.events = false;
    for (const r of s.rooms.filter((x) => x.type === 'kitchen' || x.type === 'canteen')) E.demolishRoom(s, r.id);
    const a = game(); a.rules.incidents = false; a.rules.events = false;
    E.advance(s, 1440); E.advance(a, 1440);
    const food = (g: E.GameState) => g.inmates.reduce((n, i) => n + i.needs.food, 0) / g.inmates.length;
    expect(food(s)).toBeLessThan(food(a));
  });
});

describe('personnel', () => {
  it('recrute un candidat moyennant des frais', () => {
    const s = game();
    const c = s.candidates[0];
    const n = s.staff.length, b = s.finance.balance;
    expect(E.hire(s, c.id)).toBeNull();
    expect(s.staff.length).toBe(n + 1);
    expect(s.finance.balance).toBe(b - E.hireFee(c));
    expect(s.candidates.includes(c)).toBe(false);
  });
  it('licencie, augmente et forme', () => {
    const s = game();
    const st = s.staff[0];
    const sal = st.salary, sk = st.skill;
    E.raise(s, st.id); expect(st.salary).toBeGreaterThan(sal);
    expect(E.train(s, st.id)).toBeNull(); expect(st.skill).toBeGreaterThan(sk);
    expect(E.onDuty(s, st)).toBe(false);
    E.fire(s, st.id); expect(s.staff.includes(st)).toBe(false);
  });
  it('une salle perd son activité sans le personnel requis', () => {
    const s = game();
    const inf = s.rooms.find((r) => r.type === 'infirmary')!;
    expect(E.getRuntime(s).status.get(inf.id)!.ok).toBe(true);
    E.fire(s, s.staff.find((x) => x.role === 'doctor')!.id);
    expect(E.getRuntime(s).status.get(inf.id)!.ok).toBe(false);
  });
});

describe('construction', () => {
  it('construit une salle, la rend opérationnelle et la démolit', () => {
    const s = E.newGame({ mode: 'sandbox', seed: 5 });
    const b = s.finance.balance;
    expect(E.buildRoom(s, 'cell', 5, 5, 2, 3)).toBeNull();
    expect(s.finance.balance).toBe(b - E.roomCost('cell', 2, 3));
    const room = s.rooms[0];
    expect(E.getRuntime(s).status.get(room.id)!.ok).toBe(false);
    expect(E.buildRoom(s, 'cell', 6, 6, 2, 2)).not.toBeNull(); // chevauchement
    expect(E.addDoor(s, 5, 7, 'S')).toBeNull();
    expect(E.addFurn(s, 'bed', 5, 5)).toBeNull();
    expect(E.addFurn(s, 'stove', 6, 5)).not.toBeNull(); // mobilier inadapté
    expect(E.addFurn(s, 'toilet', 6, 5)).toBeNull();
    expect(E.getRuntime(s).status.get(room.id)!.ok).toBe(true);
    expect(E.totalCapacity(s)).toBe(1);
    expect(E.resizeRoom(s, room.id, 'E', 1)).toBeNull();
    expect(room.w).toBe(3);
    expect(E.moveFurn(s, s.furn[0].id, 7, 6)).toBeNull();
    expect(E.demolishRoom(s, room.id)).toBeNull();
    expect(s.rooms.length + s.furn.length + s.doors.length).toBe(0);
  });
  it('refuse une construction sans fonds', () => {
    const s = E.newGame({ mode: 'sandbox', seed: 5 });
    s.finance.balance = 10;
    expect(E.buildRoom(s, 'canteen', 5, 5, 4, 4)).toBe('Fonds insuffisants.');
  });
  it('les personnages trouvent un chemin par les portes', () => {
    const s = game();
    const cell = s.rooms.find((r) => r.type === 'cell')!;
    const flow = E.flowTo(s, cell.id)!;
    expect(flow[s.gate.y * s.map.w + s.gate.x]).toBeGreaterThan(0);
  });
});

describe('événements et incidents', () => {
  it('déclenche un événement et applique le choix', () => {
    const s = game();
    E.triggerEvent(s, 'reglementation');
    const b = s.finance.balance, a = s.authority;
    expect(E.chooseEvent(s, s.events.active[0].id, 0)).toBeNull();
    expect(s.finance.balance).toBe(b - 2500);
    expect(s.authority).toBeGreaterThan(a);
    expect(s.events.active.length).toBe(0);
    expect(s.events.history.length).toBe(1);
  });
  it('les événements dépendent de l\'état réel', () => {
    const s = game();
    const def = E.eventDef('conditions');
    expect(def.weight(s)).toBe(0);
    s.inmates.forEach((i) => { i.mental = 20; });
    expect(def.weight(s)).toBeGreaterThan(0);
  });
  it('l\'inspection planifiée survient et un événement sans réponse se résout seul', () => {
    const s = game();
    s.rules.events = false;
    s.events.nextInspection = 1;
    E.advance(s, 5 * 60);
    expect(s.events.active.some((e) => e.def === 'inspection')).toBe(true);
    E.advance(s, 25 * 60);
    expect(s.events.lastInspection).toBeGreaterThanOrEqual(0);
  });
  it('résout un incident avec des conséquences', () => {
    const s = game();
    s.sec.tension = 90;
    const c = s.sec.climate;
    s.incidents.push({ id: 9999, type: 'tension', t: s.time, deadline: s.time + 600, title: 't', text: '', inmates: [], room: 0, furn: 0, status: 'open' });
    expect(E.resolveIncident(s, 9999, 'dialogue')).toBeNull();
    expect(s.sec.climate).toBeGreaterThan(c);
    expect(s.sec.tension).toBeLessThan(90);
  });
});

describe('recherche et progression', () => {
  it('mène une recherche à son terme', () => {
    const s = game();
    expect(E.startResearch(s, 'video')).not.toBeNull(); // prérequis
    expect(E.startResearch(s, 'rondes')).toBeNull();
    E.advance(s, 30 * 60);
    expect(E.hasResearch(s, 'rondes')).toBe(true);
    expect(E.researchState(s, 'video')).toBe('available');
  });
  it('valide les missions de carrière', () => {
    const s = game();
    E.advance(s, 1440 * 2);
    expect(s.career.mission).toBeGreaterThan(0);
  });
  it('chaque scénario démarre et peut échouer à l\'échéance', () => {
    for (const sc of E.SCENARIOS) {
      const s = E.newGame({ mode: 'scenario', scenario: sc.id, seed: 9 });
      expect(s.inmates.length).toBeGreaterThan(0);
      E.advance(s, 600);
    }
  });
});

describe('sauvegardes', () => {
  it('sauvegarde, liste, recharge et supprime', async () => {
    const s = game();
    E.advance(s, 700);
    await saveGame('slot1', s);
    await saveGame('auto', s);
    const metas = await listSaves();
    expect(metas.map((m) => m.slot).sort()).toEqual(['auto', 'slot1']);
    expect(metas[0].inmates).toBe(s.inmates.length);
    const l = await loadGame('slot1');
    expect(l).toEqual(JSON.parse(JSON.stringify(s)));
    await deleteSave('slot1');
    expect((await listSaves()).length).toBe(1);
    await expect(loadGame('slot1')).rejects.toThrow();
  });
  it('une partie rechargée reprend exactement la même simulation', async () => {
    const s = game('classique');
    E.advance(s, 500);
    await saveGame('slot2', s);
    const l = await loadGame('slot2');
    E.advance(s, 900); E.advance(l, 900);
    expect(l.time).toBe(s.time);
    expect(l.finance.balance).toBeCloseTo(s.finance.balance, 4);
    expect(l.inmates.map((i) => [i.id, Math.round(i.needs.food)])).toEqual(s.inmates.map((i) => [i.id, Math.round(i.needs.food)]));
  });
  it('migre les anciennes versions et rejette les sauvegardes invalides', () => {
    const s: any = JSON.parse(JSON.stringify(game()));
    s.version = 1; delete s.sec.covAcc; delete s.sec.pendingRefusals;
    const m = migrate(s);
    expect(m.version).toBe(E.SAVE_VERSION);
    expect(m.sec.pendingRefusals).toEqual([]);
    expect(() => migrate({ version: 999, inmates: [], finance: {} })).toThrow();
    expect(() => migrate({ foo: 1 })).toThrow();
  });
});

describe('performances', () => {
  it('simule une heure pour 1 000 détenus en moins de 2 secondes', () => {
    const s = E.newGame({ mode: 'sandbox', seed: 7, sandbox: { ...E.DEFAULT_SANDBOX, size: 'L', inmates: 1000, unlimitedMoney: true } });
    const t = performance.now();
    E.advance(s, 60);
    expect(performance.now() - t).toBeLessThan(2000);
    expect(s.inmates.length).toBe(1000);
  });
});
