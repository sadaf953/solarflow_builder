// Header filter for head office: type or pick a channel partner, then Apply.

import { useEffect, useMemo, useRef, useState } from 'react';

export default function PartnerFilter({ partners, value, onApply }) {
    const [text, setText] = useState(value);
    const [open, setOpen] = useState(false);
    const boxRef = useRef(null);

    useEffect(() => { setText(value); }, [value]);
    useEffect(() => {
        const close = event => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const suggestions = useMemo(() => {
        const needle = text.trim().toLowerCase();
        return needle ? partners.filter(name => name.toLowerCase().includes(needle)) : partners;
    }, [partners, text]);

    const apply = next => { onApply(next.trim()); setOpen(false); };

    return (
        <div className="relative sf-partner-filter flex items-center gap-1.5" ref={boxRef}>
            <input
                type="text" aria-label="Filter by channel partner" placeholder="Channel partner…" autoComplete="off"
                value={text}
                onChange={event => { setText(event.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onKeyDown={event => { if (event.key === 'Enter') apply(text); if (event.key === 'Escape') setOpen(false); }}
                className="sf-input min-h-11 w-40"
            />
            <button type="button" onClick={() => apply(text)} className="min-h-11 px-3 rounded-xl text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 transition-colors">
                Apply
            </button>
            {(value || text) && (
                <button type="button" onClick={() => { setText(''); apply(''); }} className="min-h-11 px-3 rounded-xl text-xs font-semibold bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors">
                    Clear
                </button>
            )}
            {open && suggestions.length > 0 && (
                <div className="absolute top-full mt-1 left-0 w-56 bg-white rounded-xl shadow-xl border border-stone-100 py-1 z-50 max-h-56 overflow-y-auto">
                    {suggestions.map(name => (
                        <button type="button" key={name} onClick={() => { setText(name); setOpen(false); }}
                            className="w-full min-h-11 px-3 py-2 text-left text-xs hover:bg-stone-50 text-stone-700 transition-colors">
                            {name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
