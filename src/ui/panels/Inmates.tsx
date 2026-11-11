// Détenus : liste filtrable, programmes de réinsertion, régime quotidien.
import { useState } from 'react';
import * as E from '../../engine';
import { Bar, Portrait, Section, Tabs } from '../common';
import { ctl } from '../controller';

const PAGE = 40;
const SLOTS: E.Slot[] = ['sleep', 'hygiene', 'meal', 'work', 'free', 'lockup'];

export function InmatesPanel() {
  const s = ctl.state!;
  const [tab, setTab] = useState('list');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(0);
  const rt = E.getRuntime(s);

  let list = s.inmates;
  if (q) { const k = q.toLowerCase(); list = list.filter((i) => `${i.first} ${i.last}`.toLowerCase().includes(k)); }
  list = [...list].sort((a, b) => sort === 'mental' ? a.mental - b.mental : sort === 'health' ? a.needs.health - b.needs.health : sort === 'reins' ? E.reinsertionScore(b) - E.reinsertionScore(a) : sort === 'release' ? (a.sentence - a.served) - (b.sentence - b.served) : a.last.localeCompare(b.last));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const p = Math.min(page, pages - 1);

  const progCount = (pr: E.Program) => s.inmates.filter((i) => i.program === pr).length;
  const progCap = (pr: E.Program) => E.PROGRAMS[pr].rooms.reduce((n, t) => n + (rt.byType.get(t) ?? []).reduce((m, r) => m + (rt.status.get(r.id)?.ok ? rt.status.get(r.id)!.capacity : 0), 0), 0);

  return (
    <>
      <Tabs tabs={[['list', `Détenus (${s.inmates.length})`], ['programs', 'Réinsertion'], ['regime', 'Régime quotidien']]} value={tab} onChange={setTab} />
      {tab === 'list' && (
        <>
          <div className="filters">
            <input placeholder="Rechercher un nom…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">Tri : nom</option><option value="mental">Moral le plus bas</option><option value="health">Santé la plus basse</option><option value="reins">Meilleure réinsertion</option><option value="release">Libération proche</option>
            </select>
          </div>
          {list.length === 0 && <div className="empty">Aucun détenu.</div>}
          {list.slice(p * PAGE, p * PAGE + PAGE).map((i) => (
            <button key={i.id} className={'row-card' + (ctl.sel?.kind === 'inmate' && ctl.sel.id === i.id ? ' on' : '')} onClick={() => { ctl.select({ kind: 'inmate', id: i.id }); ctl.focusTile(i.x, i.y); }}>
              <Portrait look={i.look} uniform="#e8792b" size={38} />
              <div className="grow">
                <b>{i.first} {i.last}{i.sick && <i className="dot warn" title="Malade" />}{!i.cell && <i className="dot bad" title="Sans place" />}</b>
                <small>{E.ACT_LABEL[i.act] ?? i.act} · {E.PERSONALITY[i.personality].name} · reste {i.sentence - i.served} j</small>
              </div>
              <div className="mini"><span>Moral</span><Bar value={i.mental} /><span>Santé</span><Bar value={i.needs.health} /></div>
            </button>
          ))}
          {pages > 1 && <div className="pager"><button disabled={p === 0} onClick={() => setPage(p - 1)}>←</button><span>{p + 1} / {pages}</span><button disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>→</button></div>}
        </>
      )}
      {tab === 'programs' && (
        <>
          <Section title="Programmes de réinsertion" right={<button className="primary small" onClick={() => ctl.act((g) => { const n = E.autoAssignPrograms(g); return n ? undefined : 'Aucune place libre dans les programmes, ou tous les détenus sont déjà inscrits.'; }, 'Inscriptions effectuées.')}>Inscrire automatiquement</button>}>
            {(Object.keys(E.PROGRAMS) as E.Program[]).filter((k) => k !== 'none').map((k) => {
              const pr = E.PROGRAMS[k];
              const cap = k === 'perso' ? null : progCap(k);
              const locked = (k === 'training' && !E.hasResearch(s, 'formation')) || (k === 'perso' && !E.hasResearch(s, 'perso'));
              return (
                <div key={k} className={'card' + (locked ? ' locked' : '')}>
                  <div className="grow"><b>{pr.name}</b><p>{pr.desc}</p>
                    <small>{locked ? 'Recherche requise' : cap === null ? 'S\'appuie sur les salles des autres programmes' : `Salles : ${pr.rooms.map((t) => E.ROOMS[t].name).join(', ')} · ${cap} place(s) simultanée(s)`}</small></div>
                  <div className="big-num">{progCount(k)}<small>inscrits</small></div>
                </div>
              );
            })}
            <div className="kv"><span>Sans programme</span><b>{progCount('none')}</b></div>
            <div className="kv"><span>Niveau moyen de réinsertion</span><b>{Math.round(E.avgReinsertion(s))} %</b></div>
            <div className="kv"><span>Réinsertions réussies</span><b>{s.totals.reinserted} / {s.totals.released} libérés</b></div>
          </Section>
          <p className="muted">Les détenus suivent leur programme pendant les créneaux « Activités » du régime quotidien. L'inscription individuelle se fait depuis la fiche de chaque détenu.</p>
        </>
      )}
      {tab === 'regime' && (
        <Section title="Régime quotidien" right={<button className="small" onClick={() => ctl.act((g) => { g.regime = [...E.DEFAULT_REGIME]; })}>Réinitialiser</button>}>
          <p className="muted">Cliquez sur une heure pour changer son créneau. Les routines de tous les détenus s'adaptent immédiatement.</p>
          <div className="regime">
            {s.regime.map((slot, h) => (
              <button key={h} style={{ background: E.SLOT_COLOR[slot] }} className={E.clock(s.time).hour === h ? 'now' : ''} title={`${h} h : ${E.SLOT_LABEL[slot]}`}
                onClick={() => ctl.act((g) => { g.regime[h] = SLOTS[(SLOTS.indexOf(g.regime[h]) + 1) % SLOTS.length]; })}>
                <b>{h}h</b><span>{E.SLOT_LABEL[slot]}</span>
              </button>
            ))}
          </div>
          <div className="legend">{SLOTS.map((x) => <span key={x}><i style={{ background: E.SLOT_COLOR[x] }} />{E.SLOT_LABEL[x]} ({s.regime.filter((y) => y === x).length} h)</span>)}</div>
        </Section>
      )}
    </>
  );
}
