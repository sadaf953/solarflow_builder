import { useEffect, useId, useState } from 'react';
import { KeyRound, Eye, EyeOff, Check, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';
import { containDialogFocus } from '../utils/dialogFocus';

const MIN_LENGTH = 8;

// mode 'recovery': opened by a reset link, which has already signed the user in.
// mode 'change': a signed-in user changes their password; the current one is checked first.
export default function PasswordRecoveryModal({ mode = 'recovery', onClose }) {
    const id = useId();
    const [current, setCurrent] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const changing = mode === 'change';

    useEffect(() => {
        const onKey = event => { if (event.key === 'Escape' && !busy) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    async function submit(event) {
        event.preventDefault();
        if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
        if (password !== confirm) return setError('The two new passwords do not match.');
        if (changing && password === current) return setError('Choose a password different from the current one.');
        setBusy(true);
        setError('');
        try {
            if (changing) {
                const { data } = await supabase.auth.getSession();
                const { error: wrong } = await supabase.auth.signInWithPassword({ email: data.session?.user?.email || '', password: current });
                if (wrong) throw new Error(wrong.code === 'invalid_credentials' ? 'Your current password is not correct.' : wrong.message);
            }
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) throw updateError;
            setDone(true);
        } catch (err) {
            setError(err.message || 'Could not update the password. Please try again.');
        } finally {
            setBusy(false);
        }
    }

    const field = (name, label, value, setValue, autoComplete, autoFocus) => (
        <div>
            <label htmlFor={`${id}-${name}`} className="block text-xs font-bold text-stone-700 mb-1">{label}</label>
            <input id={`${id}-${name}`} type={show ? 'text' : 'password'} value={value} onChange={e => setValue(e.target.value)}
                autoComplete={autoComplete} autoFocus={autoFocus} required className="sf-input min-h-11" />
        </div>
    );

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-stone-900/60 p-4">
            <div role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={containDialogFocus}
                className="w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
                <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-4">
                    <span className="rounded-xl bg-orange-50 p-2 text-orange-600"><KeyRound size={18} aria-hidden="true" /></span>
                    <h2 id={`${id}-title`} className="text-base font-bold text-stone-900">{changing ? 'Change password' : 'Choose a new password'}</h2>
                </div>
                {done ? (
                    <div className="space-y-4 p-5">
                        <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                            <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> Your password has been changed.
                        </p>
                        <button type="button" onClick={onClose} autoFocus className="sf-btn-primary min-h-11 w-full">Continue</button>
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-4 p-5">
                        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
                        {changing && field('current', 'Current password', current, setCurrent, 'current-password', true)}
                        {field('new', 'New password', password, setPassword, 'new-password', !changing)}
                        {field('repeat', 'Repeat new password', confirm, setConfirm, 'new-password', false)}
                        <button type="button" onClick={() => setShow(!show)} aria-pressed={show}
                            className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-stone-900">
                            {show ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />} {show ? 'Hide passwords' : 'Show passwords'}
                        </button>
                        <div className="flex gap-2">
                            <button type="button" onClick={onClose} disabled={busy} className="sf-btn-secondary min-h-11 flex-1">{changing ? 'Cancel' : 'Not now'}</button>
                            <button type="submit" disabled={busy} className="sf-btn-primary min-h-11 flex-1">
                                {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {busy ? 'Saving…' : 'Save password'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
