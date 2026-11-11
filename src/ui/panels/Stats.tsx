// Statistiques : courbes historiques alimentées par la clôture quotidienne.
import * as E from '../../engine';
import { LineChart, Section } from '../common';
import { ctl } from '../controller';

export function StatsPanel() {
  const s = ctl.state!;
  const st = s.stats.slice(-60);
  const days = st.map((x) => x.day);
  const col = (k: keyof E.StatRecord) => st.map((x) => x[k] as number);
  const pers = E.PERSONALITIES.map((p) => [E.PERSONALITY[p].name, s.inmates.filter((i) => i.personality === p).length] as const);
  const maxP = Math.max(1, ...pers.map((p) => p[1]));
  const needs = E.NEED_KEYS.map((k) => [E.NEED_LABEL[k], s.inmates.length ? s.inmates.reduce((a, i) => a + i.needs[k], 0) / s.inmates.length : 0] as const);
  return (
    <>
      <div className="two">
        <Section title="Population et capacité"><LineChart series={[{ name: 'Détenus', color: '#f2a33a', data: col('inmates') }, { name: 'Capacité', color: '#7fb4ff', data: col('capacity') }]} labels={days} /></Section>
        <Section title="Bien-être des détenus"><LineChart series={[{ name: 'État psychologique', color: '#4fd39a', data: col('mental') }, { name: 'Besoins', color: '#c79bf2', data: col('needs') }]} labels={days} unit="%" /></Section>
        <Section title="Sécurité"><LineChart series={[{ name: 'Tension', color: '#ef6a5b', data: col('tension') }, { name: 'Couverture moyenne', color: '#7fb4ff', data: col('coverage') }]} labels={days} unit="%" /></Section>
        <Section title="Incidents par jour"><LineChart series={[{ name: 'Incidents', color: '#ef6a5b', data: col('incidents') }]} labels={days} /></Section>
        <Section title="Réputation et autorités"><LineChart series={[{ name: 'Réputation', color: '#f2a33a', data: col('reputation') }, { name: 'Autorités', color: '#3fc1b0', data: col('authority') }]} labels={days} /></Section>
        <Section title="Réinsertion et personnel"><LineChart series={[{ name: 'Niveau de réinsertion', color: '#c79bf2', data: col('reinsertion') }, { name: 'Satisfaction du personnel', color: '#4fd39a', data: col('staffSat') }]} labels={days} unit="%" /></Section>
      </div>
      <div className="two">
        <Section title="Besoins moyens (instantané)">
          {needs.map(([l, v]) => <div key={l} className="flow"><span>{l}</span><div className="flow-bar"><i style={{ width: `${v}%`, background: v >= 60 ? 'var(--good)' : v >= 35 ? 'var(--warn)' : 'var(--bad)' }} /></div><b>{Math.round(v)} %</b></div>)}
        </Section>
        <Section title="Personnalités des détenus">
          {pers.map(([l, v]) => <div key={l} className="flow"><span>{l}</span><div className="flow-bar"><i style={{ width: `${(v / maxP) * 100}%`, background: 'var(--accent)' }} /></div><b>{v}</b></div>)}
        </Section>
      </div>
    </>
  );
}
