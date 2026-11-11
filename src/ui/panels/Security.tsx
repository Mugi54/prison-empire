// Sécurité : indicateurs, dispositifs, mesures générales et incidents à traiter.
import * as E from '../../engine';
import { Meter, Section, money } from '../common';
import { ctl } from '../controller';

const fmt = (t: number) => { const c = E.clock(t); return `J${c.day} ${c.hhmm}`; };

export function IncidentCard({ inc }: { inc: E.Incident }) {
  const s = ctl.state!;
  const left = Math.max(0, inc.deadline - s.time);
  return (
    <div className={'card incident ' + inc.status}>
      <div className="grow">
        <small>{E.INCIDENT_LABEL[inc.type]} · {fmt(inc.t)}</small>
        <b>{inc.title}</b>
        <p>{inc.text}</p>
        {inc.status === 'open' ? (
          <>
            <div className="choices">
              {E.OPTIONS[inc.type].map((o) => {
                const blocked = o.can?.(s, inc);
                return <button key={o.id} disabled={!!blocked} title={blocked ?? o.desc} onClick={() => ctl.act((g) => E.resolveIncident(g, inc.id, o.id))}><b>{o.label}</b><span>{blocked ?? o.desc}</span></button>;
              })}
            </div>
            <small className="warn">Décision attendue sous {Math.floor(left / 60)} h {String(left % 60).padStart(2, '0')}. Passé ce délai, une réponse par défaut s'applique.</small>
            {inc.inmates.length > 0 && <div className="links">{inc.inmates.map((id) => { const i = s.inmates.find((x) => x.id === id); return i ? <button key={id} className="link" onClick={() => { ctl.select({ kind: 'inmate', id }); ctl.focusTile(i.x, i.y); }}>Voir {i.first} {i.last}</button> : null; })}</div>}
          </>
        ) : <p className="result"><b>{inc.choice}</b> — {inc.result}</p>}
      </div>
    </div>
  );
}

export function SecurityPanel() {
  const s = ctl.state!;
  const sec = s.sec;
  const open = s.incidents.filter((i) => i.status === 'open');
  const done = s.incidents.filter((i) => i.status === 'resolved').slice(-12).reverse();
  const guards = E.guardsOnDuty(s);
  const posts = E.activeRooms(s, 'guardpost').length;
  const cams = s.furn.filter((f) => f.type === 'camera' && !f.broken).length;
  const control = E.anyActive(s, 'control');
  const lock = sec.lockdownUntil > s.time;
  const rt = E.getRuntime(s);
  const unwatched = s.rooms.filter((r) => (rt.occ.get(r.id) ?? 0) > 0 && !s.staff.some((st) => !st.away && st.tr === r.id && (st.role === 'guard' || st.role === 'lead'))).length;
  return (
    <>
      <Section title="Indicateurs">
        <div className="meters">
          <Meter label="Couverture de sécurité" value={sec.coverage * 100} hint="Capacité de surveillance rapportée au nombre de détenus à surveiller" />
          <Meter label="Tension" value={sec.tension} invert />
          <Meter label="Sécurité ressentie (base)" value={sec.safetyBase} />
          <Meter label="Climat détenus / personnel" value={sec.climate} />
          <Meter label="Objets interdits en circulation" value={sec.contraband} invert />
          <Meter label="Laxisme perçu" value={sec.laxity} invert hint="Monte quand les refus et dégradations sont tolérés" />
        </div>
      </Section>
      <Section title="Dispositif de surveillance">
        <div className="kv"><span>Surveillants et responsables en service</span><b>{guards.length} / {s.staff.filter((x) => x.role === 'guard' || x.role === 'lead').length}</b></div>
        <div className="kv"><span>En ronde (sans poste fixe)</span><b>{guards.filter((g) => !g.room).length}</b></div>
        <div className="kv"><span>Postes de surveillance actifs</span><b>{posts}</b></div>
        <div className="kv"><span>Caméras {control ? 'actives' : '(salle de contrôle inactive)'}</span><b>{control ? cams : 0} / {cams}</b></div>
        <div className="kv"><span>Contrôle d'accès</span><b>{E.anyActive(s, 'intake') ? (s.furn.some((f) => f.type === 'scanner' && !f.broken) ? 'Actif avec portique' : 'Actif') : 'Inactif'}</b></div>
        <div className="kv"><span>Salles occupées sans surveillant présent</span><b>{unwatched}</b></div>
        <div className="kv"><span>Incidents sur 7 jours</span><b>{sec.incidentLog.length}</b></div>
      </Section>
      <Section title="Mesures générales">
        <div className="row">
          {lock ? <button onClick={() => ctl.act((g) => E.endLockdown(g))}>Lever le confinement</button> : <button className="danger" onClick={() => ctl.act((g) => E.startLockdown(g, 6))} title="Tous les détenus regagnent leur cellule pendant 6 h. Stoppe les rassemblements, dégrade le moral.">Alarme : confinement général (6 h)</button>}
          <button onClick={() => ctl.act((g) => E.shakedown(g))} title="Réduit de 60 % les objets interdits. Coût 150 €, fatigue les surveillants, dégrade le climat.">Fouille générale ({money(150)})</button>
        </div>
        {lock && <p className="warn">Confinement en cours jusqu'à {fmt(sec.lockdownUntil)}.</p>}
      </Section>
      <Section title="Incidents en cours" right={<span className="tag">{open.length}</span>}>
        {open.length === 0 && <div className="empty">Aucun incident en attente.</div>}
        {open.map((i) => <IncidentCard key={i.id} inc={i} />)}
      </Section>
      <Section title="Incidents récents">
        {done.length === 0 && <div className="empty">Aucun incident traité pour l'instant.</div>}
        {done.map((i) => <IncidentCard key={i.id} inc={i} />)}
      </Section>
    </>
  );
}
