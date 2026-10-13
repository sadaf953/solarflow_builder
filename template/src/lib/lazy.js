// Lazy-loaded screens. After a deploy, an open tab can still ask for chunk
// files that no longer exist, so the first failed import reloads the page once
// per session to pick up the new build.

import { Component, Suspense, createElement as h, forwardRef, lazy } from 'react';

const RELOAD_FLAG = 'retry-lazy-refreshed';
const failedImports = new Set();

// Without sessionStorage we cannot tell whether we already reloaded, so never reload.
function alreadyRefreshed() {
    try { return window.sessionStorage.getItem(RELOAD_FLAG) === 'true'; } catch { return true; }
}
function setRefreshed(value) {
    try { window.sessionStorage.setItem(RELOAD_FLAG, value); } catch { /* storage blocked */ }
}

export function lazyWithRetry(factory) {
    let Lazy;
    // React caches a failed lazy() for good, so LazyBoundary's Retry swaps in a fresh one.
    const load = () => {
        Lazy = lazy(async () => {
            const refreshed = alreadyRefreshed();
            try {
                const module = await factory();
                setRefreshed('false');
                return module;
            } catch (error) {
                console.warn('Dynamic import failed (likely stale build chunk after new deploy), reloading latest bundle...', error);
                if (!refreshed) {
                    setRefreshed('true');
                    window.location.reload();
                    return { default: () => null };
                }
                failedImports.add(load);
                throw error;
            }
        });
    };
    load();
    return forwardRef(function LazyWithRetry(props, ref) {
        return h(Lazy, { ...props, ref });
    });
}

class LoadBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    retry = () => {
        failedImports.forEach(reload => reload());
        failedImports.clear();
        this.setState({ error: null });
    };

    render() {
        if (!this.state.error) return this.props.children;
        return h('div', { role: 'alert', className: 'm-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800' },
            h('p', { className: 'font-semibold' }, 'This section could not load. Check your connection and try again.'),
            h('button', { type: 'button', onClick: this.retry, className: 'sf-btn-secondary min-h-11' }, 'Retry'));
    }
}

/** Suspense for lazy screens, plus a Retry card if loading or rendering fails. */
export function LazyBoundary({ fallback = null, children }) {
    return h(LoadBoundary, null, h(Suspense, { fallback }, children));
}
