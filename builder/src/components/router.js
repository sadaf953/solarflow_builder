import { useEffect, useState } from 'react';

// '#/admin/i/<id>' -> ['admin', 'i', '<id>']
const readPath = () => (globalThis.location?.hash || '').replace(/^#\/?/, '').split(/[?#]/)[0]
    .split('/').filter(Boolean).map(part => {
        try { return decodeURIComponent(part); } catch { return part; }
    });

export function useHashPath() {
    const [path, setPath] = useState(readPath);
    useEffect(() => {
        const onChange = () => {
            setPath(readPath());
            window.scrollTo(0, 0);
        };
        window.addEventListener('hashchange', onChange);
        return () => window.removeEventListener('hashchange', onChange);
    }, []);
    return path;
}

export const go = path => { window.location.hash = path; };
