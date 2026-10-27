// The Cookies tab of a profile's page: the cookies it has saved, values hidden, found by name or domain, edited,
// deleted, and brought in from a file after a preview that says what each entry is. Values show and copy only for
// roles that may take cookies away, and every read is recorded. While the profile runs here, changes reach its
// browser too; while it is open on another computer, nothing changes.
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { cookieKey, readCookies, type Cookie, type CookieEdit, type CookieKey } from '@shared/cookies';
import { can, folio, isApiError, type Profile } from './api';
import type { WorkspaceData } from './data';
import { errorText, type Dict, type Lang } from './i18n';
import { Act, BulkBar, Cancel, Empty, Icon, LoadFailed, Modal, MoreMenu, PanelEdge, SkelRows, Tabs, useChanged, useToast } from './ui';
import { Pager } from './Pager';
import { Select, SelectField } from './Select';
import { dayLabel, time } from './Activity';

type Info = Omit<Cookie, 'value'>;
type Sort = 'name' | 'domain' | 'path' | 'expires';
interface Props { d: Dict; lang: Lang; data: WorkspaceData; p: Profile; running: boolean }

const keyOf = ({ name, domain, path }: Info) => ({ name, domain, path });
// Session cookies sort after every dated one.
const until = (c: Info) => (c.expires > 0 ? c.expires : Number.MAX_SAFE_INTEGER);

export function CookiesTab({ d, lang, data, p, running }: Props){
  const C = d.cookies;
  const toast = useToast();
  // The saved cookies; 'none' before anything was saved, 'local' when they stay on the computer that uses it.
  const [list, setList] = useState<Info[] | null>(null);
  const [state, setState] = useState<'ok' | 'none' | 'local' | 'failed'>('ok');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [domain, setDomain] = useState('all');
  const [sort, setSort] = useState<[Sort, 1 | -1]>(['domain', 1]);
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [cur, setCur] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Info | null>(null);
  const [confirm, setConfirm] = useState<Info[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const canImport = can(data.role, 'cookies.import'), canRead = can(data.role, 'cookies.export'), canDelete = can(data.role, 'profiles.edit');
  const away = !!p.lock && !p.lock.self;
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');

  const load = useCallback(async () => {
    if (p.syncMode === 'local'){ setState('local'); setList([]); return; }
    try {
      const r = await folio.api<{ cookies: Info[]; savedAt: string }>('GET', `/profiles/${p.id}/cookies`);
      setList(r.cookies); setSavedAt(r.savedAt); setState('ok');
    } catch (e){
      if (isApiError(e) && e.code === 'not_found'){ setList([]); setSavedAt(null); setState('none'); } else setState('failed');
    }
  }, [p.id, p.syncMode]);
  // Again whenever the saved state moves (a browser closing, an import from elsewhere).
  useEffect(() => { void load(); }, [load, p.data?.savedAt]);

  const all = list ?? [];
  const domains = useMemo(() => [...new Set(all.map(c => c.domain))].sort(), [all]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase(), [k, dir] = sort;
    return all.filter(c => (domain === 'all' || c.domain === domain) && (!n || `${c.name} ${c.domain}`.toLowerCase().includes(n)))
      .sort((a, b) => dir * (k === 'expires' ? until(a) - until(b) : a[k].localeCompare(b[k]) || a.name.localeCompare(b.name)));
  }, [all, q, domain, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / size)), at = Math.min(page, pages);
  const rows = shown.slice((at - 1) * size, at * size);
  const picked = all.filter(c => sel.has(cookieKey(c)));
  const curCookie = all.find(c => cookieKey(c) === cur) ?? null;
  const pageSel = rows.filter(c => sel.has(cookieKey(c))).length;
  const toggle = (c: Info) => setSel(s => { const n = new Set(s), k = cookieKey(c); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleAll = () => setSel(s => { const n = new Set(s); rows.forEach(c => (pageSel === rows.length ? n.delete(cookieKey(c)) : n.add(cookieKey(c)))); return n; });
  const when = (iso: string) => `${dayLabel(iso, d, lang)} ${time(iso, lang)}`;
  const expiry = (c: Info) => (c.expires > 0 ? new Date(c.expires * 1000).toLocaleDateString('sv-SE') : C.session);
  const changed = () => { void load(); data.refresh('profiles'); };

  async function remove(cs: Info[]){
    setConfirm(null);
    try {
      toast(C.deleted((await folio.deleteCookies(p.id, cs.map(keyOf))).count));
      setSel(new Set());
      if (cs.some(c => cookieKey(c) === cur)) setCur(null);
      changed();
    } catch (e){ fail(e); }
  }

  const head = (k: Sort, label: string, cls?: string) => (
    <th className={cls} scope="col" aria-sort={sort[0] === k ? (sort[1] === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="th-sort" onClick={() => setSort(([s, dir]) => [k, s === k ? (-dir as 1 | -1) : 1])}>{label}<Icon name={sort[0] === k && sort[1] === -1 ? 'down' : 'up'} /></button>
    </th>
  );
  const writable = !away && (p.syncMode === 'cloud' || running);
  return (
    <div className={`ck-wrap${curCookie ? ' with-panel' : ''}`}>
      <section className="sec ck" aria-label={C.title}>
        <h3>{C.title}</h3>
        {away && <p className="notice warn">{C.away}</p>}
        <div className="ck-bar">
          {state !== 'local' && <>
            <label className="search">
              <Icon name="search" /><span className="sr">{C.search}</span>
              <input type="search" placeholder={C.search} value={q} onChange={e => { setQ(e.target.value); setPage(1); }} autoComplete="off" />
            </label>
            <span className="grp-pick"><Select label={C.domain} value={domain} onChange={v => { setDomain(v); setPage(1); }} searchPh={d.form.searchPh}
              options={[{ value: 'all', label: C.allDomains }, ...domains.map(x => ({ value: x, label: x, hint: String(all.filter(c => c.domain === x).length) }))]} /></span>
          </>}
          <span className="sp" />
          {canRead && all.length > 0 && <button type="button" className="btn btn-secondary" onClick={() => setExporting(true)}><Icon name="download" />{C.export}</button>}
          {canImport && <button type="button" className="btn btn-primary" disabled={!writable} onClick={() => setImporting(true)}><Icon name="upload" />{C.import}</button>}
        </div>
        {state === 'local'
          ? <p className="hint">{running ? C.localRunning : C.local}</p>
          : <p className="ck-meta">
              <span>{C.count(all.length)}{savedAt && ` · ${C.synced(when(savedAt))}`}</span>
              <button type="button" className="icon-btn bare" aria-label={C.reload} title={C.reload} onClick={() => void load()}><Icon name="refresh" /></button>
            </p>}
        {state !== 'local' && <>
          {picked.length > 0 && canDelete && (
            <BulkBar n={picked.length} all={rows.length > 0 && pageSel === rows.length} label={d.common.picked.cookies(picked.length)} clearLabel={d.common.clearSelection} onClear={() => setSel(new Set())}>
              <button type="button" className="bb danger" disabled={!writable} onClick={() => setConfirm(picked)}><Icon name="trash" />{C.delete}</button>
            </BulkBar>
          )}
          <div className="tw ck-t">
            <table>
              <thead>
                <tr>
                  <th className="cb" scope="col">
                    <input type="checkbox" aria-label={d.common.selectAll} checked={rows.length > 0 && pageSel === rows.length}
                      ref={el => { if (el) el.indeterminate = pageSel > 0 && pageSel < rows.length; }} onChange={toggleAll} />
                  </th>
                  {head('name', C.cols.name)}{head('domain', C.cols.domain)}{head('path', C.cols.path)}{head('expires', C.cols.expires, 'mid')}
                  <th className="mid" scope="col">{C.cols.flags}</th><th className="act" scope="col">{C.cols.actions}</th><th className="more" scope="col"><span className="sr">{d.detail.more}</span></th>
                </tr>
              </thead>
              <tbody>
                {list === null && state !== 'failed' && <SkelRows cols={8} check rows={4} />}
                {state === 'failed' && <tr className="empty"><td colSpan={8}><LoadFailed d={d} onRetry={() => void load()} /></td></tr>}
                {list !== null && !shown.length && state !== 'failed' && <tr className="empty"><td colSpan={8}>{state === 'none'
                  ? <Empty icon="clock" title={C.notSaved} text={C.notSavedText} />
                  : all.length
                    ? <Empty icon="search" title={d.states.noMatch} text={d.states.noMatchText}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setDomain('all'); setPage(1); }}>{d.states.clear}</button>
                      </Empty>
                    : <Empty icon="cookie" title={C.none} text={C.noneText}>
                        {canImport && writable && <button type="button" className="btn btn-primary btn-sm" onClick={() => setImporting(true)}><Icon name="upload" />{C.import}</button>}
                      </Empty>}</td></tr>}
                {rows.map(c => {
                  const k = cookieKey(c);
                  return (
                    <tr key={k} data-cookie={c.name} className={[k === cur && 'cur', sel.has(k) && 'on'].filter(Boolean).join(' ')} onClick={e => { if (!(e.target as HTMLElement).closest('button,input,td.cb')) setCur(k); }}>
                      <td className="cb" onClick={e => { if (e.target === e.currentTarget) toggle(c); }}><input type="checkbox" checked={sel.has(k)} onChange={() => toggle(c)} aria-label={d.common.select(c.name)} /></td>
                      <td className="mono">{c.name}</td><td className="mono">{c.domain}</td><td className="mono">{c.path}</td><td className="nowrap mid">{expiry(c)}</td>
                      <td className="mid"><span className="ck-flags">{c.secure && <span className="badge">Secure</span>}{c.httpOnly && <span className="badge">HttpOnly</span>}</span></td>
                      <td className="act">{canImport && <button type="button" className="btn btn-sm btn-text" disabled={!writable} onClick={() => setEditing(c)}>{C.edit}</button>}</td>
                      <td className="more">{canDelete && <MoreMenu label={d.profiles.actionsX(c.name)} items={[{ label: C.delete, onClick: () => setConfirm([c]), danger: true, disabled: !writable }]} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shown.length > 0 && <Pager d={d} total={shown.length} page={page} size={size} onPage={setPage} onSize={n => { setSize(n); setPage(1); }} />}
        </>}
      </section>
      {curCookie && <CookiePanel d={d} lang={lang} p={p} c={curCookie} canRead={canRead} canEdit={canImport && writable} onEdit={() => setEditing(curCookie)} onClose={() => setCur(null)} />}

      {importing && <CookieImport d={d} p={p} existing={new Set(all.map(cookieKey))} onClose={() => setImporting(false)} onDone={() => { setImporting(false); changed(); }} />}
      {editing && <CookieEdit d={d} p={p} c={editing} canRead={canRead} canRename={canDelete} onClose={() => setEditing(null)} onDone={k => { setEditing(null); setCur(cookieKey(k)); changed(); }} />}
      {exporting && <CookieExport d={d} profiles={[p]} picked={picked.map(keyOf)} site={domain !== 'all' ? domain : null} onClose={() => setExporting(false)} />}
      {confirm && (
        <Modal kind="bad" title={C.deleteN(confirm.length)} onClose={() => setConfirm(null)} foot={<>
          <Cancel />
          <Act className="btn btn-danger solid" run={() => remove(confirm)}>{C.delete}</Act>
        </>}><p>{running ? C.deleteRunning : C.deleteNote}</p></Modal>
      )}
    </div>
  );
}

// One cookie: its attributes, and its value hidden until asked for (each read is recorded on the server).
function CookiePanel({ d, lang, p, c, canRead, canEdit, onEdit, onClose }: { d: Dict; lang: Lang; p: Profile; c: Info; canRead: boolean; canEdit: boolean; onEdit(): void; onClose(): void }){
  const C = d.cookies;
  const toast = useToast();
  const [value, setValue] = useState<string | null>(null);
  const k = cookieKey(c);
  useEffect(() => setValue(null), [k]);
  const read = async () => (await folio.api<{ cookies: Cookie[] }>('GET', `/profiles/${p.id}/cookies/values?${new URLSearchParams({ name: c.name, domain: c.domain, path: c.path })}`)).cookies[0]?.value ?? '';
  const fail = (e: unknown) => toast(errorText(d, isApiError(e) ? e.code : 'internal'), undefined, 'bad');
  const on = (yes: boolean) => <span className={`badge${yes ? ' good' : ''}`}>{yes ? C.on : C.off}</span>;
  return (
    <aside className="sec ck-panel" aria-label={C.detail}><PanelEdge />
      <div className="sec-row"><h3>{C.detail}</h3><button type="button" className="icon-btn bare" aria-label={C.close} title={C.close} onClick={onClose}><Icon name="x" /></button></div>
      <dl className="kvl">
        <dt>{C.cols.name}</dt><dd className="mono">{c.name}</dd>
        <dt>{C.cols.domain}</dt><dd className="mono">{c.domain}</dd>
        <dt>{C.cols.path}</dt><dd className="mono">{c.path}</dd>
        <dt>{C.cols.expires}</dt><dd>{c.expires > 0 ? new Date(c.expires * 1000).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US') : C.session}</dd>
        <dt>SameSite</dt><dd>{c.sameSite}</dd>
        <dt>Secure</dt><dd>{on(c.secure)}</dd>
        <dt>HttpOnly</dt><dd>{on(c.httpOnly)}</dd>
      </dl>
      <div className="ck-value">
        <span className="label">{C.value}</span>
        {canRead ? (
          <div className="ck-v">
            <code data-testid="cookie-value">{value ?? '••••••••••'}</code>
            <button type="button" className="btn btn-sm btn-text" onClick={() => void (value === null ? read().then(setValue, fail) : setValue(null))}>
              <Icon name={value === null ? 'eye' : 'eyeOff'} />{value === null ? C.show : C.hide}
            </button>
            <button type="button" className="icon-btn" aria-label={C.copy} title={C.copy}
              onClick={() => void read().then(v => navigator.clipboard.writeText(v)).then(() => toast(C.copied), fail)}><Icon name="copy" /></button>
          </div>
        ) : <p className="hint">{C.noValue}</p>}
        <p className="hint ck-note"><Icon name="info" />{C.hidden}</p>
      </div>
      {canEdit && <div><button type="button" className="btn btn-sm btn-secondary" onClick={onEdit}><Icon name="edit" />{C.edit}</button></div>}
    </aside>
  );
}

// Changing one cookie (v2 28). The value stays hidden: left alone it keeps the current one; the eye shows it (the read
// is recorded) to roles that may read values; anything typed in is the new value. A new name, domain or path replaces
// the old cookie. A field in error says so under it, and the first one takes the focus.
function CookieEdit({ d, p, c, canRead, canRename, onClose, onDone }: { d: Dict; p: Profile; c: Info; canRead: boolean; canRename: boolean; onClose(): void; onDone(k: CookieKey): void }){
  const C = d.cookies;
  const [name, setName] = useState(c.name);
  // null: unchanged, the cookie keeps its value.
  const [value, setValue] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [domain, setDomain] = useState(c.domain);
  const [path, setPath] = useState(c.path);
  const [session, setSession] = useState(c.expires <= 0);
  const [expires, setExpires] = useState(c.expires > 0 ? new Date(c.expires * 1000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
  const [sameSite, setSameSite] = useState(c.sameSite);
  const [secure, setSecure] = useState(c.secure);
  const [httpOnly, setHttpOnly] = useState(c.httpOnly);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = useChanged({ name, domain, path, session, expires, sameSite, secure, httpOnly }) || value !== null;
  const errs = { 'ck-name': canRename && !name.trim() ? C.nameErr : null, 'ck-domain': !domain.trim() ? C.domainErr : null, 'ck-path': !path.trim() ? C.pathErr : null, 'ck-expires': !session && !expires ? C.expiresErr : null };
  const err = (id: keyof typeof errs) => (tried ? errs[id] : null);
  const field = (id: keyof typeof errs) => ({ id, 'aria-invalid': !!err(id), 'aria-describedby': err(id) ? `${id}-err` : undefined });
  const under = (id: keyof typeof errs) => err(id) && <p className="err" id={`${id}-err`}>{err(id)}</p>;

  async function reveal(){
    if (value !== null) return setShown(x => !x);
    try {
      const r = await folio.api<{ cookies: Cookie[] }>('GET', `/profiles/${p.id}/cookies/values?${new URLSearchParams({ name: c.name, domain: c.domain, path: c.path })}`);
      setValue(r.cookies[0]?.value ?? ''); setShown(true);
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); }
  }
  async function save(){
    setTried(true);
    const first = (Object.keys(errs) as (keyof typeof errs)[]).find(k => errs[k]);
    if (first) return document.getElementById(first)?.focus();
    const cookie: CookieEdit = { name, domain: domain.trim(), path: path.trim(), expires: session ? -1 : Math.round(Date.parse(expires) / 1000), sameSite, secure, httpOnly, ...(value !== null ? { value } : {}) };
    setBusy(true); setError(null);
    try {
      await folio.editCookie(p.id, keyOf(c), cookie);
      onDone(cookie);
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); } finally { setBusy(false); }
  }
  const req = <span className="req" aria-hidden="true">*</span>;
  return (
    <Modal title={C.editTitle} onClose={onClose} busy={busy} dirty={dirty} foot={<>
      <span className="sp" />
      <Cancel />
      <button type="button" className="btn btn-primary" aria-busy={busy || undefined} disabled={busy} onClick={() => void save()}>{C.save}</button>
    </>}>
      <div className="m-body">
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="row2">
          <div className="field"><label htmlFor="ck-name">{C.cols.name}{canRename && req}</label><input {...field('ck-name')} className="mono-in" value={name} disabled={!canRename} onChange={e => setName(e.target.value)} spellCheck={false} />{under('ck-name')}</div>
          <div className="field"><label htmlFor="ck-domain">{C.cols.domain}{req}</label><input {...field('ck-domain')} className="mono-in" value={domain} disabled={!canRename} onChange={e => setDomain(e.target.value)} spellCheck={false} />{under('ck-domain')}</div>
        </div>
        <div className="row2">
          <div className="field"><label htmlFor="ck-path">{C.cols.path}{req}</label><input {...field('ck-path')} className="mono-in" value={path} disabled={!canRename} onChange={e => setPath(e.target.value)} spellCheck={false} />{under('ck-path')}</div>
          <div className="field"><span className="label" id="ck-ss">SameSite</span>
            <Select labelledBy="ck-ss" value={sameSite} onChange={v => setSameSite(v as Cookie['sameSite'])} options={(['Lax', 'Strict', 'None'] as const).map(v => ({ value: v, label: v }))} /></div>
        </div>
        <div className="field">
          <label htmlFor="ck-value">{C.value}</label>
          <span className="pass-in">
            <input id="ck-value" className="mono-in" type={shown ? 'text' : 'password'} value={value ?? ''} placeholder={C.keepValue} autoComplete="off" spellCheck={false}
              onChange={e => setValue(e.target.value)} />
            {(canRead || value !== null) && <button type="button" className="icon-btn bare" aria-label={shown ? C.hide : C.show} title={shown ? C.hide : C.show} onClick={() => void reveal()}><Icon name={shown ? 'eyeOff' : 'eye'} /></button>}
          </span>
        </div>
        <div className="field">
          <label htmlFor="ck-expires">{C.cols.expires}</label>
          <input {...field('ck-expires')} type="datetime-local" value={expires} disabled={session} onChange={e => setExpires(e.target.value)} />
          <label className="check-row"><input type="checkbox" checked={session} onChange={e => setSession(e.target.checked)} />{C.sessionOnly}</label>
          {under('ck-expires')}
        </div>
        <div className="ck-checks">
          <label className="check-row"><input type="checkbox" checked={secure} onChange={e => setSecure(e.target.checked)} />Secure</label>
          <label className="check-row"><input type="checkbox" checked={httpOnly} onChange={e => setHttpOnly(e.target.checked)} />HttpOnly</label>
        </div>
        <p className="notice info"><Icon name="info" /><span>{C.editNote}</span></p>
      </div>
    </Modal>
  );
}

// Taking sign-ins out (v2 37): which cookies (those picked, one site's or all of a profile's; several profiles give all
// of theirs), the file's format, and a word that the file holds sign-ins; it goes once that is ticked, and is recorded.
export function CookieExport({ d, profiles, picked, site, onClose }: { d: Dict; profiles: Profile[]; picked?: CookieKey[]; site?: string | null; onClose(): void }){
  const C = d.cookies;
  const toast = useToast();
  const scopes = [...(picked?.length ? ['picked'] as const : []), ...(site ? ['site'] as const : []), 'all' as const];
  const [scope, setScope] = useState<'picked' | 'site' | 'all'>(scopes[0]);
  const [format, setFormat] = useState<'json' | 'netscape'>('json');
  const [sure, setSure] = useState(false);
  async function run(){
    const only = scope === 'picked' ? { cookies: picked } : scope === 'site' && site ? { domain: site } : undefined;
    const r = await folio.exportCookies(profiles.map(x => ({ id: x.id, name: x.name, number: x.number })), format, only);
    if (!r) return;
    onClose();
    if (r.saved) toast(d.detail.exported(r.saved, r.path));
    r.failed.forEach(f => toast(d.detail.exportFailed(f.name, errorText(d, f.code)), undefined, 'bad'));
  }
  const one = profiles.length === 1;
  return (
    <Modal title={C.exportTitle} onClose={onClose} foot={<>
      <Cancel />
      <Act className="btn btn-primary" disabled={!sure} run={run}>{C.exportDo}</Act>
    </>}>
      <div className="m-body">
        <p className="notice warn"><Icon name="alert" /><span>{C.exportNote(one ? profiles[0].name : C.exportMany(profiles.length))}</span></p>
        <div className="row2">
          {one
            ? <SelectField label={C.exportScope} value={scope} onChange={v => setScope(v as typeof scope)}
                options={scopes.map(s => ({ value: s, label: s === 'picked' ? C.scopePicked(picked!.length) : s === 'site' ? C.scopeDomain(site!) : C.scopeAll }))} />
            : <div className="field"><span className="label">{C.exportScope}</span><p className="ck-scope">{C.scopeAllOf(profiles.length)}</p></div>}
          <SelectField label={C.format} value={format} onChange={v => setFormat(v as typeof format)} options={[{ value: 'json', label: d.detail.json }, { value: 'netscape', label: d.detail.netscape }]} />
        </div>
        <label className="check-row"><input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} />{C.exportSure}</label>
      </div>
    </Modal>
  );
}

// Bringing cookies in, as text or from a file: what each entry is shows first, and a cookie already saved (same
// name, domain and path) is replaced or kept, as chosen.
function CookieImport({ d, p, existing, onClose, onDone }: { d: Dict; p: Profile; existing: Set<string>; onClose(): void; onDone(): void }){
  const C = d.cookies;
  const toast = useToast();
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<string | null>(null);
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const read = useMemo(() => { if (!text.trim()) return null; try { return readCookies(text); } catch { return 'json' as const; } }, [text]);
  const entries = read && read !== 'json' ? read.entries : [];
  const valid = entries.flatMap(e => ('cookie' in e ? [e.cookie] : []));
  const clash = (c: Cookie) => existing.has(cookieKey(c));
  const going = valid.filter(c => !skip || !clash(c));
  async function pick(e: ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f){ setFile(f.name); setText(await f.text()); }
  }
  async function submit(){
    setBusy(true); setError(null);
    try {
      toast(d.detail.imported((await folio.importCookies(p.id, going)).count));
      onDone();
    } catch (e){ setError(errorText(d, isApiError(e) ? e.code : 'internal')); } finally { setBusy(false); }
  }
  return (
    <Modal wide title={C.importTitle(p.name)} onClose={onClose} busy={busy} dirty={!!(text.trim() || file)} foot={<>
      <span className="sp" />
      <Cancel />
      <button type="button" className="btn btn-primary" aria-busy={busy || undefined} disabled={busy || !going.length} onClick={() => void submit()}>{C.submit(going.length)}</button>
    </>}>
      <div className="m-body ck-in">
        {error && <p className="notice error" role="alert">{error}</p>}
        <Tabs label={C.import} value={mode} tabs={['text', 'file']} name={m => C.modes[m]} onChange={setMode} />
        {mode === 'text'
          ? <textarea className="mono-in ck-src" aria-label={C.modes.text} rows={7} value={text} placeholder={'[{"name": "sid", "value": "…", "domain": ".example.com", "path": "/"}]'} onChange={e => { setText(e.target.value); setFile(null); }} spellCheck={false} />
          : <div className="ck-file">
              <label className="btn btn-secondary file-btn"><Icon name="upload" />{C.chooseFile}<input type="file" accept=".json,.txt,text/plain,application/json" onChange={e => void pick(e)} /></label>
              <span className="muted">{file ?? C.noFile}</span>
            </div>}
        <p className="hint">{read && read !== 'json' ? C.detected(read.format === 'json' ? 'JSON' : 'Netscape cookies.txt') : C.formats}</p>
        {read === 'json' && <p className="err">{C.notJson}</p>}
        {entries.length > 0 && <>
          <div className="sec-row">
            <h3 className="ck-h">{C.preview}</h3>
            <span className="ck-counts"><span className="good-t">{C.valid(valid.length)}</span> · <span className={entries.length - valid.length ? 'bad-t' : ''}>{C.invalid(entries.length - valid.length)}</span></span>
          </div>
          <div className="tw ck-prev">
            <table>
              <thead><tr><th scope="col">#</th><th scope="col">{C.cols.domain}</th><th scope="col">{C.cols.name}</th><th scope="col">{C.result}</th></tr></thead>
              <tbody>
                {entries.slice(0, 500).map((e, i) => {
                  const c = 'cookie' in e ? e.cookie : null;
                  return (
                    <tr key={i} data-entry={i + 1}>
                      <td className="mono muted">{i + 1}</td><td className="mono">{c?.domain ?? (e as { domain: string }).domain}</td><td className="mono">{c?.name ?? (e as { name: string }).name}</td>
                      <td>{c
                        ? <span className="ck-ok"><Icon name="check" />{C.ok}{clash(c) && <small>{skip ? C.willSkip : C.willReplace}</small>}</span>
                        : <span className="ck-bad"><Icon name="alert" />{C.why[(e as { why: keyof typeof C.why }).why]}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <fieldset className="field ck-conflict">
            <legend className="label">{C.conflict}</legend>
            <div className="radios">
              <label className="check-row"><input type="radio" name="ck-skip" checked={!skip} onChange={() => setSkip(false)} />{C.replace}</label>
              <label className="check-row"><input type="radio" name="ck-skip" checked={skip} onChange={() => setSkip(true)} />{C.skip}</label>
            </div>
            <p className="hint">{C.conflictHelp}</p>
          </fieldset>
        </>}
      </div>
    </Modal>
  );
}
