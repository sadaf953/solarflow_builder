// ─── UpdateChecker.jsx ──────────────────────────────────────────────────────
// GitHub Pages can't set real Cache-Control headers, so a client's browser
// can keep serving a stale index.html pointing at JS/CSS chunk filenames
// that no longer exist after the next deploy - the app silently fails to
// load or update. This polls public/version.json (written fresh on every
// build, fetched with cache disabled) and prompts a reload when the
// deployed build id no longer matches the one this tab loaded with.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds
const BASE_PATH = import.meta.env.BASE_URL || '/';
const VERSION_URL = (BASE_PATH.endsWith('/') ? BASE_PATH : BASE_PATH + '/') + 'version.json';

// Show the deploy time in the user's own timezone, e.g. "1 Sep 2026, 10:20 am".
function formatBuiltAt(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
}

// Compiled in by vite.config.js from the version.json written moments earlier.
// This is the ONLY trustworthy answer to "which build is this tab running?" -
// anything fetched at runtime describes the SERVER, not this tab.
const RUNNING_BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

export default function UpdateChecker() {
    const [updateAvailable, setUpdateAvailable] = useState(null); // null | { builtAt }

    useEffect(() => {
        // In dev there is no build id, so there is nothing meaningful to compare.
        if (RUNNING_BUILD_ID === 'dev') return;

        let cancelled = false;

        const fetchVersion = async () => {
            try {
                const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) return null;
                const data = await res.json();
                if (!data?.buildId) return null;
                return { buildId: String(data.buildId), builtAt: data.builtAt || null };
            } catch {
                return null;
            }
        };

        const checkForUpdate = async () => {
            const remote = await fetchVersion();
            if (cancelled || !remote) return;

            // Compare the SERVER's build against the one compiled into this
            // bundle. A tab running a stale cached index.html now notices
            // immediately, instead of adopting the server's answer as its own.
            if (remote.buildId === RUNNING_BUILD_ID) return;

            // No timestamp comparison any more, and none is needed: the ids come
            // from two different places - one compiled into this tab, one live
            // from the server. A difference is never a false alarm, it means
            // this tab is genuinely not running what is deployed.

            setUpdateAvailable({ builtAt: remote.builtAt });
        };

        checkForUpdate();
        const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);

        const onVisible = () => {
            if (document.visibilityState === 'visible') checkForUpdate();
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            cancelled = true;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    if (!updateAvailable) return null;

    const releasedAt = formatBuiltAt(updateAvailable.builtAt);

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-stone-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-3 duration-300">
            <span className="text-xs font-semibold">
                Update released{releasedAt ? ` ${releasedAt}` : ''}.
                <span className="block text-[10px] font-medium text-stone-400 mt-0.5">
                    Refresh to load it.
                </span>
            </span>
            <button
                onClick={() => window.location.reload()}
                className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
            >
                Refresh Now
            </button>
        </div>
    );
}
