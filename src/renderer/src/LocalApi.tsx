// API & scripts: the local API's switch, port and tokens, with examples to copy for each engine.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { LocalApi } from '@shared/bridge';
import { folio, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { day, type Dict, type Lang } from './i18n';
import { Switch, useToast } from './ui';

type Example = 'playwright' | 'puppeteer' | 'selenium' | 'firefox';

// Colours for the examples (JavaScript and Python): comments, strings, numbers, keywords and calls.
const KEYWORDS = new Set(['import', 'from', 'const', 'let', 'await', 'async', 'new', 'return', 'function', 'def', 'if', 'else', 'for', 'in', 'of', 'True', 'False', 'None', 'true', 'false', 'null']);
const TOKEN = /(\/\/[^\n]*|#[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;
function highlight(code: string){
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(TOKEN)){
    const [t, comment, str, num, call, word] = m;
    if (m.index > last) out.push(code.slice(last, m.index));
    const cls = comment ? 'c-com' : str ? 'c-str' : num ? 'c-num' : call ? (KEYWORDS.has(call) ? 'c-kw' : 'c-fn') : word && KEYWORDS.has(word) ? 'c-kw' : null;
    out.push(cls ? <span key={m.index} className={cls}>{t}</span> : t);
    last = m.index + t.length;
  }
  out.push(code.slice(last));
  return out;
}
const clock = (at: number, lang: Lang) => new Date(at).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export function ApiPage({ d, lang, ws, data }: { d: Dict; lang: Lang; ws: Workspace; data: WorkspaceData }){
  const A = d.apiPage;
  const toast = useToast();
  const [state, setState] = useState<LocalApi | null>(null);
  const [port, setPort] = useState('');
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [example, setExample] = useState<Example>('playwright');
  const company = ws.subscription.plan === 'company';
  const wsName = new Map([[ws.id, ws.name]]);
  const sample = data.profiles?.[0];
  const ref = sample ? String(sample.number).padStart(4, '0') : '0001';
  const base = `http://127.0.0.1:${state?.port ?? 47210}`;

  useEffect(() => { void folio.localApi().then(s => { setState(s); setPort(String(s.port)); }); }, []);
  // Each script call shows up at once.
  useEffect(() => folio.onLocalApi(setState), []);
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast(A.copied));

  async function change(c: { enabled?: boolean; port?: number }){
    // The switch moves at once; whether the server listens comes back from the main process.
    if (c.enabled !== undefined) setState(x => x && { ...x, enabled: c.enabled! });
    const s = await folio.setLocalApi(c);
    setState(s); setPort(String(s.port));
  }
  async function create(e: FormEvent){
    e.preventDefault();
    const r = await folio.createApiToken(name || A.defaultName, ws.id);
    setState(r.api); setFresh(r.token); setName('');
  }

  const code: Record<Example, string> = {
    playwright: `import { chromium } from 'playwright';

const res = await fetch('${base}/api/v1/profiles/${ref}/start', {
  method: 'POST', headers: { authorization: 'Bearer <token>' }
});
const { wsEndpoint } = await res.json();
const browser = await chromium.connectOverCDP(wsEndpoint);
const page = browser.contexts()[0].pages()[0];
await page.goto('https://example.com');`,
    puppeteer: `import puppeteer from 'puppeteer-core';

const res = await fetch('${base}/api/v1/profiles/${ref}/start', {
  method: 'POST', headers: { authorization: 'Bearer <token>' }
});
const { wsEndpoint } = await res.json();
const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
const [page] = await browser.pages();
await page.goto('https://example.com');`,
    selenium: `import requests
from selenium import webdriver

r = requests.post('${base}/api/v1/profiles/${ref}/start',
                  headers={'Authorization': 'Bearer <token>'}).json()
options = webdriver.ChromeOptions()
options.debugger_address = r['debuggerAddress']  # needs chromedriver 150
driver = webdriver.Chrome(options=options)
driver.get('https://example.com')`,
    firefox: `import puppeteer from 'puppeteer-core';

const res = await fetch('${base}/api/v1/profiles/${ref}/start', {
  method: 'POST', headers: { authorization: 'Bearer <token>' }
});
const { wsEndpoint } = await res.json();  // ws://127.0.0.1:…/session
const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint, protocol: 'webDriverBiDi' });
const [page] = await browser.pages();
await page.goto('https://example.com');`
  };

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{A.title}</h1><p className="sub">{A.sub}</p></div>
          <span className="sp" />
          <button type="button" className="btn btn-secondary" onClick={() => folio.openSite(`/${lang}/docs/api/`)}>{A.reference}</button>
        </header>
        {state && <div className="api-page">
          <section className="api-card" aria-label={A.server}>
            <div className="sec-row">
              <h2 className="sec-t">{A.server}</h2>
              <Switch label={A.enable} checked={state.enabled} onChange={on => void change({ enabled: on })} />
            </div>
            <p className="api-status" role="status">
              <span className={`d ${state.listening ? 'good' : state.error ? 'bad' : ''}`} aria-hidden="true" />
              {state.listening ? <>{A.listening} <span className="mono">{base}</span> <button type="button" className="linkish hint" onClick={() => copy(base)}>{A.copy}</button></>
                : state.error ? A.errors[state.error as keyof typeof A.errors] ?? state.error : A.off}
            </p>
            <form className="api-port" onSubmit={e => { e.preventDefault(); void change({ port: Number(port) }); }}>
              <label className="field"><span>{A.port}</span><input type="number" min={1024} max={65535} value={port} onChange={e => setPort(e.target.value)} /></label>
              <button type="submit" className="btn btn-secondary btn-sm" disabled={Number(port) === state.port}>{d.common.save}</button>
            </form>
            <p className="hint">{company ? A.unthrottled : A.limit}</p>
            <p className="hint">{A.security}</p>
          </section>

          <section className="api-card" aria-label={A.tokens}>
            <h2 className="sec-t">{A.tokens}</h2>
            <p className="hint">{A.tokensHelp}</p>
            {fresh && (
              <div className="token-new" role="status">
                <span>{A.newToken}</span>
                <code className="mono">{fresh}</code>
                <span className="actin"><button type="button" className="btn btn-xs btn-primary" onClick={() => copy(fresh)}>{A.copy}</button>
                  <button type="button" className="btn btn-xs btn-text" onClick={() => setFresh(null)}>{A.done}</button></span>
              </div>
            )}
            <ul className="plain-list">
              {state.tokens.map(t => (
                <li key={t.id} data-token={t.name}>
                  <span><b>{t.name}</b>{t.workspaceId !== ws.id && <span className="tag">{wsName.get(t.workspaceId) ?? A.otherWorkspace}</span>}<br />
                    <span className="hint">{A.made(day(t.createdAt, lang))} · {t.lastUsedAt ? A.used(day(t.lastUsedAt, lang)) : A.unused}</span></span>
                  <span className="sp" />
                  <button type="button" className="btn btn-xs btn-danger" aria-label={A.revokeX(t.name)} onClick={() => void folio.revokeApiToken(t.id).then(setState)}>{A.revoke}</button>
                </li>
              ))}
            </ul>
            <form className="token-form" onSubmit={e => void create(e)}>
              <input aria-label={A.tokenName} placeholder={A.tokenName} value={name} maxLength={60} onChange={e => setName(e.target.value)} />
              <button type="submit" className="btn btn-secondary btn-sm">{A.createToken}</button>
            </form>
          </section>

          <section className="api-card wide" aria-label={A.examples}>
            <div className="sec-row">
              <h2 className="sec-t">{A.examples}</h2>
              <div className="seg" role="group" aria-label={A.examples}>
                {(['playwright', 'puppeteer', 'selenium', 'firefox'] as const).map(k => <button key={k} type="button" aria-pressed={example === k} onClick={() => setExample(k)}>{A.exampleNames[k]}</button>)}
              </div>
            </div>
            <p className="hint">{example === 'firefox' ? A.firefoxNote : A.chromiumNote}</p>
            <div className="code-wrap">
              <pre className="code"><code>{highlight(code[example])}</code></pre>
              <button type="button" className="btn btn-xs btn-secondary copy" onClick={() => copy(code[example])}>{A.copy}</button>
            </div>
          </section>

          {state.enabled && (
            <section className="api-card wide" aria-label={A.calls}>
              <h2 className="sec-t">{A.calls}</h2>
              {!state.calls.length ? <p className="hint">{A.noCalls}</p> : (
                <ol className="calls">
                  {state.calls.map(c => (
                    <li key={`${c.at}${c.path}`}>
                      <time className="mono">{clock(c.at, lang)}</time>
                      <span className="mono call"><b>{c.method}</b> {c.path}</span>
                      <span className={`st ${c.status < 300 ? 'run' : c.status < 500 ? 'away' : 'bad'}`}>{c.status}</span>
                      <span className="hint">{c.token ?? A.noToken}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          <section className="api-card wide" aria-label={A.endpoints}>
            <h2 className="sec-t">{A.endpoints}</h2>
            <table className="endpoints">
              <tbody>
                {A.routes.map(([route, what]) => <tr key={route}><td className="mono">{route}</td><td>{what}</td></tr>)}
              </tbody>
            </table>
          </section>
        </div>}
      </main>
    </div>
  );
}
