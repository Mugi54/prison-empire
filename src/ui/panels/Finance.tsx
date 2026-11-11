// Finances : tableau de bord, flux par poste, prévisions, dettes et contrats.
import * as E from '../../engine';
import { LineChart, Section, money } from '../common';
import { ctl } from '../controller';

function Lines({ data, labels, sign }: { data: Record<string, number>; labels: Record<string, string>; sign: 1 | -1 }) {
  const rows = Object.entries(data).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <div className="empty">Aucun flux.</div>;
  return <>{rows.map(([k, v]) => <div key={k} className="flow"><span>{labels[k] ?? k}</span><div className="flow-bar"><i style={{ width: `${(v / max) * 100}%`, background: sign > 0 ? 'var(--good)' : 'var(--bad)' }} /></div><b>{money(v)}</b></div>)}</>;
}

export function FinancePanel() {
  const s = ctl.state!;
  const f = s.finance;
  const r = E.computeRates(s);
  const fc = E.forecast(s);
  const hist = f.history.slice(-30);
  const nets = hist.map((h) => E.sum(h.inc) - E.sum(h.exp));
  const todayNet = E.sum(f.today.inc) - E.sum(f.today.exp);
  return (
    <>
      <div className="fin-top">
        <div className="fin-card"><small>Solde disponible</small><b className={f.balance < 0 ? 'neg' : ''}>{money(f.balance)}</b></div>
        <div className="fin-card"><small>Revenus quotidiens</small><b className="pos">{money(fc.inc)}</b></div>
        <div className="fin-card"><small>Dépenses quotidiennes</small><b className="neg">{money(fc.exp)}</b></div>
        <div className="fin-card"><small>Résultat net prévu</small><b className={fc.net < 0 ? 'neg' : 'pos'}>{fc.net >= 0 ? '+' : ''}{money(fc.net)}</b></div>
      </div>
      {f.deficitDays > 0 && <p className="warn box">Trésorerie négative depuis {f.deficitDays} jour(s). Conséquences : agios quotidiens ; dès 3 jours, réputation et confiance des autorités en baisse ; dès 5 jours, alimentation réduite et salaires en retard{s.rules.bankruptcy ? ' ; à 12 jours, mise sous administration' : ''}.</p>}
      {f.fundingCut.until > s.time && <p className="warn box">Financement public réduit à {Math.round(f.fundingCut.factor * 100)} % jusqu'au jour {E.clock(f.fundingCut.until).day}.</p>}

      <div className="two">
        <Section title="Revenus courants (par jour)"><Lines data={r.inc} labels={E.INCOME_LABEL} sign={1} /></Section>
        <Section title="Dépenses courantes (par jour)"><Lines data={r.exp} labels={E.EXPENSE_LABEL} sign={-1} /></Section>
      </div>

      <div className="two">
        <Section title="Historique du solde"><LineChart series={[{ name: 'Solde', color: '#f2a33a', data: hist.map((h) => h.balance) }]} labels={hist.map((h) => h.day)} /></Section>
        <Section title="Résultat net par jour"><LineChart series={[{ name: 'Revenus', color: '#4fd39a', data: hist.map((h) => E.sum(h.inc)) }, { name: 'Dépenses', color: '#ef6a5b', data: hist.map((h) => E.sum(h.exp)) }, { name: 'Net', color: '#7fb4ff', data: nets }]} labels={hist.map((h) => h.day)} /></Section>
      </div>

      <div className="two">
        <Section title="Journée en cours">
          <div className="kv"><span>Recettes encaissées</span><b className="pos">{money(E.sum(f.today.inc))}</b></div>
          <div className="kv"><span>Dépenses réglées</span><b className="neg">{money(E.sum(f.today.exp))}</b></div>
          {Object.entries(f.today.exp).filter(([k]) => ['construction', 'equipements', 'formations', 'recherche', 'divers'].includes(k)).map(([k, v]) => <div key={k} className="kv sub"><span>dont {E.EXPENSE_LABEL[k]?.toLowerCase()}</span><b>{money(v)}</b></div>)}
          <div className="kv"><span>Résultat provisoire</span><b className={todayNet < 0 ? 'neg' : 'pos'}>{money(todayNet)}</b></div>
        </Section>
        <Section title="Prévisions (au rythme actuel)">
          <div className="kv"><span>Solde dans 7 jours</span><b className={fc.in7 < 0 ? 'neg' : ''}>{money(fc.in7)}</b></div>
          <div className="kv"><span>Solde dans 30 jours</span><b className={fc.in30 < 0 ? 'neg' : ''}>{money(fc.in30)}</b></div>
          <div className="kv"><span>Jours bénéficiaires consécutifs</span><b>{f.positiveDays}</b></div>
          {f.grants.filter((g) => g.until > s.time).map((g, k) => <div key={k} className="kv sub"><span>{g.name} (jusqu'au jour {E.clock(g.until).day})</span><b>{g.perDay > 0 ? '+' : ''}{money(g.perDay)}/j</b></div>)}
        </Section>
      </div>

      <div className="two">
        <Section title="Dettes" right={<span className="tag">{money(E.totalDebt(s))}</span>}>
          {f.loans.length === 0 && <div className="empty">Aucun emprunt en cours.</div>}
          {f.loans.map((l) => <div key={l.id} className="kv"><span>Emprunt de {money(l.amount)} · {money(l.daily)}/j</span><b>{money(l.remaining)} <button className="small" onClick={() => ctl.act((g) => E.repayLoan(g, l.id), 'Emprunt soldé.')}>Solder</button></b></div>)}
          <div className="row">{[10000, 25000, 50000].map((a) => <button key={a} onClick={() => ctl.act((g) => E.takeLoan(g, a))} title="Remboursement sur 30 jours, 15 % d'intérêts">Emprunter {money(a)}</button>)}</div>
        </Section>
        <Section title="Contrats institutionnels">
          {E.CONTRACTS.map((c) => {
            const signed = f.contracts.find((x) => x.id === c.id);
            const pb = c.research && !E.hasResearch(s, c.research) ? 'Recherche « Contrats institutionnels » requise' : s.mode === 'career' && s.career.grade < c.grade ? `Catégorie ${c.grade + 1} requise` : c.check(s);
            return (
              <div key={c.id} className={'card' + (signed ? ' on' : '')}>
                <div className="grow"><b>{c.name} · +{money(c.perDay)}/j</b><p>{c.desc}</p><small className={pb ? 'neg' : 'pos'}>{pb ?? 'Conditions remplies'}{signed && signed.failDays > 0 ? ` · ${signed.failDays}/3 jours non honorés` : ''}</small></div>
                {signed ? <button className="small" onClick={() => ctl.act((g) => E.cancelContract(g, c.id))}>Résilier</button> : <button className="primary small" disabled={!!pb} onClick={() => ctl.act((g) => E.signContract(g, c.id))}>Signer</button>}
              </div>
            );
          })}
        </Section>
      </div>
    </>
  );
}
