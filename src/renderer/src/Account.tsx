// The person's own page (design v2 32–35), from the account button at the foot of the sidebar: their name, note and
// language, and (on Windows and macOS) opening Folio at startup; a new password; and the ways out, switching workspace
// and logging out, which open dialogs. A menu card on the left, the chosen part in a card on the right, saved from the
// card's own button.
import { useEffect, useState, type FormEvent } from 'react';
import { folio, isApiError, type Me, type MyInvitation, type Workspace } from './api';
import { errorText, roleName, type Dict, type Lang } from './i18n';
import { Act, Cancel, Icon, Modal, Switch, useGuard, useLeave, useToast } from './ui';
import { SelectField } from './Select';

type Part = 'profile' | 'password';

export function AccountPage({ d, lang, version, me, onSaved, onSwitch, onLogout }: {
  d: Dict; lang: Lang; version: string; me: Me; onSaved(): Promise<void>; onSwitch(): void; onLogout(): void;
}){
  const A = d.account;
  const [part, setPart] = useState<Part>('profile');
  const guard = useGuard();
  return (
    <div className="page">
      <main className="main">
        <header className="bar"><div className="ttl"><h1>{A.title}</h1><p className="sub">{A.lead}</p></div></header>
        <div className="duo">
          <nav className="sec duo-nav" aria-label={A.title}>
            {(['profile', 'password'] as const).map(x => (
              <button key={x} type="button" className={`duo-i${part === x ? ' on' : ''}`} aria-current={part === x ? 'true' : undefined} onClick={() => guard(() => setPart(x))}>{A.menu[x]}</button>
            ))}
            <button type="button" className="duo-i" onClick={onSwitch}>{A.menu.switch}</button>
            <button type="button" className="duo-i" onClick={onLogout}>{A.menu.logout}</button>
            <p className="duo-foot">{A.version(version)}</p>
          </nav>
          {part === 'profile' ? <ProfileCard d={d} lang={lang} me={me} onSaved={onSaved} /> : <PasswordCard d={d} />}
        </div>
      </main>
    </div>
  );
}

function ProfileCard({ d, lang, me, onSaved }: { d: Dict; lang: Lang; me: Me; onSaved(): Promise<void> }){
  const A = d.account;
  const toast = useToast();
  const [name, setName] = useState(me.user.displayName);
  const [note, setNote] = useState(me.user.note ?? '');
  const [language, setLanguage] = useState<Lang>(lang);
  // Opening at startup belongs to this computer, and only Windows and macOS have it.
  const [startup, setStartup] = useState<{ supported: boolean; enabled: boolean } | null>(null);
  const [onStart, setOnStart] = useState(false);
  useEffect(() => { void folio.startup().then(s => { setStartup(s); setOnStart(s.enabled); }); }, []);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name !== me.user.displayName || note !== (me.user.note ?? '') || language !== lang || (!!startup && onStart !== startup.enabled);
  useLeave(dirty);
  const nameErr = tried && !name.trim() ? A.nameErr : null;

  async function save(e: FormEvent){
    e.preventDefault();
    setTried(true);
    if (!name.trim()){ document.getElementById('ac-name')?.focus(); return; }
    setBusy(true); setError(null);
    try {
      await folio.api('PATCH', '/me', { displayName: name.trim(), note: note.trim() || null, locale: language });
      if (startup?.supported && onStart !== startup.enabled){ await folio.setStartup(onStart); setStartup({ ...startup, enabled: onStart }); }
      await onSaved();
      toast(A.saved);
    } catch (err){ setError(errorText(d, isApiError(err) ? err.code : 'internal')); } finally { setBusy(false); }
  }

  return (
    <form className="sec duo-body" onSubmit={e => void save(e)} noValidate aria-labelledby="ac-h">
      <h3 id="ac-h">{A.info}</h3>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="field">
        <label htmlFor="ac-name">{A.displayName}<span className="req" aria-hidden="true">*</span></label>
        <input id="ac-name" value={name} maxLength={40} required onChange={e => setName(e.target.value)} aria-invalid={!!nameErr} aria-describedby={nameErr ? 'ac-name-err' : 'ac-name-hint'} />
        {nameErr ? <p className="err" id="ac-name-err">{nameErr}</p> : <p className="hint" id="ac-name-hint">{A.displayNameHint}</p>}
      </div>
      <div className="field">
        <label htmlFor="ac-email">{A.email}</label>
        <input id="ac-email" value={me.user.email} disabled />
      </div>
      <div className="field">
        <label htmlFor="ac-note">{A.note}<small className="opt">{d.form.optional}</small></label>
        <input id="ac-note" value={note} maxLength={200} placeholder={A.notePh} onChange={e => setNote(e.target.value)} />
      </div>
      <SelectField label={d.user.language} value={language} onChange={v => setLanguage(v as Lang)} options={(['zh', 'en'] as const).map(l => ({ value: l, label: d.user.langs[l] }))} />
      {startup?.supported && (
        <div className="set-row">
          <Switch label={d.user.startup} checked={onStart} onChange={setOnStart} />
          <p className="hint">{d.user.startupHint}</p>
        </div>
      )}
      <p className="notice"><Icon name="info" /><span>{A.emailNote} <button className="linkish" type="button" onClick={() => folio.openSite(`/${lang}/account/`)}>{d.user.manage}</button></span></p>
      <div className="duo-act"><button className="btn btn-primary" type="submit" disabled={busy || !dirty} aria-busy={busy || undefined}>{A.save}</button></div>
    </form>
  );
}

// A new password (v2 33): the current one, the new one twice. The server ends the sign-ins on other computers.
function PasswordCard({ d }: { d: Dict }){
  const P = d.account.password;
  const toast = useToast();
  const [values, setValues] = useState({ current: '', next: '', again: '' });
  const [shown, setShown] = useState(false);
  const [tried, setTried] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLeave(!!(values.current || values.next || values.again));
  const errs = {
    current: tried && !values.current ? P.currentErr : wrong ? d.errors.wrong_password : null,
    next: tried && (values.next.length < 8 || values.next.length > 64) ? P.short : null,
    again: tried && values.again !== values.next ? P.mismatch : null
  };

  async function save(e: FormEvent){
    e.preventDefault();
    setTried(true); setWrong(false);
    const first = (['current', 'next', 'again'] as const).find(k => (k === 'current' ? !values.current : k === 'next' ? values.next.length < 8 || values.next.length > 64 : values.again !== values.next));
    if (first){ document.getElementById(`pw-${first}`)?.focus(); return; }
    setBusy(true); setError(null);
    try {
      await folio.api('POST', '/auth/password/change', { current: values.current, password: values.next });
      setValues({ current: '', next: '', again: '' }); setTried(false);
      toast(P.done);
    } catch (err){
      if (isApiError(err) && err.code === 'wrong_password'){ setWrong(true); document.getElementById('pw-current')?.focus(); }
      else setError(errorText(d, isApiError(err) ? err.code : 'internal'));
    } finally { setBusy(false); }
  }

  const field = (k: keyof typeof values, label: string, hint?: string) => (
    <div className="field">
      <label htmlFor={`pw-${k}`}>{label}<span className="req" aria-hidden="true">*</span></label>
      <span className="pass-in">
        <input id={`pw-${k}`} type={shown ? 'text' : 'password'} value={values[k]} required autoComplete={k === 'current' ? 'current-password' : 'new-password'}
          onChange={e => { setValues(v => ({ ...v, [k]: e.target.value })); if (k === 'current') setWrong(false); }} aria-invalid={!!errs[k]} aria-describedby={errs[k] ? `pw-${k}-err` : hint ? `pw-${k}-hint` : undefined} />
        <button type="button" className="icon-btn bare" aria-label={shown ? d.proxies.conceal : d.proxies.reveal} title={shown ? d.proxies.conceal : d.proxies.reveal} onClick={() => setShown(x => !x)}><Icon name={shown ? 'eyeOff' : 'eye'} /></button>
      </span>
      {errs[k] ? <p className="err" id={`pw-${k}-err`}>{errs[k]}</p> : hint && <p className="hint" id={`pw-${k}-hint`}>{hint}</p>}
    </div>
  );
  return (
    <form className="sec duo-body" onSubmit={e => void save(e)} noValidate aria-labelledby="pw-h">
      <h3 id="pw-h">{d.account.menu.password}</h3>
      {error && <p className="notice error" role="alert">{error}</p>}
      {field('current', P.current)}
      {field('next', P.next, P.rule)}
      {field('again', P.confirm)}
      <div className="duo-act"><button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy || undefined}>{d.account.save}</button></div>
    </form>
  );
}

// Which workspace to work in (v2 35), and invitations to others, joined or declined from here.
export function SwitchDialog({ d, me, ws, invites, onSwitch, onAnswer, onClose }: {
  d: Dict; me: Me; ws: Workspace; invites: MyInvitation[]; onSwitch(id: string): void; onAnswer(i: MyInvitation, accept: boolean): void; onClose(): void;
}){
  const S = d.account.switchDlg;
  const [pick, setPick] = useState(ws.id);
  return (
    <Modal title={S.title} sub={S.sub} onClose={onClose} foot={<>
      <span className="sp" />
      <Cancel />
      <button className="btn btn-primary" type="button" disabled={pick === ws.id} onClick={() => { onClose(); onSwitch(pick); }}>{S.go}</button>
    </>}>
      <div className="m-body">
        <SelectField label={S.field} required value={pick} onChange={setPick}
          options={me.workspaces.map(w => ({ value: w.id, label: w.name, hint: `${d.plans[w.plan]} · ${roleName(d, w.role)}` }))} />
        <p className="notice"><Icon name="info" /><span>{S.note}</span></p>
        {invites.length > 0 && (
          <section className="sw-invites" aria-label={S.invites}>
            <h4>{S.invites}</h4>
            <ul>
              {invites.map(i => (
                <li key={i.id} data-invite={i.workspaceName}>
                  <span><b>{i.workspaceName}</b><small>{d.team.from(i.inviter ?? 'Folio', roleName(d, i.role))}</small></span>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => { onClose(); onAnswer(i, true); }}>{d.team.join}</button>
                  <button type="button" className="btn btn-sm btn-text" onClick={() => onAnswer(i, false)}>{d.team.decline}</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}

// Logging out (v2 34) says what it ends: profiles open here save their sign-ins and close, flows and scheduled tasks
// running here stop, and window sync ends.
export function LogoutDialog({ d, profiles, runs, sync, onLogout, onClose }: { d: Dict; profiles: number; runs: number; sync: boolean; onLogout(): Promise<void>; onClose(): void }){
  const L = d.account.logoutDlg;
  return (
    <Modal title={L.title} sub={L.sub} onClose={onClose} foot={<>
      <span className="sp" />
      <Cancel />
      <Act className="btn btn-primary" run={onLogout}>{L.go}</Act>
    </>}>
      <div className="m-body">
        <p>{L.ask}</p>
        {(profiles > 0 || runs > 0 || sync) && (
          <p className="notice warn"><Icon name="alert" /><span>{[profiles > 0 || runs > 0 ? L.running(profiles, runs) : '', sync ? L.sync : ''].filter(Boolean).join(' ')}</span></p>
        )}
      </div>
    </Modal>
  );
}
