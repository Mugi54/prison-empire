// Panneau contextuel : fiche du détenu, de l'employé, de la salle ou de l'équipement sélectionné.
import { useState } from 'react';
import * as E from '../engine';
import { Bar, Icon, Meter, Portrait, Section, Tabs, money } from './common';
import { ctl } from './controller';
import { staffStatus } from './panels/Staff';

const fmt = (t: number) => { const c = E.clock(t); return `J${c.day} ${c.hhmm}`; };

function InmateSheet({ i }: { i: E.Inmate }) {
  const s = ctl.state!;
  const [tab, setTab] = useState('state');
  const rt = E.getRuntime(s);
  const cell = rt.rooms.get(i.cell);
  const rels = Object.entries(i.rel).map(([id, v]) => ({ o: s.inmates.find((x) => x.id === +id), v })).filter((r) => r.o).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  return (
    <>
      <div className="sheet-head">
        <Portrait look={i.look} uniform="#e8792b" size={72} />
        <div>
          <h3>{i.first} {i.last}</h3>
          <small>{i.age} ans · n° d'écrou {String(i.id).padStart(5, '0')}</small>
          <span className="tag">{E.PERSONALITY[i.personality].name}</span> <span className="tag">{i.profile}</span>
          <em>{E.ACT_LABEL[i.act] ?? i.act}{!i.at && i.tr > 0 ? ' (en chemin)' : ''}</em>
        </div>
      </div>
      <div className="row">
        <button className={ctl.follow ? 'on' : ''} onClick={() => { ctl.follow = !ctl.follow; ctl.focusTile(i.x, i.y); ctl.bump(); }}><Icon name="target" size={14} />{ctl.follow ? 'Suivi actif' : 'Suivre'}</button>
        {cell && <button onClick={() => { ctl.focusTile(cell.x + cell.w / 2, cell.y + cell.h / 2); ctl.bump(); }}><Icon name="bed" size={14} />Voir sa cellule</button>}
      </div>
      <Tabs tabs={[['state', 'État'], ['profile', 'Parcours'], ['social', `Relations (${rels.length})`], ['log', 'Historique']]} value={tab} onChange={setTab} />
      {tab === 'state' && (
        <>
          <Section title="Besoins">
            <div className="meters one">{E.NEED_KEYS.map((k) => <Meter key={k} label={E.NEED_LABEL[k]} value={i.needs[k]} />)}</div>
          </Section>
          <Section title="État général">
            <div className="meters one">
              <Meter label="État psychologique" value={i.mental} />
              <Meter label="Dangerosité estimée" value={i.risk} invert />
            </div>
            <div className="kv"><span>État de santé</span><b className={i.sick ? 'neg' : ''}>{i.sick ? 'Malade' : i.needs.health < 35 ? 'Blessé / affaibli' : 'Bon'}</b></div>
            <div className="kv"><span>Hébergement</span><b className={cell ? '' : 'neg'}>{cell ? E.ROOMS[cell.type].name : 'Aucune place attribuée'}</b></div>
            {i.isoUntil > s.time && <div className="kv"><span>Isolement jusqu'à</span><b>{fmt(i.isoUntil)}</b></div>}
          </Section>
          <Section title="Réinsertion">
            <div className="meters one">
              <Meter label="Instruction" value={i.skills.education} />
              <Meter label="Savoir-faire professionnel" value={i.skills.craft} />
              <Meter label="Compétences sociales" value={i.skills.social} />
              <Meter label="Niveau de réinsertion" value={E.reinsertionScore(i)} />
            </div>
            <label className="field">Programme
              <select value={i.program} onChange={(e) => ctl.act((g) => E.setProgram(g, i, e.target.value as E.Program))}>
                {(Object.keys(E.PROGRAMS) as E.Program[]).map((k) => <option key={k} value={k}>{E.PROGRAMS[k].name}</option>)}
              </select>
            </label>
            <p className="muted">{E.PROGRAMS[i.program].desc}</p>
          </Section>
        </>
      )}
      {tab === 'profile' && (
        <Section title="Dossier">
          <p>Condamné pour {i.crime}. {i.background}</p>
          <p className="muted">{E.PERSONALITY[i.personality].name} : {E.PERSONALITY[i.personality].desc}</p>
          <div className="kv"><span>Peine</span><b>{i.sentence} jours</b></div>
          <div className="kv"><span>Purgée</span><b>{i.served} jours</b></div>
          <Bar value={(i.served / i.sentence) * 100} color="var(--accent)" />
          <div className="kv"><span>Libération dans</span><b>{i.sentence - i.served} jour(s)</b></div>
          <div className="kv"><span>Arrivé le</span><b>{fmt(i.arrived)}</b></div>
          <div className="kv"><span>Chances de réinsertion à la sortie</span><b>{Math.round(Math.min(97, E.reinsertionScore(i) + 10 + (E.hasResearch(s, 'partenariats') ? 20 : 0)))} %</b></div>
        </Section>
      )}
      {tab === 'social' && (
        <Section title="Relations sociales">
          {rels.length === 0 && <div className="empty">Aucune relation marquante pour l'instant.</div>}
          {rels.map(({ o, v }) => (
            <button key={o!.id} className="row-card" onClick={() => { ctl.select({ kind: 'inmate', id: o!.id }); ctl.focusTile(o!.x, o!.y); }}>
              <Portrait look={o!.look} uniform="#e8792b" size={30} />
              <div className="grow"><b>{o!.first} {o!.last}</b><small className={v < -15 ? 'neg' : v > 15 ? 'pos' : ''}>{E.relLabel(v)} ({v > 0 ? '+' : ''}{Math.round(v)})</small></div>
            </button>
          ))}
        </Section>
      )}
      {tab === 'log' && (
        <div className="journal">{[...i.log].reverse().map((l, k) => <div key={k} className="jrow"><time>{fmt(l.t)}</time><span>{l.m}</span></div>)}</div>
      )}
    </>
  );
}

function StaffSheet({ st }: { st: E.Staff }) {
  const s = ctl.state!;
  const def = E.ROLES[st.role];
  const rooms = s.rooms.filter((r) => def.rooms.includes(r.type));
  return (
    <>
      <div className="sheet-head">
        <Portrait look={st.look} uniform={def.color} size={72} />
        <div><h3>{st.first} {st.last}</h3><small>{st.age} ans · {def.name} · échelon {st.rank}</small><em>{staffStatus(s, st)}</em></div>
      </div>
      <p className="muted">{def.desc}</p>
      <Section title="Condition">
        <div className="meters one">
          <Meter label="Compétence" value={st.skill} />
          <Meter label="Fatigue" value={st.fatigue} invert />
          <Meter label="Satisfaction" value={st.satisfaction} />
          <Meter label="Efficacité actuelle" value={Math.min(100, E.staffEff(st) * 70)} hint="Dépend de la compétence, de la fatigue et de la satisfaction" />
        </div>
        <div className="kv"><span>Salaire</span><b>{money(st.salary)}/jour</b></div>
        <div className="kv"><span>Expérience</span><b>{Math.floor(st.xp)} jour(s) de service</b></div>
      </Section>
      <Section title="Organisation">
        <label className="field">Horaires
          <select value={st.shift} onChange={(e) => ctl.act((g) => E.setShift(g, st.id, e.target.value as E.Shift))}>
            {(Object.keys(E.SHIFTS) as E.Shift[]).map((k) => <option key={k} value={k}>{E.SHIFTS[k].name}</option>)}
          </select>
        </label>
        <label className="field">Affectation
          <select value={st.room} onChange={(e) => ctl.act((g) => E.assign(g, st.id, +e.target.value))}>
            <option value={0}>{st.role === 'guard' || st.role === 'lead' ? 'Rondes (aucun poste fixe)' : 'Automatique'}</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{E.ROOMS[r.type].name} ({r.x},{r.y})</option>)}
          </select>
        </label>
      </Section>
      <Section title="Carrière">
        <div className="grid2">
          <button onClick={() => ctl.act((g) => E.train(g, st.id), 'Formation lancée : +8 de compétence.')} title="Absent le temps de la formation (12 h avec une salle de réunion, 24 h sinon)">Former ({money(E.trainCost(st))})</button>
          <button onClick={() => ctl.act((g) => E.raise(g, st.id), 'Augmentation accordée.')}>Augmenter (+8 %)</button>
          <button onClick={() => ctl.act((g) => E.promote(g, st.id))} title={`Nécessite ${E.promoteXp(st)} jours d'expérience`}>Promouvoir</button>
          <button onClick={() => ctl.act((g) => E.grantLeave(g, st.id, 3), 'Congé de 3 jours accordé.')}>Congé (3 j)</button>
        </div>
        <button className="danger wide" onClick={() => { if (window.confirm(`Licencier ${st.first} ${st.last} ? Indemnité : ${money(st.salary * 5)}.`)) { ctl.act((g) => E.fire(g, st.id)); ctl.select(null); } }}>Licencier</button>
      </Section>
    </>
  );
}

function RoomSheet({ r }: { r: E.Room }) {
  const s = ctl.state!;
  const rt = E.getRuntime(s);
  const def = E.ROOMS[r.type];
  const st = rt.status.get(r.id);
  const active = rt.active.get(r.id);
  const furn = rt.furnByRoom.get(r.id) ?? [];
  const occ = r.type === 'cell' || r.type === 'dorm' ? s.inmates.filter((i) => i.cell === r.id).length : rt.occ.get(r.id) ?? 0;
  const autoCost = E.autoFurnishCost(s, r);
  const staff = s.staff.filter((x) => x.room === r.id);
  return (
    <>
      <div className="sheet-head"><i className="swatch big" style={{ background: def.floor }} /><div><h3>{def.name}</h3><small>{r.w}×{r.h} cases · entretien {(def.upkeep * r.w * r.h).toFixed(1)} €/j</small>
        <em className={st?.ok ? (active ? 'pos' : 'warn') : 'neg'}>{st?.ok ? (active ? 'Opérationnelle et active' : 'Opérationnelle — personnel hors service') : 'Non opérationnelle'}</em></div></div>
      <p className="muted">{def.desc}</p>
      {st && st.problems.length > 0 && <div className="problems">{st.problems.map((p) => <div key={p}><Icon name="alert" size={14} />{p}</div>)}</div>}
      <Section title="Fonctionnement">
        <div className="kv"><span>{r.type === 'cell' || r.type === 'dorm' ? 'Occupants / places' : 'Présents / capacité'}</span><b>{occ} / {st?.capacity ?? 0}</b></div>
        {def.staff && <div className="kv"><span>Personnel affecté</span><b>{staff.length ? staff.map((x) => `${x.first} ${x.last}`).join(', ') : 'Aucun'}</b></div>}
        <div className="kv"><span>Mobilier</span><b>{furn.length ? Object.entries(furn.reduce<Record<string, number>>((a, f) => { a[f.type] = (a[f.type] ?? 0) + 1; return a; }, {})).map(([t, n]) => `${E.FURN[t as E.FurnType].name} ×${n}`).join(', ') : 'Aucun'}</b></div>
      </Section>
      <Section title="Équiper">
        <div className="chips">{def.furn.map((t) => <button key={t} disabled={!!E.FURN[t].research && !E.hasResearch(s, E.FURN[t].research!)} onClick={() => ctl.setTool({ kind: 'furn', type: t })}>{E.FURN[t].name} · {E.FURN[t].cost} €</button>)}</div>
        <div className="row">
          <button disabled={autoCost === 0} onClick={() => ctl.act((g) => { E.autoFurnish(g, r, false); })} title="Place le mobilier standard de ce type de salle">Équipement standard ({money(autoCost)})</button>
          <button onClick={() => ctl.setTool({ kind: 'door' })}><Icon name="door" size={14} />Porte</button>
        </div>
        {r.broken && <button className="primary wide" onClick={() => ctl.act((g) => E.repairRoom(g, r.id), 'Salle réparée.')}>Réparer la panne ({money(E.ROOM_REPAIR)})</button>}
      </Section>
      <Section title="Modifier la taille">
        <div className="resize">
          {(['N', 'W', 'E', 'S'] as E.Side[]).map((side) => (
            <div key={side} className={'rs rs-' + side}>
              <span>{{ N: 'Nord-est', S: 'Sud-ouest', W: 'Nord-ouest', E: 'Sud-est' }[side]}</span>
              <button onClick={() => ctl.act((g) => E.resizeRoom(g, r.id, side, 1))} title={`Agrandir : ${money(def.cost * (side === 'N' || side === 'S' ? r.w : r.h))}`}>+</button>
              <button onClick={() => ctl.act((g) => E.resizeRoom(g, r.id, side, -1))} title="Réduire (remboursement 30 %)">−</button>
            </div>
          ))}
        </div>
      </Section>
      <button className="danger wide" onClick={() => { if (window.confirm(`Démolir « ${def.name} » et son mobilier ? Remboursement : 30 %.`)) { ctl.act((g) => E.demolishRoom(g, r.id)); ctl.select(null); } }}><Icon name="erase" size={14} />Démolir la salle</button>
    </>
  );
}

function FurnSheet({ f }: { f: E.Furn }) {
  const def = E.FURN[f.type];
  return (
    <>
      <div className="sheet-head"><i className="swatch big" style={{ background: def.boxes[0][6] }} /><div><h3>{def.name}</h3><small>Valeur {money(def.cost)} · entretien {def.upkeep} €/j</small><em className={f.broken ? 'neg' : 'pos'}>{f.broken ? 'Hors service' : 'En état'}</em></div></div>
      <p className="muted">{def.desc}</p>
      <div className="grid2">
        <button onClick={() => ctl.setTool({ kind: 'move', id: f.id })}><Icon name="move" size={14} />Déplacer</button>
        {f.broken && <button className="primary" onClick={() => ctl.act((g) => E.repairFurn(g, f.id), 'Équipement réparé.')}>Réparer ({money(E.repairCost(f))})</button>}
        <button className="danger" onClick={() => { ctl.act((g) => E.removeFurn(g, f.id)); ctl.select(null); }}><Icon name="erase" size={14} />Retirer</button>
      </div>
    </>
  );
}

export function ContextPanel() {
  const s = ctl.state!;
  const sel = ctl.sel;
  if (!sel) return null;
  const i = sel.kind === 'inmate' ? s.inmates.find((x) => x.id === sel.id) : undefined;
  const st = sel.kind === 'staff' ? s.staff.find((x) => x.id === sel.id) : undefined;
  const r = sel.kind === 'room' ? s.rooms.find((x) => x.id === sel.id) : undefined;
  const f = sel.kind === 'furn' ? s.furn.find((x) => x.id === sel.id) : undefined;
  if (!i && !st && !r && !f) return null;
  return (
    <aside className="context">
      <header><small>{i ? 'Détenu' : st ? 'Personnel' : r ? 'Salle' : 'Équipement'}</small><button className="ghost" onClick={() => ctl.select(null)} aria-label="Fermer"><Icon name="close" /></button></header>
      <div className="panel-body">
        {i && <InmateSheet key={i.id} i={i} />}
        {st && <StaffSheet st={st} />}
        {r && <RoomSheet r={r} />}
        {f && <FurnSheet f={f} />}
      </div>
    </aside>
  );
}
