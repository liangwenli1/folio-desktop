import { useEffect, useState } from 'react';
import type { KernelProgress, ProfileStatus } from '@shared/bridge';
import { folio, isApiError, type ActivityEntry, type Extension, type Group, type Profile } from './api';
import { dayLabel, describe, time } from './Activity';
import { ENGINES, fingerprintFacts, latencyTone, type Check, type CheckLevel, type Fix, type Health } from './checks';
import { errorText, runTime, type Dict, type Lang } from './i18n';
import { ExtIcon, Icon, MoreMenu, Progress, bytes, percent, useToast, type IconName } from './ui';
import { EngineLogo, Flag, SearchLogo } from './Flag';
import { ReportDialog, buildReport, passed, type Report } from './Checkup';
import type { Risk } from './risks';

interface Props {
  d: Dict; lang: Lang; p: Profile; h: Health; status?: ProfileStatus; progress?: KernelProgress; now: number;
  // The download size of the profile's engine version, when the catalog has it; why its last launch here failed.
  size: number | null; failed?: string;
  // What could tie it to other profiles; the team's profiles, for the health check's comparisons.
  risks: Risk[]; others: Profile[]; onStar(): void;
  // Its group's name; the assigned person's email, when there is one; the extensions installed in it.
  group: Group | null; owner: string | null; extensions: Extension[]; activity: ActivityEntry[];
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
  const away = elsewhere(p);
  const geo = h.geo, px = h.line ?? h.px, facts = fingerprintFacts(p.fingerprint);
  const tz = p.timezoneOverride ?? geo?.timezone ?? null, locale = p.localeOverride ?? geo?.locale ?? null;
  const kernel = ENGINES[p.kernel];
  const latest = h.checks.find(c => c.fix?.kind === 'use-engine')?.fix;
  const vars = {
    ms: px?.lastCheck?.ms ?? 0, host: px ? `${px.type.toUpperCase()} · ${px.host}:${px.port}` : '', city: geo?.city ?? geo?.countryName ?? '',
    tz: geo?.timezone ?? tz ?? '', set: p.timezoneOverride ?? '', setLang: p.localeOverride ?? '',
    lang: locale ? `${locale}, ${locale.split('-')[0]}` : '', country: geo?.countryName ?? '', version: p.kernelVersion,
    latest: latest && 'version' in latest ? `${kernel} ${latest.version}` : '', size: engineSize ? bytes(engineSize) : '—', kernel,
    real: [facts.canvas === 'real' && 'Canvas', facts.webgl === 'real' && 'WebGL'].filter(Boolean).join(lang === 'zh' ? '、' : ' and ')
  };
  const fixLabel = (f: Fix) => (f.kind === 'use-engine' ? d.fixes.use(`${kernel} ${f.version.split('.')[0]}`) : d.fixes[f.kind]);
  const fixKey = (f: Fix) => `${f.kind}:${'proxyId' in f ? f.proxyId : 'version' in f ? f.version : ''}`;
  const downloading = progress && !progress.finished && !progress.error;
  const P = d.profiles, D = d.detail;
  const when = (iso: string) => `${dayLabel(iso, d, lang)} ${time(iso, lang)}`;

  let primary, chip;
  if (status?.state === 'running'){
    primary = <button type="button" className="btn btn-primary" onClick={onStop}><Icon name="stop" />{P.stop}</button>;
    chip = <span className="dot-st run">{P.st.running} · {runTime(now - (status.startedAt ?? now))}</span>;
  } else if (status || downloading){
    const label = status ? busyLabel(d, status.state) : P.downloading(percent(progress!));
    primary = <button type="button" className="btn btn-secondary" disabled><span className="spin" aria-hidden="true" />{label}</button>;
    chip = <span className="dot-st boot">{label}</span>;
  } else if (away){
    primary = canTakeOver
      ? <button type="button" className="btn btn-secondary" onClick={() => setConfirmTakeover(true)}>{d.detail.takeover}</button>
      : <button type="button" className="btn btn-secondary" disabled>{d.detail.inUse}</button>;
    chip = <span className="dot-st away">{P.inUseOn(away.deviceName ?? away.email)}</span>;
  } else {
    primary = <button type="button" className="btn btn-primary" onClick={onOpen}><Icon name="play" />{d.detail.openProfile}</button>;
    chip = failed ? <span className="dot-st bad">{d.launch[failed] ?? d.launch.launch_failed}</span> : <span className="dot-st idle">{P.st.idle}</span>;
  }

  const row = (c: Check) => {
    const text = d.checks[c.id];
    return (
      <li key={c.id} className={c.level} data-check={c.id}>
        <span className="ic" aria-hidden="true"><Icon name={IC[c.level]} /></span>
        <div>
          <span><span className="sr">{d.detail.status[c.level]}: </span>{text.t(vars)}</span>
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
      <header className="dh">
        <Flag country={geo?.country ?? null} kernel={p.kernel} size="lg" />
        <div className="dh-t">
          <div className="dh-n">
            <h2 data-testid="detail-name">{p.name}</h2>
            <button type="button" className={`icon-btn bare sm star${p.starred ? ' on' : ''}`} aria-pressed={p.starred} aria-label={p.starred ? P.unstar : P.star} title={p.starred ? P.unstar : P.star} onClick={onStar}><Icon name="star" /></button>
          </div>
          <span className="dh-sub">{chip}{group && <span className="tag grp-tag"><span className={`d gc-${group.color}`} aria-hidden="true" />{group.name}</span>}</span>
        </div>
        <span className="sp" />
        {primary}
        <button type="button" className="btn btn-secondary" onClick={onEdit}>{D.edit}</button>
        {canTrash && <MoreMenu label={D.more} items={[{ label: D.trash, onClick: onTrash, danger: true }]} />}
        <button type="button" className="icon-btn bare sm" aria-label={D.close} onClick={onClose}><Icon name="x" /></button>
      </header>
      {away && (
        <div className="away-note" data-testid="away">
          <p>{D.away(away.deviceName ?? '—', away.email, new Date(away.since).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' }))}</p>
          {confirmTakeover && <>
            <p className="muted">{D.takeoverNote}</p>
            <div className="d-actions">
              <button type="button" className="btn btn-text btn-sm" onClick={() => setConfirmTakeover(false)}>{d.common.cancel}</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { setConfirmTakeover(false); onTakeover(); }}>{D.takeoverDo}</button>
            </div>
          </>}
        </div>
      )}

      {(status || downloading) && status?.state !== 'running' && status?.state !== 'saving' && <Opening d={d} p={p} h={h} status={status} progress={downloading ? progress : undefined} />}

      <div className="tabs" role="tablist" aria-label={d.detail.profile}>
        {(['overview', 'signins', 'extensions', 'activity'] as const).map(t => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {d.detail.tabs[t]}{t === 'extensions' && extensions.length > 0 && <small>{extensions.length}</small>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <>
        <div className="dgrid">
          <section className="sec" aria-label={D.basics}>
            <h3>{D.basics}</h3>
            <dl className="kvl">
              <dt>{d.form.group}</dt><dd>{group?.name ?? d.groups.none}</dd>
              <dt>{d.form.owner}</dt><dd data-testid="assigned">{owner ?? P.unassigned}</dd>
              <dt>{D.fields.os}</dt><dd><Icon name={p.os} />{d.os[p.os]}</dd>
              <dt>{D.fields.engine}</dt><dd><EngineLogo kernel={p.kernel} size={14} />{kernel} {p.kernelVersion}</dd>
              <dt>{d.browser.search}</dt><dd><SearchLogo engine={p.searchEngine} size={14} />{d.browser.name(p.searchEngine)}</dd>
              <dt>{d.browser.start}</dt><dd>{p.restoreTabs ? d.browser.startTabs : p.searchEngine !== 'none' ? d.browser.startHome(d.browser.name(p.searchEngine)) : d.browser.startBlank}</dd>
              <dt>{D.lastOpened}</dt><dd>{p.lastOpenedAt ? when(p.lastOpenedAt) : d.common.never}</dd>
              {p.notes && <><dt>{D.notes}</dt><dd className="notes">{p.notes}</dd></>}
            </dl>
          </section>
          <section className="sec" aria-label={D.proxyCard}>
            <h3>{D.proxyCard}</h3>
            {px ? <>
              <p className="px-line"><b>{px.name}</b><span className="mono">{px.type.toUpperCase()} · {px.host}:{px.port}</span></p>
              {geo && <p className="px-line"><span><Flag country={geo.country} size="xs" />{[geo.city, geo.countryName].filter(Boolean).join(', ')}</span><span className="mono">{px.lastCheck?.ip}</span></p>}
              <p className={`pxres ${h.proxy === 'down' ? 'down' : h.proxy === 'ok' || h.proxy === 'slow' ? { good: 'ok', warn: 'warn', bad: 'slow' }[latencyTone(px.lastCheck?.ms ?? null)] : ''}`}>
                <Icon name={h.proxy === 'down' ? 'alert' : h.proxy === 'unchecked' ? 'clock' : 'check'} />
                <span>{h.proxy === 'down' ? D.noExit : h.proxy === 'unchecked' ? D.notChecked : D.answered(px.lastCheck?.ms ?? 0)}</span>
              </p>
              <div><button type="button" className="btn btn-xs btn-secondary" disabled={busy === `check:${px.id}`} onClick={() => onFix({ kind: 'check', proxyId: px.id })}>
                {busy === `check:${px.id}` && <span className="spin" aria-hidden="true" />}{d.proxies.test}
              </button></div>
            </> : <p className="hint">{D.direct}</p>}
          </section>
          <section className="sec" aria-label={D.fingerprint}>
            <h3>{D.fingerprint}</h3>
            <dl className="kvl">
              <dt>{D.fields.tz}</dt><dd className={`mono${h.checks.some(c => c.id === 'tz-mismatch') ? ' warn' : ''}`}>{tz ?? D.hostTz}</dd>
              <dt>{D.fields.lang}</dt><dd className="mono">{locale ?? D.hostTz}</dd>
              <dt>{d.fp.screen}</dt><dd className="mono">{facts.screen ?? d.fp.screenHost}</dd>
              <dt>{d.fp.webgl}</dt><dd>{facts.gpu ?? d.fp.webglOpts[facts.webgl]}</dd>
              <dt>{d.fp.webrtc}</dt><dd>{d.fp.webrtcOpts[facts.webrtc]}</dd>
              <dt>{d.fp.canvas}</dt><dd>{d.fp.canvasOpts[facts.canvas]}</dd>
              <dt>{D.fields.cores}</dt><dd>{facts.cores ?? '—'}</dd>
              {facts.seed && <><dt>{D.fields.seed}</dt><dd className="mono">{facts.seed}</dd></>}
            </dl>
          </section>
          <section className="sec" aria-label={D.dataCard}>
            <div className="sec-row"><h3>{D.dataCard}</h3><button type="button" className="linkish" onClick={() => setTab('signins')}>{D.manage}</button></div>
            {p.syncMode === 'local' ? <p className="hint">{D.localOnly}</p> : p.data ? (
              <dl className="kvl">
                <dt>{D.cookies}</dt><dd>{p.data.cookies}</dd>
                <dt>{D.sites}</dt><dd>{p.data.origins}</dd>
                <dt>{D.siteData}</dt><dd>{size(p.data.storageBytes)}</dd>
                <dt>{D.synced}</dt><dd>{when(p.data.savedAt)}</dd>
              </dl>
            ) : <p className="hint">{D.notSaved}</p>}
          </section>
        </div>
        {geo && <p className="attrib">{d.common.attribution}</p>}
        <section className="sec" aria-label={D.checksTitle}>
          <div className="sec-row">
            <h3>{D.checksTitle}</h3><span className={`verdict ${h.level}`} data-testid="verdict">{D.verdict[h.level]}</span><span className="sp" />
            <button type="button" className="btn btn-xs btn-secondary" title={d.checkup.lead} disabled={checking || !!away} onClick={() => void checkup()}>
              {checking && <span className="spin" aria-hidden="true" />}{checking ? d.checkup.running : d.checkup.run}
            </button>
          </div>
          {p.report && (
            <p className="report-line">
              {d.checkup.last(when(p.report.at), passed(p.report))}{' '}
              <button type="button" className="linkish" onClick={() => setReport(p.report)}>{d.checkup.view}</button>
            </p>
          )}
          <ul className="chk">
            {h.checks.map(row)}
            {risks.map((r, i) => {
              const level = r.level === 'info' ? 'todo' : r.level;
              return (
                <li key={`r${i}`} className={level} data-risk={r.kind}>
                  <span className="ic" aria-hidden="true"><Icon name={r.level === 'info' ? 'alert' : IC[level]} /></span>
                  <div>
                    <span><span className="sr">{D.status[level]}: </span>{d.risks.kinds[r.kind].t(r.ids.length, r.what)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        {activity.length > 0 && (
          <section className="sec" aria-label={d.activity.recent}>
            <div className="sec-row"><h3>{d.activity.recent}</h3><button type="button" className="linkish" onClick={() => setTab('activity')}>{D.viewAll}</button></div>
            <ol className="acts">{activity.slice(0, 3).map(e => <li key={e.seq}><time>{when(e.at)}</time><span>{describe(d, e)}</span></li>)}</ol>
          </section>
        )}
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
            <p className="hint">{d.detail.savedOn(when(p.data.savedAt), p.data.deviceName)}</p>
          </> : <p className="hint">{d.detail.notSaved}</p>}
          <div className="d-actions">
            {canExport && p.data && p.syncMode === 'cloud' && <>
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => onExport('json')}>{d.detail.exportAs(d.detail.json)}</button>
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => onExport('netscape')}>{d.detail.exportAs(d.detail.netscape)}</button>
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
            ? <ol className="acts" data-testid="recent">{activity.map(e => <li key={e.seq}><time>{when(e.at)}</time><span>{describe(d, e)}</span></li>)}</ol>
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
