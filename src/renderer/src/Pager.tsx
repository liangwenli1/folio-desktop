// Which page of a long list shows, and how many a page holds: the profile list and a profile's cookies.
import type { Dict } from './i18n';
import { Icon } from './ui';
import { Select } from './Select';

export function Pager({ d, total, page, size, onPage, onSize }: { d: Dict; total: number; page: number; size: number; onPage(p: number): void; onSize(n: number): void }){
  const G = d.profiles.page, pages = Math.max(1, Math.ceil(total / size)), at = Math.min(page, pages);
  // The first, the last, and the two either side of the current one; gaps show as an ellipsis.
  const shown = [...new Set([1, at - 1, at, at + 1, pages])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <nav className="pager" aria-label={G.total(total)}>
      <span className="muted">{G.total(total)}</span>
      <Select variant="sm" label={G.size(size)} value={String(size)} onChange={v => onSize(Number(v))}
        options={[20, 50, 100].map(n => ({ value: String(n), label: G.size(n) }))} />
      <span className="sp" />
      <button type="button" className="icon-btn" aria-label={G.prev} title={G.prev} disabled={at <= 1} onClick={() => onPage(at - 1)}><Icon name="back" /></button>
      {shown.map((n, i) => <span key={n} className="pg">
        {i > 0 && n - shown[i - 1] > 1 && <span className="muted" aria-hidden="true">…</span>}
        <button type="button" className="pg-n" aria-label={G.go(n)} aria-current={n === at ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
      </span>)}
      <button type="button" className="icon-btn" aria-label={G.next} title={G.next} disabled={at >= pages} onClick={() => onPage(at + 1)}><Icon name="chevR" /></button>
    </nav>
  );
}
