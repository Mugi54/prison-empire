// Vue générale : objectifs, indicateurs clés, alertes et règles de gestion.
import * as E from '../../engine';
import { Icon, Meter, Section, money } from '../common';
import { ctl } from '../controller';
import { computeAlerts } from '../alerts';

const MODE: Record<string, string> = { career: 'Carrière', scenario: 'Scénario', sandbox: 'Bac à sable' };

export function OverviewPanel() {
  const s = ctl.state!;
  const alerts = computeAlerts(s);
  const sc = E.scenarioDef(s.scenario);
  const mission = E.MISSIONS[s.career.mission];
  const cap = E.totalCapacity(s);
  return (
    <>
      <div className="hero">
        <small>{MODE[s.mode]}{s.mode === 'career' ? ` · Catégorie ${s.career.grade + 1}` : ''}</small>
        <h3>{s.title}</h3>
        <p>Jour {E.day(s)} · {s.inmates.length} détenus pour {cap} places · {s.staff.length} employés · {s.rooms.length} salles</p>
      </div>

      {s.mode === 'career' && (
        <Section title="Missions de carrière" right={<span className="tag">{s.career.mission}/{E.MISSIONS.length}</span>}>
          {mission ? (
            <div className="mission current"><Icon name="target" /><div><b>{mission.title}</b><p>{mission.desc}</p><em>{mission.progress(s)}</em><small>Récompense : {mission.rewardText}</small></div></div>
          ) : <div className="mission done"><Icon name="trophy" /><div><b>Carrière accomplie</b><p>Toutes les missions sont remplies.</p></div></div>}
          <div className="mission-list">{E.MISSIONS.map((m, k) => <span key={m.title} className={k < s.career.mission ? 'done' : k === s.career.mission ? 'cur' : ''} title={m.desc}>{k < s.career.mission ? '✓ ' : ''}{m.title}</span>)}</div>
          <p className="muted">Chaque nouvelle catégorie augmente la dotation publique de 8 %, le flux d'arrivées et donne accès à de nouveaux contrats.</p>
        </Section>
      )}
      {sc && (
        <Section title="Objectifs du scénario" right={<span className="tag">Jour {Math.min(E.day(s), sc.days)}/{sc.days}</span>}>
          <p className="muted">{sc.desc}</p>
          {sc.goals.map((g) => <div key={g.label} className={'goal' + (g.check(s) ? ' ok' : '')}><Icon name={g.check(s) ? 'check' : 'target'} size={16} /><span>{g.label}</span><b>{g.value(s)}</b></div>)}
          <p className="muted">Les objectifs sont vérifiés à la fin de chaque journée.</p>
        </Section>
      )}
      {s.mode === 'sandbox' && <Section title="Bac à sable"><p className="muted">Aucun objectif imposé. Difficulté ×{s.rules.difficulty}, dotations ×{s.rules.fundingMul}{s.rules.unlimitedMoney ? ', fonds illimités' : ''}.</p></Section>}

      <Section title="État de l'établissement">
        <div className="meters">
          <Meter label="État psychologique moyen" value={E.avgMental(s)} />
          <Meter label="Satisfaction des besoins" value={E.avgNeedsAll(s)} />
          <Meter label="Couverture de sécurité" value={s.sec.coverage * 100} />
          <Meter label="Tension" value={s.sec.tension} invert />
          <Meter label="Climat détenus / personnel" value={s.sec.climate} />
          <Meter label="Satisfaction du personnel" value={E.avgSatisfaction(s)} />
          <Meter label="Niveau de réinsertion" value={E.avgReinsertion(s)} hint="Moyenne des compétences et de l'état psychologique des détenus" />
          <Meter label="Occupation" value={Math.min(100, E.occupancy(s) * 100)} invert={E.occupancy(s) > 1} />
        </div>
      </Section>

      <Section title="Alertes" right={<span className="tag">{alerts.length}</span>}>
        {alerts.length === 0 && <div className="empty">Aucune alerte.</div>}
        {alerts.map((a, i) => <button key={i} className={'alert-row ' + a.level} onClick={() => ctl.setPanel(a.panel)}><i />{a.text}</button>)}
      </Section>

      <Section title="Règles de gestion">
        <div className="policy"><span>Alimentation</span><div className="seg">{E.FOOD_POLICY.map((p, k) => <button key={p.name} className={s.policies.food === k ? 'on' : ''} title={`${p.cost} € par détenu et par jour`} onClick={() => ctl.act((g) => { g.policies.food = k as 0 | 1 | 2; })}>{p.name}</button>)}</div></div>
        <div className="policy"><span>Entretien</span><div className="seg">{E.MAINT_POLICY.map((p, k) => <button key={p.name} className={s.policies.maintenance === k ? 'on' : ''} title={`Coût ×${p.cost}, risque de panne ×${p.risk}`} onClick={() => ctl.act((g) => { g.policies.maintenance = k as 0 | 1 | 2; })}>{p.name}</button>)}</div></div>
        <div className="policy"><span>Admissions</span><div className="seg"><button className={s.rules.intake ? 'on' : ''} onClick={() => ctl.act((g) => { g.rules.intake = true; })}>Ouvertes</button><button className={!s.rules.intake ? 'on' : ''} title="Les autorités apprécient peu un établissement fermé aux transferts" onClick={() => ctl.act((g) => { g.rules.intake = false; g.pendingArrivals = 0; })}>Suspendues</button></div></div>
        <p className="muted">Repas : {E.FOOD_POLICY[s.policies.food].cost} €/détenu/jour, qualité servie {Math.round(E.mealQuality(s) * 100)} %. {s.pendingArrivals > 0 ? `${s.pendingArrivals} arrivée(s) prévue(s) à 9 h.` : ''}</p>
      </Section>

      <Section title="Bilan">
        <div className="kv"><span>Détenus libérés</span><b>{s.totals.released}</b></div>
        <div className="kv"><span>Réinsertions réussies</span><b>{s.totals.reinserted}{s.totals.released ? ` (${Math.round((s.totals.reinserted / s.totals.released) * 100)} %)` : ''}</b></div>
        <div className="kv"><span>Arrivées</span><b>{s.totals.arrivals}</b></div>
        <div className="kv"><span>Décès en détention</span><b>{s.totals.deaths}</b></div>
        <div className="kv"><span>Dette totale</span><b>{money(E.totalDebt(s))}</b></div>
      </Section>
    </>
  );
}
