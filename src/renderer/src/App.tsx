import { useCallback, useEffect, useRef, useState } from 'react';
import { folio, isApiError, type Me, type Workspace } from './api';
import { dicts, type Lang } from './i18n';
import { Login } from './Login';
import { Workbench } from './Workbench';
import { Mark } from './ui';

const WS_KEY = 'folio.workspace';
const savedWorkspace = () => { try { return localStorage.getItem(WS_KEY); } catch { return null; } };

export function App(){
  const [phase, setPhase] = useState<'loading' | 'login' | 'app' | 'offline'>('loading');
  const [lang, setLang] = useState<Lang>('en');
  const [version, setVersion] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [ws, setWs] = useState<Workspace | null>(null);
  const wsId = useRef<string | null>(savedWorkspace());
  const d = dicts[lang];

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  // Reloads the account and the current workspace. Any 401 sends the user back to the login screen.
  const load = useCallback(async (preferred?: string) => {
    try {
      const m = await folio.api<Me>('GET', '/me');
      const id = [preferred, wsId.current].find(x => x && m.workspaces.some(w => w.id === x)) ?? m.workspaces[0].id;
      const w = await folio.api<Workspace>('GET', `/workspaces/${id}`);
      wsId.current = id;
      try { localStorage.setItem(WS_KEY, id); } catch { /* storage unavailable: keep it in memory */ }
      setMe(m); setWs(w); setLang(m.user.locale); setPhase('app');
    } catch (e){
      setPhase(isApiError(e) && e.status === 401 ? 'login' : 'offline');
    }
  }, []);

  useEffect(() => {
    // The platform decides whether the window has a title bar of its own (styles.css, --tb).
    folio.info().then(i => { setLang(i.locale.startsWith('zh') ? 'zh' : 'en'); setVersion(i.version); document.documentElement.dataset.platform = i.platform; });
    folio.hasSession().then(has => (has ? load() : setPhase('login')));
  }, [load]);

  // Coming back from the website (for example after buying more profiles) shows the new limits right away.
  useEffect(() => folio.onFocus(() => { if (phase === 'app') void load(); }), [phase, load]);

  if (phase === 'loading') return <div className="splash"><Mark /></div>;
  if (phase === 'offline') return (
    <div className="splash"><p className="notice error" role="alert">{d.errors.network} <button className="linkish" type="button" onClick={() => load()}>{d.retry}</button></p></div>
  );
  if (phase === 'login' || !me || !ws) return <Login d={d} lang={lang} version={version} onLang={setLang} onDone={() => load()} />;
  return (
    <Workbench
      d={d} lang={lang} version={version} me={me} ws={ws}
      onSwitch={id => load(id)}
      onWorkspace={() => load()}
      onLang={async l => { await folio.api('PATCH', '/me', { locale: l }); await load(); }}
      onLogout={async () => { await folio.logout(); setMe(null); setWs(null); setPhase('login'); }}
    />
  );
}
