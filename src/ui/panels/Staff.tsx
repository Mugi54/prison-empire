// Personnel : équipe en poste et recrutement.
import { useState } from 'react';
import * as E from '../../engine';
import { Bar, Portrait, Section, Tabs, money } from '../common';
import { ctl } from '../controller';

export function staffStatus(s: E.GameState, st: E.Staff) {
  if (st.trainUntil > s.time) return 'En formation';
  if (st.leaveUntil > s.time) return 'En congé';
  return E.onDuty(s, st) ? 'En service' : 'Au repos';
}

export function StaffPanel() {
  const s = ctl.state!;
  const [tab, setTab] = useState('team');
  const [role, setRole] = useState('all');
  const payroll = s.staff.reduce((a, st) => a + st.salary, 0);
  const team = s.staff.filter((st) => role === 'all' || st.role === role);
  return (
    <>
      <Tabs tabs={[['team', `Équipe (${s.staff.length})`], ['hire', `Recrutement (${s.candidates.length})`]]} value={tab} onChange={setTab} />
      {tab === 'team' && (
        <>
          <div className="filters">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="all">Tous les métiers</option>
              {E.ROLE_LIST.map((r) => <option key={r.role} value={r.role}>{r.name} ({s.staff.filter((x) => x.role === r.role).length})</option>)}
            </select>
            <span className="tag">Masse salariale : {money(payroll)}/j</span>
          </div>
          {team.length === 0 && <div className="empty">Aucun employé dans cette catégorie.</div>}
          {team.map((st) => (
            <button key={st.id} className={'row-card' + (ctl.sel?.kind === 'staff' && ctl.sel.id === st.id ? ' on' : '')} onClick={() => { ctl.select({ kind: 'staff', id: st.id }); if (!st.away) ctl.focusTile(st.x, st.y); }}>
              <Portrait look={st.look} uniform={E.ROLES[st.role].color} size={38} />
              <div className="grow"><b>{st.first} {st.last}</b><small>{E.ROLES[st.role].name} · éch. {st.rank} · {staffStatus(s, st)} · {money(st.salary)}/j</small></div>
              <div className="mini"><span>Fatigue</span><Bar value={st.fatigue} invert /><span>Satisf.</span><Bar value={st.satisfaction} /></div>
            </button>
          ))}
          <p className="muted">Cliquez sur un employé pour gérer ses horaires, son affectation, sa formation, son salaire, ses congés et sa promotion.</p>
        </>
      )}
      {tab === 'hire' && (
        <Section title="Candidats du jour">
          {s.candidates.length === 0 && <div className="empty">Aucun candidat aujourd'hui. Le vivier se renouvelle chaque nuit.</div>}
          {s.candidates.map((c) => (
            <div key={c.id} className="card">
              <Portrait look={c.look} uniform={E.ROLES[c.role].color} size={44} />
              <div className="grow">
                <b>{c.first} {c.last}, {c.age} ans</b>
                <small>{E.ROLES[c.role].name} · compétence {Math.round(c.skill)} % · {Math.floor(c.xp)} j d'expérience</small>
                <small>{E.ROLES[c.role].desc}</small>
                <small>Salaire {money(c.salary)}/j · frais de recrutement {money(E.hireFee(c))}</small>
              </div>
              <button className="primary small" onClick={() => ctl.act((g) => E.hire(g, c.id))}>Recruter</button>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}
