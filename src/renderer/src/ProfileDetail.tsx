import { useEffect, useRef, useState } from 'react';
import type { KernelProgress, ProfileStatus } from '@shared/bridge';
import type { Profile } from './api';
import { engineName, fingerprintFacts, type Check, type Fix, type Health } from './checks';
import { day, runTime, type Dict, type Lang } from './i18n';
import { Icon, percent } from './ui';

interface Props {
  d: Dict; lang: Lang; p: Profile | null; h: Health | null; status?: ProfileStatus; progress?: KernelProgress; group: string; now: number;
  // The assigned person's email, when there is one.
  owner: string | null;
  busy: string | null; canTakeOver: boolean; canTrash: boolean;
  onClose(): void; onTakeover(): void; onOpen(): void; onStop(): void; onEdit(): void; onTrash(): void; onFix(f: Fix): void;
}

// Open on another computer (this computer's own runs show up as a status instead).
export const elsewhere = (p: Profile) => (p.lock && !p.lock.self ? p.lock : null);
export const busyLabel = (d: Dict, state: string) => (state === 'restoring' ? d.profiles.restoring : state === 'saving' ? d.profiles.saving : d.profiles.starting);

const IC = { ok: '✓', warn: '!', bad: '×' };
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

export function ProfileDetail({ d, lang, p, h, status, progress, group, owner, now, busy, canTakeOver, canTrash, onClose, onOpen, onStop, onEdit, onTrash, onFix, onTakeover }: Props){
  const canvas = useGuilloche(p?.id);
  const [confirmTakeover, setConfirmTakeover] = useState(false);
  useEffect(() => setConfirmTakeover(false), [p?.id, p?.lock?.since]);
  const closeBtn = <button type="button" className="icon-btn only-drawer" aria-label={d.detail.close} onClick={onClose}><Icon name="x" /></button>;
  if (!p || !h){
    return (
      <>
        <div className="d-top"><p className="sec-t">{d.detail.profile}</p>{closeBtn}</div>
        <div className="d-empty"><p><b>{d.detail.emptyTitle}</b></p><p>{d.detail.emptyBody}</p></div>
      </>
    );
  }
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
    latest: latest && 'version' in latest ? `${kernel} ${latest.version}` : '', size: p.kernel === 'firefox' ? '1.3 GB' : '150 MB', kernel
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
  if (status?.state === 'running') primary = <button type="button" className="btn btn-line" onClick={onStop}>{d.profiles.stop} <span className="mono">{runTime(now - (status.startedAt ?? now))}</span></button>;
  else if (status) primary = <button type="button" className="btn btn-line" disabled><span className="spin" aria-hidden="true" />{busyLabel(d, status.state)}</button>;
  else if (progress && !progress.finished && !progress.error) primary = <button type="button" className="btn btn-line" disabled><span className="spin" aria-hidden="true" />{d.profiles.downloading(percent(progress))}</button>;
  else if (away) primary = canTakeOver
    ? <button type="button" className="btn btn-line" onClick={() => setConfirmTakeover(true)}>{d.detail.takeover}</button>
    : <button type="button" className="btn btn-line" disabled>{d.detail.inUse}</button>;
  else primary = <button type="button" className="btn btn-stamp" onClick={onOpen}>{d.detail.openProfile}</button>;

  const row = (c: Check) => {
    const text = d.checks[c.id];
    return (
      <div key={c.id} className={`ck ${c.level}`} data-check={c.id}>
        <span className="ic" aria-hidden="true">{IC[c.level]}</span>
        <div>
          <p className="ck-t"><span className="sr">{d.detail.status[c.level]}: </span>{text.t(vars)}</p>
          {text.d(vars) && <p className="ck-d">{text.d(vars)}</p>}
          {c.fix && (
            <button type="button" className="btn btn-xs btn-line" disabled={busy === fixKey(c.fix)} onClick={() => onFix(c.fix!)}>
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
        <h2 data-testid="detail-name">{p.name}</h2>
        <p className="d-meta">{d.detail.meta(group, day(p.createdAt, lang))} · {engineName(p.kernel, p.kernelVersion)}</p>
        <p className="d-meta" data-testid="assigned">{owner ? d.detail.assignedTo(owner) : d.profiles.unassigned}</p>
        {away && (
          <div className="away-note" data-testid="away">
            <p>{d.detail.away(away.deviceName ?? '—', away.email, new Date(away.since).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' }))}</p>
            {confirmTakeover && <>
              <p className="muted">{d.detail.takeoverNote}</p>
              <div className="d-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmTakeover(false)}>{d.common.cancel}</button>
                <button type="button" className="btn btn-stamp btn-sm" onClick={() => { setConfirmTakeover(false); onTakeover(); }}>{d.detail.takeoverDo}</button>
              </div>
            </>}
          </div>
        )}
        <div className="d-actions">
          {primary}
          <button type="button" className="btn btn-ghost" onClick={onEdit}>{d.detail.edit}</button>
          {canTrash && <button type="button" className="btn btn-ghost" onClick={onTrash}>{d.detail.trash}</button>}
        </div>
      </div>
      <article className="idcard" aria-label={d.detail.cardLabel(p.name)}>
        <canvas className="gl" ref={canvas} aria-hidden="true" />
        <header className="id-head"><span>{d.detail.card}</span><span>No. <b>{num}</b></span></header>
        <div className="id-city">
          {geo
            ? <><span className="city">{geo.city ?? geo.countryName}</span><span className="region">{[geo.region, geo.countryName].filter(Boolean).join(', ')}</span></>
            : <><span className="city">{px ? d.detail.notChecked : d.detail.direct}</span>{!px && <span className="region">{d.detail.directSub}</span>}</>}
        </div>
        <dl className="id-fields">
          {fields.map(([k, v, cls]) => <div key={k} className={cls}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="mrz" aria-hidden="true"><span>{mrz1}</span><span>{mrz2}</span></div>
        <div className={`stamp ${h.level}`} data-testid="stamp" aria-hidden="true">
          <span className="s-top">FOLIO</span><span className="s-main">{d.detail.stamps[h.level]}</span><span className="s-date">{stampDate}</span>
        </div>
      </article>
      {geo && <p className="attrib">{d.common.attribution}</p>}
      <section aria-label={d.detail.checksTitle}>
        <h3 className="sec-t">{d.detail.checksTitle}</h3>
        <div className="check">{h.checks.map(row)}</div>
      </section>
      {p.notes && <section aria-label={d.detail.notes}><h3 className="sec-t">{d.detail.notes}</h3><p className="notes">{p.notes}</p></section>}
    </>
  );
}
