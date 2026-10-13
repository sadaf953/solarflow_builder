// Dropdown options from the metadata table, read once per category and shared
// by every component that asks. Until rows exist (or if the read fails) the
// client's configured defaults are used.

import { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';
import { dropdownOptions } from '../config/index.js';

const cache = new Map();        // category -> { promise, options }
const listeners = new Set();

function load(category) {
    if (!cache.has(category)) {
        const entry = {};
        entry.promise = supabase.from('metadata').select('label')
            .eq('category', category).eq('is_active', true)
            .order('sort_order').order('label')
            .then(({ data, error }) => {
                if (error) throw error;
                entry.options = dropdownOptions(category, { [category]: (data || []).map(row => row.label) });
                return entry.options;
            })
            .catch(error => {
                console.warn(`Could not load ${category} options:`, error);
                if (cache.get(category) === entry) cache.delete(category);   // try again next time
                return dropdownOptions(category);
            });
        cache.set(category, entry);
    }
    return cache.get(category).promise;
}

/** Forgets loaded options (one category or all) and reloads them where they are shown. */
export function invalidateMetadata(category) {
    if (category) cache.delete(category);
    else cache.clear();
    listeners.forEach(listener => listener());
}

/** string[] of active labels for `category`, in sort order. */
export function useMetadataOptions(category) {
    const [loaded, setLoaded] = useState(null);     // { category, options }
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const listener = () => setVersion(v => v + 1);
        listeners.add(listener);
        return () => listeners.delete(listener);
    }, []);

    useEffect(() => {
        let active = true;
        load(category).then(options => { if (active) setLoaded({ category, options }); });
        return () => { active = false; };
    }, [category, version]);

    if (loaded?.category === category) return loaded.options;
    return cache.get(category)?.options || dropdownOptions(category);
}
