// Header search across every stage (name, phone or consumer number).

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { customerSource } from '../lib/db.js';
import { stageLabel } from '../config/index.js';
import { SearchInput } from '../ui/index.js';
import { scopeCustomers } from '../dashboard/queries.js';

export default function GlobalSearch({ isCpo, scope, placeholder, onSelect }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const boxRef = useRef(null);

    useEffect(() => {
        const close = event => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    useEffect(() => {
        // Commas and brackets would break the or() filter below.
        const text = query.trim().replace(/[,()]/g, ' ').trim();
        if (!text) { setResults([]); setOpen(false); return undefined; }
        let cancelled = false;
        let filter = `customer_name.ilike.%${text}%`;
        if (/^\d+$/.test(text)) filter += `,phone_number.eq.${text},consumer_no.eq.${text}`;
        scopeCustomers(
            supabase.from(customerSource(isCpo)).select('id, customer_name, phone_number, consumer_no, stage').is('deleted_at', null).or(filter).limit(8),
            scope,
        ).then(({ data, error }) => {
            if (cancelled) return;
            if (error) console.error('Search failed:', error);
            setResults(data || []);
            setOpen((data || []).length > 0);
        });
        return () => { cancelled = true; };
    }, [query, isCpo, scope]);

    const pick = customer => {
        setQuery('');
        setOpen(false);
        onSelect(customer);
    };

    return (
        <div className="relative" ref={boxRef} onFocus={() => { if (results.length) setOpen(true); }}>
            <SearchInput value={query} onChange={setQuery} label="Search all stages" placeholder={placeholder} />
            {open && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-2xl shadow-xl border border-stone-100 py-1 z-50 overflow-hidden">
                    {results.map(customer => (
                        <button type="button" key={customer.id} onClick={() => pick(customer)}
                            className="w-full min-h-11 px-4 py-2.5 text-left hover:bg-amber-50 transition-colors group">
                            <p className="text-sm font-semibold text-stone-800 group-hover:text-amber-700">{customer.customer_name || 'Unnamed'}</p>
                            <p className="text-[11px] text-stone-500 mt-0.5">{stageLabel(customer.stage)} · {customer.phone_number || 'No phone'}</p>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
