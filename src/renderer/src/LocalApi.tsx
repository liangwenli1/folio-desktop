// API & scripts (v2's standard, one column of cards): the local API's switch, address, port and request limit; the
// tokens scripts sign in with, made in a dialog and shown once; examples to copy for each engine; and the latest calls.
import { useEffect, useState, type ReactNode } from 'react';
import type { LocalApi } from '@shared/bridge';
import { folio, type Workspace } from './api';
import type { WorkspaceData } from './data';
import { day, type Dict, type Lang } from './i18n';
import { Act, Cancel, CopyBtn, Empty, Icon, Modal, Switch, useToast } from './ui';

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
  const [making, setMaking] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [example, setExample] = useState<Example>('playwright');
  const sample = data.profiles[0];
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
  async function create(name: string){
    const r = await folio.createApiToken(name || A.defaultName, ws.id);
    setState(r.api); setFresh(r.token); setMaking(false);
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

  // A token made just now goes into the examples until it is put away; otherwise they say where one goes.
  const token = fresh ?? '<token>';
  const shown = code[example].replaceAll('<token>', token);
  const tone = state?.listening ? 'good' : state?.error ? 'bad' : '';

  return (
    <div className="page">
      <main className="main">
        <header className="bar">
          <div className="ttl"><h1>{A.title}</h1></div>
          <span className="sp" />
          <button type="button" className="btn btn-secondary" onClick={() => folio.openSite(`/${lang}/help/api/`)}><Icon name="api" />{A.reference}</button>
        </header>
        {state && <div className="api-page">
          <section className="sec" aria-labelledby="api-server">
            <div className="api-head">
              <div><h3 id="api-server">{A.server}</h3><p className="hint">{A.serverLead}</p></div>
              <Switch label={A.enable} checked={state.enabled} onChange={on => void change({ enabled: on })} />
            </div>
            <dl className="kvl api-kv">
              <dt>{A.status}</dt>
              <dd role="status">
                <span className={`badge ${tone}`}>{state.listening ? A.running : state.error ? A.failed : A.stopped}</span>
                {state.listening ? <><span>{A.listening} <span className="mono">{base}</span></span><CopyBtn text={base} label={A.copyAddress} done={A.copied} /></>
                  : <span className="hint">{state.error ? A.errors[state.error as keyof typeof A.errors] ?? state.error : A.off}</span>}
              </dd>
              <dt><label htmlFor="api-port">{A.port}</label></dt>
              <dd>
                <form className="api-port" onSubmit={e => { e.preventDefault(); void change({ port: Number(port) }); }}>
                  <input id="api-port" className="mono-in" type="number" min={1024} max={65535} value={port} onChange={e => setPort(e.target.value)} />
                  {Number(port) !== state.port && <button type="submit" className="btn btn-secondary btn-sm">{d.common.save}</button>}
                </form>
              </dd>
              <dt>{A.rate}</dt><dd>{ws.subscription.plan === 'company' ? A.unthrottled : A.limit}</dd>
            </dl>
            <p className="notice warn"><Icon name="alert" /><span>{A.security}</span></p>
          </section>

          <section className="sec" aria-labelledby="api-tokens">
            <div className="api-head">
              <div><h3 id="api-tokens">{A.tokens}</h3><p className="hint">{A.tokensLead}</p></div>
              <button type="button" className="btn btn-primary" onClick={() => setMaking(true)}><Icon name="plus" />{A.createToken}</button>
            </div>
            {fresh && (
              <div className="notice good token-new" role="status">
                <b>{A.newToken}</b>
                <code className="mono">{fresh}</code>
                <span className="actin"><button type="button" className="btn btn-sm btn-primary" onClick={() => copy(fresh)}>{A.copy}</button>
                  <button type="button" className="btn btn-sm btn-text" onClick={() => setFresh(null)}>{A.done}</button></span>
              </div>
            )}
            <div className="tw api-t">
              <table>
                <thead><tr><th scope="col">{A.cols.name}</th><th scope="col">{A.cols.workspace}</th><th className="mid" scope="col">{A.cols.created}</th><th className="mid" scope="col">{A.cols.used}</th><th className="act" scope="col">{A.cols.actions}</th></tr></thead>
                <tbody>
                  {!state.tokens.length && <tr className="empty"><td colSpan={5}><Empty icon="key" title={A.noTokens} text={A.noTokensText} /></td></tr>}
                  {state.tokens.map(t => (
                    <tr key={t.id} data-token={t.name}>
                      <td><b>{t.name}</b></td>
                      <td>{t.workspaceId === ws.id ? ws.name : <span className="muted">{A.otherWorkspace}</span>}</td>
                      <td className="mono mid">{day(t.createdAt, lang)}</td>
                      <td className={t.lastUsedAt ? 'mono mid' : 'muted mid'}>{t.lastUsedAt ? day(t.lastUsedAt, lang) : A.unused}</td>
                      <td className="act"><button type="button" className="btn btn-sm btn-text danger-t" aria-label={A.revokeX(t.name)} onClick={() => void folio.revokeApiToken(t.id).then(setState)}>{A.revoke}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sec" aria-labelledby="api-examples">
            <div className="api-head">
              <div><h3 id="api-examples">{A.examples}</h3><p className="hint">{A.placeholder}</p></div>
              <div className="seg" role="group" aria-label={A.examples}>
                {(['playwright', 'puppeteer', 'selenium', 'firefox'] as const).map(k => <button key={k} type="button" aria-pressed={example === k} onClick={() => setExample(k)}>{A.exampleNames[k]}</button>)}
              </div>
            </div>
            <div className="code-wrap">
              <pre className="code"><code>{highlight(shown)}</code></pre>
              <button type="button" className="btn btn-sm btn-secondary copy" onClick={() => copy(shown)}>{A.copy}</button>
            </div>
          </section>

          <section className="sec" aria-labelledby="api-calls">
            <div><h3 id="api-calls">{A.calls}</h3><p className="hint">{A.callsLead}</p></div>
            <div className="tw api-t api-calls">
              <table>
                <thead><tr><th className="mid" scope="col">{A.cols.time}</th><th className="mid" scope="col">{A.cols.method}</th><th scope="col">{A.cols.path}</th><th className="mid" scope="col">{A.cols.status}</th><th scope="col">{A.cols.token}</th></tr></thead>
                <tbody>
                  {!state.enabled ? <tr className="empty"><td colSpan={5}><Empty icon="api" title={A.offTitle} text={A.off} /></td></tr>
                    : !state.calls.length ? <tr className="empty"><td colSpan={5}><Empty icon="api" title={A.noCallsTitle} text={A.noCalls} /></td></tr>
                    : state.calls.map(c => (
                      <tr key={`${c.at}${c.path}`}>
                        <td className="mono mid">{clock(c.at, lang)}</td>
                        <td className="mid"><span className={`verb ${c.method.toLowerCase()}`}>{c.method}</span></td>
                        <td className="mono call">{c.path}</td>
                        <td className="mid"><span className={`badge ${c.status >= 400 ? 'bad' : 'good'}`}>{c.status}{c.status === 429 && ` ${A.limited}`}</span></td>
                        <td>{c.token ?? <span className="muted">{A.noToken}</span>}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>}
        {making && <TokenDialog d={d} onClose={() => setMaking(false)} onCreate={create} />}
      </main>
    </div>
  );
}

// Naming a new token; it is shown once on the page after it is made.
function TokenDialog({ d, onClose, onCreate }: { d: Dict; onClose(): void; onCreate(name: string): Promise<void> }){
  const A = d.apiPage;
  const [name, setName] = useState('');
  return (
    <Modal title={A.createToken} onClose={onClose} foot={<>
      <Cancel />
      <Act className="btn btn-primary" run={() => onCreate(name.trim())}>{A.createToken}</Act>
    </>}>
      <form className="m-body" onSubmit={e => { e.preventDefault(); void onCreate(name.trim()); }}>
        <label className="field"><span>{A.nameLabel}</span>
          <input value={name} maxLength={60} placeholder={A.tokenName} autoFocus onChange={e => setName(e.target.value)} /></label>
        <p className="hint">{A.nameHint}</p>
      </form>
    </Modal>
  );
}
