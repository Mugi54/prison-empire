// Menu principal : nouvelle partie (carrière, scénarios, bac à sable) et chargement.
import { useEffect, useState } from 'react';
import * as E from '../engine';
import { listSaves } from '../save/db';
import { Icon, money } from './common';
import { ctl, useCtl } from './controller';
import { SaveSlots } from './SaveSlots';
import { CloudPanel } from './CloudPanel';

type Screen = 'home' | 'career' | 'scenario' | 'sandbox' | 'load' | 'cloud';

export function MainMenu({ onStart }: { onStart: () => void }) {
  useCtl();
  const [screen, setScreen] = useState<Screen>('home');
  const [hasSave, setHasSave] = useState(false);
  const [sb, setSb] = useState<E.SandboxConfig>({ ...E.DEFAULT_SANDBOX });
  const [busy, setBusy] = useState(false);
  useEffect(() => { listSaves().then((l) => setHasSave(l.length > 0)).catch(() => setHasSave(false)); }, [screen]);

  const start = (cfg: E.NewGameConfig) => {
    setBusy(true);
    setTimeout(() => {
      try { ctl.start(E.newGame(cfg)); onStart(); }
      catch (e) { console.error(e); ctl.toast('bad', 'Création de la partie impossible : ' + (e as Error).message); }
      setBusy(false);
    }, 30);
  };
  const back = <button className="ghost back" onClick={() => setScreen('home')}>← Retour</button>;

  return (
    <div className="menu-screen">
      <div className="menu-bg" aria-hidden><i /><i /><i /><i /><i /></div>
      <div className="menu-inner">
        <div className="logo"><span className="brand-mark big"><Icon name="tower" size={44} /></span><div><h1>PRISON EMPIRE</h1><p>Construire. Administrer. Réinsérer.</p></div></div>

        {screen === 'home' && (
          <div className="menu-cards">
            <button className="mode-card" onClick={() => setScreen('career')}><Icon name="trophy" size={30} /><b>Carrière</b><span>Prenez la direction d'un établissement existant et menez-le au rang d'établissement modèle, mission après mission.</span></button>
            <button className="mode-card" onClick={() => setScreen('scenario')}><Icon name="target" size={30} /><b>Scénarios</b><span>Six situations de crise indépendantes, chacune avec ses objectifs, son délai et ses conditions d'échec.</span></button>
            <button className="mode-card" onClick={() => setScreen('sandbox')}><Icon name="build" size={30} /><b>Bac à sable</b><span>Budget, terrain, difficulté, événements : fixez vos règles et construisez librement, sans objectif imposé.</span></button>
            <button className="mode-card" onClick={() => setScreen('load')}><Icon name="save" size={30} /><b>Charger une partie</b><span>{hasSave ? 'Reprenez une partie sauvegardée sur cet appareil ou en ligne.' : 'Aucune sauvegarde locale : connectez-vous pour retrouver vos parties en ligne.'}</span></button>
          </div>
        )}

        {screen === 'career' && (
          <div className="menu-panel">
            {back}<h2>Choisissez votre établissement</h2>
            <div className="preset-grid">
              {E.PRESETS.map((p) => (
                <div key={p.id} className="preset">
                  <small>{p.tagline}</small><h3>{p.name}</h3><p>{p.desc}</p>
                  <dl>
                    <div><dt>Budget initial</dt><dd>{money(p.budget)}</dd></div>
                    <div><dt>Détenus</dt><dd>{p.inmates}</dd></div>
                    <div><dt>Personnel</dt><dd>{p.staff.reduce((a, x) => a + x[1], 0)}</dd></div>
                    <div><dt>Salles</dt><dd>{p.rooms.reduce((a, x) => a + x[3], 0)}</dd></div>
                    <div><dt>Dotation</dt><dd>{money(p.funding)}/j</dd></div>
                    <div><dt>Terrain</dt><dd>{p.map[0]}×{p.map[1]}</dd></div>
                  </dl>
                  <ul>{p.issues.map((i) => <li key={i}>{i}</li>)}</ul>
                  <button className="primary" disabled={busy} onClick={() => start({ mode: 'career', preset: p.id })}>Prendre la direction</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {screen === 'scenario' && (
          <div className="menu-panel">
            {back}<h2>Scénarios</h2>
            <div className="preset-grid">
              {E.SCENARIOS.map((sc) => (
                <div key={sc.id} className="preset">
                  <small>{E.presetDef(sc.preset).name} · {sc.days} jours</small><h3>{sc.name}</h3><p>{sc.desc}</p>
                  <ul className="goals">{sc.goals.map((g) => <li key={g.label}>{g.label}</li>)}</ul>
                  <button className="primary" disabled={busy} onClick={() => start({ mode: 'scenario', scenario: sc.id })}>Commencer</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {screen === 'sandbox' && (
          <div className="menu-panel narrow">
            {back}<h2>Bac à sable</h2>
            <div className="form">
              <label>Budget initial<span>{money(sb.budget)}</span><input type="range" min={20000} max={1000000} step={10000} value={sb.budget} onChange={(e) => setSb({ ...sb, budget: +e.target.value })} /></label>
              <label>Taille du terrain<select value={sb.size} onChange={(e) => setSb({ ...sb, size: e.target.value as 'S' | 'M' | 'L' })}><option value="S">Petit (36×28)</option><option value="M">Moyen (50×38)</option><option value="L">Grand (68×52)</option></select></label>
              <label>Détenus au départ<span>{sb.inmates === 0 ? 'Terrain vierge' : `${sb.inmates} (établissement de base généré)`}</span><input type="range" min={0} max={400} step={10} value={sb.inmates} onChange={(e) => setSb({ ...sb, inmates: +e.target.value })} /></label>
              <label>Difficulté<select value={sb.difficulty} onChange={(e) => setSb({ ...sb, difficulty: +e.target.value })}><option value={0.75}>Facile</option><option value={1}>Normale</option><option value={1.3}>Difficile</option></select></label>
              <label>Contraintes financières<select value={sb.funding} onChange={(e) => setSb({ ...sb, funding: +e.target.value })}><option value={2}>Dotations généreuses</option><option value={1}>Dotations normales</option><option value={0}>Dotations serrées</option></select></label>
              <label>Fréquence des événements<select value={sb.events ? sb.eventFreq : 0} onChange={(e) => setSb({ ...sb, events: +e.target.value > 0, eventFreq: +e.target.value || 1 })}><option value={0}>Aucun événement</option><option value={0.5}>Rares</option><option value={1}>Normale</option><option value={2}>Fréquents</option></select></label>
              <label className="check"><input type="checkbox" checked={sb.incidents} onChange={(e) => setSb({ ...sb, incidents: e.target.checked })} />Incidents de sécurité et pannes</label>
              <label className="check"><input type="checkbox" checked={sb.intake} onChange={(e) => setSb({ ...sb, intake: e.target.checked })} />Arrivées automatiques de détenus</label>
              <label className="check"><input type="checkbox" checked={sb.bankruptcy} onChange={(e) => setSb({ ...sb, bankruptcy: e.target.checked })} />Mise sous administration en cas de faillite</label>
              <label className="check"><input type="checkbox" checked={sb.unlimitedMoney} onChange={(e) => setSb({ ...sb, unlimitedMoney: e.target.checked })} />Fonds illimités</label>
            </div>
            <button className="primary big" disabled={busy} onClick={() => start({ mode: 'sandbox', sandbox: sb })}>{busy ? 'Création…' : 'Créer l\'établissement'}</button>
          </div>
        )}

        {screen === 'load' && (
          <div className="menu-panel narrow">{back}<h2>Charger une partie</h2><h3 className="subhead">Sur cet appareil</h3><SaveSlots mode="load" onLoaded={onStart} /><h3 className="subhead">En ligne</h3><CloudPanel onLoaded={onStart} /></div>
        )}
        <footer className="menu-foot">Jeu solo · Sauvegardes locales et en ligne · Jouable hors connexion après le premier chargement</footer>
      </div>
      <div className="toasts">{ctl.toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.m}</div>)}</div>
    </div>
  );
}
