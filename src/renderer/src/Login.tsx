import { useState, type FormEvent } from 'react';
import { folio, isApiError } from './api';
import type { Dict, Lang } from './i18n';
import { Mark } from './ui';

// The profile list, in each language and colour scheme, as demo/capture.spec.ts recorded it.
const PICTURES = import.meta.glob<string>('./shots/*.webp', { query: '?url', import: 'default', eager: true });

// The form on the left; on the right the workbench, as it looks once signed in.
export function Login({ d, lang, version, onLang, onDone }: { d: Dict; lang: Lang; version: string; onLang(l: Lang): void; onDone: () => void }){
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const site = `/${lang}`;

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
          <button className="btn btn-primary btn-lg full" type="submit" disabled={busy} aria-busy={busy || undefined}>{d.login.submit}</button>
          <p className="login-alt">{d.login.noAccount} <button className="linkish" type="button" onClick={() => folio.openSite(`${site}/signup/`)}>{d.login.create}</button></p>
        </form>
        <p className="login-foot">
          <span>Folio {version}</span><span aria-hidden="true">·</span>
          <button className="linkish" type="button" onClick={() => onLang(lang === 'zh' ? 'en' : 'zh')}>{d.user.langs[lang]}</button>
        </p>
      </div>
      <div className="login-r">
        <picture className="login-shot">
          <source srcSet={PICTURES[`./shots/${lang}-dark.webp`]} media="(prefers-color-scheme: dark)" />
          <img src={PICTURES[`./shots/${lang}-light.webp`]} width={1920} height={1200} alt={d.login.picture} />
        </picture>
      </div>
    </main>
  );
}
