// A profile's badge: the flag of the country it exits in (a globe until its proxy has been checked), with a corner
// mark for its engine. Flags are flag-icons' square SVGs (MIT), bundled and loaded as they are needed.
import { useEffect, useState } from 'react';
import type { KernelKind } from '@shared/bridge';
import { Icon } from './ui';

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

export function Flag({ country, kernel, size = 'sm' }: { country: string | null; kernel: KernelKind; size?: 'sm' | 'lg' }){
  const url = useFlag(country);
  return (
    <span className={`flag-badge ${size}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span className="globe"><Icon name="proxies" /></span>}
      <span className={`eng ${kernel}`}>{kernel === 'chromium' ? 'C' : 'F'}</span>
    </span>
  );
}
