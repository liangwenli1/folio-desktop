import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { KernelProgress, ProfileStatus } from '@shared/bridge';
import type { ActivityEntry, Profile } from './api';
import { dayLabel, describe, time } from './Activity';
import { engineName, fingerprintFacts, type Check, type CheckLevel, type Fix, type Health } from './checks';
import { day, runTime, type Dict, type Lang } from './i18n';
import { Icon, bytes, percent, type IconName } from './ui';
import { Flag } from './Flag';

interface Props {
  d: Dict; lang: Lang; p: Profile; h: Health; status?: ProfileStatus; progress?: KernelProgress; group: string; now: number;
  // The download size of the profile's engine version, when the catalog has it; why its last launch here failed.
  size: number | null; failed?: string;
  // The assigned person's email, when there is one.
  owner: string | null; activity: ActivityEntry[];
  busy: string | null; canTakeOver: boolean; canTrash: boolean; canExport: boolean;
  onClose(): void; onTakeover(): void; onExport(format: 'json' | 'netscape'): void; onImport(text: string): void; onOpen(): void; onStop(): void; onEdit(): void; onTrash(): void; onFix(f: Fix): void;
}

// Open on another computer (this computer's own runs show up as a status instead).
export const elsewhere = (p: Profile) => (p.lock && !p.lock.self ? p.lock : null);
export const busyLabel = (d: Dict, state: string) => (state === 'restoring' ? d.profiles.restoring : state === 'saving' ? d.profiles.saving : d.profiles.starting);

const IC: Record<CheckLevel, IconName> = { ok: 'check', todo: 'download', warn: 'alert', bad: 'x' };
const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);
const two = (n: number) => String(n).padStart(2, '0');
const pad32 = (s: string) => `${s}${'<'.repeat(32)}`.slice(0, 32);
const ascii = (s: string) => s.normalize('NFD').toUpperCase().replace(/[^A-Z]/g, '');

// Wavy security lines behind the passport card, in the guilloche colour of the theme.
function useGuilloche(dep: unknown){
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const r = c.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = getComputedStyle(c).getPropertyValue('--guilloche').trim();
      for (const [y0, amp, f, lines, alpha] of [[70, 6, 0.026, 10, 0.09], [r.height - 24, 5, 0.032, 9, 0.08]]){
        ctx.globalAlpha = alpha; ctx.lineWidth = 0.55;
        for (let j = 0; j < lines; j++){
          const ph = (j * Math.PI * 2) / lines;
          ctx.beginPath();
          for (let x = -4; x <= r.width + 4; x += 3){
            const y = y0 + amp * Math.sin(x * f + ph) + amp * 0.5 * Math.sin(x * f * 2.3 - ph * 1.7);
            if (x > -4) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [dep]);
  return ref;
}

export function ProfileDetail({ d, lang, p, h, status, progress, size: engineSize, failed, group, owner, activity, now, busy, canTakeOver, canTrash, canExport, onClose, onOpen, onStop, onEdit, onTrash, onFix, onTakeover, onExport, onImport }: Props){
  const canvas = useGuilloche(p.id);
  // The card tilts toward the pointer and catches a holographic sheen where it is.
  const card = useRef<HTMLElement>(null);
  const tilt = (e: MouseEvent) => {
    const el = card.current!, r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${Math.round(x * 100)}%`); el.style.setProperty('--my', `${Math.round(y * 100)}%`);
    el.style.setProperty('--rx', `${((0.5 - y) * 6).toFixed(2)}deg`); el.style.setProperty('--ry', `${((x - 0.5) * 8).toFixed(2)}deg`);
  };
  const untilt = () => ['--mx', '--my', '--rx', '--ry'].forEach(v => card.current?.style.removeProperty(v));
  // The stamp lands again when a launch here succeeds (the check's verdict) or fails (OFFLINE).
  const launch = failed ? `x:${failed}` : status?.state === 'running' ? `r:${status.startedAt}` : '';
  const seen = useRef({ id: p.id, launch });
  const thud = seen.current.id === p.id && launch !== '' && launch !== seen.current.launch;
  useEffect(() => { seen.current = { id: p.id, launch }; });
  const stampLevel = failed ? 'bad' : h.level;
  const [confirmTakeover, setConfirmTakeover] = useState(false);
  useEffect(() => setConfirmTakeover(false), [p?.id, p?.lock?.since]);
  const closeBtn = <button type="button" className="icon-btn" aria-label={d.detail.close} onClick={onClose}><Icon name="x" /></button>;
  const num = String(p.number).padStart(4, '0');
  const away = elsewhere(p);
  const geo = h.geo, px = h.line ?? h.px, facts = fingerprintFacts(p.fingerprint);
  const tz = p.timezoneOverride ?? geo?.timezone ?? null, locale = p.localeOverride ?? geo?.locale ?? null;
  const kernel = p.kernel === 'chromium' ? 'Chromium' : 'Firefox';
  const latest = h.checks.find(c => c.fix?.kind === 'use-engine')?.fix;
  const vars = {
    ms: px?.lastCheck?.ms ?? 0, host: px ? `${px.type.toUpperCase()} · ${px.host}:${px.port}` : '', city: geo?.city ?? geo?.countryName ?? '',
    tz: geo?.timezone ?? tz ?? '', set: p.timezoneOverride ?? '', setLang: p.localeOverride ?? '',
    lang: locale ? `${locale}, ${locale.split('-')[0]}` : '', country: geo?.countryName ?? '', version: p.kernelVersion,
    latest: latest && 'version' in latest ? `${kernel} ${latest.version}` : '', size: engineSize ? bytes(engineSize) : '—', kernel
  };
  const fixLabel = (f: Fix) => (f.kind === 'use-engine' ? d.fixes.use(`${kernel} ${f.version.split('.')[0]}`) : d.fixes[f.kind]);
  const fixKey = (f: Fix) => `${f.kind}:${'proxyId' in f ? f.proxyId : 'version' in f ? f.version : ''}`;

  const fields: [string, string, string?][] = [
    [d.detail.fields.ip, px?.lastCheck?.ip ?? '—'],
    [d.detail.fields.lang, locale ?? d.detail.hostTz],
    [d.detail.fields.tz, tz ?? d.detail.hostTz, `wide${h.checks.some(c => c.id === 'tz-mismatch') ? ' warn' : ''}`],
    [d.detail.fields.os, d.os[p.os]], [d.detail.fields.engine, engineName(p.kernel, p.kernelVersion)],
    [facts.seed ? d.detail.fields.seed : d.detail.fields.screen, facts.seed ?? facts.screen ?? '—'],
    [d.detail.fields.cores, facts.cores ? String(facts.cores) : '—'],
    ...(facts.gpu ? [[d.detail.fields.gpu, facts.gpu, 'wide'] as [string, string, string]] : []),
    [d.detail.fields.proxy, px ? `${px.type.toUpperCase()} · ${px.host}:${px.port}` : d.profiles.noProxy, 'wide']
  ];
  const today = new Date(now), stampDate = `${today.getFullYear()}·${two(today.getMonth() + 1)}·${two(today.getDate())}`;
  const mrz1 = pad32(`FOLIO<ENV${num}<<${geo?.country ?? 'XX'}<${ascii(geo?.city ?? geo?.countryName ?? 'DIRECT')}`);
  const mrz2 = pad32(`${p.os.slice(0, 3).toUpperCase()}<${p.kernel === 'chromium' ? 'CHR' : 'FFX'}${p.kernelVersion.split('.')[0]}<<${(facts.seed ?? facts.screen?.replace(' × ', 'X') ?? '').toUpperCase()}`);

  let primary;
  if (status?.state === 'running') primary = <button type="button" className="btn btn-secondary" onClick={onStop}>{d.profiles.stop} <span className="mono">{runTime(now - (status.startedAt ?? now))}</span></button>;
  else if (status) primary = <button type="button" className="btn btn-secondary" disabled><span className="spin" aria-hidden="true" />{busyLabel(d, status.state)}</button>;
  else if (progress && !progress.finished && !progress.error) primary = <button type="button" className="btn btn-secondary" disabled><span className="spin" aria-hidden="true" />{d.profiles.downloading(percent(progress))}</button>;
  else if (away) primary = canTakeOver
    ? <button type="button" className="btn btn-secondary" onClick={() => setConfirmTakeover(true)}>{d.detail.takeover}</button>
    : <button type="button" className="btn btn-secondary" disabled>{d.detail.inUse}</button>;
  else primary = <button type="button" className="btn btn-primary" onClick={onOpen}><Icon name="play" />{d.detail.openProfile}</button>;

  const row = (c: Check) => {
    const text = d.checks[c.id];
    return (
      <div key={c.id} className={`ck ${c.level}`} data-check={c.id}>
        <span className="ic" aria-hidden="true"><Icon name={IC[c.level]} /></span>
        <div>
          <p className="ck-t"><span className="sr">{d.detail.status[c.level]}: </span>{text.t(vars)}</p>
          {text.d(vars) && <p className="ck-d">{text.d(vars)}</p>}
          {c.fix && (
            <button type="button" className="btn btn-xs btn-secondary" disabled={busy === fixKey(c.fix)} onClick={() => onFix(c.fix!)}>
              {busy === fixKey(c.fix) && <span className="spin" aria-hidden="true" />}{fixLabel(c.fix)}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="d-head">
        <div className="d-top"><p className="sec-t">{d.detail.profile} <span className="mono">#{num}</span></p>{closeBtn}</div>
        <div className="d-title"><Flag country={h.geo?.country ?? null} kernel={p.kernel} size="lg" /><h2 data-testid="detail-name">{p.name}</h2></div>
        <p className="d-meta">{d.detail.meta(group, day(p.createdAt, lang))} · {engineName(p.kernel, p.kernelVersion)}</p>
        <p className="d-meta" data-testid="assigned">{owner ? d.detail.assignedTo(owner) : d.profiles.unassigned}</p>
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
          <span className="sp" />
          {canTrash && <button type="button" className="btn btn-danger" onClick={onTrash}>{d.detail.trash}</button>}
        </div>
      </div>
      <article className="idcard" ref={card} aria-label={d.detail.cardLabel(p.name)} onMouseMove={tilt} onMouseLeave={untilt}>
        <canvas className="gl" ref={canvas} aria-hidden="true" />
        <header className="id-head"><span>{d.detail.card}</span><span>No. <b>{num}</b></span></header>
        <div className="id-city">
          <div>
            {geo
              ? <><span className="city">{geo.city ?? geo.countryName}</span><span className="region">{[geo.region, geo.countryName].filter(Boolean).join(', ')}</span></>
              : <><span className="city">{px ? (h.proxy === 'down' ? d.detail.noExit : d.detail.notChecked) : d.detail.direct}</span>{!px && <span className="region">{d.detail.directSub}</span>}</>}
          </div>
          <div key={`${p.id}${launch}`} className={`stamp ${stampLevel}${thud ? ' thud' : ''}`} data-testid="stamp" aria-hidden="true">
            <span className="s-top">FOLIO</span><span className="s-main">{d.detail.stamps[stampLevel]}</span><span className="s-date">{stampDate}</span>
          </div>
        </div>
        <dl className="id-fields">
          {fields.map(([k, v, cls]) => <div key={k} className={cls}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="mrz" aria-hidden="true"><span>{mrz1}</span><span>{mrz2}</span></div>
      </article>
      {geo && <p className="attrib">{d.common.attribution}</p>}
      <section aria-label={d.detail.checksTitle}>
        <h3 className="sec-t">{d.detail.checksTitle}</h3>
        <div className="check">{h.checks.map(row)}</div>
      </section>
      <section aria-label={d.detail.storage} data-testid="storage">
        <h3 className="sec-t">{d.detail.storage}</h3>
        {p.syncMode === 'local' ? <p className="hint">{d.detail.localOnly}</p> : p.data ? <>
          <div className="store">
            <div><b>{p.data.cookies}</b><span>{d.detail.cookies}</span></div>
            <div><b>{size(p.data.storageBytes)}</b><span>{d.detail.siteData}</span></div>
            <div><b>{p.data.origins}</b><span>{d.detail.sites}</span></div>
            <div><b>{p.extensionIds.length}</b><span>{d.detail.extensions}</span></div>
          </div>
          <p className="hint">{d.detail.savedOn(`${dayLabel(p.data.savedAt, d, lang)} ${time(p.data.savedAt, lang)}`, p.data.deviceName)}</p>
        </> : <p className="hint">{d.detail.notSaved}</p>}
        <div className="d-actions tight">
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
      {activity.length > 0 && (
        <section aria-label={d.activity.recent}>
          <h3 className="sec-t">{d.activity.recent}</h3>
          <ol className="acts" data-testid="recent">
            {activity.map(e => <li key={e.seq}><time>{dayLabel(e.at, d, lang)} {time(e.at, lang)}</time><span>{describe(d, e)}</span></li>)}
          </ol>
        </section>
      )}
      {p.notes && <section aria-label={d.detail.notes}><h3 className="sec-t">{d.detail.notes}</h3><p className="notes">{p.notes}</p></section>}
    </>
  );
}
