// The Fingerprint tab of a profile's page: its fields (only what the engine honours), what it is saved as, whether it
// is consistent with where the proxy exits (the checks, and the health check run in its browser), and the switches
// applied at launch. A running profile keeps what it was started with until it is stopped.
import { useEffect, useState } from 'react';
import type { ProfileStatus } from '@shared/bridge';
import { folio, isApiError, type Profile } from './api';
import { ENGINES, fingerprintFacts, type Check, type CheckLevel, type Fix, type Health } from './checks';
import type { WorkspaceData } from './data';
import { errorText, type Dict, type Lang } from './i18n';
import { Icon, useFail, useToast, bytes, type IconName } from './ui';
import { CanvasField, CoresField, GpuField, LangField, ScreenField, WebrtcField, ZoneField, useFingerprint } from './Fingerprint';
import { ReportDialog, buildReport, passed, type Report } from './Checkup';
import { dayLabel, time } from './Activity';
import type { Risk } from './risks';

interface Props {
  d: Dict; lang: Lang; data: WorkspaceData; p: Profile; h: Health; status?: ProfileStatus;
  // The download size of its engine version, for the checks; what ties it to other profiles, and the team's profiles.
  size: number | null; risks: Risk[]; others: Profile[]; busy: string | null;
  onFix(f: Fix): void; onDirty(dirty: boolean): void; onSaved(): void;
}
const IC: Record<CheckLevel, IconName> = { ok: 'check', todo: 'download', warn: 'alert', bad: 'x' };

export function FingerprintTab({ d, lang, data, p, h, status, size, risks, others, busy, onFix, onDirty, onSaved }: Props){
  const T = d.fpTab, F = d.fp, D = d.detail;
  const toast = useToast(), fail = useFail();
  // The version this draft started from: a save over someone else's change is refused once, as in the edit form.
  const [base, setBase] = useState(p);
  const installed = !!data.kernels.find(k => k.kind === p.kernel && k.version === p.kernelVersion)?.installed;
  const f = useFingerprint(p, p.kernel, p.os, p.kernelVersion, installed);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const locked = !!status;
  const dirty = f.changed || f.timezoneOverride !== p.timezoneOverride || f.localeOverride !== p.localeOverride;
  useEffect(() => onDirty(dirty), [dirty]);
  const geo = h.geo, proxied = !!p.proxyId;
  const draft = f.value();
  const ua = draft?.kind === 'firefox' ? String(draft.config['navigator.userAgent'] ?? '') : p.report?.checks.find(c => c.id === 'ua')?.seen ?? '';

  async function save(){
    setTried(true);
    if (f.langBad){ document.getElementById('fp-lang')?.focus(); return; }
    if (!draft) return;
    setSaving(true);
    try {
      const ok = await data.patch(base, { timezoneOverride: f.timezoneOverride, localeOverride: f.localeOverride, ...(f.changed ? { fingerprint: draft } : {}) });
      if (!ok){ setBase(p); toast({ title: d.form.stale, tone: 'bad' }); return; }
      toast({ title: T.saved, detail: p.name });
      onSaved();
    } catch (e){ fail(e); } finally { setSaving(false); }
  }

  // What it is saved as, with the time zone and language as they come out (following the proxy, or this computer).
  const saved = fingerprintFacts(p.fingerprint);
  const follow = (own: string | null, seen: string | undefined) => own ?? seen ?? (proxied ? d.form.follow : D.hostTz);
  return (
    <div className="fpt">
      <p className={`notice ${locked ? 'warn' : 'info'} fpt-note`} role="status">
        <Icon name={locked ? 'stop' : 'info'} /><span>{locked ? T.locked : T.next}</span>
        {status?.state === 'running' && <button type="button" className="btn btn-sm btn-secondary" onClick={() => void folio.stopProfile(p.id)}>{d.form.stopNow}</button>}
      </p>
      <div className="fpt-grid">
        <section className="sec fpt-form" aria-label={F.title}>
          <h3 className="fpt-h">{T.browser}</h3>
          <div className="row2">
            <div className="field"><label htmlFor="fp-engine">{d.form.engine}</label><input id="fp-engine" value={`${ENGINES[p.kernel]} ${p.kernelVersion}`} readOnly disabled /></div>
            <div className="field"><label htmlFor="fp-os">{d.form.os}</label><input id="fp-os" value={d.os[p.os]} readOnly disabled /></div>
          </div>
          <div className="field">
            <label htmlFor="fp-ua">{T.ua}</label>
            <textarea id="fp-ua" className="mono-in" rows={2} value={ua} placeholder={T.uaLater} readOnly />
          </div>
          <h3 className="fpt-h">{T.screen}</h3>
          <div className="row2"><ScreenField d={d} f={f} disabled={locked} /></div>
          <p className="hint">{T.screenHint}</p>
          <h3 className="fpt-h">{T.langTz}</h3>
          <div className="row2">
            <LangField d={d} f={f} geo={geo} proxied={proxied} disabled={locked} error={tried && f.langBad ? d.form.langErr : null} />
            <ZoneField d={d} f={f} geo={geo} proxied={proxied} disabled={locked} />
          </div>
          <h3 className="fpt-h">{T.hardware}</h3>
          <div className="row2"><CoresField d={d} f={f} disabled={locked} /></div>
          {f.fp.state === 'loading' && <p className="hint"><span className="spin" aria-hidden="true" /></p>}
          {f.fp.state === 'error' && <p className="err">{d.form.fpErr}</p>}
          {f.regenerated && <p className="hint">{d.form.regenWarn}</p>}
        </section>

        <div className="fpt-side">
          <section className="sec" aria-label={T.current}>
            <h3 className="fpt-h">{T.current}</h3>
            <dl className="kvl">
              <dt>{d.form.os}</dt><dd>{d.os[p.os]}</dd>
              <dt>{d.form.engine}</dt><dd>{ENGINES[p.kernel]} {p.kernelVersion}</dd>
              <dt>{F.screen}</dt><dd className="mono">{saved.screen ?? F.screenHost}</dd>
              <dt>{d.form.lang}</dt><dd className="mono">{follow(p.localeOverride, geo?.locale)}</dd>
              <dt>{d.form.tz}</dt><dd className="mono">{follow(p.timezoneOverride, geo?.timezone)}</dd>
              <dt>{F.cores}</dt><dd>{saved.cores ?? '—'}</dd>
            </dl>
          </section>
          <Consistency d={d} lang={lang} p={p} h={h} size={size} risks={risks} others={others} busy={busy} onFix={onFix} />
          <section className="sec" aria-label={T.advanced}>
            <h3 className="fpt-h">{T.advanced}</h3>
            <CanvasField d={d} f={f} disabled={locked} />
            <GpuField d={d} f={f} disabled={locked} />
            <WebrtcField d={d} f={f} disabled={locked} />
          </section>
        </div>
      </div>
      <div className="fpt-foot">
        {dirty && <span className="pf-dirty"><span className="d warn" aria-hidden="true" /><b>{d.form.unsaved}</b></span>}
        <span className="sp" />
        <button type="button" className="btn btn-secondary" disabled={locked} onClick={f.defaults}>{T.defaults}</button>
        <button type="button" className="btn btn-primary" aria-busy={saving || undefined} disabled={locked || saving || !dirty || f.fp.state !== 'ready'} onClick={() => void save()}>{T.save}</button>
      </div>
    </div>
  );
}

// Whether the profile holds together: the checks (with their fixes), what ties it to other profiles, and the health
// check run in its browser, saved for everyone and shown as a report.
function Consistency({ d, lang, p, h, size, risks, others, busy, onFix }: Pick<Props, 'd' | 'lang' | 'p' | 'h' | 'size' | 'risks' | 'others' | 'busy' | 'onFix'>){
  const D = d.detail;
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const away = p.lock && !p.lock.self;
  async function checkup(){
    setChecking(true);
    try {
      const { facts, exitIp, exitGeo } = await folio.checkup(p.id);
      const r = buildReport(p, facts, exitIp, exitGeo ?? h.geo, others);
      await folio.api('PUT', `/profiles/${p.id}/report`, r);
      setReport({ ...r, at: new Date().toISOString() });
    } catch (e){ toast({ title: errorText(d, isApiError(e) && e.code ? e.code : 'checkup_failed'), tone: 'bad' }); } finally { setChecking(false); }
  }
  const geo = h.geo, px = h.line ?? h.px, kernel = ENGINES[p.kernel];
  const tz = p.timezoneOverride ?? geo?.timezone ?? null, locale = p.localeOverride ?? geo?.locale ?? null;
  const facts = fingerprintFacts(p.fingerprint);
  const latest = h.checks.find(c => c.fix?.kind === 'use-engine')?.fix;
  const vars = {
    ms: px?.lastCheck?.ms ?? 0, host: px ? `${px.type.toUpperCase()} · ${px.host}:${px.port}` : '', city: geo?.city ?? geo?.countryName ?? '',
    tz: geo?.timezone ?? tz ?? '', set: p.timezoneOverride ?? '', setLang: p.localeOverride ?? '',
    lang: locale ? `${locale}, ${locale.split('-')[0]}` : '', country: geo?.countryName ?? '', version: p.kernelVersion,
    latest: latest && 'version' in latest ? `${kernel} ${latest.version}` : '', size: size ? bytes(size) : '—', kernel,
    real: [facts.canvas === 'real' && 'Canvas', facts.webgl === 'real' && 'WebGL'].filter(Boolean).join(lang === 'zh' ? '、' : ' and ')
  };
  const fixLabel = (f: Fix) => (f.kind === 'use-engine' ? d.fixes.use(`${kernel} ${f.version.split('.')[0]}`) : d.fixes[f.kind]);
  const fixKey = (f: Fix) => `${f.kind}:${'proxyId' in f ? f.proxyId : 'version' in f ? f.version : ''}`;
  const when = (iso: string) => `${dayLabel(iso, d, lang)} ${time(iso, lang)}`;
  const row = (c: Check) => (
    <li key={c.id} className={c.level} data-check={c.id}>
      <span className="ic" aria-hidden="true"><Icon name={IC[c.level]} /></span>
      <div>
        <span><span className="sr">{D.status[c.level]}: </span>{d.checks[c.id].t(vars)}</span>
        {c.fix && (
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy === fixKey(c.fix)} onClick={() => onFix(c.fix!)}>
            {busy === fixKey(c.fix) && <span className="spin" aria-hidden="true" />}{fixLabel(c.fix)}
          </button>
        )}
      </div>
    </li>
  );
  return (
    <section className="sec" aria-label={d.fpTab.consistency} id="fp-consistency">
      <div className="sec-row">
        <h3 className="fpt-h">{d.fpTab.consistency}</h3><span className={`badge ${h.level === 'ok' ? 'good' : h.level}`} data-testid="verdict">{D.verdict[h.level]}</span>
      </div>
      <ul className="chk">
        {h.checks.map(row)}
        {risks.map((r, i) => {
          const level = r.level === 'info' ? 'todo' : r.level;
          return (
            <li key={`r${i}`} className={level} data-risk={r.kind}>
              <span className="ic" aria-hidden="true"><Icon name={r.level === 'info' ? 'alert' : IC[level]} /></span>
              <div><span><span className="sr">{D.status[level]}: </span>{d.risks.kinds[r.kind].t(r.ids.length, r.what)}</span></div>
            </li>
          );
        })}
      </ul>
      {p.report && (
        <p className="report-line">
          {d.checkup.last(when(p.report.at), passed(p.report))}{' '}
          <button type="button" className="linkish" onClick={() => setReport(p.report)}>{d.checkup.view}</button>
        </p>
      )}
      <div>
        <button type="button" className="btn btn-sm btn-secondary" title={d.checkup.lead} disabled={checking || !!away} onClick={() => void checkup()}>
          {checking && <span className="spin" aria-hidden="true" />}{checking ? d.checkup.running : d.checkup.run}
        </button>
      </div>
      {report && <ReportDialog d={d} lang={lang} p={p} report={report} busy={checking} onAgain={() => void checkup()} onClose={() => setReport(null)} />}
    </section>
  );
}
