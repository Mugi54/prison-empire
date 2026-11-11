// Recherche : arbre technologique à quatre branches.
import * as E from '../../engine';
import { Icon, money } from '../common';
import { ctl } from '../controller';

const CW = 196, CH = 92, GX = 34, GY = 14;

export function ResearchPanel() {
  const s = ctl.state!;
  const active = E.researchDef(s.research.active);
  const speed = E.researchSpeed(s);
  return (
    <>
      <div className={'research-now' + (active ? ' on' : '')}>
        {active ? (
          <>
            <div><small>Recherche en cours</small><b>{active.name}</b></div>
            <div className="bar"><div className="bar-fill" style={{ width: `${(s.research.progress / active.hours) * 100}%`, background: 'var(--accent)' }} /></div>
            <small>{Math.floor(s.research.progress)} / {active.hours} h · vitesse ×{speed.toFixed(2)}{speed === 0 ? ' (aucun bureau opérationnel !)' : ''}</small>
          </>
        ) : <div><small>Aucune recherche en cours</small><b>Choisissez un projet disponible ci-dessous</b><small>Vitesse actuelle ×{speed.toFixed(2)} — des bureaux opérationnels sont requis ; chaque agent administratif en service ajoute 12 %.</small></div>}
      </div>
      {E.BRANCHES.map((b) => {
        const nodes = E.RESEARCH.filter((r) => r.branch === b.id);
        const pos = (r: E.ResearchDef) => ({ x: r.col * (CW + GX), y: r.row * (CH + GY) });
        return (
          <div key={b.id} className="branch">
            <h3 style={{ color: b.color }}>{b.name}<small>{nodes.filter((n) => s.research.done.includes(n.id)).length}/{nodes.length}</small></h3>
            <div className="tree" style={{ height: 2 * CH + GY, width: 3 * CW + 2 * GX }}>
              <svg width={3 * CW + 2 * GX} height={2 * CH + GY}>
                {nodes.flatMap((n) => n.req.map((q) => {
                  const a = pos(E.researchDef(q)!), c = pos(n);
                  const done = s.research.done.includes(q);
                  const x1 = a.x + CW, y1 = a.y + CH / 2, x2 = c.x, y2 = c.y + CH / 2;
                  return <path key={n.id + q} d={`M${x1} ${y1} C${x1 + GX / 2} ${y1} ${x2 - GX / 2} ${y2} ${x2} ${y2}`} fill="none" stroke={done ? b.color : 'rgba(255,255,255,.18)'} strokeWidth="2" strokeDasharray={done ? '' : '4 4'} />;
                }))}
              </svg>
              {nodes.map((n) => {
                const st = E.researchState(s, n.id);
                const p = pos(n);
                return (
                  <button key={n.id} className={'node ' + st} style={{ left: p.x, top: p.y, width: CW, height: CH, borderColor: st === 'locked' ? undefined : b.color }}
                    disabled={st !== 'available' || !!s.research.active} title={st === 'locked' ? 'Prérequis : ' + n.req.map((q) => E.researchDef(q)!.name).join(', ') : n.desc}
                    onClick={() => ctl.act((g) => E.startResearch(g, n.id), `Recherche lancée : ${n.name}.`)}>
                    <b>{st === 'done' && <Icon name="check" size={13} />}{st === 'locked' && <Icon name="lock" size={13} />}{n.name}</b>
                    <span>{n.desc}</span>
                    <small>{st === 'done' ? 'Acquis' : st === 'active' ? 'En cours…' : `${money(n.cost)} · ${n.hours} h`}</small>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
