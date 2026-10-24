import { useEffect, useState } from 'react';
import type { KernelProgress, ProfileStatus } from '@shared/bridge';
import { folio, isApiError, type ActivityEntry, type Extension, type Profile } from './api';
import { dayLabel, describe, time } from './Activity';
import { ENGINES, fingerprintFacts, type Check, type CheckLevel, type Fix, type Health } from './checks';
import { day, errorText, runTime, type Dict, type Lang } from './i18n';
import { ExtIcon, Icon, Progress, bytes, percent, useOutsideClose, useToast, type IconName } from './ui';
import { EngineLogo, Flag, SearchLogo } from './Flag';
import { ReportDialog, buildReport, passed, type Report } from './Checkup';
import type { Risk } from './risks';

interface Props {
  d: Dict; lang: Lang; p: Profile; h: Health; status?: ProfileStatus; progress?: KernelProgress; group: string; now: number;
  // The download size of the profile's engine version, when the catalog has it; why its last launch here failed.
  size: number | null; failed?: string;
  // What could tie it to other profiles; the team's profiles, for the health check's comparisons.
  risks: Risk[]; others: Profile[]; onStar(): void;
  // The assigned person's email, when there is one; the extensions installed in it.
  owner: string | null; extensions: Extension[]; activity: ActivityEntry[];
  busy: string | null; canTakeOver: boolean; canTrash: boolean; canExport: boolean;
  onClose(): void; onTakeover(): void; onExport(format: 'json' | 'netscape'): void; onImport(text: string): void; onOpen(): void; onStop(): void; onEdit(): void; onTrash(): void; onFix(f: Fix): void;
}
type Tab = 'overview' | 'signins' | 'extensions' | 'activity';

// Open on another computer (this computer's own runs show up as a status instead).
export const elsewhere = (p: Profile) => (p.lock && !p.lock.self ? p.lock : null);
export const busyLabel = (d: Dict, state: string) => (state === 'restoring' ? d.profiles.restoring : state === 'saving' ? d.profiles.saving : d.profiles.starting);

const IC: Record<CheckLevel, IconName> = { ok: 'check', todo: 'download', warn: 'alert', bad: 'x' };
const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

export function ProfileDetail({ d, lang, p, h, status, progress, size: engineSize, failed, risks, others, onStar, group, owner, extensions, activity, now, busy, canTakeOver, canTrash, canExport, onClose, onOpen, onStop, onEdit, onTrash, onFix, onTakeover, onExport, onImport }: Props){
  const [tab, setTab] = useState<Tab>('overview');
  const [more, setMore] = useState(false);
  const moreRef = useOutsideClose(more, () => setMore(false));
  const [confirmTakeover, setConfirmTakeover] = useState(false);
  useEffect(() => setConfirmTakeover(false), [p?.id, p?.lock?.since]);
  const toast = useToast();
  // The health check: run in the profile's browser, compared with the team, saved for everyone, shown as a report.
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => setReport(null), [p.id]);
  async function checkup(){
    setChecking(true);
    try {
      const { facts, exitIp, exitGeo } = await folio.checkup(p.id);
      const r = buildReport(p, facts, exitIp, exitGeo ?? h.geo, others);
      await folio.api('PUT', `/profiles/${p.id}/report`, r);
      setReport({ ...r, at: new Date().toISOString() });
    } catch (e){ toast(errorText(d, isApiError(e) && e.code ? e.code : 'checkup_failed'), undefined, 'bad'); } finally { setChecking(false); }
  }
  const num = String(p.number).padStart(4, '0');
  const away = elsewhere(p);
  const geo = h.geo, px = h.line ?? h.px, facts = fingerprintFacts(p.fingerprint);
  const tz = p.timezoneOverride ?? geo?.timezone ?? null, locale = p.localeOverride ?? geo?.locale ?? null;
  const kernel = ENGINES[p.kernel];
  const latest = h.checks.find(c => c.fix?.kind === 'use-engine')?.fix;
  const vars = {
    ms: px?.lastCheck?.ms ?? 0, host: px ? `${px.type.toUpperCase()} · ${px.host}:${px.port}` : '', city: geo?.city ?? geo?.countryName ?? '',
    tz: geo?.timezone ?? tz ?? '', set: p.timezoneOverride ?? '', setLang: p.localeOverride ?? '',
    lang: locale ? `${locale}, ${locale.split('-')[0]}` : '', country: geo?.countryName ?? '', version: p.kernelVersion,
    latest: latest && 'version' in latest ? `${kernel} ${latest.version}` : '', size: engineSize ? bytes(engineSize) : '—', kernel
  };
  const fixLabel = (f: Fix) => (f.kind === 'use-engine' ? d.fixes.use(`${kernel} ${f.version.split('.')[0]}`) : d.fixes[f.kind]);
  const fixKey = (f: Fix) => `${f.kind}:${'proxyId' in f ? f.proxyId : 'version' in f ? f.version : ''}`;
  const downloading = progress && !progress.finished && !progress.error;
  const P = d.profiles;

  let primary, chip;
  if (status?.state === 'running'){
    primary = <button type="button" className="btn btn-primary" onClick={onStop}><Icon name="stop" />{P.stop}</button>;
    chip = <span className="st run"><Icon name="play" />{P.st.running}<span className="sub">{runTime(now - (status.startedAt ?? now))}</span></span>;
  } else if (status || downloading){
    const label = status ? busyLabel(d, status.state) : P.downloading(percent(progress!));
    primary = <button type="button" className="btn btn-secondary" disabled><span className="spin" aria-hidden="true" />{label}</button>;
    chip = <span className="st boot"><span className="spin" aria-hidden="true" />{label}</span>;
  } else if (away){
    primary = canTakeOver
      ? <button type="button" className="btn btn-secondary" onClick={() => setConfirmTakeover(true)}>{d.detail.takeover}</button>
      : <button type="button" className="btn btn-secondary" disabled>{d.detail.inUse}</button>;
    chip = <span className="st away"><Icon name="monitor" />{P.inUseOn(away.deviceName ?? away.email)}</span>;
  } else {
    primary = <button type="button" className="btn btn-primary" onClick={onOpen}><Icon name="play" />{d.detail.openProfile}</button>;
    chip = failed ? <span className="st bad"><Icon name="alert" />{d.launch[failed] ?? d.launch.launch_failed}</span> : <span className="st idle"><Icon name="pause" />{P.st.idle}</span>;
  }

  const row = (c: Check) => {
    const text = d.checks[c.id];
    return (
      <li key={c.id} className={c.level} data-check={c.id}>
        <span className="ic" aria-hidden="true"><Icon name={IC[c.level]} /></span>
        <div>
          <span><span className="sr">{d.detail.status[c.level]}: </span>{text.t(vars)}</span>
          {text.d(vars) && <span className="ck-d">{text.d(vars)}</span>}
          {c.fix && (
            <button type="button" className="btn btn-xs btn-secondary" disabled={busy === fixKey(c.fix)} onClick={() => onFix(c.fix!)}>
              {busy === fixKey(c.fix) && <span className="spin" aria-hidden="true" />}{fixLabel(c.fix)}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <>
      <div className="d-top">
        <span className="mono">#{num}</span>
        <button type="button" className={`icon-btn bare sm star${p.starred ? ' on' : ''}`} aria-pressed={p.starred} aria-label={p.starred ? P.unstar : P.star} title={p.starred ? P.unstar : P.star} onClick={onStar}><Icon name="star" /></button>
        <button type="button" className="icon-btn bare sm" aria-label={d.detail.close} onClick={onClose}><Icon name="x" /></button>
      </div>
      <article className="idcard" aria-label={p.name}>
        <div className="idc-top">
          <Flag country={geo?.country ?? null} kernel={p.kernel} size="lg" />
          <div><h2 data-testid="detail-name">{p.name}</h2><span className="mono">#{num} · {group}</span></div>
        </div>
        <div className="idc-city">
          <b>{geo ? geo.city ?? geo.countryName : px ? (h.proxy === 'down' ? d.detail.noExit : d.detail.notChecked) : d.detail.direct}</b>
          <span className="mono">{px?.lastCheck?.ip ?? (px ? '' : d.detail.directSub)}</span>
        </div>
        {chip}
      </article>
      {geo && <p className="attrib">{d.common.attribution}</p>}
      {away && (
        <div className="away-note" data-testid="away">
          <p>{d.detail.away(away.deviceName ?? '—', away.email, new Date(away.since).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' }))}</p>
          {confirmTakeover && <>
            <p className="muted">{d.detail.takeoverNote}</p>
            <div className="d-actions">
              <button type="button" className="btn btn-text btn-sm" onClick={() => setConfirmTakeover(false)}>{d.common.cancel}</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { setConfirmTakeover(false); onTakeover(); }}>{d.detail.takeoverDo}</button>
            </div>
          </>}
        </div>
      )}
      <div className="d-actions">
        {primary}
        <button type="button" className="btn btn-secondary" onClick={onEdit}>{d.detail.edit}</button>
        <button type="button" className="btn btn-secondary" title={d.checkup.lead} disabled={checking || !!away} onClick={() => void checkup()}>
          {checking && <span className="spin" aria-hidden="true" />}{checking ? d.checkup.running : d.checkup.run}
        </button>
        {canTrash && (
          <div className="d-more" ref={moreRef}>
            <button type="button" className="icon-btn bare" aria-label={d.detail.more} aria-haspopup="menu" aria-expanded={more} onClick={() => setMore(o => !o)}><Icon name="more" /></button>
            {more && (
              <div className="menu" role="menu">
                <button className="menu-item danger" type="button" role="menuitem" onClick={() => { setMore(false); onTrash(); }}>{d.detail.trash}</button>
              </div>
            )}
          </div>
        )}
      </div>

      {(status || downloading) && status?.state !== 'running' && status?.state !== 'saving' && <Opening d={d} p={p} h={h} status={status} progress={downloading ? progress : undefined} />}

      <div className="tabs" role="tablist" aria-label={d.detail.profile}>
        {(['overview', 'signins', 'extensions', 'activity'] as const).map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {d.detail.tabs[t]}{t === 'extensions' && extensions.length > 0 && <small>{extensions.length}</small>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <>
        <section className="sec" aria-label={d.detail.fingerprint}>
          <h3>{d.detail.fingerprint}</h3>
          <dl className="kvl">
            <dt>{d.detail.fields.os}</dt><dd>{d.os[p.os]}</dd>
            <dt>{d.detail.fields.engine}</dt><dd><EngineLogo kernel={p.kernel} size={14} />{kernel} {p.kernelVersion}</dd>
            <dt>{d.detail.fields.tz}</dt><dd className={`mono${h.checks.some(c => c.id === 'tz-mismatch') ? ' warn' : ''}`}>{tz ?? d.detail.hostTz}</dd>
            <dt>{d.detail.fields.lang}</dt><dd className="mono">{locale ?? d.detail.hostTz}</dd>
            <dt>{d.detail.fields.proxy}</dt><dd>{px ? `${px.type.toUpperCase()} · ${px.host}:${px.port}` : P.noProxy}</dd>
            <dt>{d.browser.search}</dt><dd><SearchLogo engine={p.searchEngine} size={14} />{d.browser.name(p.searchEngine)}</dd>
            <dt>{d.browser.start}</dt><dd>{p.restoreTabs ? d.browser.startTabs : p.searchEngine !== 'none' ? d.browser.startHome(d.browser.name(p.searchEngine)) : d.browser.startBlank}</dd>
            <dt>{facts.seed ? d.detail.fields.seed : d.detail.fields.screen}</dt><dd className="mono">{facts.seed ?? facts.screen ?? '—'}</dd>
            <dt>{d.detail.fields.cores}</dt><dd>{facts.cores ?? '—'}</dd>
            {facts.gpu && <><dt>{d.detail.fields.gpu}</dt><dd>{facts.gpu}</dd></>}
          </dl>
          <p className="hint">{d.detail.meta(group, day(p.createdAt, lang))}</p>
          <p className="hint" data-testid="assigned">{owner ? d.detail.assignedTo(owner) : P.unassigned}</p>
        </section>
        <section className="sec" aria-label={d.detail.checksTitle}>
          <div className="sec-row"><h3>{d.detail.checksTitle}</h3><span className={`verdict ${h.level}`} data-testid="verdict">{d.detail.verdict[h.level]}</span></div>
          {p.report && (
            <p className="report-line">
              {d.checkup.last(`${dayLabel(p.report.at, d, lang)} ${time(p.report.at, lang)}`, passed(p.report))}{' '}
              <button type="button" className="linkish" onClick={() => setReport(p.report)}>{d.checkup.view}</button>
            </p>
          )}
          <ul className="chk">
            {h.checks.map(row)}
            {risks.map((r, i) => {
              const level = r.level === 'info' ? 'todo' : r.level;
              const with_ = r.ids.filter(id => id !== p.id).map(id => others.find(o => o.id === id)?.name).filter(Boolean).join(lang === 'zh' ? '、' : ', ');
              return (
                <li key={`r${i}`} className={level} data-risk={r.kind}>
                  <span className="ic" aria-hidden="true"><Icon name={r.level === 'info' ? 'alert' : IC[level]} /></span>
                  <div>
                    <span><span className="sr">{d.detail.status[level]}: </span>{d.risks.kinds[r.kind].t(r.ids.length, r.what)}</span>
                    <span className="ck-d">{[with_, d.risks.kinds[r.kind].fix].filter(Boolean).join(' · ')}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        {p.notes && <section className="sec" aria-label={d.detail.notes}><h3>{d.detail.notes}</h3><p className="notes">{p.notes}</p></section>}
      </>}

      {tab === 'signins' && (
        <section className="sec" aria-label={d.detail.storage} data-testid="storage">
          <h3>{d.detail.storage}</h3>
          {p.syncMode === 'local' ? <p className="hint">{d.detail.localOnly}</p> : p.data ? <>
            <div className="store">
              <div><b>{p.data.cookies}</b><span>{d.detail.cookies}</span></div>
              <div><b>{size(p.data.storageBytes)}</b><span>{d.detail.siteData}</span></div>
              <div><b>{p.data.origins}</b><span>{d.detail.sites}</span></div>
              <div><b>{p.extensionIds.length}</b><span>{d.detail.extensions}</span></div>
            </div>
            <p className="hint">{d.detail.savedOn(`${dayLabel(p.data.savedAt, d, lang)} ${time(p.data.savedAt, lang)}`, p.data.deviceName)}</p>
          </> : <p className="hint">{d.detail.notSaved}</p>}
          <div className="d-actions">
            {canExport && p.data && p.syncMode === 'cloud' && <>
              <span className="hint">{d.detail.exportCookies}</span>
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => onExport('json')}>{d.detail.json}</button>
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => onExport('netscape')}>{d.detail.netscape}</button>
              <span className="sp" />
            </>}
            <label className="btn btn-xs btn-secondary file-btn">{d.detail.importCookies}
              <input type="file" accept=".json,.txt,text/plain,application/json" onChange={async e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onImport(await file.text());
              }} />
            </label>
          </div>
        </section>
      )}

      {tab === 'extensions' && (
        <section className="sec" aria-label={d.detail.tabs.extensions}>
          {extensions.length
            ? <ul className="ext-list">{extensions.map(x => <li key={x.id}><ExtIcon src={x.icon} />{x.name}<span className="mono">{x.version}</span></li>)}</ul>
            : <p className="hint">{d.detail.noExtensions}</p>}
        </section>
      )}

      {tab === 'activity' && (
        <section className="sec" aria-label={d.activity.recent}>
          {activity.length
            ? <ol className="acts" data-testid="recent">{activity.map(e => <li key={e.seq}><time>{dayLabel(e.at, d, lang)} {time(e.at, lang)}</time><span>{describe(d, e)}</span></li>)}</ol>
            : <p className="hint">{d.detail.noActivity}</p>}
        </section>
      )}

      {report && <ReportDialog d={d} lang={lang} p={p} report={report} busy={checking} onAgain={() => void checkup()} onClose={() => setReport(null)} />}
    </>
  );
}

// Opening the profile: the engine (downloaded first when this computer lacks it), the proxy, the sign-ins, the browser.
function Opening({ d, p, h, status, progress }: { d: Dict; p: Profile; h: Health; status?: ProfileStatus; progress?: KernelProgress }){
  const O = d.opening;
  const at = progress ? 0 : status?.state === 'restoring' ? 2 : status?.stage === 'launch' ? 3 : 1;
  const engine = `${ENGINES[p.kernel]} ${p.kernelVersion.split('.')[0]}`;
  const geo = status?.exitGeo ?? h.geo, px = h.line ?? h.px;
  const steps: [IconName, string, string][] = [
    ['engines', O.steps.engine, progress ? O.engineGet(bytes(progress.done), bytes(progress.total || progress.done)) : O.engineReady(engine)],
    ['proxies', O.steps.proxy, !px ? O.direct : at > 1 && geo ? O.exit(geo.city ?? geo.countryName, px.lastCheck?.ms ?? 0) : O.checking],
    ['download', O.steps.restore, p.syncMode === 'local' ? O.local : p.data ? O.signins(p.data.cookies, p.data.origins) : O.fresh],
    ['play', O.steps.browser, at === 3 ? O.starting : O.waiting]
  ];
  return (
    <section className="opening" aria-label={O.title} role="status">
      <p>{O.title}<span>{O.of(at + 1, steps.length)}</span></p>
      {steps.map(([icon, title, sub], i) => (
        <div key={title} className={`step-r${i < at ? ' done' : i === at ? ' now' : ''}`}>
          <span className="step-ic" aria-hidden="true">{i < at ? <Icon name="check" /> : i === at ? <span className="spin" /> : <Icon name={icon} />}</span>
          <div><b>{title}</b>{i === 0 && progress && <Progress done={progress.done} total={progress.total} />}<small>{sub}</small></div>
        </div>
      ))}
    </section>
  );
}
