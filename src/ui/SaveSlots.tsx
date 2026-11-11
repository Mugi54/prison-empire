// Emplacements de sauvegarde : sauvegarde manuelle, chargement, suppression.
import { useEffect, useState } from 'react';
import { AUTO_SLOT, MANUAL_SLOTS, SaveMeta, deleteSave, listSaves } from '../save/db';
import { money } from './common';
import { ctl } from './controller';

const MODE: Record<string, string> = { career: 'Carrière', scenario: 'Scénario', sandbox: 'Bac à sable' };

export function SaveSlots({ mode, onLoaded }: { mode: 'save' | 'load'; onLoaded?: () => void }) {
  const [metas, setMetas] = useState<SaveMeta[] | null>(null);
  const [error, setError] = useState('');
  const refresh = () => listSaves().then(setMetas).catch((e) => { setError((e as Error).message); setMetas([]); });
  useEffect(() => { void refresh(); }, []);
  if (!metas) return <div className="empty">Lecture des sauvegardes…</div>;
  const slots = [AUTO_SLOT, ...MANUAL_SLOTS];
  return (
    <div className="slots">
      {error && <div className="empty bad">Sauvegardes indisponibles : {error}</div>}
      {slots.map((slot, k) => {
        const m = metas.find((x) => x.slot === slot);
        const name = slot === AUTO_SLOT ? 'Sauvegarde automatique' : `Emplacement ${k}`;
        return (
          <div key={slot} className={'slot-row' + (m ? '' : ' empty-slot')}>
            <div className="slot-info">
              <b>{name}</b>
              {m ? <span>{m.title} · {MODE[m.mode] ?? m.mode} · Jour {m.day} · {m.inmates} détenus · {money(m.balance)}<br /><small>{new Date(m.savedAt).toLocaleString('fr-FR')} · format v{m.version}</small></span> : <span>Vide</span>}
            </div>
            <div className="slot-actions">
              {mode === 'save' && slot !== AUTO_SLOT && <button onClick={async () => { await ctl.save(slot); void refresh(); }}>{m ? 'Écraser' : 'Sauvegarder'}</button>}
              {m && mode === 'load' && <button className="primary" onClick={async () => { if (await ctl.load(slot)) onLoaded?.(); else void refresh(); }}>Charger</button>}
              {m && <button className="danger" onClick={async () => { if (window.confirm(`Supprimer définitivement « ${name} » ?`)) { try { await deleteSave(slot); } catch (e) { setError((e as Error).message); } void refresh(); } }}>Supprimer</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
