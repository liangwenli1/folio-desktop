import { useState, type FormEvent } from 'react';
import { folio, isApiError } from './api';
import type { Dict } from './i18n';
import { Mark } from './ui';

export function Login({ d, onDone }: { d: Dict; onDone: () => void }){
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const site = document.documentElement.lang === 'zh' ? '/zh' : '/en';

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
      <div className="login-brand"><Mark /><span className="brand-word">Folio</span></div>
      <form className="login-card" onSubmit={submit} noValidate>
        <h1>{d.login.title}</h1>
        <p className="muted">{d.login.lead}</p>
        {error && <p className="notice error" role="alert">{error}</p>}
        <label className="field">
          <span>{d.login.email}</span>
          <input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>{d.login.password}</span>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <button className="btn btn-primary full" type="submit" disabled={busy}>{d.login.submit}</button>
        <button className="linkish" type="button" onClick={() => folio.openSite(`${site}/forgot/`)}>{d.login.forgot}</button>
      </form>
      <p className="muted">{d.login.noAccount} <button className="linkish" type="button" onClick={() => folio.openSite(`${site}/signup/`)}>{d.login.create}</button></p>
    </main>
  );
}
