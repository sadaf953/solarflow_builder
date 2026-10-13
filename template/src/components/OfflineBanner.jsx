// ─── OfflineBanner.jsx ──────────────────────────────────────────────────────
// The app has no local draft storage - if the connection drops mid-edit,
// writes just fail (now with a clear alert, per the 10.9 sweep) but there
// was previously zero indication of *why*. This tells people plainly so a
// dropped connection doesn't look like a broken app.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
    const [isOffline, setIsOffline] = useState(
        typeof navigator !== 'undefined' ? !navigator.onLine : false
    );

    useEffect(() => {
        const goOffline = () => setIsOffline(true);
        const goOnline = () => setIsOffline(false);
        window.addEventListener('offline', goOffline);
        window.addEventListener('online', goOnline);
        return () => {
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('online', goOnline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-rose-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold shadow-md">
            <WifiOff size={14} />
            <span>You're offline - changes won't save until your connection comes back.</span>
        </div>
    );
}
