'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

export interface FilterOption {
  value: string;
  label: string;
  /** Optional heading the option is listed under (like an <optgroup>). */
  group?: string;
}

interface BaseProps {
  options: FilterOption[];
  style?: CSSProperties;
  title?: string;
  searchPlaceholder?: string;
}

interface SingleProps extends BaseProps {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
}

interface MultiProps extends BaseProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
  /** Shown on the button when nothing is ticked (nothing ticked = no filter). */
  allLabel: string;
}

type Props = SingleProps | MultiProps;

const PANEL_MAX_HEIGHT = 300;

/**
 * Filter dropdown with a search box. Single mode is a drop-in for a filter <select>
 * (the "All ..." choice is just one of the options). Multi mode ticks several values;
 * an empty list means "no filter".
 *
 * The panel is portalled to <body> with fixed positioning so a parent card with
 * overflow:hidden can't clip it.
 */
export default function FilterSelect(props: Props) {
  const { options, style, title, searchPlaceholder } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number; openUp: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setSearch('');
  }

  // Position the panel under (or above, near the bottom of the screen) the button.
  useLayoutEffect(() => {
    if (!open) return;
    function place(e?: Event) {
      if (e?.type === 'scroll' && e.target instanceof Node && panelRef.current?.contains(e.target)) return; // scrolling the list itself
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      const openUp = window.innerHeight - r.bottom < PANEL_MAX_HEIGHT + 80 && r.top > window.innerHeight - r.bottom;
      setPos({ left: Math.min(r.left, Math.max(8, window.innerWidth - 428)), top: openUp ? r.top - 4 : r.bottom + 4, minWidth: r.width, openUp });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    }
    document.addEventListener('mousedown', handleClick);
    searchRef.current?.focus();
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q) || (o.group || '').toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => { setActive(0); }, [search, open]);

  // Keep the keyboard-highlighted option in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const selectedSet = useMemo(
    () => new Set(props.multiple ? props.value : [props.value]),
    [props.multiple, props.value],
  );

  let buttonLabel: string;
  if (props.multiple) {
    const picked = props.value;
    if (picked.length === 0) buttonLabel = props.allLabel;
    else if (picked.length === 1) buttonLabel = options.find(o => o.value === picked[0])?.label ?? picked[0];
    else buttonLabel = `${picked.length} selected`;
  } else {
    // A value no longer in the list still filters, so show it rather than "All ...".
    buttonLabel = options.find(o => o.value === props.value)?.label ?? props.value;
  }

  function pick(value: string) {
    if (props.multiple) {
      props.onChange(props.value.includes(value) ? props.value.filter(v => v !== value) : [...props.value, value]);
    } else {
      props.onChange(value);
      close();
      buttonRef.current?.focus();
    }
  }

  function tickAllShown() {
    if (!props.multiple) return;
    const next = new Set(props.value);
    for (const o of shown) next.add(o.value);
    props.onChange([...next]);
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(shown.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[active]) pick(shown[active].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
      buttonRef.current?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  }

  function onButtonKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true);
    }
  }

  // Group headings appear when the group changes from the previous option.
  let lastGroup: string | undefined;

  const panel = open && pos && (
    <div
      ref={panelRef}
      style={{
        position: 'fixed', left: pos.left, top: pos.top, zIndex: 1000,
        transform: pos.openUp ? 'translateY(-100%)' : undefined,
        background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: pos.minWidth, width: 'max-content', maxWidth: 420,
      }}
    >
      <div style={{ padding: 6, borderBottom: '1px solid #f3f4f6' }}>
        <input
          ref={searchRef}
          className="input"
          type="text"
          role="combobox"
          aria-expanded
          aria-controls="filter-select-list"
          aria-activedescendant={shown[active] ? `filter-opt-${active}` : undefined}
          placeholder={searchPlaceholder || 'Search...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={onSearchKey}
          style={{ width: '100%', fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
        />
      </div>

      {props.multiple && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 10px', borderBottom: '1px solid #f3f4f6', fontSize: '0.75rem' }}>
          <button type="button" onClick={tickAllShown} disabled={shown.length === 0}
            style={{ border: 'none', background: 'none', color: 'var(--haier-blue)', cursor: 'pointer', padding: 0 }}>
            {search ? `Tick all ${shown.length} shown` : 'Tick all'}
          </button>
          <button type="button" onClick={() => props.onChange([])} disabled={props.value.length === 0}
            style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', padding: 0 }}>
            Clear ({props.value.length})
          </button>
        </div>
      )}

      <div ref={listRef} id="filter-select-list" role="listbox" aria-multiselectable={props.multiple || undefined}
        style={{ maxHeight: PANEL_MAX_HEIGHT, overflowY: 'auto', padding: '4px 0' }}>
        {shown.length === 0 && (
          <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#9ca3af' }}>No matches</div>
        )}
        {shown.map((o, idx) => {
          const heading = o.group && o.group !== lastGroup ? o.group : null;
          lastGroup = o.group;
          const isSelected = selectedSet.has(o.value);
          const isActive = idx === active;
          return (
            <div key={o.value}>
              {heading && (
                <div style={{ padding: '6px 10px 2px', fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                  {heading}
                </div>
              )}
              <div
                id={`filter-opt-${idx}`}
                data-idx={idx}
                role="option"
                aria-selected={isSelected}
                onClick={() => pick(o.value)}
                onMouseEnter={() => setActive(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  padding: `0.35rem 0.75rem 0.35rem ${o.group ? '1.25rem' : '0.75rem'}`,
                  fontSize: '0.85rem', color: '#374151',
                  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', // keeps label indents, wraps long names
                  background: isActive ? '#f3f4f6' : !props.multiple && isSelected ? '#eff6ff' : 'white',
                  fontWeight: !props.multiple && isSelected ? 600 : 400,
                }}
              >
                {props.multiple && <input type="checkbox" checked={isSelected} readOnly tabIndex={-1} style={{ pointerEvents: 'none', flexShrink: 0 }} />}
                {o.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        className="select"
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onButtonKey}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          textAlign: 'left', cursor: 'pointer', color: '#111827',
          // Fixed width so the filter row doesn't shift as the label changes.
          width: style?.width ?? style?.minWidth ?? '100%',
          ...style,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{buttonLabel}</span>
        <span style={{ fontSize: '0.65rem', color: '#6b7280', flexShrink: 0 }}>&#x25BE;</span>
      </button>
      {panel && createPortal(panel, document.body)}
    </div>
  );
}
