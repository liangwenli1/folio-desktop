// The app's dropdown, in place of the system one: same look everywhere, keyboard and type-to-filter, options with a
// status dot or a logo and a hint (a proxy's exit city), a search box for long lists. The list opens above everything (dialogs
// included) and closes on a click elsewhere, Escape, scrolling or resizing. With `action` it is a menu button: the
// trigger always shows the placeholder, and picking runs onChange (the bulk bar's "Move to group…").
// A list that comes from the server says so while it loads (`loading`) and when it failed (`failed`, with `onRetry`);
// no options and no matches for the search are told apart (delivery spec 4). `empty` names what there is none of.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon, useDict, useDismiss, type GroupColor } from './ui';

// `dot` is a status, or a group's colour. `count` shows in the open list only, never on the closed dropdown.
export interface Opt { value: string; label: string; hint?: string; count?: number; dot?: 'good' | 'warn' | 'bad' | 'idle' | `gc-${GroupColor}`; img?: string; group?: string }
interface Props {
  value: string; options: Opt[]; onChange(value: string): void;
  id?: string; label?: string; labelledBy?: string; placeholder?: string; disabled?: boolean; required?: boolean;
  variant?: 'field' | 'sm' | 'bar'; action?: boolean; search?: boolean; searchPh?: string; empty?: string;
  loading?: boolean; failed?: boolean; onRetry?(): void;
}
type Place = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };
// Consecutive options of the same group, with where they start in the list.
const runs = (opts: Opt[]) => opts.reduce<{ group?: string; from: number; opts: Opt[] }[]>((out, o, i) => {
  const last = out.at(-1);
  if (last && last.group === o.group) last.opts.push(o); else out.push({ group: o.group, from: i, opts: [o] });
  return out;
}, []);

export function Select({ value, options, onChange, id, label, labelledBy, placeholder, disabled, required, variant = 'field', action, search, searchPh, empty, loading, failed, onRetry }: Props){
  const d = useDict().common;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const uid = useId();
  const searchable = search ?? options.length > 8;
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter(o => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(needle)) : options;
  const cur = action ? undefined : options.find(o => o.value === value);

  const close = (focus = true) => { setOpen(false); setQ(''); if (focus) btn.current?.focus(); };
  const pick = (o: Opt) => { close(); if (o.value !== value || action) onChange(o.value); };

  function show(){
    if (disabled) return;
    // Never up into the window's top strip (--tb), where clicks drag the window.
    const tb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tb')) || 0;
    const r = btn.current!.getBoundingClientRect(), below = innerHeight - r.bottom - 8, above = r.top - 8 - tb;
    const up = below < 240 && above > below, width = Math.max(r.width, variant === 'bar' ? 220 : 0);
    setPlace({ left: Math.max(8, Math.min(r.left, innerWidth - width - 8)), width, maxHeight: Math.min(340, up ? above : below), ...(up ? { bottom: innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
    setActive(Math.max(0, options.findIndex(o => o.value === value)));
    setOpen(true);
  }

  useDismiss(open, [btn, pop], () => close(false));
  useLayoutEffect(() => {
    if (!open) return;
    (searchable ? pop.current?.querySelector('input') : list.current)?.focus();
  }, [open, searchable]);
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, open]);
  useEffect(() => setActive(0), [needle]);

  function key(e: KeyboardEvent){
    const last = shown.length - 1;
    // Escape and Tab both give the focus back to the dropdown, so Tab goes on from there.
    if (e.key === 'Escape' || e.key === 'Tab'){ e.stopPropagation(); if (e.key === 'Escape') e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown'){ e.preventDefault(); setActive(a => Math.min(last, a + 1)); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Home' || e.key === 'End'){ e.preventDefault(); setActive(e.key === 'Home' ? 0 : last); }
    else if (e.key === 'Enter' || (e.key === ' ' && !searchable)){ e.preventDefault(); if (shown[active]) pick(shown[active]); }
    else if (!searchable && e.key.length === 1){
      // Type-ahead: the next option starting with the letter.
      const k = e.key.toLowerCase(), from = shown.findIndex((o, i) => i > active && o.label.toLowerCase().startsWith(k));
      const at = from >= 0 ? from : shown.findIndex(o => o.label.toLowerCase().startsWith(k));
      if (at >= 0) setActive(at);
    }
  }
  const optId = (i: number) => `${uid}-o${i}`;

  return (
    <>
      <button ref={btn} type="button" id={id} className={`sel ${variant}${open ? ' open' : ''}`} role="combobox" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${uid}-list` : undefined} aria-label={label} aria-labelledby={labelledBy} aria-required={required || undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={e => { if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')){ e.preventDefault(); show(); } }}>
        {cur?.dot && <span className={`d ${cur.dot}`} aria-hidden="true" />}
        {cur?.img && <img className="logo" src={cur.img} alt="" aria-hidden="true" />}
        <span className={`sel-v${cur ? '' : ' ph'}`}>{cur?.label ?? placeholder ?? ''}</span>
        {cur?.hint && variant === 'field' && <span className="sel-h">{cur.hint}</span>}
        <Icon name="chev" />
      </button>
      {open && place && createPortal(
        <div ref={pop} className={`sel-pop${variant === 'bar' ? ' bar' : ''}`} style={place} onKeyDown={key}>
          {searchable && (
            <div className="sel-search"><Icon name="search" />
              <input value={q} placeholder={searchPh} onChange={e => setQ(e.target.value)} aria-controls={`${uid}-list`} aria-activedescendant={shown[active] ? optId(active) : undefined} spellCheck={false} />
            </div>
          )}
          <div ref={list} id={`${uid}-list`} role="listbox" tabIndex={-1} aria-label={label} aria-labelledby={labelledBy}
            aria-activedescendant={!searchable && shown[active] ? optId(active) : undefined}>
            {runs(shown).map(({ group, from, opts }) => {
              const items = opts.map((o, k) => {
                const i = from + k;
                return (
                  <div key={o.value} id={optId(i)} role="option" aria-selected={!action && o.value === value} data-active={i === active}
                    onMouseMove={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(o)}>
                    {o.dot && <span className={`d ${o.dot}`} aria-hidden="true" />}
                    {o.img && <img className="logo" src={o.img} alt="" aria-hidden="true" />}
                    <span className="sel-v">{o.label}</span>{o.hint && <span className="sel-h">{o.hint}</span>}{o.count !== undefined && <span className="sel-h">{o.count}</span>}
                    {!action && o.value === value && <Icon name="check" />}
                  </div>
                );
              });
              return group
                ? <div key={`${group}:${from}`} role="group" aria-labelledby={`${uid}-g${from}`}><div className="sel-group" id={`${uid}-g${from}`}>{group}</div>{items}</div>
                : <div key={`:${from}`} role="presentation">{items}</div>;
            })}
            {loading ? <p className="sel-none"><span className="spin" aria-hidden="true" />{d.listLoading}</p>
              : failed ? <p className="sel-none bad">{d.listFailed}{onRetry && <button type="button" className="linkish" onClick={onRetry}>{d.retry}</button>}</p>
              : !options.length ? <p className="sel-none">{empty ?? d.noOptions}</p>
              : !shown.length && <p className="sel-none">{d.noMatch}</p>}
          </div>
        </div>, document.body)}
    </>
  );
}

// A labelled dropdown in a form: the label names the dropdown (marked when it may be left as it is), an optional hint
// goes below.
export function SelectField({ label, optional, hint, wide, ...props }: Omit<Props, 'label' | 'labelledBy'> & { label: string; optional?: boolean; hint?: string; wide?: boolean }){
  const id = useId(), d = useDict();
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <span className="label" id={id}>{label}{props.required && <span className="req" aria-hidden="true">*</span>}{optional && <small className="opt">{d.form.optional}</small>}</span>
      <Select {...props} labelledBy={id} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
