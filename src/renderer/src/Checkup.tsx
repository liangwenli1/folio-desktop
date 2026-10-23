// The health check: what the self-check page found inside a profile's browser, held against what the profile should
// show (its exit, its settings, the rest of the team), as a passport-style report with a stamp when all is well.
import type { CheckupFacts } from '@shared/bridge';
import type { Geo, Profile } from './api';
import type { Dict, Lang } from './i18n';
import { Icon, Modal } from './ui';

export type Report = NonNullable<Profile['report']>;
type Check = Report['checks'][number];

const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.|f[cd][0-9a-f]{2}:|fe80:)/i;
const SYSTEM: Record<Profile['os'], RegExp> = { windows: /Windows NT/, macos: /Macintosh|Mac OS X/, linux: /Linux(?!.*Android)/ };

// The report for one profile. `geo` is where its line exits; `others` are the team's other profiles.
export function buildReport(p: Profile, facts: CheckupFacts, exitIp: string | null, geo: Geo | null, others: Profile[]): Omit<Report, 'at'> {
  const leaked = facts.ips.filter(ip => PRIVATE.test(ip) || (exitIp !== null && ip !== exitIp));
  const tz = p.timezoneOverride ?? geo?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lang = p.localeOverride ?? geo?.locale ?? 'en-US';
  const twin = others.find(o => o.id !== p.id && o.report?.canvas === facts.canvas);
  const checks: Check[] = [
    { id: 'webrtc', ok: !leaked.length, seen: facts.ips.join(', ').slice(0, 300), want: exitIp },
    { id: 'timezone', ok: facts.timezone === tz, seen: facts.timezone, want: tz },
    { id: 'language', ok: facts.language === lang, seen: facts.language, want: lang },
    { id: 'ua', ok: SYSTEM[p.os].test(facts.userAgent), seen: facts.userAgent.slice(0, 300), want: null },
    { id: 'canvas', ok: !twin, seen: facts.canvas, want: twin ? twin.name.slice(0, 300) : null }
  ];
  return { checks, canvas: facts.canvas, webgl: facts.webgl };
}

export const passed = (r: Pick<Report, 'checks'>) => r.checks.every(c => c.ok);

export function ReportDialog({ d, lang, p, report, busy, onAgain, onClose }: { d: Dict; lang: Lang; p: Profile; report: Report; busy: boolean; onAgain(): void; onClose(): void }){
  const C = d.checkup;
  const ok = passed(report);
  const when = new Date(report.at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <Modal title={C.title(p.name)} closeLabel={d.common.close} onClose={onClose} foot={<>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={onAgain}>{busy && <span className="spin" aria-hidden="true" />}{busy ? C.running : C.again}</button>
      <button className="btn btn-primary" type="button" onClick={onClose}>{d.common.close}</button>
    </>}>
      <div className="m-body">
        <article className="report" data-testid="report">
          <header className="id-head"><span>{C.card}</span><span>{when}</span></header>
          <div className={`stamp report-stamp ${ok ? 'ok' : 'warn'} thud`} aria-hidden="true">
            <span className="s-top">FOLIO</span><span className="s-main">{ok ? C.passed : C.review}</span><span className="s-date">#{String(p.number).padStart(4, '0')}</span>
          </div>
          <p className="sr" role="status">{ok ? C.passed : C.review}</p>
          <ol className="report-list">
            {report.checks.map(c => (
              <li key={c.id} className={c.ok ? 'ok' : 'bad'} data-check={c.id}>
                <span className="ic" aria-hidden="true"><Icon name={c.ok ? 'check' : 'x'} /></span>
                <div>
                  <p className="ck-t">{C.checks[c.id].t}</p>
                  <p className="ck-d">{C.seen}<span className="mono">{c.seen || C.none}</span>{c.want && <>{` · ${C.want}`}<span className="mono">{c.want}</span></>}</p>
                  {!c.ok && <p className="ck-fix">{C.checks[c.id].fix}</p>}
                </div>
              </li>
            ))}
          </ol>
        </article>
      </div>
    </Modal>
  );
}
