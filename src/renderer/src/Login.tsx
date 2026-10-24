import { useState, type FormEvent } from 'react';
import { folio, isApiError } from './api';
import { LANG_NAMES, type Dict, type Lang } from './i18n';
import { Icon, Mark } from './ui';
import { Flag } from './Flag';

// The form on the left; on the right the brand panel with a few profiles, as they look in the workbench.
export function Login({ d, lang, version, onLang, onDone }: { d: Dict; lang: Lang; version: string; onLang(l: Lang): void; onDone: () => void }){
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const site = `/${lang}`;
  const P = d.profiles;

  async function submit(ev: FormEvent){
    ev.preventDefault();
    if (!email.trim() || !password){ setError(d.errors.validation); return; }
    setBusy(true); setError(null);
    try {
      await folio.login(email.trim(), password);
      onDone();
    } catch (e){
      setError((isApiError(e) && d.errors[e.code]) || d.errors.internal);
    } finally { setBusy(false); }
  }

  const [us, uk, jp] = d.login.demo;
  const cards = [
    { cc: 'US', kernel: 'chromium' as const, name: us[0], where: `${us[1]} · Chromium 150`, st: <span className="st run"><Icon name="play" />{P.st.running}<span className="sub">1:42:10</span></span> },
    { cc: 'GB', kernel: 'firefox' as const, name: uk[0], where: `${uk[1]} · Firefox 156`, st: <span className="st boot"><span className="spin" />{P.stage.restore}<span className="sub">3 / 4</span></span> },
    { cc: 'JP', kernel: 'chromium' as const, name: jp[0], where: `${jp[1]} · Chromium 150`, st: <span className="st idle"><Icon name="pause" />{P.st.idle}</span> }
  ];

  return (
    <main className="login">
      <div className="login-l">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-brand"><Mark /><span className="brand-word">Folio</span></div>
          <h1>{d.login.title}</h1>
          <p className="lead">{d.login.lead}</p>
          {error && <p className="notice error" role="alert">{error}</p>}
          <label className="field">
            <span>{d.login.email}</span>
            <input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </label>
          <div className="field">
            <label htmlFor="password">{d.login.password}</label>
            <div className="pw">
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
              <button className="linkish" type="button" onClick={() => folio.openSite(`${site}/forgot/`)}>{d.login.forgot}</button>
            </div>
          </div>
          <button className="btn btn-primary full" type="submit" disabled={busy}>{d.login.submit}</button>
          <p className="login-alt">{d.login.noAccount} <button className="linkish" type="button" onClick={() => folio.openSite(`${site}/signup/`)}>{d.login.create}</button></p>
        </form>
        <p className="login-foot">
          <span>Folio {version}</span><span aria-hidden="true">·</span>
          <button className="linkish" type="button" onClick={() => onLang(lang === 'zh' ? 'en' : 'zh')}>{LANG_NAMES[lang]}</button>
        </p>
      </div>
      <div className="login-r" aria-hidden="true">
        <div className="login-cards">
          {cards.map(c => (
            <div key={c.name} className="login-pc">
              <Flag country={c.cc} kernel={c.kernel} />
              <span><b>{c.name}</b><small>{c.where}</small></span>
              {c.st}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
