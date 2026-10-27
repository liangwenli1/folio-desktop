// Ctrl+K (⌘K on macOS) from anywhere, or the top bar's search: find a profile and open, stop or switch to it, find a
// proxy or a member, go to a page, or run a common action, without leaving the keyboard.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Dict } from './i18n';
import { Icon } from './ui';

export interface Command { id: string; group: 'profiles' | 'proxies' | 'members' | 'actions' | 'pages'; label: string; hint?: string; keys?: string; icon: ReactNode; run(): void }
const GROUPS: Command['group'][] = ['profiles', 'proxies', 'members', 'actions', 'pages'];
export const mod = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl';

export function CommandPalette({ d, commands, onClose }: { d: Dict; commands: Command[]; onClose(): void }){
  const C = d.palette;
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const uid = useId();
  const needle = q.trim().toLowerCase();
  // In group order, so the arrow keys follow what is on screen.
  const shown = GROUPS.flatMap(g => commands.filter(c => c.group === g && (!needle || `${c.label} ${c.hint ?? ''}`.toLowerCase().includes(needle))).slice(0, g === 'actions' || g === 'pages' ? 12 : 8));
  useEffect(() => setActive(0), [needle]);
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const run = (c: Command) => { onClose(); c.run(); };
  function key(e: KeyboardEvent){
    if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === 'ArrowDown'){ e.preventDefault(); setActive(a => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && shown[active]){ e.preventDefault(); run(shown[active]); }
  }

  return (
    <>
      <div className="scrim palette-scrim" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label={C.title} onKeyDown={key}>
        <div className="pal-search">
          <Icon name="search" />
          <input autoFocus value={q} placeholder={C.placeholder} onChange={e => setQ(e.target.value)} role="combobox" aria-expanded="true"
            aria-controls={`${uid}-list`} aria-activedescendant={shown[active] ? `${uid}-${active}` : undefined} spellCheck={false} />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" id={`${uid}-list`} role="listbox" ref={list} aria-label={C.title}>
          {GROUPS.map(g => {
            const items = shown.map((c, i) => ({ c, i })).filter(x => x.c.group === g);
            return items.length > 0 && (
              <div key={g} role="group" aria-labelledby={`${uid}-${g}`}>
                <p className="pal-g" id={`${uid}-${g}`}>{C.groups[g]}</p>
                {items.map(({ c, i }) => (
                  <div key={c.id} id={`${uid}-${i}`} role="option" aria-selected={i === active} data-active={i === active}
                    onMouseMove={() => setActive(i)} onClick={() => run(c)}>
                    <span className="pal-ic">{c.icon}</span>
                    <span className="pal-l">{c.label}{c.hint && <small>{c.hint}</small>}</span>
                    {c.keys && <kbd>{c.keys}</kbd>}
                  </div>
                ))}
              </div>
            );
          })}
          {!shown.length && <p className="pal-none">{C.none}</p>}
        </div>
        <p className="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> {C.move}</span><span><kbd>Enter</kbd> {C.run}</span><span><kbd>Esc</kbd> {C.close}</span></p>
      </div>
    </>
  );
}
