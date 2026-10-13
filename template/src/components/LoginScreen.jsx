import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Sun } from 'lucide-react';
import { supabase } from '../supabase';
import { BRANDING } from '../config/index.js';

function authProblem(error) {
    if (error.status === 429 || /rate.?limit/i.test(error.code || error.message)) return 'Too many attempts. Please wait a few minutes and try again.';
    if (error.code === 'invalid_credentials' || /invalid login/i.test(error.message)) return 'That email and password do not match. Check both and try again.';
    if (error.code === 'email_not_confirmed') return 'This email address is not confirmed yet. Ask your administrator to confirm it.';
    if (error.name === 'AuthRetryableFetchError' || /fetch|network/i.test(error.message)) return 'Could not reach the server. Check your internet connection and try again.';
    return error.message || 'Something went wrong. Please try again.';
}

// onSignedIn(session) loads the user's profile and resolves to an error message, or null.
export default function LoginScreen({ notice = '', onSignedIn }) {
    const [resetting, setResetting] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(notice ? { type: 'error', text: notice } : null);

    useEffect(() => { if (notice) setMessage({ type: 'error', text: notice }); }, [notice]);

    function switchMode(next) {
        setResetting(next);
        setMessage(null);
    }

    async function submit(event) {
        event.preventDefault();
        const address = email.trim();
        setBusy(true);
        setMessage(null);
        try {
            if (resetting) {
                const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: window.location.origin + window.location.pathname });
                if (error) throw error;
                setMessage({ type: 'success', text: `If ${address} has a login here, a reset link is on its way. Open it in this browser.` });
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({ email: address, password });
                if (error) throw error;
                const problem = await onSignedIn(data.session);
                if (problem) setMessage({ type: 'error', text: problem });
            }
        } catch (error) {
            setMessage({ type: 'error', text: authProblem(error) });
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="sf-page flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-sm">
                <div className="mb-6 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-500"><Sun size={26} aria-hidden="true" /></span>
                    <h1 className="text-2xl font-bold text-stone-900">{BRANDING.appName}</h1>
                    {BRANDING.companyName !== BRANDING.appName && <p className="text-sm text-stone-500">{BRANDING.companyName}</p>}
                </div>
                <form onSubmit={submit} className="sf-card space-y-4 p-5 shadow-sm sm:p-6">
                    <div>
                        <h2 className="text-base font-bold text-stone-900">{resetting ? 'Reset your password' : 'Sign in'}</h2>
                        {resetting && <p className="text-xs text-stone-500">We will email you a link to choose a new password.</p>}
                    </div>
                    {message && (
                        <p role={message.type === 'error' ? 'alert' : 'status'}
                            className={`rounded-xl border p-3 text-sm ${message.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                            {message.text}
                        </p>
                    )}
                    <div>
                        <label htmlFor="login-email" className="mb-1 block text-xs font-bold text-stone-700">Email</label>
                        <input id="login-email" type="email" inputMode="email" autoComplete="username" required autoFocus
                            value={email} onChange={e => setEmail(e.target.value)} className="sf-input min-h-11" />
                    </div>
                    {!resetting && (
                        <div>
                            <label htmlFor="login-password" className="mb-1 block text-xs font-bold text-stone-700">Password</label>
                            <div className="relative">
                                <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                                    value={password} onChange={e => setPassword(e.target.value)} className="sf-input min-h-11 pr-12" />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-stone-400 hover:text-stone-700">
                                    {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                                </button>
                            </div>
                            <button type="button" onClick={() => switchMode(true)} className="-mb-2 ml-auto flex min-h-11 items-center text-xs font-bold text-orange-600 hover:underline">Forgot password?</button>
                        </div>
                    )}
                    <button type="submit" disabled={busy} className="sf-btn-primary min-h-11 w-full text-sm">
                        {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                        {resetting ? (busy ? 'Sending…' : 'Send reset link') : (busy ? 'Signing in…' : 'Sign in')}
                    </button>
                    {resetting && <button type="button" onClick={() => switchMode(false)} className="min-h-11 w-full text-xs font-bold text-stone-500 hover:text-stone-800">Back to sign in</button>}
                </form>
                <p className="mt-4 text-center text-xs text-stone-400">Logins are created by your administrator.</p>
            </div>
        </main>
    );
}
