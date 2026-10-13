import { useEffect, useState } from 'react';
import { documentMode } from '../config/index.js';

// How document items behave: 'checklist' ticks them off without a file,
// 'files' needs an upload. Only a client with both features may switch;
// otherwise the one mode it has is forced.
const STORAGE_KEY = 'solarflow_checklist_mode';
const EVENT = 'solarflow-checklist-mode-changed';

export const canSwitchChecklistMode = () => documentMode() === 'both';

export const getChecklistMode = () => {
    const forced = documentMode();
    if (forced !== 'both') return forced;
    try {
        return localStorage.getItem(STORAGE_KEY) === 'files' ? 'files' : 'checklist';
    } catch {
        return 'checklist';
    }
};

export const setChecklistMode = (mode) => {
    if (!canSwitchChecklistMode()) return;
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* storage blocked: the event still updates open screens */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { mode } }));
};

/** The current mode, kept in step with every other screen that switches it. */
export function useChecklistMode() {
    const [mode, setMode] = useState(getChecklistMode);
    useEffect(() => {
        if (!canSwitchChecklistMode()) return undefined;
        const handleChange = event => { if (event.detail?.mode) setMode(event.detail.mode); };
        window.addEventListener(EVENT, handleChange);
        return () => window.removeEventListener(EVENT, handleChange);
    }, []);
    return mode;
}
