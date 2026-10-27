// A profile's badge: the flag of the country it exits in (a globe until its proxy has been checked), with its engine's
// logo in the corner (a proxy's badge has no engine). Flags are flag-icons' square SVGs (MIT), bundled and loaded as they are needed.
// The engine and search engine logos (logos/) are their owners' trademarks, shown only to say which engine and search
// engine a profile uses: Chromium, Firefox, Google, Bing and DuckDuckGo from svgl, Baidu from Simple Icons (in its
// brand colour), Yahoo and Yandex the icons their own sites serve.
import { useEffect, useState } from 'react';
import type { KernelKind, Os } from '@shared/bridge';
import type { SearchEngine } from '@shared/search';
import { Icon } from './ui';
import chromium from './logos/chromium.svg?url';
import firefox from './logos/firefox.svg?url';
import google from './logos/google.svg?url';
import bing from './logos/bing.svg?url';
import baidu from './logos/baidu.svg?url';
import duckduckgo from './logos/duckduckgo.svg?url';
import yahoo from './logos/yahoo.png?url';
import yandex from './logos/yandex.png?url';

export const SEARCH_LOGOS: Record<Exclude<SearchEngine, 'none'>, string> = { google, bing, baidu, duckduckgo, yahoo, yandex };

const FLAGS = import.meta.glob<string>('../../../node_modules/flag-icons/flags/1x1/*.svg', { query: '?url', import: 'default' });
const loaded = new Map<string, string>();
const flagOf = (cc: string) => FLAGS[`../../../node_modules/flag-icons/flags/1x1/${cc.toLowerCase()}.svg`];

function useFlag(cc: string | null){
  const [url, setUrl] = useState(() => (cc ? loaded.get(cc) ?? null : null));
  useEffect(() => {
    if (!cc) { setUrl(null); return; }
    if (loaded.has(cc)) { setUrl(loaded.get(cc)!); return; }
    let live = true;
    void flagOf(cc)?.().then(u => { loaded.set(cc, u); if (live) setUrl(u); });
    return () => { live = false; };
  }, [cc]);
  return url;
}

export const EngineLogo = ({ kernel, size = 16 }: { kernel: KernelKind; size?: number }) =>
  <img className="logo" src={kernel === 'chromium' ? chromium : firefox} width={size} height={size} alt="" aria-hidden="true" />;

// A system's own mark, filled: Windows' four panes, the Apple, the Linux penguin.
const OS_MARKS: Record<Os, string> = {
  windows: 'M3 5.2 10.4 4.2V11.3H3zM11.4 4.1 21 2.8V11.3H11.4zM3 12.3H10.4V19.4L3 18.4zM11.4 12.3H21V20.8L11.4 19.5z',
  macos: 'M16.5 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.5-1-2.5-3.7zM14.2 5.9c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.7-1.3z',
  linux: 'M12 2C9.8 2 8.5 3.9 8.5 6.4c0 1.4.2 2.4-.6 3.7-1 1.6-2.7 3.7-2.7 6.6 0 1.4.4 2.4 1.1 3.1-.5.4-1.1.8-1.1 1.5 0 .9 1.2.9 2.6.9 1.3 0 2.2-.4 2.9-.9.4.1.8.1 1.3.1s.9 0 1.3-.1c.7.5 1.6.9 2.9.9 1.4 0 2.6 0 2.6-.9 0-.7-.6-1.1-1.1-1.5.7-.7 1.1-1.7 1.1-3.1 0-2.9-1.7-5-2.7-6.6-.8-1.3-.6-2.3-.6-3.7C15.5 3.9 14.2 2 12 2z'
};
export const OsLogo = ({ os, size = 14 }: { os: Os; size?: number }) =>
  <svg className="os-logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={OS_MARKS[os]} fill="currentColor" /></svg>;

// Nothing for 'none'.
export const SearchLogo = ({ engine, size = 16 }: { engine: SearchEngine; size?: number }) =>
  engine === 'none' ? null : <img className="logo" src={SEARCH_LOGOS[engine]} width={size} height={size} alt="" aria-hidden="true" />;

export function Flag({ country, kernel, size = 'sm' }: { country: string | null; kernel?: KernelKind; size?: 'xs' | 'sm' | 'lg' }){
  const url = useFlag(country);
  return (
    <span className={`flag-badge ${size}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span className="globe"><Icon name="proxies" /></span>}
      {kernel && <span className="eng"><EngineLogo kernel={kernel} /></span>}
    </span>
  );
}
