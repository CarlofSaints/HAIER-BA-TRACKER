'use client';

import { useState, useRef, useEffect, useMemo, type CSSProperties } from 'react';

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

/**
 * Filter dropdown with a search box. Single mode is a drop-in for a filter <select>
 * (the "All ..." choice is just one of the options). Multi mode ticks several values;
 * an empty list means "no filter".
 */
export default function FilterSelect(props: Props) {
  const { options, style, title, searchPlaceholder } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => { if (!open) setSearch(''); }, [open]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q) || (o.group || '').toLowerCase().includes(q));
  }, [options, search]);

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
    const current = options.find(o => o.value === props.value);
    buttonLabel = current ? current.label : (options[0]?.label ?? '');
  }

  function pick(value: string) {
    if (props.multiple) {
      props.onChange(props.value.includes(value) ? props.value.filter(v => v !== value) : [...props.value, value]);
    } else {
      props.onChange(value);
      setOpen(false);
    }
  }

  function tickAllShown() {
    if (!props.multiple) return;
    const next = new Set(props.value);
    for (const o of shown) next.add(o.value);
    props.onChange([...next]);
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && shown.length > 0) {
      e.preventDefault();
      pick(shown[0].value);
    }
  }

  // Group headings appear when the group changes from the previous option.
  let lastGroup: string | undefined;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="select"
        title={title}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          textAlign: 'left', cursor: 'pointer', color: '#111827', width: '100%',
          ...style,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{buttonLabel}</span>
        <span style={{ fontSize: '0.65rem', color: '#6b7280', flexShrink: 0 }}>&#x25BE;</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 60,
            background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: '100%', width: 'max-content', maxWidth: 420,
          }}
        >
          <div style={{ padding: 6, borderBottom: '1px solid #f3f4f6' }}>
            <input
              ref={searchRef}
              className="input"
              type="text"
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

          <div style={{ maxHeight: 300, overflowY: 'auto', padding: '4px 0' }}>
            {shown.length === 0 && (
              <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#9ca3af' }}>No matches</div>
            )}
            {shown.map(o => {
              const heading = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              const isSelected = selectedSet.has(o.value);
              return (
                <div key={o.value}>
                  {heading && (
                    <div style={{ padding: '6px 10px 2px', fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                      {heading}
                    </div>
                  )}
                  <div
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pick(o.value)}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                    onMouseLeave={e => (e.currentTarget.style.background = !props.multiple && isSelected ? '#eff6ff' : 'white')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                      padding: `0.35rem 0.75rem 0.35rem ${o.group ? '1.25rem' : '0.75rem'}`,
                      fontSize: '0.85rem', color: '#374151', whiteSpace: 'pre', // keeps label indents

                      background: !props.multiple && isSelected ? '#eff6ff' : 'white',
                      fontWeight: !props.multiple && isSelected ? 600 : 400,
                    }}
                  >
                    {props.multiple && <input type="checkbox" checked={isSelected} readOnly style={{ pointerEvents: 'none' }} />}
                    {o.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
