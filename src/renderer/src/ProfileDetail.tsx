// A profile's own page, opened from its name in the list: a header saying what it is doing and what can be done with
// it, and four tabs — an overview, its fingerprint, its cookies, and what was done to it. The list behind keeps its
// filters and page; the breadcrumb (or Escape) goes back to it.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { KernelProgress, ProfileStatus } from '@shared/bridge';
import { folio, type ActivityEntry, type Extension, type Group, type Profile, type Workspace } from './api';
import { ActivityTable, dayLabel, said, time, useActivity } from './Activity';
import { ENGINES, fingerprintFacts, latencyTone, type Fix, type Health } from './checks';
import type { WorkspaceData } from './data';
import { runTime, type Dict, type Lang } from './i18n';
import { Icon, MoreMenu, Progress, bytes, percent, type IconName } from './ui';
import { Flag, SearchLogo } from './Flag';
import { FingerprintTab } from './ProfileFingerprint';
import { CookiesTab } from './ProfileCookies';
import type { Risk } from './risks';

interface Props {
  d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData; p: Profile; h: Health; status?: ProfileStatus; progress?: KernelProgress; now: number;
  // The download size of the profile's engine version, when the catalog has it; why its last launch here failed.
  size: number | null; failed?: string;
  // What could tie it to other profiles; the team's profiles, for the health check's comparisons.
  risks: Risk[]; others: Profile[];
  // Its group; the assigned person's email, when there is one; the extensions installed in it.
  group: Group | null; owner: string | null; extensions: Extension[];
  busy: string | null; canTakeOver: boolean; canTrash: boolean;
  onBack(): void; onStar(): void; onTakeover(): void; onExport(format: 'json' | 'netscape'): void;
  onOpen(): void; onStop(): void; onEdit(): void; onTrash(): void; onFix(f: Fix): void; onShowProxy?(id: string): void;
}
type Tab = 'overview' | 'fingerprint' | 'cookies' | 'activity';
const TABS: Tab[] = ['overview', 'fingerprint', 'cookies', 'activity'];

// Open on another computer (this computer's own runs show up as a status instead).
export const elsewhere = (p: Profile) => (p.lock && !p.lock.self ? p.lock : null);
export const busyLabel = (d: Dict, state: string) => (state === 'restoring' ? d.profiles.restoring : state === 'saving' ? d.profiles.saving : d.profiles.starting);
const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

export function ProfileDetail(props: Props){
  const { d, lang, ws, data, p, h, status, progress, now, failed, group, owner, extensions, busy, canTakeOver, canTrash, onBack, onStar, onOpen, onStop, onEdit, onTrash, onFix, onTakeover, onShowProxy } = props;
  const P = d.profiles, D = d.detail;
  const [tab, setTab] = useState<Tab>('overview');
  // Tabs stay as they were once seen, so a half-edited fingerprint or a filtered cookie list survives a look at another tab.
  const [seen, setSeen] = useState<Set<Tab>>(() => new Set(['overview']));
  const show = (t: Tab) => { setTab(t); setSeen(s => new Set(s).add(t)); };
  const [confirmTakeover, setConfirmTakeover] = useState(false);
  useEffect(() => setConfirmTakeover(false), [p.id, p.lock?.since]);
  const log = useActivity(ws.id, `&profileId=${p.id}`, data);
  // The fingerprint draft starts again from the saved profile whenever that changes, unless it holds unsaved edits.
  const [fpDirty, setFpDirty] = useState(false);
  const [fpRound, setFpRound] = useState(0);
  const fpVersion = useRef(p.version);
  if (!fpDirty) fpVersion.current = p.version;
  // Escape goes back to the list, unless a dialog is open or a field has the keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.modal') || (e.target as HTMLElement).closest?.('input,textarea,[role="combobox"]')) return;
      onBack();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);

  const away = elsewhere(p);
  const downloading = progress && !progress.finished && !progress.error;
  const number = `#${String(p.number).padStart(4, '0')}`;
  let primary: ReactNode, chip: ReactNode;
  if (status?.state === 'running'){
    primary = <>
      <button type="button" className="btn btn-secondary" onClick={() => void folio.focusProfile(p.id)}><Icon name="pointer" />{P.enter}</button>
      <button type="button" className="btn btn-primary" onClick={onStop}><Icon name="stop" />{P.stop}</button>
    </>;
    chip = <span className="dot-st run">{P.st.running} · {runTime(now - (status.startedAt ?? now))}</span>;
  } else if (status || downloading){
    const label = status ? busyLabel(d, status.state) : P.downloading(percent(progress!));
    primary = <button type="button" className="btn btn-secondary" disabled><span className="spin" aria-hidden="true" />{label}</button>;
    chip = <span className="dot-st boot">{label}</span>;
  } else if (away){
    primary = canTakeOver
      ? <button type="button" className="btn btn-secondary" onClick={() => setConfirmTakeover(true)}>{D.takeover}</button>
      : <button type="button" className="btn btn-secondary" disabled>{D.inUse}</button>;
    chip = <span className="dot-st away">{P.inUseOn(away.deviceName ?? away.email)}</span>;
  } else {
    primary = <button type="button" className="btn btn-primary" onClick={onOpen}><Icon name="play" />{D.openProfile}</button>;
    chip = failed ? <span className="dot-st bad">{d.launch[failed] ?? d.launch.launch_failed}</span> : <span className="dot-st idle">{P.tabs.stopped}</span>;
  }

  return (
    <div className="page">
      <main className="main pd" aria-label={D.profile}>
        <nav className="crumbs" aria-label={D.crumbs}>
          <button type="button" onClick={onBack}>{P.title}</button><Icon name="chevR" /><span aria-current="page">{p.name}</span>
        </nav>
        <header className="pd-head">
          <div className="pd-t">
            <div className="pd-n">
              <h1 data-testid="detail-name">{p.name}</h1>{chip}
              {h.level !== 'ok' && <button type="button" className={`verdict ${h.level}`} onClick={() => show('fingerprint')}>{D.verdict[h.level]}</button>}
              <button type="button" className={`icon-btn bare star${p.starred ? ' on' : ''}`} aria-pressed={p.starred} aria-label={p.starred ? P.unstar : P.star} title={p.starred ? P.unstar : P.star} onClick={onStar}><Icon name="star" /></button>
            </div>
            <p className="pd-sub"><span className="mono">{number}</span>{group && <><span className="sep" aria-hidden="true" /><span className={`gtag gc-${group.color}`}>{group.name}</span></>}</p>
          </div>
          <span className="sp" />
          <button type="button" className="btn btn-secondary" onClick={onEdit}><Icon name="edit" />{D.editProfile}</button>
          {primary}
          {canTrash && <MoreMenu label={D.more} items={[{ label: D.trash, onClick: onTrash, danger: true }]} />}
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

        <div className="tabs page-tabs" role="tablist" aria-label={D.profile}>
          {TABS.map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => show(t)}>{D.tabs[t]}</button>)}
        </div>
        <div className="pd-body">
          {tab === 'overview' && <Overview {...props} entries={log.entries} onTab={show} onShowProxy={onShowProxy} />}
          {seen.has('fingerprint') && (
            <div hidden={tab !== 'fingerprint'}>
              <FingerprintTab key={`${fpVersion.current}:${fpRound}`} d={d} lang={lang} data={data} p={p} h={h} status={status} size={props.size}
                risks={props.risks} others={props.others} busy={busy} onFix={onFix}
                onDirty={setFpDirty} onSaved={() => { setFpDirty(false); setFpRound(r => r + 1); }} />
            </div>
          )}
          {seen.has('cookies') && <div hidden={tab !== 'cookies'}><CookiesTab d={d} lang={lang} data={data} p={p} running={status?.state === 'running'} onExport={props.onExport} /></div>}
          {tab === 'activity' && <>
            <ActivityTable d={d} lang={lang} entries={log.entries} failed={log.failed} onRetry={() => void log.reload()} />
            {log.more && <button className="btn btn-secondary btn-sm older" type="button" onClick={() => void log.older()}>{d.activity.more}</button>}
          </>}
        </div>
      </main>
    </div>
  );
}

// The overview: its basics, its proxy, a summary of its fingerprint, the data it keeps, and what was done lately.
function Overview({ d, lang, p, h, group, owner, extensions, busy, entries, onEdit, onFix, onTab, onShowProxy }: Props & { entries: ActivityEntry[] | null; onTab(t: Tab): void }){
  const D = d.detail, F = d.fp;
  const geo = h.geo, px = h.line ?? h.px, facts = fingerprintFacts(p.fingerprint);
  const when = (iso: string) => `${dayLabel(iso, d, lang)} ${time(iso, lang)}`;
  const tz = p.timezoneOverride ?? geo?.timezone, locale = p.localeOverride ?? geo?.locale;
  const start = p.startUrl ?? (p.restoreTabs ? d.browser.startTabs : p.searchEngine !== 'none' ? d.browser.startHome(d.browser.name(p.searchEngine)) : d.browser.startBlank);
  const windowSize = p.windowMode === 'custom' ? `${p.windowWidth} × ${p.windowHeight}` : d.form.windowModes[p.windowMode ?? 'default'];
  const tone = h.proxy === 'down' ? 'down' : h.proxy === 'ok' || h.proxy === 'slow' ? { good: 'ok', warn: 'warn', bad: 'slow' }[latencyTone(px?.lastCheck?.ms ?? null)] : '';
  const head = (title: string, action?: [string, () => void], icon?: IconName) => (
    <div className="sec-row"><h3>{title}</h3>{action && <button type="button" className="linkish act-link" onClick={action[1]}>{icon && <Icon name={icon} />}{action[0]}</button>}</div>
  );
  return <>
    <div className="pd-grid">
      <section className="sec" aria-label={D.basics}>
        {head(D.basics, [D.edit, onEdit], 'edit')}
        <dl className="kvl">
          <dt>{D.fields.name}</dt><dd>{p.name}</dd>
          <dt>{D.fields.number}</dt><dd className="mono">#{String(p.number).padStart(4, '0')}</dd>
          <dt>{d.form.group}</dt><dd>{group?.name ?? d.groups.none}</dd>
          {p.tags.length > 0 && <><dt>{d.form.tags}</dt><dd className="tags">{p.tags.map(t => <span key={t} className="tag">{t}</span>)}</dd></>}
          <dt>{d.form.owner}</dt><dd data-testid="assigned">{owner ?? d.profiles.unassigned}</dd>
          <dt>{D.fields.engine}</dt><dd>{ENGINES[p.kernel]} {p.kernelVersion}</dd>
          <dt>{D.fields.os}</dt><dd><Icon name={p.os} />{d.os[p.os]}</dd>
          <dt>{d.browser.search}</dt><dd><SearchLogo engine={p.searchEngine} size={14} />{d.browser.name(p.searchEngine)}</dd>
          <dt>{d.browser.start}</dt><dd className={p.startUrl ? 'mono' : undefined}>{start}</dd>
          {extensions.length > 0 && <><dt>{D.extensions}</dt><dd>{extensions.map(x => x.name).join(lang === 'zh' ? '、' : ', ')}</dd></>}
          <dt>{D.lastOpened}</dt><dd>{p.lastOpenedAt ? when(p.lastOpenedAt) : d.common.never}</dd>
          {p.notes && <><dt>{D.notes}</dt><dd className="notes">{p.notes}</dd></>}
        </dl>
      </section>
      <section className="sec" aria-label={D.proxyCard}>
        {head(D.proxyCard)}
        {px ? <>
          <dl className="kvl">
            <dt>{D.fields.proxyName}</dt><dd>{px.name}</dd>
            <dt>{D.fields.proxyType}</dt><dd className="mono">{px.type.toUpperCase()} · {px.host}:{px.port}</dd>
            <dt>{D.fields.ip}</dt><dd>{px.lastCheck?.ip ? <><span className="mono">{px.lastCheck.ip}</span>{geo && <span className="px-geo"><Flag country={geo.country} size="xs" />{[geo.city, geo.countryName].filter(Boolean).join(', ')}</span>}</> : '—'}</dd>
            <dt>{D.fields.state}</dt>
            <dd><span className={`pxres ${tone}`}>
              <Icon name={h.proxy === 'down' ? 'alert' : h.proxy === 'unchecked' ? 'clock' : 'check'} />
              <span>{h.proxy === 'down' ? D.noExit : h.proxy === 'unchecked' ? D.notChecked : D.answered(px.lastCheck?.ms ?? 0)}</span>
            </span></dd>
            {px.lastCheck && <><dt>{D.fields.checked}</dt><dd>{when(px.lastCheck.checkedAt)}</dd></>}
          </dl>
          <div className="d-actions">
            <button type="button" className="btn btn-sm btn-secondary" disabled={busy === `check:${px.id}`} onClick={() => onFix({ kind: 'check', proxyId: px.id })}>
              {busy === `check:${px.id}` && <span className="spin" aria-hidden="true" />}{d.proxies.test}
            </button>
            {onShowProxy && <button type="button" className="btn btn-sm btn-secondary" onClick={() => onShowProxy(px.id)}>{D.viewProxy}</button>}
          </div>
        </> : <p className="hint">{D.direct}</p>}
        {geo && <p className="attrib">{d.common.attribution}</p>}
      </section>
      <section className="sec" aria-label={D.fingerprint}>
        {head(D.fingerprint, [D.edit, () => onTab('fingerprint')], 'edit')}
        <dl className="kvl">
          <dt>{F.screen}</dt><dd className="mono">{facts.screen ?? F.screenHost}</dd>
          <dt>{D.fields.lang}</dt><dd className="mono">{locale ?? D.hostTz}</dd>
          <dt>{D.fields.tz}</dt><dd className={`mono${h.checks.some(c => c.id === 'tz-mismatch') ? ' warn' : ''}`}>{tz ?? D.hostTz}</dd>
          <dt>{F.canvas}</dt><dd>{F.canvasOpts[facts.canvas]}</dd>
          <dt>{F.webrtc}</dt><dd>{F.webrtcOpts[facts.webrtc]}</dd>
          <dt>{F.webgl}</dt><dd>{facts.gpu ?? F.webglOpts[facts.webgl]}</dd>
          <dt>{F.cores}</dt><dd>{facts.cores ?? '—'}</dd>
          <dt>{D.fields.window}</dt><dd>{windowSize}</dd>
        </dl>
      </section>
      <section className="sec" aria-label={D.dataCard}>
        {head(D.dataCard, [D.manage, () => onTab('cookies')])}
        {p.syncMode === 'local' ? <p className="hint">{D.localOnly}</p> : p.data ? (
          <dl className="kvl">
            <dt>{D.cookies}</dt><dd className="num">{p.data.cookies}</dd>
            <dt>{D.siteData}</dt><dd>{size(p.data.storageBytes)}</dd>
            <dt>{D.sites}</dt><dd>{p.data.origins}</dd>
            <dt>{D.synced}</dt><dd>{when(p.data.savedAt)}</dd>
          </dl>
        ) : <p className="hint">{D.notSaved}</p>}
      </section>
    </div>
    <section className="sec" aria-label={d.activity.recent}>
      {head(d.activity.recent, entries?.length ? [D.viewAll, () => onTab('activity')] : undefined)}
      {entries?.length
        ? <ol className="timeline" data-testid="recent">{entries.slice(0, 4).map(e => (
            <li key={e.seq}><time>{when(e.at)}</time><div><b>{said(d, e)}</b><small>{d.activity.by(e.actor ?? d.activity.someone)}</small></div></li>
          ))}</ol>
        : <p className="hint">{D.noActivity}</p>}
    </section>
  </>;
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
