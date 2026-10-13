// Tells people plainly when the connection drops, so failed saves do not look
// like a broken app.

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
        <div role="status" className="fixed top-0 left-0 right-0 z-[9999] bg-rose-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold shadow-md">
            <WifiOff size={14} aria-hidden="true" />
            <span>You're offline - changes won't save until your connection comes back.</span>
        </div>
    );
}
