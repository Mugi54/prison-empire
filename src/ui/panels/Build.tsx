// Construction : catalogue des salles par catégorie, mobilier, portes, murs, suppression.
import { useState } from 'react';
import * as E from '../../engine';
import { Icon, Section, Tabs, money } from '../common';
import { ctl } from '../controller';

export function BuildPanel() {
  const s = ctl.state!;
  const [cat, setCat] = useState<string>('hebergement');
  const [tab, setTab] = useState('rooms');
  const tool = ctl.tool;
  const rt = E.getRuntime(s);
  const selRoom = ctl.sel?.kind === 'room' ? rt.rooms.get(ctl.sel.id) : undefined;
  const furnList = selRoom ? E.ROOMS[selRoom.type].furn.map((t) => E.FURN[t]) : Object.values(E.FURN);
  const ko = s.rooms.filter((r) => !rt.status.get(r.id)?.ok);
  return (
    <>
      <div className="toolrow">
        <button className={tool.kind === 'door' ? 'on' : ''} onClick={() => ctl.setTool(tool.kind === 'door' ? { kind: 'none' } : { kind: 'door' })}><Icon name="door" />Porte<small>{E.DOOR_COST} €</small></button>
        <button className={tool.kind === 'wall' ? 'on' : ''} onClick={() => ctl.setTool(tool.kind === 'wall' ? { kind: 'none' } : { kind: 'wall' })}><Icon name="wall" />Mur<small>{E.WALL_COST} €/case</small></button>
        <button className={tool.kind === 'erase' ? 'on danger' : ''} onClick={() => ctl.setTool(tool.kind === 'erase' ? { kind: 'none' } : { kind: 'erase' })}><Icon name="erase" />Supprimer<small>−30 %</small></button>
      </div>
      <Tabs tabs={[['rooms', 'Salles'], ['furn', 'Mobilier'], ['state', `À corriger (${ko.length})`]]} value={tab} onChange={setTab} />

      {tab === 'rooms' && (
        <>
          <div className="cats">{E.ROOM_CATS.map((c) => <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>)}</div>
          {E.ROOM_LIST.filter((r) => r.cat === cat).map((r) => {
            const locked = !!r.research && !E.hasResearch(s, r.research);
            const on = tool.kind === 'room' && tool.type === r.type;
            return (
              <button key={r.type} className={'card build-card' + (on ? ' on' : '') + (locked ? ' locked' : '')} disabled={locked} onClick={() => ctl.setTool(on ? { kind: 'none' } : { kind: 'room', type: r.type })}>
                <i className="swatch" style={{ background: r.floor }} />
                <div>
                  <b>{r.name}{locked && <Icon name="lock" size={13} />}</b>
                  <p>{r.desc}</p>
                  <small>{r.cost} €/case · min. {r.minW}×{r.minH} · entretien {r.upkeep} €/case/jour</small>
                  <small>Requis : porte{r.req.map((q) => `, ${E.FURN[q.types[0]].name.toLowerCase()}${q.n > 1 ? ` ×${q.n}` : ''}`).join('')}{r.staff ? `, ${r.staff.map((x) => E.ROLES[x].name.toLowerCase()).join(' ou ')}` : ''}{locked ? ` · recherche « ${E.researchDef(r.research!)?.name} »` : ''}</small>
                </div>
              </button>
            );
          })}
        </>
      )}

      {tab === 'furn' && (
        <Section title={selRoom ? `Mobilier pour : ${E.ROOMS[selRoom.type].name}` : 'Tout le mobilier'}>
          {!selRoom && <p className="muted">Sélectionnez une salle sur la carte pour ne voir que le mobilier adapté.</p>}
          {furnList.map((f) => {
            const locked = !!f.research && !E.hasResearch(s, f.research);
            const on = tool.kind === 'furn' && tool.type === f.type;
            const rooms = f.anywhere ? 'Partout' : E.ROOM_LIST.filter((r) => r.furn.includes(f.type)).map((r) => r.name).join(', ');
            return (
              <button key={f.type} className={'card build-card' + (on ? ' on' : '') + (locked ? ' locked' : '')} disabled={locked} onClick={() => ctl.setTool(on ? { kind: 'none' } : { kind: 'furn', type: f.type })}>
                <i className="swatch" style={{ background: f.boxes[0][6] }} />
                <div><b>{f.name} — {money(f.cost)}{locked && <Icon name="lock" size={13} />}</b><p>{f.desc}</p><small>Entretien {f.upkeep} €/jour{f.power ? ` · électricité ${f.power}` : ''} · {rooms}</small></div>
              </button>
            );
          })}
        </Section>
      )}

      {tab === 'state' && (
        <Section title="Salles non opérationnelles">
          {ko.length === 0 && <div className="empty">Toutes les salles sont opérationnelles.</div>}
          {ko.map((r) => (
            <button key={r.id} className="card" onClick={() => { ctl.select({ kind: 'room', id: r.id }); ctl.focusTile(r.x + r.w / 2, r.y + r.h / 2); }}>
              <div><b>{E.ROOMS[r.type].name}</b><p className="neg">{rt.status.get(r.id)?.problems.join(' · ')}</p></div>
            </button>
          ))}
        </Section>
      )}
      <p className="muted">Une salle n'est opérationnelle qu'avec une porte, son mobilier requis et, le cas échéant, le personnel affecté. Les travaux sont immédiats ; la démolition rembourse 30 %.</p>
    </>
  );
}
