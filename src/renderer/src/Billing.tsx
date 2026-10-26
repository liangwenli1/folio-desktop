// The plan this workspace is on, what it has used of it, and what it has paid. Changing the plan and reading an
// invoice happen on the website, which this page opens.
import { useEffect, useState } from 'react';
import { folio, isApiError, type Payment, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { day, errorText, type Dict, type Lang } from './i18n';
import { isPaid, planStatus } from './plan';
import { Empty, LoadFailed, Switch, useToast } from './ui';

type Tab = 'plan' | 'usage' | 'payments';

export function BillingPage({ d, lang, ws, data, manager, used }: {
  d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData; manager: boolean; used: number;
}){
  const B = d.billing;
  const toast = useToast();
  const s = ws.subscription, e = s.entitlements;
  const [tab, setTab] = useState<Tab>('plan');
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expiry, setExpiry] = useState(ws.settings.expiryReminder);
  const site = `/${lang}`;

  const load = () => folio.api<{ payments: Payment[] }>('GET', `/workspaces/${ws.id}/payments`)
    .then(r => { setPayments(r.payments); setFailed(false); }, () => setFailed(true));
  useEffect(() => { if (manager) void load(); }, [ws.id, manager]);

  async function setReminder(on: boolean){
    setExpiry(on);
    try { await folio.api('PATCH', `/workspaces/${ws.id}`, { settings: { expiryReminder: on } }); }
    catch (err){ setExpiry(!on); toast(errorText(d, isApiError(err) ? err.code : 'internal'), undefined, 'bad'); }
  }

  // No bar where there is no limit to fill.
  const bar = (n: number, limit: number | null) => (limit === null ? null : <span className="meter"><i style={{ width: `${Math.min(100, (n / limit) * 100)}%` }} /></span>);
  const of = (n: number, limit: number | null) => `${n} / ${limit === null ? B.unlimited : limit}`;

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{B.title}</h1><p className="sub">{B.lead}</p></div>
          <span className="sp" />
          {manager && (
            <button className="btn btn-primary" type="button" data-testid="plan-buy" onClick={() => folio.openSite(`${site}/checkout/?ws=${ws.id}`)}>
              {isPaid(s) ? d.plan.addProfiles : B.change}
            </button>
          )}
        </header>

        <div className="filters">
          <div className="tabs" role="tablist" aria-label={B.title}>
            {(['plan', 'usage', 'payments'] as const).map(t => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{B.tabs[t]}</button>
            ))}
          </div>
        </div>

        {tab === 'plan' && (
          <div className="dgrid bill">
            <section className="sec" aria-label={B.current}>
              <h3>{B.current}</h3>
              <p className="bill-plan" data-testid="plan-name">{d.plans[s.plan]}</p>
              <dl className="kvl">
                <dt>{B.status}</dt><dd>{s.status === 'trialing' ? B.statusTrial : B.statusActive}</dd>
                {s.currentPeriodStart && <><dt>{B.since}</dt><dd>{day(s.currentPeriodStart, lang)}</dd></>}
                {s.currentPeriodEnd && <><dt>{B.until}</dt><dd>{day(s.currentPeriodEnd, lang)}</dd></>}
                <dt>{B.renew}</dt><dd>{s.cancelAtPeriodEnd ? B.no : B.yes}</dd>
              </dl>
              <p className="hint" data-testid="plan-status">{planStatus(s, d, lang)}</p>
            </section>
            <section className="sec" aria-label={B.expiry}>
              <div className="set-row">
                <Switch label={B.expiry} checked={expiry} disabled={!manager} onChange={on => void setReminder(on)} />
                <p className="hint">{B.expiryHint}</p>
              </div>
            </section>
          </div>
        )}

        {tab === 'usage' && (
          <section className="sec use" aria-label={B.limits}>
            <h3>{B.limits}</h3>
            <dl className="use-list">
              <div><dt>{B.profiles}</dt><dd data-testid="plan-usage">{of(used, e.profiles)}</dd>{bar(used, e.profiles)}</div>
              <div><dt>{B.members}</dt><dd>{of(data.members.length, e.members)}</dd>{bar(data.members.length, e.members)}</div>
              <div><dt>{B.logDays}</dt><dd>{B.logKept(e.logDays)}</dd></div>
            </dl>
          </section>
        )}

        {tab === 'payments' && (
          <div className="tw top-gap">
            <table>
              <thead>
                <tr><th scope="col">{B.invoice}</th><th scope="col">{B.date}</th><th scope="col">{B.item}</th>
                  <th scope="col" className="num">{B.amount}</th><th scope="col">{B.status}</th><th className="act" scope="col">{d.profiles.cols.actions}</th></tr>
              </thead>
              <tbody>
                {failed && <tr className="empty"><td colSpan={6}><LoadFailed d={d} onRetry={() => void load()} /></td></tr>}
                {!failed && payments !== null && !payments.length && (
                  <tr className="empty"><td colSpan={6}><Empty icon="billing" title={B.none} text={B.noneHint} /></td></tr>
                )}
                {(payments ?? []).map(x => (
                  <tr key={x.id}>
                    <td className="mono">{x.invoiceNumber}</td>
                    <td>{day(x.createdAt, lang)}</td>
                    <td>{x.lines.map(l => (l.kind === 'plan' ? d.plans[l.plan] : d.plan.addProfiles)).join(' · ')}</td>
                    <td className="num">{(x.amountCents / 100).toFixed(2)} {x.currency.toUpperCase()}</td>
                    <td><span className={`dot-st${x.refundedAt ? '' : ' run'}`}>{x.refundedAt ? B.refunded : B.paid}</span></td>
                    <td className="act"><button className="btn btn-sm btn-secondary" type="button" onClick={() => folio.openSite(`${site}/invoice/?id=${x.id}`)}>{B.open}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
