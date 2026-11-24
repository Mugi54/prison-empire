// Écran de jeu : barre supérieure, menu latéral, carte, panneaux, barre inférieure, fenêtres.
import { useState } from 'react';
import * as E from '../engine';
import { AUTO_SLOT } from '../save/db';
import { Icon, Modal, money } from './common';
import { ContextPanel } from './Context';
import { ctl, useCtl } from './controller';
import { MapView } from './MapView';
import { computeAlerts } from './alerts';
import { BuildPanel } from './panels/Build';
import { EventsPanel, EventCard } from './panels/Events';
import { FinancePanel } from './panels/Finance';
import { InmatesPanel } from './panels/Inmates';
import { OverviewPanel } from './panels/Overview';
import { ResearchPanel } from './panels/Research';
import { SecurityPanel } from './panels/Security';
import { StaffPanel } from './panels/Staff';
import { StatsPanel } from './panels/Stats';
import { SaveSlots } from './SaveSlots';
import { CloudPanel } from './CloudPanel';

const MENU: [string, string, string][] = [
  ['overview', 'Vue générale', 'overview'], ['build', 'Construction', 'build'], ['inmates', 'Détenus', 'inmates'], ['staff', 'Personnel', 'staff'],
  ['security', 'Sécurité', 'security'], ['finance', 'Finances', 'finance'], ['research', 'Recherche', 'research'], ['events', 'Événements', 'events'], ['stats', 'Statistiques', 'stats'],
];

function TopBar({ onMenu }: { onMenu: () => void }) {
  const s = ctl.state!;
  const cap = E.totalCapacity(s);
  const alerts = computeAlerts(s);
  const [open, setOpen] = useState(false);
  const worst = alerts.some((a) => a.level === 'bad') ? 'bad' : alerts.length ? 'warn' : '';
  const f = E.forecast(s);
  return (
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Icon name="tower" size={20} /></span><div><b>PRISON EMPIRE</b><small>{s.title}</small></div></div>
      <div className="top-stats">
        <div className={'chip' + (s.finance.balance < 0 ? ' bad' : '')} title={`Résultat prévisionnel : ${money(f.net)} / jour`}><Icon name="money" /><div><b>{money(s.finance.balance)}</b><small className={f.net < 0 ? 'neg' : 'pos'}>{f.net >= 0 ? '+' : ''}{money(f.net)}/j</small></div></div>
        <div className={'chip' + (s.inmates.length > cap ? ' bad' : '')} title="Détenus présents / capacité d'accueil"><Icon name="inmates" /><div><b>{s.inmates.length} / {cap}</b><small>Détenus / capacité</small></div></div>
        <div className="chip" title="Employés"><Icon name="staff" /><div><b>{s.staff.length}</b><small>Employés</small></div></div>
        <div className="chip" title="Réputation de l'établissement"><Icon name="star" /><div><b>{Math.round(s.reputation)}</b><small>Réputation</small></div></div>
        <div className="chip" title="Relations avec les autorités"><Icon name="trophy" /><div><b>{Math.round(s.authority)}</b><small>Autorités</small></div></div>
      </div>
      <div className="top-right">
        <div className="alerts-wrap">
          <button className={'alert-btn ' + worst} onClick={() => setOpen(!open)} title="Alertes"><Icon name="alert" /><b>{alerts.length}</b></button>
          {open && (
            <div className="alerts-pop" onMouseLeave={() => setOpen(false)}>
              {alerts.length === 0 && <div className="empty">Aucune alerte : l'établissement fonctionne normalement.</div>}
              {alerts.map((a, i) => <button key={i} className={'alert-row ' + a.level} onClick={() => { if (ctl.panel !== a.panel) ctl.setPanel(a.panel); setOpen(false); }}><i />{a.text}</button>)}
            </div>
          )}
        </div>
        <button className="ghost" onClick={onMenu} title="Menu du jeu"><Icon name="menu" /></button>
      </div>
    </header>
  );
}

function BottomBar() {
  const s = ctl.state!;
  const ck = E.clock(s.time);
  const slot = s.regime[ck.hour];
  const last = s.notes[s.notes.length - 1];
  return (
    <footer className="bottombar">
      <div className="clock"><Icon name="clock" /><b>{ck.hhmm}</b><span>{ck.date}</span><em>Jour {ck.day} · {ck.period}</em><span className="slot" style={{ background: E.SLOT_COLOR[slot] }}>{E.SLOT_LABEL[slot]}</span></div>
      <div className="speed">
        <button className={s.speed === 0 ? 'on' : ''} onClick={() => ctl.setSpeed(0)} title="Pause (Espace)"><Icon name="pause" size={15} /></button>
        {[1, 2, 3].map((v) => <button key={v} className={s.speed === v ? 'on' : ''} onClick={() => ctl.setSpeed(v)} title={`Vitesse ×${v} (touche ${v})`}>×{v}</button>)}
      </div>
      <button className="lastnote" onClick={() => { if (ctl.panel !== 'events') ctl.setPanel('events'); }} title="Ouvrir le journal">
        <Icon name="events" size={15} />{last ? <span className={last.kind}>{last.m}</span> : <span>Aucune notification</span>}
      </button>
    </footer>
  );
}

function GameMenu({ onClose, onQuit }: { onClose: () => void; onQuit: () => void }) {
  return (
    <Modal title="Menu" onClose={onClose}>
      <p className="muted">La partie est sauvegardée automatiquement à chaque changement de jour et à la fermeture de l'onglet.</p>
      <SaveSlots mode="save" />
      <h3 className="subhead">Sauvegardes en ligne</h3>
      <CloudPanel />
      <div className="row end">
        <button onClick={onClose}>Reprendre</button>
        <button className="danger" onClick={async () => { await ctl.save(AUTO_SLOT, true); onQuit(); }}>Sauvegarder et quitter</button>
      </div>
    </Modal>
  );
}

export function Game({ onQuit }: { onQuit: () => void }) {
  useCtl();
  const s = ctl.state;
  const [menu, setMenu] = useState(false);
  if (!s) return null;
  const P = ctl.panel;
  const pending = s.events.active[0];
  const tool = ctl.tool;
  return (
    <div className="game">
      <TopBar onMenu={() => setMenu(true)} />
      <div className="main">
        <nav className="sidemenu">
          {MENU.map(([id, label, icon]) => {
            const badge = id === 'security' ? s.incidents.filter((i) => i.status === 'open').length : id === 'events' ? s.events.active.length : 0;
            return <button key={id} className={P === id ? 'on' : ''} onClick={() => ctl.setPanel(id)} title={label}><Icon name={icon} size={22} /><span>{label}</span>{badge > 0 && <i className="badge">{badge}</i>}</button>;
          })}
        </nav>
        <div className={'stage' + (ctl.sel ? ' has-context' : '')}>
          <MapView />
          {P && (
            <aside className={'panel' + (P === 'research' || P === 'stats' || P === 'finance' ? ' wide' : '')}>
              <header><h2>{MENU.find((m) => m[0] === P)?.[1]}</h2><button className="ghost" onClick={() => ctl.setPanel(P)} aria-label="Fermer"><Icon name="close" /></button></header>
              <div className="panel-body">
                {P === 'overview' && <OverviewPanel />}
                {P === 'build' && <BuildPanel />}
                {P === 'inmates' && <InmatesPanel />}
                {P === 'staff' && <StaffPanel />}
                {P === 'security' && <SecurityPanel />}
                {P === 'finance' && <FinancePanel />}
                {P === 'research' && <ResearchPanel />}
                {P === 'events' && <EventsPanel />}
                {P === 'stats' && <StatsPanel />}
              </div>
            </aside>
          )}
          {tool.kind !== 'none' && (
            <div className="toolhint">
              <b>{tool.kind === 'room' ? E.ROOMS[tool.type].name : tool.kind === 'furn' ? E.FURN[tool.type].name : tool.kind === 'door' ? 'Porte' : tool.kind === 'wall' ? 'Mur d\'enceinte' : tool.kind === 'erase' ? 'Suppression' : 'Déplacement'}</b>
              <span>{tool.kind === 'room' ? 'Cliquez-glissez pour tracer la salle' : tool.kind === 'door' ? 'Cliquez sur un mur de salle' : 'Cliquez sur la carte'} · clic droit ou Échap pour annuler</span>
              <button onClick={() => ctl.setTool({ kind: 'none' })}>Annuler</button>
            </div>
          )}
          <ContextPanel />
          <div className="toasts">{ctl.toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.m}</div>)}</div>
          <div className="maphelp">Glisser : déplacer · Molette : zoom · Clic : sélectionner</div>
        </div>
      </div>
      <BottomBar />
      {pending && P !== 'events' && !s.outcome && (
        <div className="event-float"><EventCard a={pending} compact /></div>
      )}
      {s.outcome && !s.outcomeSeen && (
        <Modal title={s.outcome === 'won' ? 'Objectifs atteints' : 'Fin de mandat'}>
          <div className={'outcome ' + s.outcome}><Icon name={s.outcome === 'won' ? 'trophy' : 'alert'} size={46} /><p>{s.outcomeText}</p></div>
          <div className="row end">
            <button onClick={() => ctl.act((g) => { g.outcomeSeen = true; g.rules.bankruptcy = false; })}>Continuer la partie</button>
            <button className="danger" onClick={onQuit}>Retour au menu principal</button>
          </div>
        </Modal>
      )}
      {menu && <GameMenu onClose={() => setMenu(false)} onQuit={onQuit} />}
    </div>
  );
}
