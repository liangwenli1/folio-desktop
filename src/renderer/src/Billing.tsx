// The plan and what it allows (delivery design 24): the current plan with its quotas and the expiry reminder, the
// plan's details and the latest payments; the usage; and every payment. Changing the plan and reading an invoice
// happen on the website, which this page opens. The plans and prices are the real ones, so nothing here is marked as
// a sample.
import { useEffect, useState, type ReactNode } from 'react';
import { folio, type Payment, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { day, type Dict, type Lang } from './i18n';
import { isPaid, planStatus } from './plan';
import { Empty, LoadFailed, SkelRows, Switch, Tabs, useFail } from './ui';

type Tab = 'plan' | 'usage' | 'payments';

export function BillingPage({ d, lang, ws, data, manager, used }: {
  d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData; manager: boolean; used: number;
}){
  const B = d.billing;
  const fail = useFail();
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
    catch (err){ setExpiry(!on); fail(err); }
  }

  // A quota: what is used of it, with a bar when it has a limit (none is drawn for an unlimited one).
  const quota = (label: string, n: number, limit: number | null, testId?: string) => (
    <div className="quota">
      <span className="quota-h"><b>{label}</b><span className="mono" data-testid={testId}>{n} / {limit === null ? B.unlimited : limit}</span></span>
      {limit !== null && <span className="meter"><i style={{ width: `${Math.min(100, (n / limit) * 100)}%` }} /></span>}
    </div>
  );
  const status = s.status === 'trialing' ? B.statusTrial : B.statusActive;
  const ends = s.currentPeriodEnd ?? s.trialEndsAt;
  const paymentsTable = (list: Payment[] | null, empty: ReactNode) => (
    <div className="tw bill-t">
      <table>
        <thead>
          <tr><th scope="col">{B.invoice}</th><th className="mid" scope="col">{B.date}</th><th scope="col">{B.item}</th>
            <th scope="col" className="num">{B.amount}</th><th className="mid" scope="col">{B.status}</th><th className="act" scope="col">{d.profiles.cols.actions}</th></tr>
        </thead>
        <tbody>
          {failed && <tr className="empty"><td colSpan={6}><LoadFailed d={d} onRetry={() => void load()} /></td></tr>}
          {!failed && list === null && <SkelRows cols={6} rows={3} />}
          {!failed && list !== null && !list.length && <tr className="empty"><td colSpan={6}>{empty}</td></tr>}
          {(list ?? []).map(x => (
            <tr key={x.id}>
              <td className="mono">{x.invoiceNumber}</td>
              <td className="mid">{day(x.createdAt, lang)}</td>
              <td>{x.lines.map(l => (l.kind === 'plan' ? d.plans[l.plan] : d.plan.addProfiles)).join(' · ')}</td>
              <td className="num">{(x.amountCents / 100).toFixed(2)} {x.currency.toUpperCase()}</td>
              <td className="mid"><span className={`dot-st${x.refundedAt ? '' : ' run'}`}>{x.refundedAt ? B.refunded : B.paid}</span></td>
              <td className="act"><button className="btn btn-sm btn-secondary" type="button" onClick={() => folio.openSite(`${site}/invoice/?id=${x.id}`)}>{B.open}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const noPayments = <Empty icon="billing" title={B.none} text={B.noneHint} />;

  return (
    <div className="page">
      <main className="main">
        <div className="bar"><Tabs label={B.title} value={tab} tabs={['plan', 'usage', 'payments']} name={t => B.tabs[t]} onChange={setTab} /></div>

        {tab === 'plan' && (
          <div className="bill">
            <section className="sec" aria-labelledby="bill-now">
              <h3 id="bill-now">{B.current}</h3>
              <div className="bill-now">
                <div className="plan-box">
                  <span className={`badge ${s.status === 'trialing' ? 'info' : 'good'}`}>{status}</span>
                  <p className="bill-plan" data-testid="plan-name">{d.plans[s.plan]}</p>
                  <p className="hint" data-testid="plan-status">{planStatus(s, d, lang)}</p>
                  {manager && (
                    <button className="btn btn-secondary" type="button" data-testid="plan-buy" onClick={() => folio.openSite(`${site}/checkout/?ws=${ws.id}`)}>
                      {isPaid(s) ? d.plan.addProfiles : B.change}
                    </button>
                  )}
                </div>
                <div className="quotas">
                  <h4>{B.limits}</h4>
                  {quota(B.profiles, used, e.profiles)}
                  {quota(B.members, data.members.length, e.members)}
                  {quota(B.proxies, data.proxies.length, null)}
                </div>
                <div className="bill-remind">
                  <Switch label={B.expiry} checked={expiry} disabled={!manager} onChange={on => void setReminder(on)} />
                  <p className="hint">{B.expiryHint}</p>
                </div>
              </div>
            </section>
            <section className="sec" aria-labelledby="bill-details">
              <h3 id="bill-details">{B.details}</h3>
              <dl className="kvl bill-kv">
                <dt>{B.planRow}</dt><dd>{d.plans[s.plan]}</dd>
                <dt>{B.status}</dt><dd>{status}</dd>
                {s.currentPeriodStart && <><dt>{B.since}</dt><dd>{day(s.currentPeriodStart, lang)}</dd></>}
                {ends && <><dt>{B.until}</dt><dd>{day(ends, lang)}</dd></>}
                <dt>{B.renew}</dt><dd>{isPaid(s) && !s.cancelAtPeriodEnd ? B.yes : B.no}</dd>
              </dl>
            </section>
            {manager && (
              <section className="sec" aria-labelledby="bill-recent">
                <div className="sec-row"><h3 id="bill-recent">{B.payments}</h3>
                  {payments && payments.length > 5 && <button type="button" className="btn btn-text btn-sm" onClick={() => setTab('payments')}>{B.all}</button>}</div>
                {paymentsTable(payments && payments.slice(0, 5), noPayments)}
              </section>
            )}
          </div>
        )}

        {tab === 'usage' && (
          <section className="sec use" aria-labelledby="bill-usage">
            <h3 id="bill-usage">{B.limits}</h3>
            <div className="quotas wide">
              {quota(B.profiles, used, e.profiles, 'plan-usage')}
              {quota(B.members, data.members.length, e.members)}
              {quota(B.proxies, data.proxies.length, null)}
              <div className="quota"><span className="quota-h"><b>{B.logDays}</b><span>{B.logKept(e.logDays)}</span></span></div>
            </div>
          </section>
        )}

        {tab === 'payments' && <div className="bill-all">{paymentsTable(payments, noPayments)}</div>}
      </main>
    </div>
  );
}
