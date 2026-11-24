// Compte en ligne et sauvegardes synchronisées (Supabase).
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { cloudDelete, cloudList, cloudLoad, cloudSave, getSession, onAuth, signIn, signOut, signUp } from '../cloud/cloud';
import type { SaveMeta } from '../save/db';
import { money } from './common';
import { ctl } from './controller';

const SLOTS = ['cloud1', 'cloud2', 'cloud3'];
const MODE: Record<string, string> = { career: 'Carrière', scenario: 'Scénario', sandbox: 'Bac à sable' };

function AuthForm() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ kind: string; m: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ kind: 'bad', m: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <form className="auth" onSubmit={(e) => { e.preventDefault(); void run(() => signIn(email, pw)); }}>
      <p className="muted">Créez un compte pour retrouver vos parties sur n'importe quel ordinateur. Sans compte, vos sauvegardes restent dans ce navigateur.</p>
      <input type="email" required placeholder="Adresse e-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" required minLength={6} placeholder="Mot de passe (6 caractères min.)" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <div className="row">
        <button type="submit" className="primary" disabled={busy}>Se connecter</button>
        <button type="button" disabled={busy || !email || pw.length < 6} onClick={() => run(async () => {
          const r = await signUp(email, pw);
          setMsg(r === 'confirm' ? { kind: 'good', m: 'Compte créé : confirmez votre adresse via le lien reçu par e-mail, puis connectez-vous.' } : { kind: 'good', m: 'Compte créé, vous êtes connecté.' });
        })}>Créer un compte</button>
      </div>
      {msg && <p className={msg.kind === 'bad' ? 'neg' : 'pos'}>{msg.m}</p>}
    </form>
  );
}

export function CloudPanel({ onLoaded }: { onLoaded?: () => void }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [metas, setMetas] = useState<SaveMeta[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    getSession().then(setSession).catch(() => setSession(null));
    return onAuth(setSession);
  }, []);
  const refresh = () => cloudList().then((l) => { setMetas(l); setErr(''); }).catch((e) => setErr((e as Error).message));
  useEffect(() => { if (session) void refresh(); else setMetas(null); }, [session?.user.id]);

  if (session === undefined) return <div className="empty">Connexion au service en ligne…</div>;
  if (!session) return <AuthForm />;
  const inGame = !!ctl.state;
  const act = async (slot: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(slot);
    try { await fn(); if (ok) ctl.toast('good', ok); } catch (e) { ctl.toast('bad', (e as Error).message); }
    setBusy(''); void refresh();
  };
  return (
    <div>
      <div className="kv"><span>Connecté : {session.user.email}</span><b><button className="small" onClick={() => void signOut()}>Se déconnecter</button></b></div>
      {err && <div className="empty bad">{err}</div>}
      <div className="slots">
        {SLOTS.map((slot, k) => {
          const m = metas?.find((x) => x.slot === slot);
          return (
            <div key={slot} className={'slot-row' + (m ? '' : ' empty-slot')}>
              <div className="slot-info">
                <b>Emplacement en ligne {k + 1}</b>
                {m ? <span>{m.title} · {MODE[m.mode] ?? m.mode} · Jour {m.day} · {m.inmates} détenus · {money(m.balance)}<br /><small>{new Date(m.savedAt).toLocaleString('fr-FR')}</small></span> : <span>{metas ? 'Vide' : 'Chargement…'}</span>}
              </div>
              <div className="slot-actions">
                {inGame && <button disabled={!!busy} onClick={() => act(slot, () => cloudSave(slot, ctl.state!), 'Partie sauvegardée en ligne.')}>{busy === slot ? '…' : m ? 'Écraser' : 'Sauvegarder'}</button>}
                {m && !inGame && <button className="primary" disabled={!!busy} onClick={() => act(slot, async () => { ctl.start(await cloudLoad(slot)); onLoaded?.(); })}>Charger</button>}
                {m && <button className="danger" disabled={!!busy} onClick={() => { if (window.confirm('Supprimer cette sauvegarde en ligne ?')) void act(slot, () => cloudDelete(slot)); }}>Supprimer</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
