// Événements : décisions en attente, historique des choix, journal des notifications.
import { useState } from 'react';
import * as E from '../../engine';
import { Section, Tabs } from '../common';
import { ctl } from '../controller';

const fmt = (t: number) => { const c = E.clock(t); return `J${c.day} ${c.hhmm}`; };

export function EventCard({ a, compact }: { a: E.ActiveEvent; compact?: boolean }) {
  const s = ctl.state!;
  const def = E.eventDef(a.def);
  const left = Math.max(0, a.deadline - s.time);
  return (
    <div className={'card event' + (compact ? ' compact' : '')}>
      <div className="grow">
        <small>Événement · réponse attendue sous {Math.floor(left / 60)} h</small>
        <b>{def.title}</b>
        <p>{def.text(s)}</p>
        <div className="choices">
          {def.choices.map((c, k) => {
            const blocked = c.can?.(s);
            return <button key={k} disabled={!!blocked} onClick={() => ctl.act((g) => E.chooseEvent(g, a.id, k))}><b>{c.label}</b><span>{blocked ? `${blocked} — ${c.desc}` : c.desc}</span></button>;
          })}
        </div>
      </div>
    </div>
  );
}

export function EventsPanel() {
  const s = ctl.state!;
  const [tab, setTab] = useState('events');
  const insp = E.inspectionScore(s);
  return (
    <>
      <Tabs tabs={[['events', `Décisions (${s.events.active.length})`], ['journal', 'Journal']]} value={tab} onChange={setTab} />
      {tab === 'events' && (
        <>
          <Section title="En attente de décision">
            {s.events.active.length === 0 && <div className="empty">Aucun événement en attente. Ils surviennent selon l'état réel de l'établissement.</div>}
            {s.events.active.map((a) => <EventCard key={a.id} a={a} />)}
          </Section>
          <Section title="Prochaine inspection" right={<span className="tag">Jour {s.events.nextInspection}</span>}>
            {insp.lines.map(([label, max, v]) => <div key={label} className="kv"><span>{label}</span><b className={v < max * 0.5 ? 'neg' : v >= max * 0.8 ? 'pos' : ''}>{v.toFixed(1)} / {max}</b></div>)}
            <div className="kv total"><span>Estimation actuelle</span><b>{insp.total} / 100</b></div>
            {s.events.lastInspection >= 0 && <div className="kv"><span>Dernière note obtenue</span><b>{s.events.lastInspection} / 100</b></div>}
          </Section>
          <Section title="Décisions passées">
            {s.events.history.length === 0 && <div className="empty">Aucune décision pour l'instant.</div>}
            {[...s.events.history].reverse().map((h, k) => <div key={k} className="card"><div className="grow"><small>{fmt(h.t)}</small><b>{h.title}</b><p className="result"><b>{h.choice}</b> — {h.result}</p></div></div>)}
          </Section>
        </>
      )}
      {tab === 'journal' && (
        <div className="journal">
          {s.notes.length === 0 && <div className="empty">Le journal est vide.</div>}
          {[...s.notes].reverse().map((n) => <div key={n.id} className={'jrow ' + n.kind}><time>{fmt(n.t)}</time><span>{n.m}</span></div>)}
        </div>
      )}
    </>
  );
}
