import { useEffect, useId, useState } from 'react';
import { FileUp, LogOut, Plus } from 'lucide-react';
import { ErrorBanner, Field, Input, LoadingState, Spinner } from '../../../../template/src/ui/index.js';
import { getSession, isBackendConfigured, onAuthChange, signIn, signOut } from '../../api.js';
import { PageShell } from '../../components/common.jsx';
import { AdminHome } from './AdminHome.jsx';
import { AdminInvite } from './AdminInvite.jsx';
import { AdminNewInvite } from './AdminNewInvite.jsx';

function AdminLogin() {
    const id = useId();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            await signIn(email, password);
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };
    return (
        <PageShell width="max-w-md">
            <h1 className="text-2xl font-bold text-stone-900">SolarFlow team sign-in</h1>
            {!isBackendConfigured ? (
                <div className="mt-5 space-y-4">
                    <ErrorBanner title="Backend not configured">
                        Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the builder project in .env.local, then restart.
                    </ErrorBanner>
                    <a href="#/admin/offline" className="sf-btn-secondary min-h-11"><FileUp size={14} aria-hidden="true" /> Build from a saved answers file</a>
                </div>
            ) : (
                <form onSubmit={submit} className="sf-card mt-5 space-y-4 p-4 sm:p-5">
                    <Field label="Email" htmlFor={`${id}-email`}>
                        <Input id={`${id}-email`} type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
                    </Field>
                    <Field label="Password" htmlFor={`${id}-password`}>
                        <Input id={`${id}-password`} type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
                    </Field>
                    <ErrorBanner>{error}</ErrorBanner>
                    <button type="submit" disabled={busy || !email.trim() || !password} className="sf-btn-primary min-h-11 w-full">
                        {busy && <Spinner size={14} />} Sign in
                    </button>
                </form>
            )}
            {isBackendConfigured && (
                <a href="#/admin/offline" className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline">
                    <FileUp size={14} aria-hidden="true" /> Build from a saved answers file instead
                </a>
            )}
        </PageShell>
    );
}

/** Admin pages behind a Supabase sign-in: `path` is what follows '#/admin/'. */
export default function AdminApp({ path }) {
    const [session, setSession] = useState(undefined);
    useEffect(() => {
        let alive = true;
        getSession().then(value => { if (alive) setSession(value); }).catch(() => { if (alive) setSession(null); });
        const stop = onAuthChange(value => setSession(value));
        return () => { alive = false; stop(); };
    }, []);

    if (session === undefined) return <PageShell><LoadingState /></PageShell>;
    if (!session) return <AdminLogin />;

    const actions = (
        <>
            <a href="#/admin/new" className="sf-btn-primary min-h-11"><Plus size={14} aria-hidden="true" /> <span className="hidden sm:inline">New invite</span><span className="sm:hidden">New</span></a>
            <a href="#/admin/offline" className="sf-btn-secondary min-h-11" aria-label="Build from a file"><FileUp size={14} aria-hidden="true" /> <span className="hidden sm:inline">From a file</span></a>
            <button type="button" onClick={() => signOut().catch(() => {})} className="sf-btn-secondary min-h-11" aria-label="Sign out">
                <LogOut size={14} aria-hidden="true" /> <span className="hidden sm:inline">Sign out</span>
            </button>
        </>
    );
    const [page, inviteId] = path;
    let body;
    if (page === 'new') body = <AdminNewInvite />;
    else if (page === 'i' && inviteId) body = <AdminInvite key={inviteId} inviteId={inviteId} />;
    else body = <AdminHome />;
    return <PageShell actions={actions}>{body}</PageShell>;
}
