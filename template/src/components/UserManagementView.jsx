// ─── UserManagementView.jsx ───────────────────────────────────────────────────
// Staff logins. Admins manage every login; a partner office (CPO) manages the
// manager and dealer logins under itself. Logins are created, re-passworded,
// re-addressed, switched on/off and deleted only through the add_user Edge
// Function; an admin changes login type and office directly on the profile.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ShieldCheck, Plus, RefreshCw, Eye, EyeOff, UserCog, KeyRound, Ban, Edit2, Building2, Send, Lock, Trash2, UserCheck } from 'lucide-react';
import { supabase } from '../supabase';
import { logActivity, runWrite } from '../utils';
import { APP_ROLES, enabledRoles } from '../constants';
import { isOn } from '../config/index.js';
import { useGlobalPopup } from './GlobalPopup';
import { CPO, CPO_CHILD_TYPES, currentParentId, loginChanges, needsParentChoice, officeOptions, partnerKey } from './staffLogins.js';
import {
    Field, Input, Select, Modal, Badge, SearchInput, FilterBar, ErrorBanner, SuccessBanner, LoadingState, EmptyState, Spinner,
} from '../ui/index.js';

const PENDING = 'pending';
const PROFILE_COLUMNS = 'id, name, email, phone_number, user_type, role, channel_partner, status, parent_profile_id, cpo_profile_id, created_by, created_at';
const SERVICE_MISSING = 'Could not reach the account-creation service: the add_user function is not deployed or cannot be reached. '
    + 'Follow step 4 of the setup guide ("Deploy the staff-login function"), then try again.';
const officeColumnOn = isOn('cpos') || isOn('dealers');

const roleLabel = userType => APP_ROLES.find(role => role.user_type === userType)?.label;
const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Calls the add_user Edge Function and turns every failure into a readable message.
async function callAddUser(body) {
    let response;
    try {
        response = await supabase.functions.invoke('add_user', { body });
    } catch {
        throw new Error(SERVICE_MISSING);
    }
    const { data, error } = response;
    if (!error) {
        if (data?.error) throw new Error(data.error);
        return data;
    }
    if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') throw new Error(SERVICE_MISSING);
    const res = error.context;
    let payload = null;
    if (res && typeof res.json === 'function') {
        try { payload = await res.json(); } catch { /* not JSON */ }
    }
    if (payload?.error) throw new Error(payload.error);
    if (res?.status === 404) throw new Error(SERVICE_MISSING);
    throw new Error(payload?.message || error.message || 'The account service did not accept the change.');
}

// Keeps Operations > Channel partner directory in step with partner offices.
async function ensurePartnerInDirectory(name) {
    const label = String(name || '').trim().toUpperCase();
    if (!label || !(isOn('channelPartners') || isOn('cpos'))) return true;
    const { data, error } = await supabase.from('metadata').select('id').eq('category', 'channel_partner').ilike('label', label).limit(1);
    if (error) return false;
    if (data?.length) return true;
    const { error: insertError } = await supabase.from('metadata').insert({ category: 'channel_partner', label });
    return !insertError;
}

function PasswordInput({ id, value, onChange, placeholder, autoFocus }) {
    const [show, setShow] = useState(false);
    return (
        <div className="relative">
            <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
                autoComplete="new-password" placeholder={placeholder} className="pr-12" data-autofocus={autoFocus || undefined} />
            <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-stone-400 hover:text-stone-700">
                {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
        </div>
    );
}

// ─── Reset password ───────────────────────────────────────────────────────────
function ResetPasswordModal({ user, currentUser, onClose, onDone }) {
    const [mode, setMode] = useState('direct'); // 'direct' | 'email'
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState('');

    const setDirect = async () => {
        if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
        setBusy(true); setError('');
        try {
            await callAddUser({ action: 'update_password', user_id: user.id, new_password: password });
            logActivity(currentUser?.id, 'update', `Set a new password for ${user.name}`, user.email || '');
            onDone(`Password for ${user.name} updated.`);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const sendLink = async () => {
        if (!user.email) { setError(`${user.name} has no email address, so a reset link cannot be sent.`); return; }
        setBusy(true); setError(''); setSent('');
        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: window.location.origin });
            if (resetError) {
                if (resetError.status === 429 || /rate.?limit/i.test(resetError.message || '')) {
                    throw new Error('Too many reset emails were sent this hour. Use "Set password" instead.');
                }
                throw resetError;
            }
            setSent(`A reset link was sent to ${user.email}.`);
            logActivity(currentUser?.id, 'update', `Sent a password reset email to ${user.name}`, user.email);
        } catch (err) {
            setError(err.message || 'The reset email could not be sent.');
        } finally {
            setBusy(false);
        }
    };

    const tab = (id, Icon, label) => (
        <button type="button" onClick={() => { setMode(id); setError(''); }} aria-pressed={mode === id}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-bold ${mode === id ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
            <Icon size={13} aria-hidden="true" /> {label}
        </button>
    );

    return (
        <Modal open title={`Password for ${user.name}`} onClose={onClose} busy={busy} size="sm"
            footer={<button type="button" className="sf-btn-secondary min-h-11" onClick={onClose} disabled={busy}>Close</button>}>
            <div className="space-y-4">
                <div className="flex gap-2">{tab('direct', Lock, 'Set password')}{tab('email', Send, 'Email a link')}</div>
                <ErrorBanner>{error}</ErrorBanner>
                <SuccessBanner>{sent}</SuccessBanner>
                {mode === 'direct' ? (
                    <>
                        <Field label="New password" htmlFor="reset-password" required hint="They can sign in with it straight away.">
                            <PasswordInput id="reset-password" value={password} onChange={setPassword} placeholder="At least 6 characters" autoFocus />
                        </Field>
                        <button type="button" onClick={setDirect} disabled={busy || !password}
                            className="sf-btn-primary min-h-11 w-full">{busy ? <Spinner size={14} /> : <KeyRound size={14} aria-hidden="true" />} Save password</button>
                    </>
                ) : (
                    <>
                        <p className="text-xs text-stone-600">Send a reset link to <b>{user.email || 'no email on file'}</b>. Supabase limits how many emails it sends each hour.</p>
                        <button type="button" onClick={sendLink} disabled={busy || !user.email}
                            className="sf-btn-primary min-h-11 w-full">{busy ? <Spinner size={14} /> : <Send size={14} aria-hidden="true" />} Send reset link</button>
                    </>
                )}
            </div>
        </Modal>
    );
}

// ─── Create login ─────────────────────────────────────────────────────────────
function CreateUserModal({ currentUser, roles, profiles, onClose, onCreated }) {
    const isCpo = currentUser?.userType === CPO;
    const officeName = (currentUser?.channel_partner || currentUser?.name || '').trim();
    const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', user_type: roles[0]?.user_type || '', channel_partner: '', parent_id: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

    const needsOfficeName = !isCpo && form.user_type === CPO;
    const needsOffice = !isCpo && CPO_CHILD_TYPES.includes(form.user_type);
    const offices = needsOffice ? officeOptions(form.user_type, profiles) : [];

    const create = async event => {
        event.preventDefault();
        const name = form.name.trim().toUpperCase();
        const email = form.email.trim().toLowerCase();
        const partner = needsOfficeName ? form.channel_partner.trim() : '';
        const parent = needsOffice ? profiles.find(p => p.id === form.parent_id) : null;
        if (!name || !email || !form.password) { setError('Name, email and password are required.'); return; }
        if (!isEmail(email)) { setError('Enter a valid email address.'); return; }
        if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
        if (!form.user_type) { setError('Choose a login type.'); return; }
        if (needsOfficeName && !partner) { setError('Enter the office name.'); return; }
        if (needsOffice && !parent) { setError('Choose who this login works under.'); return; }

        setBusy(true); setError('');
        try {
            const role = roles.find(r => r.user_type === form.user_type);
            const result = await callAddUser({
                action: 'create', name, email, password: form.password, phone: form.phone.trim(),
                user_type: form.user_type, role: role?.role, channel_partner: partner || null, parent_profile_id: parent?.id || null,
            });
            const warnings = [];
            // Partner offices and channel partners file leads under their partner name.
            const directoryName = form.user_type === CPO ? partner || name : form.user_type === 'agent' ? name : '';
            if (directoryName && !(await ensurePartnerInDirectory(directoryName))) {
                warnings.push(`"${directoryName}" could not be added to Operations > Channel partner directory. Add it there by hand.`);
            }
            if (form.user_type === 'vendor') {
                // add_user links an existing vendor row; add one when there is none yet.
                const { data: vendors } = await supabase.from('vendors').select('id, name, profile_id');
                const linked = (vendors || []).some(v => v.profile_id === result?.user?.id || sameText(v.name, name));
                if (!linked) {
                    const { error: vendorError } = await supabase.from('vendors').insert({ name, email, phone: form.phone.trim() || null, profile_id: result?.user?.id || null });
                    if (vendorError) warnings.push(`${name} was not added to Operations > Vendors: ${vendorError.message}`);
                }
            }
            logActivity(currentUser?.id, 'create', `Created login: ${name}`, `${role?.role || form.user_type} (${form.user_type})`);
            onCreated(`Login created for ${name}.`, warnings.join(' '));
        } catch (err) {
            setError(err.message || 'The login could not be created.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal open title="Create login" onClose={onClose} busy={busy} variant="sheet"
            footer={<>
                <button type="button" className="sf-btn-secondary min-h-11" onClick={onClose} disabled={busy}>Cancel</button>
                <button type="submit" form="create-user-form" className="sf-btn-primary min-h-11" disabled={busy}>
                    {busy ? <Spinner size={14} /> : <UserCog size={14} aria-hidden="true" />} {busy ? 'Creating…' : 'Create login'}
                </button>
            </>}>
            <form id="create-user-form" onSubmit={create} autoComplete="off" className="space-y-3">
                <ErrorBanner>{error}</ErrorBanner>
                <Field label="Full name" htmlFor="new-user-name" required>
                    <Input id="new-user-name" value={form.name} onChange={e => set('name', e.target.value.toUpperCase())} placeholder="e.g. RAHUL SHARMA" autoComplete="off" />
                </Field>
                <Field label="Email" htmlFor="new-user-email" required>
                    <Input id="new-user-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@company.com" autoComplete="off" />
                </Field>
                <Field label="Mobile number" htmlFor="new-user-phone">
                    <Input id="new-user-phone" type="tel" inputMode="numeric" value={form.phone} onChange={e => set('phone', e.target.value.replace(/[^\d+]/g, '').slice(0, 13))} placeholder="Optional" />
                </Field>
                <Field label="Temporary password" htmlFor="new-user-password" required hint="Share it with them; they can change it after signing in.">
                    <PasswordInput id="new-user-password" value={form.password} onChange={value => set('password', value)} placeholder="At least 6 characters" />
                </Field>
                <Field label="Login type" htmlFor="new-user-type" required>
                    <Select id="new-user-type" value={form.user_type} options={roles.map(r => ({ value: r.user_type, label: r.label }))}
                        onChange={e => setForm(prev => ({ ...prev, user_type: e.target.value, channel_partner: '', parent_id: '' }))} />
                </Field>
                {isCpo && <p className="text-xs text-stone-500">Works under your office: <b className="text-stone-700">{officeName}</b></p>}
                {needsOfficeName && (
                    <Field label="Office name" htmlFor="new-user-office" required hint="Type it exactly as it appears on existing leads. Managers and dealers are attached to it.">
                        <Input id="new-user-office" value={form.channel_partner} onChange={e => set('channel_partner', e.target.value.toUpperCase())} placeholder="Partner office name" />
                    </Field>
                )}
                {needsOffice && (
                    <Field label="Works under" htmlFor="new-user-under" required
                        hint={offices.length ? undefined : 'Create a partner office (or partner) login first.'}>
                        <Select id="new-user-under" placeholder="Choose…" options={offices} value={form.parent_id}
                            onChange={e => set('parent_id', e.target.value)} />
                    </Field>
                )}
            </form>
        </Modal>
    );
}

// ─── Edit login (email; admins also login type and office) ────────────────────
function EditUserModal({ user, currentUser, roles, profiles, onClose, onSaved }) {
    const isAdmin = currentUser?.userType === 'admin';
    const pending = user.user_type === PENDING;
    const [email, setEmail] = useState(user.email || '');
    const [userType, setUserType] = useState(pending ? '' : user.user_type);
    const [office, setOffice] = useState(user.user_type === CPO ? user.channel_partner || '' : '');
    // The parent shown at the start; it is only asked for again when the type or parent changes.
    const [startParentId] = useState(() => {
        const current = officeOptions(user.user_type, profiles, { keepId: user.parent_profile_id, excludeId: user.id });
        return currentParentId(user, current, profiles);
    });
    const [parentId, setParentId] = useState(startParentId);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const roleChoices = useMemo(() => {
        const list = roles.map(r => ({ value: r.user_type, label: r.label }));
        if (!pending && !list.some(r => r.value === user.user_type)) list.unshift({ value: user.user_type, label: `${roleLabel(user.user_type) || user.user_type} (switched off)` });
        return list;
    }, [roles, pending, user.user_type]);
    const needsOfficeName = userType === CPO;
    const needsOffice = CPO_CHILD_TYPES.includes(userType);
    const offices = needsOffice ? officeOptions(userType, profiles, { keepId: user.parent_profile_id, excludeId: user.id }) : [];
    // A login whose parent is not listed keeps it until another is chosen.
    const keepsUnlistedParent = needsOffice && userType === user.user_type && !startParentId && Boolean(user.channel_partner);
    // A channel partner keeps its key; a login that becomes one gets its name.
    const agentKey = (user.user_type === 'agent' && partnerKey({ channel_partner: user.channel_partner })) || String(user.name || '').trim().toUpperCase();

    const save = async event => {
        event.preventDefault();
        const cleanEmail = email.trim().toLowerCase();
        if (!isEmail(cleanEmail)) { setError('Enter a valid email address.'); return; }
        if (isAdmin && !userType) { setError('Choose a login type.'); return; }
        const parent = needsOffice ? profiles.find(p => p.id === parentId) : null;
        if (isAdmin && needsOfficeName && !office.trim()) { setError('Enter the office name.'); return; }
        if (isAdmin && needsParentChoice(user, { userType, parentId, startParentId })) { setError('Choose who this login works under.'); return; }

        setBusy(true); setError('');
        try {
            const notes = [];
            if (cleanEmail !== String(user.email || '').toLowerCase()) {
                await callAddUser({ action: 'update_email', user_id: user.id, new_email: cleanEmail });
                if (user.user_type === 'vendor') {
                    await supabase.from('vendors').update({ email: cleanEmail }).eq('profile_id', user.id);
                }
                notes.push('email');
            }
            if (isAdmin) {
                const role = APP_ROLES.find(r => r.user_type === userType);
                const changes = loginChanges(user, { userType, role: role?.role, officeName: office, parent });
                if (Object.keys(changes).length) {
                    const res = await runWrite(supabase.from('profiles').update(changes).eq('id', user.id).select('id'), { action: 'login change' });
                    if (!res.ok) throw res.error;
                    if (changes.channel_partner && [CPO, 'agent'].includes(userType)) await ensurePartnerInDirectory(changes.channel_partner);
                    notes.push('login type and office');
                }
                // Approving a sign-up: the login type is set first, then the login is switched on.
                if (pending) {
                    await callAddUser({ action: 'set_status', user_id: user.id, status: 'active' });
                    notes.push('activated');
                }
            }
            logActivity(currentUser?.id, 'update', `Updated login ${user.name}: ${notes.join(', ') || 'no changes'}`, cleanEmail);
            onSaved(notes.length ? `${user.name} updated.` : 'Nothing changed.');
        } catch (err) {
            setError(err.message || 'The change was not saved.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal open title={pending ? `Approve ${user.name || user.email}` : `Edit ${user.name}`} onClose={onClose} busy={busy} size="sm"
            footer={<>
                <button type="button" className="sf-btn-secondary min-h-11" onClick={onClose} disabled={busy}>Cancel</button>
                <button type="submit" form="edit-user-form" className="sf-btn-primary min-h-11" disabled={busy}>
                    {busy && <Spinner size={14} />} {pending ? 'Approve login' : 'Save'}
                </button>
            </>}>
            <form id="edit-user-form" onSubmit={save} className="space-y-3">
                {pending && <p className="text-xs text-stone-600">This person signed up on their own. Choose what they can do, then approve to let them in.</p>}
                <ErrorBanner>{error}</ErrorBanner>
                <Field label="Email" htmlFor="edit-user-email" required>
                    <Input id="edit-user-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                </Field>
                {isAdmin && (
                    <Field label="Login type" htmlFor="edit-user-type" required>
                        <Select id="edit-user-type" value={userType} options={roleChoices} placeholder={pending ? 'Choose…' : undefined}
                            onChange={e => { setUserType(e.target.value); setOffice(''); setParentId(''); }} />
                    </Field>
                )}
                {isAdmin && needsOfficeName && (
                    <Field label="Office name" htmlFor="edit-user-office" required>
                        <Input id="edit-user-office" value={office} onChange={e => setOffice(e.target.value.toUpperCase())} />
                    </Field>
                )}
                {isAdmin && needsOffice && (
                    <Field label="Works under" htmlFor="edit-user-under" required={!keepsUnlistedParent}
                        hint={keepsUnlistedParent ? `Now under ${user.channel_partner}. Leave this empty to keep it.`
                            : offices.length ? undefined : 'Create a partner office (or partner) login first.'}>
                        <Select id="edit-user-under" placeholder="Choose…" options={offices} value={parentId} onChange={e => setParentId(e.target.value)} />
                    </Field>
                )}
                {isAdmin && userType === 'agent' && (
                    <p className="text-xs text-stone-500">Leads filed under <b className="text-stone-700">{agentKey}</b> show for this partner. Rename it in Operations.</p>
                )}
            </form>
        </Modal>
    );
}

// ─── View ─────────────────────────────────────────────────────────────────────
export default function UserManagementView({ currentUser, initialShowCreate = false }) {
    const { showConfirm } = useGlobalPopup();
    const isAdmin = currentUser?.userType === 'admin';
    const isCpo = currentUser?.userType === CPO;
    // A partner office may only add its manager and dealer logins.
    const roles = useMemo(() => enabledRoles().filter(role => !isCpo || CPO_CHILD_TYPES.includes(role.user_type)), [isCpo]);

    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [notice, setNotice] = useState(null);   // { type: 'success' | 'error', message }
    const [busyId, setBusyId] = useState(null);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [creating, setCreating] = useState(Boolean(initialShowCreate) && roles.length > 0);
    const [editing, setEditing] = useState(null);
    const [resetting, setResetting] = useState(null);

    useEffect(() => { if (initialShowCreate && roles.length) setCreating(true); }, [initialShowCreate, roles.length]);
    useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(null), 6000);
        return () => clearTimeout(timer);
    }, [notice]);

    const fetchProfiles = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).order('created_at', { ascending: false });
        if (error) {
            setLoadError(`Logins could not be loaded: ${error.message}`);
        } else {
            setLoadError('');
            const rows = data || [];
            setProfiles(isCpo
                ? rows.filter(p => p.id !== currentUser?.id && CPO_CHILD_TYPES.includes(p.user_type)
                    && (p.cpo_profile_id === currentUser?.id || p.parent_profile_id === currentUser?.id))
                : rows);
        }
        setLoading(false);
    }, [isCpo, currentUser?.id]);

    useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

    const done = (message, warning = '') => {
        setNotice(warning ? { type: 'error', message: `${message} ${warning}` } : { type: 'success', message });
        fetchProfiles();
    };

    const setStatus = async (profile, status) => {
        const name = profile.name || profile.email;
        if (status === 'inactive' && !(await showConfirm(`${name} will be signed out and cannot sign in until switched back on.`, {
            title: `Switch off ${name}?`, confirmLabel: 'Switch off', type: 'warning',
        }))) return;
        setBusyId(profile.id);
        try {
            await callAddUser({ action: 'set_status', user_id: profile.id, status });
            logActivity(currentUser?.id, 'update', `${status === 'active' ? 'Switched on' : 'Switched off'} login: ${name}`, '');
            done(status === 'active' ? `${name} can sign in again.` : `${name} has been switched off.`);
        } catch (err) {
            setNotice({ type: 'error', message: err.message });
        } finally {
            setBusyId(null);
        }
    };

    const remove = async profile => {
        const name = profile.name || profile.email;
        if (!(await showConfirm(`This permanently deletes the login for ${name}. Their customers and history stay. This cannot be undone.`, {
            title: `Delete ${name}?`, confirmLabel: 'Delete login', type: 'warning',
        }))) return;
        setBusyId(profile.id);
        try {
            await callAddUser({ action: 'delete', user_id: profile.id });
            logActivity(currentUser?.id, 'delete', `Deleted login: ${name}`, profile.email || '');
            done(`${name} was deleted.`);
        } catch (err) {
            setNotice({ type: 'error', message: `${name} was not deleted: ${err.message}` });
        } finally {
            setBusyId(null);
        }
    };

    const counts = useMemo(() => profiles.reduce((acc, p) => ({ ...acc, [p.user_type]: (acc[p.user_type] || 0) + 1 }), {}), [profiles]);
    const filterOptions = useMemo(() => {
        const types = enabledRoles().map(r => ({ value: r.user_type, label: `${r.label} (${counts[r.user_type] || 0})` }))
            .filter(option => !isCpo || CPO_CHILD_TYPES.includes(option.value));
        if (counts[PENDING]) types.unshift({ value: PENDING, label: `Waiting for approval (${counts[PENDING]})` });
        return types;
    }, [counts, isCpo]);

    const q = search.trim().toLowerCase();
    const visible = profiles.filter(p => (!typeFilter || p.user_type === typeFilter)
        && (!q || [p.name, p.email, p.channel_partner, p.role].some(v => String(v || '').toLowerCase().includes(q))));

    const actionButton = (label, Icon, onClick, tone = 'stone', disabled = false) => (
        <button type="button" onClick={onClick} disabled={disabled}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                tone === 'red' ? 'text-rose-600 hover:bg-rose-50' : tone === 'green' ? 'text-emerald-700 hover:bg-emerald-50' : 'text-stone-700 hover:bg-stone-100'
            }`}>
            <Icon size={14} aria-hidden="true" /> {label}
        </button>
    );

    return (
        <div className="max-w-5xl mx-auto space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-500" aria-hidden="true" />
                    <div>
                        <h2 className="text-base font-bold text-stone-900">{isCpo ? 'Your office logins' : 'User Management'}</h2>
                        <p className="text-xs text-stone-500 font-medium">{visible.length} of {profiles.length} logins</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={fetchProfiles} aria-label="Refresh logins" className="sf-btn-secondary min-h-11">
                        <RefreshCw size={16} aria-hidden="true" />
                    </button>
                    {roles.length > 0 && (
                        <button type="button" onClick={() => setCreating(true)} className="sf-btn-primary min-h-11">
                            <Plus size={16} aria-hidden="true" /> Create login
                        </button>
                    )}
                </div>
            </div>

            {notice?.type === 'success' && <SuccessBanner>{notice.message}</SuccessBanner>}
            {notice?.type === 'error' && <ErrorBanner>{notice.message}</ErrorBanner>}
            <ErrorBanner onRetry={fetchProfiles}>{loadError}</ErrorBanner>

            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="border-b border-stone-100 p-4 bg-stone-50/50">
                    <FilterBar label="Filter logins">
                        <SearchInput className="flex-1" value={search} onChange={setSearch} label="Search logins" placeholder="Search by name, email or office…" />
                        <Select aria-label="Login type" className="sm:w-60" value={typeFilter} placeholder={`All logins (${profiles.length})`}
                            options={filterOptions} onChange={e => setTypeFilter(e.target.value)} />
                    </FilterBar>
                </div>

                {loading ? <LoadingState label="Loading logins…" /> : visible.length === 0 ? (
                    <EmptyState icon={UserCog} title={profiles.length ? 'No logins match' : 'No logins yet'} className="m-4">
                        {profiles.length ? 'Try another search or login type.' : roles.length ? 'Use Create login to add the first one.' : 'Manager and dealer logins are not switched on for your office.'}
                    </EmptyState>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-stone-100 bg-stone-50/80 text-[10px] font-black text-stone-500 uppercase tracking-wider">
                                    <th scope="col" className="px-4 py-3">Person</th>
                                    <th scope="col" className="px-4 py-3">Login type</th>
                                    {officeColumnOn && <th scope="col" className="px-4 py-3">Works under</th>}
                                    <th scope="col" className="px-4 py-3">Status</th>
                                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {visible.map(profile => {
                                    const pending = profile.user_type === PENDING;
                                    const inactive = profile.status !== 'active';
                                    const isYou = profile.id === currentUser?.id;
                                    const busy = busyId === profile.id;
                                    return (
                                        <tr key={profile.id} className={inactive ? 'bg-stone-50/60' : 'hover:bg-stone-50/50'}>
                                            <td className="px-4 py-3">
                                                <p className={`text-xs font-bold ${inactive ? 'text-stone-500' : 'text-stone-900'}`}>{profile.name || 'Unnamed'}</p>
                                                <p className="text-[11px] text-stone-500 break-all">{profile.email || '–'}</p>
                                                {profile.phone_number && <p className="text-[11px] text-stone-500">{profile.phone_number}</p>}
                                            </td>
                                            <td className="px-4 py-3">
                                                {pending
                                                    ? <span className="text-xs italic text-stone-500">Not chosen yet</span>
                                                    : <span className="text-xs font-bold text-stone-700">{roleLabel(profile.user_type) || profile.role || profile.user_type}</span>}
                                            </td>
                                            {officeColumnOn && (
                                                <td className="px-4 py-3">
                                                    {profile.channel_partner ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                                                            <Building2 size={11} className="text-amber-600" aria-hidden="true" /> {profile.channel_partner}
                                                        </span>
                                                    ) : <span className="text-xs text-stone-400">–</span>}
                                                </td>
                                            )}
                                            <td className="px-4 py-3">
                                                {isYou ? <Badge tone="green">You</Badge>
                                                    : pending ? <Badge tone="yellow">Waiting for approval</Badge>
                                                    : inactive ? <Badge tone="red">Switched off</Badge>
                                                    : <Badge tone="green">Active</Badge>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap items-center justify-end gap-1">
                                                    {busy && <Spinner size={14} className="text-amber-500" />}
                                                    {!isYou && pending && isAdmin && actionButton('Approve', UserCheck, () => setEditing(profile), 'green', busy)}
                                                    {!isYou && !pending && actionButton('Edit', Edit2, () => setEditing(profile), 'stone', busy)}
                                                    {!isYou && !pending && !inactive && actionButton('Password', KeyRound, () => setResetting(profile), 'stone', busy)}
                                                    {!isYou && !pending && !inactive && actionButton('Switch off', Ban, () => setStatus(profile, 'inactive'), 'red', busy)}
                                                    {!isYou && !pending && inactive && actionButton('Switch on', RefreshCw, () => setStatus(profile, 'active'), 'green', busy)}
                                                    {!isYou && (inactive || pending) && actionButton('Delete', Trash2, () => remove(profile), 'red', busy)}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {creating && (
                <CreateUserModal currentUser={currentUser} roles={roles} profiles={profiles}
                    onClose={() => setCreating(false)}
                    onCreated={(message, warning) => { setCreating(false); done(message, warning); }} />
            )}
            {editing && (
                <EditUserModal user={editing} currentUser={currentUser} roles={roles} profiles={profiles}
                    onClose={() => setEditing(null)}
                    onSaved={message => { setEditing(null); done(message); }} />
            )}
            {resetting && (
                <ResetPasswordModal user={resetting} currentUser={currentUser}
                    onClose={() => setResetting(null)}
                    onDone={message => { setResetting(null); done(message); }} />
            )}
        </div>
    );
}
