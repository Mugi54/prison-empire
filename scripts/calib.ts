import { newGame, advance, PRESETS, computeRates, sum, totalCapacity, avgMental, avgNeedsAll, getRuntime, unhoused, NEED_KEYS } from '../src/engine';
for (const p of PRESETS) {
  const s = newGame({ mode: 'career', preset: p.id, seed: 42 });
  const rt = getRuntime(s);
  const bad = s.rooms.filter(r => !rt.status.get(r.id)?.ok).map(r => r.type + ':' + rt.status.get(r.id)?.problems.join('|'));
  const r0 = computeRates(s);
  console.log(`\n== ${p.id} map ${s.map.w}x${s.map.h} rooms ${s.rooms.length} cap ${totalCapacity(s)} inm ${s.inmates.length} unhoused ${unhoused(s)} bad:`, bad.slice(0,5));
  console.log(' rates inc', Math.round(sum(r0.inc)), 'exp', Math.round(sum(r0.exp)));
  const t0 = performance.now();
  for (let d = 0; d < 10; d++) {
    advance(s, 1440);
    const needs = NEED_KEYS.map(k => Math.round(s.inmates.reduce((a,i)=>a+i.needs[k],0)/Math.max(1,s.inmates.length)));
    if (d % 3 === 0 || d === 9) console.log(` d${d+1} bal ${Math.round(s.finance.balance)} inm ${s.inmates.length} mental ${Math.round(avgMental(s))} needs ${needs.join(',')} tens ${Math.round(s.sec.tension)} cov ${Math.round(s.stats[s.stats.length-1].coverage)} rep ${Math.round(s.reputation)} inc ${s.sec.incidentLog.length} staffSat ${Math.round(s.stats[s.stats.length-1].staffSat)} ev ${s.events.history.length}`);
  }
  console.log(' ms/day', Math.round((performance.now() - t0) / 10));
}
// perf 1000
const s = newGame({ mode: 'sandbox', seed: 7, sandbox: { budget: 1e6, size: 'L', inmates: 1000, difficulty: 1, funding: 1, events: true, eventFreq: 1, incidents: true, bankruptcy: false, intake: false, unlimitedMoney: true } });
const t0 = performance.now(); advance(s, 1440);
console.log('\n1000 inmates: ms/day', Math.round(performance.now() - t0), 'map', s.map, 'unhoused', unhoused(s), 'mental', Math.round(avgMental(s)));
