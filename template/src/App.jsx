import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured, supabaseSetupProblem } from './supabase';
import { BRANDING, isOn, isRoleEnabled } from './config/index.js';
import LoginScreen from './components/LoginScreen';
const PasswordRecoveryModal = lazy(() => import('./components/PasswordRecoveryModal'));
const TeamChatDrawer = lazy(() => import('./components/TeamChatDrawer'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const AgentPortal = lazy(() => import('./components/AgentPortal'));
const VendorPortal = lazy(() => import('./components/VendorPortal'));
const StampPortal = isRoleEnabled('stamp') ? lazy(() => import('./components/StampPortal')) : null;

const Loader = () => <div className="p-12 text-center text-stone-500" role="status">Opening your workspace…</div>;

function portalFor(userType) {
    if (userType === 'agent' || userType === 'agent2') return AgentPortal;
    if (userType === 'vendor') return VendorPortal;
    if (userType === 'stamp' && StampPortal) return StampPortal;
    return Dashboard;
}

function Notice({ title, children, action }) {
    return (
        <main className="sf-page flex items-center justify-center px-4 py-10">
            <section className="sf-card w-full max-w-lg space-y-3 p-6 text-sm text-stone-600">
                <p className="sf-kicker">{BRANDING.appName}</p>
                <h1 className="text-xl font-bold text-stone-900">{title}</h1>
                {children}
                {action}
            </section>
        </main>
    );
}

function ConnectSupabase() {
    return (
        <Notice title="Connect your Supabase project">
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">{supabaseSetupProblem}</p>
            <p>Create a file named <code>.env</code> next to <code>package.json</code> with your project's address and its public key:</p>
            <pre className="overflow-x-auto rounded-xl bg-stone-900 p-3 text-xs text-stone-100">{'VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key'}</pre>
            <p>Both values are in Supabase under Project Settings → API. Never use the service_role or secret key here. Then restart <code>npm run dev</code>, or run <code>npm run build</code> again.</p>
        </Notice>
    );
}

// Supabase reports a failed email link (expired, or opened in another browser) in the URL.
function linkProblem() {
    const url = new URL(window.location.href);
    const description = url.searchParams.get('error_description') || new URLSearchParams(url.hash.slice(1)).get('error_description');
    if (description) return `That email link did not work (${description}). Ask for a new one with "Forgot password?".`;
    return url.searchParams.has('code') ? 'That email link has expired or was opened in a different browser. Ask for a new one with "Forgot password?".' : '';
}

function clearLinkParams() {
    const url = new URL(window.location.href);
    for (const key of ['code', 'sb_flow_id', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
    if (new URLSearchParams(url.hash.slice(1)).has('error')) url.hash = '';
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
}

function clearSessionKeys() {
    try {
        for (const key of Object.keys(sessionStorage)) if (key.startsWith('solarflow_')) sessionStorage.removeItem(key);
    } catch { /* storage may be unavailable */ }
}

export default function App() {
    if (!isSupabaseConfigured) return <ConnectSupabase />;
    return <Workspace />;
}

function Workspace() {
    const [user, setUser] = useState(null);
    const [restoring, setRestoring] = useState(true);
    const [notice, setNotice] = useState('');
    const [passwordMode, setPasswordMode] = useState(null);
    const loading = useRef({ id: null, promise: null });

    // Resolves to an error message, or null once the user is signed in.
    const loadUser = useCallback(session => {
        const id = session?.user?.id;
        if (!id) return Promise.resolve(null);
        if (loading.current.id === id) return loading.current.promise;
        const promise = supabase.from('profiles').select('*').eq('id', id).maybeSingle().then(async ({ data: profile, error }) => {
            if (error) return `Could not load your profile: ${error.message}`;
            if (profile?.status === 'active') {
                setUser({ ...profile, userType: profile.user_type });
                return null;
            }
            await supabase.auth.signOut();
            return profile
                ? 'This login has been switched off. Ask your administrator to turn it back on.'
                : 'This email has no account in this workspace yet. Ask your administrator to add you.';
        }).then(problem => {
            if (problem) loading.current = { id: null, promise: null };
            return problem;
        });
        loading.current = { id, promise };
        return promise;
    }, []);

    useEffect(() => {
        let active = true;
        const brokenLink = linkProblem();
        supabase.auth.getSession()
            .then(async ({ data }) => {
                clearLinkParams();
                const problem = data.session ? await loadUser(data.session) : brokenLink;
                if (active && problem) setNotice(problem);
            })
            .catch(error => { if (active) setNotice(error.message); })
            .finally(() => { if (active) setRestoring(false); });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') loadUser(session).then(problem => { if (active && problem) setNotice(problem); });
            if (event === 'SIGNED_OUT') {
                loading.current = { id: null, promise: null };
                setUser(null);
                setPasswordMode(null);
            }
            if (event === 'PASSWORD_RECOVERY') setPasswordMode('recovery');
        });
        return () => { active = false; subscription.unsubscribe(); };
    }, [loadUser]);

    async function logout() {
        await supabase.auth.signOut();
        clearSessionKeys();
        setNotice('');
        setUser(null);
    }

    if (restoring) return <Loader />;

    const passwordModal = passwordMode && (
        <Suspense fallback={null}>
            <PasswordRecoveryModal mode={passwordMode} onClose={() => setPasswordMode(null)} />
        </Suspense>
    );

    if (!user) return <>{passwordModal}<LoginScreen notice={notice} onSignedIn={loadUser} /></>;

    if (!isRoleEnabled(user.userType)) {
        return (
            <Notice title="Your login type is not enabled"
                action={<button type="button" onClick={logout} className="sf-btn-primary min-h-11">Sign out</button>}>
                <p>Logins of type “{user.role || user.userType}” are switched off for {BRANDING.companyName}. Ask your administrator to change your login type.</p>
            </Notice>
        );
    }

    const Portal = portalFor(user.userType);
    return (
        <>
            {passwordModal}
            <div className="sf-app">
                <Suspense fallback={<Loader />}>
                    <Portal key={user.userType} user={user} onLogout={logout} onChangePassword={() => setPasswordMode('change')} />
                </Suspense>
            </div>
            {isOn('teamChat') && <Suspense fallback={null}><TeamChatDrawer currentUser={user} /></Suspense>}
        </>
    );
}
