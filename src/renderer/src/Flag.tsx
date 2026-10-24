// A profile's badge: the flag of the country it exits in (a globe until its proxy has been checked), with its engine's
// logo in the corner (a proxy's badge has no engine). Flags are flag-icons' square SVGs (MIT), bundled and loaded as they are needed.
// The engine and search engine logos (logos/) are their owners' trademarks, shown only to say which engine and search
// engine a profile uses: Chromium, Firefox, Google, Bing and DuckDuckGo from svgl, Baidu from Simple Icons (in its
// brand colour), Yahoo and Yandex the icons their own sites serve.
import { useEffect, useState } from 'react';
import type { KernelKind } from '@shared/bridge';
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

// Nothing for 'none'.
export const SearchLogo = ({ engine, size = 16 }: { engine: SearchEngine; size?: number }) =>
  engine === 'none' ? null : <img className="logo" src={SEARCH_LOGOS[engine]} width={size} height={size} alt="" aria-hidden="true" />;

export function Flag({ country, kernel, size = 'sm' }: { country: string | null; kernel?: KernelKind; size?: 'sm' | 'lg' }){
  const url = useFlag(country);
  return (
    <span className={`flag-badge ${size}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span className="globe"><Icon name="proxies" /></span>}
      {kernel && <span className="eng"><EngineLogo kernel={kernel} /></span>}
    </span>
  );
}
