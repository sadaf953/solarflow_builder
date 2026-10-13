// ─── SetPasswordP.jsx ───────────────────────────────────────────────────────
// Landing page for the password-reset email link.
// Route this at /set-password (must match the redirectTo in smooth-worker.ts
// AND be added to Supabase Auth → URL Configuration → Redirect URLs).
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { ShieldCheck, Eye, EyeOff, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function SetPassword() {
    const [status, setStatus] = useState('checking'); // checking | ready | invalid | saving | done
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        // Supabase fires PASSWORD_RECOVERY when the recovery link's token
        // is picked up from the URL. Sign-in happens automatically.
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' && session) {
                setStatus('ready');
            }
        });

        // Fallback: wait for Supabase to fully consume the URL hash before checking the session
        let timeoutId;
        const checkSession = async (attempts = 0) => {
            // Supabase automatically clears the URL hash once it successfully logs the user in.
            // If the hash is still there, it's still processing. If we check getSession now, 
            // we might accidentally grab the OLD session (if an admin was already logged in).
            if (window.location.hash.includes('type=recovery') && attempts < 10) {
                timeoutId = setTimeout(() => checkSession(attempts + 1), 500);
                return;
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setStatus(prev => (prev === 'checking' ? 'ready' : prev));
            } else {
                setStatus(prev => (prev === 'checking' ? 'invalid' : prev));
            }
        };

        // Give the listener 1 second to fire naturally, otherwise fallback to our manual check
        timeoutId = setTimeout(() => checkSession(0), 1000);

        return () => {
            listener.subscription.unsubscribe();
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, []);

    const handleSubmit = async () => {
        setError('');
        const validateComplexity = (pw) => {
            if (pw.length < 8) return 'Password must be at least 8 characters.';
            if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter.';
            if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter.';
            if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
            if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character.';
            return null;
        };
        const complexityError = validateComplexity(password);
        if (complexityError) { setError(complexityError); return; }
        if (password !== confirm) { setError('Passwords do not match.'); return; }

        setStatus('saving');
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
            setError(updateError.message);
            setStatus('ready');
            return;
        }

        // Do not auto login: explicitly sign out so user returns to login page to sign in
        try {
            await supabase.auth.signOut();
            if (typeof window !== 'undefined') {
                Object.keys(localStorage).forEach(key => { if (key.startsWith('sb-')) localStorage.removeItem(key); });
                Object.keys(sessionStorage).forEach(key => { if (key.startsWith('sb-')) sessionStorage.removeItem(key); });
            }
        } catch (e) {
            console.warn('Signout after password reset note:', e);
        }

        setStatus('done');
    };

    const handleBackToLogin = () => {
        if (typeof window !== 'undefined') {
            const basePath = window.location.pathname.startsWith('/CRM') ? '/CRM/' : '/';
            window.location.href = window.location.origin + basePath;
        }
    };

    return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 w-full max-w-sm overflow-hidden">
                <div className="bg-stone-900 px-6 py-5 flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-white" />
                    <h1 className="text-white font-bold text-lg">Set Your Password</h1>
                </div>

                <div className="p-6 space-y-4">
                    {status === 'checking' && (
                        <div className="flex flex-col items-center gap-3 py-6">
                            <div className="w-6 h-6 border-4 border-stone-900 border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm text-stone-500">Verifying your link...</p>
                        </div>
                    )}

                    {status === 'invalid' && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-red-700 text-sm font-medium">Link expired or invalid</p>
                                <p className="text-red-600 text-xs mt-1">
                                    Ask your admin to resend the password reset email, then open the new link directly.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleBackToLogin}
                                    className="mt-3 text-xs font-bold text-stone-900 underline hover:text-stone-700 cursor-pointer block"
                                >
                                    Back to Login
                                </button>
                            </div>
                        </div>
                    )}

                    {(status === 'ready' || status === 'saving') && (
                        <>
                            <p className="text-sm text-stone-500">Choose a password for your account. You'll use this to log in going forward.</p>

                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                    <p className="text-red-600 text-xs">{error}</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-stone-600 mb-1">New Password</label>
                                <div className="relative">
                                    <input
                                        type={showPw ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="Min. 8 characters"
                                        className="w-full px-3 py-2.5 pr-10 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                                    />
                                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-3 text-stone-400 hover:text-stone-600">
                                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-stone-600 mb-1">Confirm Password</label>
                                <input
                                    type={showPw ? 'text' : 'password'}
                                    value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    placeholder="Re-enter password"
                                    className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                                />
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={status === 'saving'}
                                className="w-full py-2.5 bg-stone-900 text-white rounded-xl text-sm font-medium disabled:opacity-50 cursor-pointer"
                            >
                                {status === 'saving' ? 'Saving...' : 'Set Password'}
                            </button>
                        </>
                    )}

                    {status === 'done' && (
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                            <p className="text-stone-800 font-bold text-sm">Password set successfully</p>
                            <p className="text-stone-500 text-xs">Your password has been updated. Please sign in with your new password.</p>
                            <button
                                type="button"
                                onClick={handleBackToLogin}
                                className="mt-3 w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
                            >
                                Go to Login
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}