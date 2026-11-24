// Sauvegardes en ligne (Supabase). Facultatives : le jeu reste entièrement jouable
// hors connexion avec les sauvegardes locales IndexedDB.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { GameState } from '../engine/types';
import { migrate, type SaveMeta } from '../save/db';

// Clé « publishable » : publique par conception, l'accès aux données est protégé par la RLS.
const URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://nvhhuziraoqhgowhidot.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_3Od_bGjggclv2zQnOqQ1nw_opRfIwuC';

let client: SupabaseClient | null = null;
export function cloud(): SupabaseClient {
  if (!client) client = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

const fr = (m: string) => {
  if (/Invalid login credentials/i.test(m)) return 'Adresse e-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return 'Adresse e-mail non confirmée : cliquez sur le lien reçu par e-mail.';
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cette adresse.';
  if (/Password should be/i.test(m)) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (/rate limit/i.test(m)) return 'Trop de tentatives, réessayez dans quelques minutes.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion au serveur impossible (êtes-vous hors ligne ?).';
  return m;
};
const fail = (e: { message: string } | null) => { if (e) throw new Error(fr(e.message)); };

export async function getSession(): Promise<Session | null> {
  const { data } = await cloud().auth.getSession();
  return data.session;
}
export function onAuth(fn: (s: Session | null) => void) {
  const { data } = cloud().auth.onAuthStateChange((_e, s) => fn(s));
  return () => data.subscription.unsubscribe();
}
export async function signUp(email: string, password: string): Promise<'confirm' | 'ok'> {
  const { data, error } = await cloud().auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  fail(error);
  return data.session ? 'ok' : 'confirm';
}
export async function signIn(email: string, password: string) {
  const { error } = await cloud().auth.signInWithPassword({ email, password });
  fail(error);
}
export async function signOut() { await cloud().auth.signOut(); }

export async function cloudList(): Promise<SaveMeta[]> {
  const { data, error } = await cloud().from('saves').select('slot,title,mode,day,inmates,balance,version,saved_at').order('saved_at', { ascending: false });
  fail(error);
  return (data ?? []).map((r) => ({ slot: r.slot, title: r.title, mode: r.mode, day: r.day, inmates: r.inmates, balance: r.balance, version: r.version, savedAt: Date.parse(r.saved_at) }));
}
export async function cloudSave(slot: string, s: GameState) {
  const { error } = await cloud().from('saves').upsert({
    slot, title: s.title, mode: s.mode, day: Math.floor(s.time / 1440) + 1, inmates: s.inmates.length,
    balance: Math.round(s.finance.balance), version: s.version, saved_at: new Date().toISOString(), data: s,
  }, { onConflict: 'user_id,slot' });
  fail(error);
}
export async function cloudLoad(slot: string): Promise<GameState> {
  const { data, error } = await cloud().from('saves').select('data').eq('slot', slot).maybeSingle();
  fail(error);
  if (!data) throw new Error('Sauvegarde en ligne introuvable.');
  return migrate(data.data);
}
export async function cloudDelete(slot: string) {
  const { error } = await cloud().from('saves').delete().eq('slot', slot);
  fail(error);
}
