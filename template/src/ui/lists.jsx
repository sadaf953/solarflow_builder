import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { MONTH_NAMES, todayIST } from '../lib/format.js';
import { Select } from './fields.jsx';
import { Spinner } from './feedback.jsx';
import { useDebouncedValue } from './hooks.js';

const MONTH_OPTIONS = MONTH_NAMES.map((name, i) => ({ value: String(i + 1).padStart(2, '0'), label: name }));

/** Search box that reports what was typed `delay` ms after typing stops. Clearing is immediate. */
export function SearchInput({ value = '', onChange, delay = 300, label = 'Search', placeholder = 'Search…', className = '' }) {
    const [text, setText] = useState(value);
    const debounced = useDebouncedValue(text, delay);
    const sentRef = useRef(value);
    const onChangeRef = useRef(onChange);
    useEffect(() => { onChangeRef.current = onChange; });

    useEffect(() => {
        if (debounced === sentRef.current) return;
        sentRef.current = debounced;
        onChangeRef.current?.(debounced);
    }, [debounced]);
    // The parent changed the value itself (e.g. "Clear filters").
    useEffect(() => {
        if (value === sentRef.current) return;
        sentRef.current = value;
        setText(value);
    }, [value]);

    const clear = () => { setText(''); sentRef.current = ''; onChangeRef.current?.(''); };
    return (
        <div className={`relative ${className}`}>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input
                type="search" aria-label={label} placeholder={placeholder} value={text}
                onChange={event => setText(event.target.value)} autoComplete="off" spellCheck="false"
                className="sf-input min-h-11 pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden"
            />
            {text && (
                <button type="button" onClick={clear} aria-label="Clear search"
                    className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-stone-400 hover:text-stone-700">
                    <X size={16} aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

/** Row of filters that stacks on phones. */
export function FilterBar({ children, label = 'Filters', className = '' }) {
    return (
        <div role="group" aria-label={label} className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
            {children}
        </div>
    );
}

export function LoadMoreButton({ onClick, loading = false, hasMore = true, label = 'Load more' }) {
    if (!hasMore) return null;
    return (
        <div className="flex justify-center py-4">
            <button type="button" onClick={onClick} disabled={loading} className="sf-btn-secondary min-h-11 px-6">
                {loading ? <Spinner size={14} /> : <ChevronDown size={14} aria-hidden="true" />}
                {loading ? 'Loading…' : label}
            </button>
        </div>
    );
}

/** Month as '01'…'12' ('' = all). `extraOptions` go first, e.g. {value:'this-month', label:'This month'}. */
export function MonthSelect({ value, onChange, allLabel = 'All months', extraOptions = [], label = 'Month', className = '' }) {
    return (
        <Select aria-label={label} value={value} onChange={event => onChange?.(event.target.value)}
            placeholder={allLabel} options={[...extraOptions, ...MONTH_OPTIONS]} className={`sm:w-auto ${className}`} />
    );
}

/** Years from `from` to `to` (default: the last five years up to this year in IST), newest first. */
export function YearSelect({ value, onChange, from, to, allLabel = 'All years', label = 'Year', className = '' }) {
    const last = Number(to) || Number(todayIST().slice(0, 4));
    const first = Math.min(Number(from) || last - 4, last);
    const years = Array.from({ length: last - first + 1 }, (_, i) => String(last - i));
    return (
        <Select aria-label={label} value={value} onChange={event => onChange?.(event.target.value)}
            placeholder={allLabel} options={years} className={`sm:w-auto ${className}`} />
    );
}
