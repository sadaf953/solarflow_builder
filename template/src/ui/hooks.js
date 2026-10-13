import { useCallback, useEffect, useRef, useState } from 'react';

/** `value`, updated only after it has stopped changing for `ms`. */
export function useDebouncedValue(value, ms = 300) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(timer);
    }, [value, ms]);
    return debounced;
}

/**
 * Saves `value` (JSON-serialisable) `delay` ms after the last change. Saves
 * run one at a time in order, an unchanged snapshot is never re-sent, pending
 * changes are flushed when the tab is hidden or the component unmounts, and
 * the browser warns before leaving only while something is unsaved.
 *
 * The value at the moment `enabled` turns on counts as already saved, so pass
 * `enabled: false` until the record has loaded.
 * `flush()` saves now and resolves to true once everything is saved.
 */
export function useAutosave({ value, save, delay = 550, enabled = true }) {
    const snapshot = JSON.stringify(value ?? null);
    const [status, setStatus] = useState('saved');
    const savedRef = useRef(null);
    const latestRef = useRef(snapshot);
    const enabledRef = useRef(enabled);
    const saveRef = useRef(save);
    const queueRef = useRef(Promise.resolve(true));
    const pendingRef = useRef(0);

    if (!enabled) savedRef.current = null;
    else if (savedRef.current === null) savedRef.current = snapshot;

    useEffect(() => {
        latestRef.current = snapshot;
        enabledRef.current = enabled;
        saveRef.current = save;
    });

    const persist = useCallback(snap => {
        if (snap === savedRef.current && !pendingRef.current) return Promise.resolve(true);
        pendingRef.current += 1;
        setStatus('saving');
        const next = queueRef.current.then(async () => {
            if (snap !== savedRef.current) {
                await saveRef.current(JSON.parse(snap));
                if (enabledRef.current) savedRef.current = snap;
            }
            pendingRef.current -= 1;
            if (!pendingRef.current && latestRef.current === savedRef.current) setStatus('saved');
            return true;
        }).catch(error => {
            pendingRef.current -= 1;
            console.error('Autosave failed:', error);
            setStatus('error');
            return false;
        });
        queueRef.current = next;
        return next;
    }, []);

    const flush = useCallback(
        () => (enabledRef.current ? persist(latestRef.current) : Promise.resolve(true)),
        [persist],
    );

    useEffect(() => {
        if (!enabled) return;
        // Edited back to what is already saved: nothing left to do.
        if (snapshot === savedRef.current && !pendingRef.current) { setStatus('saved'); return; }
        setStatus('saving');
        const timer = setTimeout(() => persist(snapshot), delay);
        return () => clearTimeout(timer);
    }, [enabled, snapshot, delay, persist]);

    useEffect(() => {
        const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
        document.addEventListener('visibilitychange', onHide);
        return () => {
            document.removeEventListener('visibilitychange', onHide);
            flush();
        };
    }, [flush]);

    const unsaved = enabled && (snapshot !== savedRef.current || status === 'saving');
    useEffect(() => {
        if (!unsaved) return;
        const warn = event => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [unsaved]);

    return { status: enabled ? status : 'saved', flush };
}

/**
 * Calls `callback` when the user comes back to the tab, at most once per
 * `throttleMs`, and every `intervalMs` (if set) while the tab is visible.
 * Costs nothing while the tab is in the background.
 */
export function useRefreshOnFocus(callback, { throttleMs = 10000, intervalMs = 0, enabled = true } = {}) {
    const callbackRef = useRef(callback);
    useEffect(() => { callbackRef.current = callback; });

    useEffect(() => {
        if (!enabled) return;
        let last = Date.now();
        const refresh = force => {
            if (document.visibilityState !== 'visible') return;
            if (!force && Date.now() - last < throttleMs) return;
            last = Date.now();
            callbackRef.current?.();
        };
        const onFocus = () => refresh(false);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        const timer = intervalMs > 0 ? setInterval(() => refresh(true), intervalMs) : null;
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
            if (timer) clearInterval(timer);
        };
    }, [enabled, throttleMs, intervalMs]);
}
