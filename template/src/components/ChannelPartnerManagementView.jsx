// Operations (admins): the dropdown lists the team picks from, partner offices
// and their teams, installers (vendors) and drivers. Every card follows this
// client's switched-on features, so a list nobody uses is not shown.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowDown, ArrowUp, Award, Building2, ClipboardList, Cpu, Eye, Link2, Package, Pencil, Phone, Plus, ShieldCheck,
    Tag, Trash2, Truck, Unlink, Users, Wallet, Wrench, Zap,
} from 'lucide-react';
import { supabase } from '../supabase';
import { logActivity, runWrite } from '../utils';
import { fetchAllPages } from '../lib/db.js';
import { invalidateMetadata } from '../lib/metadata.js';
import { DROPDOWN_CATALOG } from '../config/catalog/dropdowns.js';
import { STAGE_IDS, isOn, isStageEnabled } from '../config/index.js';
import { APP_ROLES } from '../constants';
import { useGlobalPopup } from './GlobalPopup';
import {
    Badge, EmptyState, ErrorBanner, Field, Input, LoadingState, Modal, SearchInput, SectionCard, Select, StatTile,
} from '../ui/index.js';

const CPO = 'channel_partner_office';
const TEAM_TYPES = ['office2', 'agent2'];
const partnersOn = isOn('channelPartners') || isOn('cpos');
const teamsOn = isOn('cpos') || isOn('dealers');
const PROFILE_COLUMNS = 'id, name, email, user_type, role, channel_partner, status, parent_profile_id, cpo_profile_id, created_at';
const NOUNS = { admin: 'customer records', profiles: 'logins', bom_items: 'BOM lines' };

const sameText = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label).localeCompare(String(b.label));
const roleLabel = userType => APP_ROLES.find(role => role.user_type === userType)?.label || userType;

// Dropdown lists on this page. `renames` are the columns that hold the label
// and follow a rename; `jsonRenames` are keys inside a jsonb column. A label
// still used in any of them (or `inUse`) is hidden rather than deleted.
const LISTS = [
    partnersOn && {
        id: 'channel_partner', label: 'Channel partner directory', help: 'Partner names offered when a lead is added.',
        usedIn: 'Leads', icon: Users, upper: true,
        renames: [['admin', 'channel_partner'], ['profiles', 'channel_partner']],
    },
    { id: 'module_brand', icon: Tag, renames: [['admin', 'module_brand']] },
    { id: 'module_wp', icon: Zap, inUse: [['admin', 'module_wp']] },
    { id: 'inverter_make', icon: Cpu, renames: [['admin', 'inverter_make']] },
    (isStageEnabled(STAGE_IDS.REGISTRATION) || isStageEnabled(STAGE_IDS.LOAN) || isStageEnabled(STAGE_IDS.DISCOM_SUBMISSION)) && {
        id: 'registration_by', icon: ClipboardList,
        renames: [['admin', 'registration_by'], ['admin', 'loan_by']],
        jsonRenames: [['admin', 'discom_submission', 'submitted_by']],
    },
    isStageEnabled(STAGE_IDS.MATERIAL_INTEGRATION) && { id: 'integration_by', icon: Package, renames: [['bom_items', 'integration_by']] },
    // Payment modes are stored inside cash payment details, so use cannot be counted.
    isStageEnabled(STAGE_IDS.CASH) && { id: 'payment_method_modes', icon: Wallet, alwaysInUse: true },
].filter(Boolean).map(list => ({ ...DROPDOWN_CATALOG[list.id], ...list }));
const LIST_IDS = LISTS.map(list => list.id);

const ICON_BUTTON = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-500 transition-colors disabled:opacity-30 disabled:hover:bg-transparent';
const iconButton = `${ICON_BUTTON} hover:bg-stone-100 hover:text-stone-900`;
const dangerButton = `${ICON_BUTTON} hover:bg-red-50 hover:text-red-600`;

async function countRows(table, column, value) {
    const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq(column, value);
    if (error) throw error;
    return count || 0;
}

// How many records still hold `label`; null when that cannot be counted.
async function usageOf(list, label) {
    if (list.alwaysInUse) return null;
    let total = 0;
    for (const [table, column] of list.inUse || list.renames || []) total += await countRows(table, column, label);
    for (const [table, column, key] of list.jsonRenames || []) total += await countRows(table, `${column}->>${key}`, label);
    return total;
}

// Renames the label wherever it is stored. Writes that already landed are put
// back if a later one fails; the error then says what could not be restored.
async function renameEverywhere(list, from, to) {
    const done = [];
    try {
        for (const [table, column] of list.renames || []) {
            const expected = await countRows(table, column, from);
            if (!expected) continue;
            const res = await runWrite(supabase.from(table).update({ [column]: to }).eq(column, from).select('id'), { action: 'rename' });
            if (!res.ok) throw res.error;
            done.push({
                what: `${res.rows.length} ${NOUNS[table]}`,
                undo: () => runWrite(supabase.from(table).update({ [column]: from }).eq(column, to).select('id'), { action: 'undo' }),
            });
            if (res.rows.length !== expected) throw new Error(`Only ${res.rows.length} of ${expected} ${NOUNS[table]} could be renamed.`);
        }
        for (const [table, column, key] of list.jsonRenames || []) {
            const rows = await fetchAllPages(() => supabase.from(table).select(`id, ${column}`).eq(`${column}->>${key}`, from).order('id'));
            for (const row of rows) {
                const res = await runWrite(supabase.from(table).update({ [column]: { ...row[column], [key]: to } }).eq('id', row.id).select('id'), { action: 'rename' });
                if (!res.ok) throw res.error;
                done.push({
                    what: `1 ${NOUNS[table].replace(/s$/, '')}`,
                    undo: () => runWrite(supabase.from(table).update({ [column]: row[column] }).eq('id', row.id).select('id'), { action: 'undo' }),
                });
            }
        }
    } catch (error) {
        const stuck = [];
        for (const step of done.reverse()) {
            const res = await step.undo();
            if (!res.ok) stuck.push(step.what);
        }
        error.stuck = stuck;
        throw error;
    }
}

// ─── One dropdown list ───────────────────────────────────────────────────────
function ListModal({ list, rows, currentUser, onClose, onChanged }) {
    const { showAlert, showConfirm } = useGlobalPopup();
    const [search, setSearch] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [editing, setEditing] = useState(null);     // { id, label }
    const [busy, setBusy] = useState(false);
    const sorted = useMemo(() => [...rows].sort(byOrder), [rows]);
    const q = search.trim().toLowerCase();
    const visible = q ? sorted.filter(row => row.label.toLowerCase().includes(q)) : sorted;
    const clean = value => {
        const text = String(value || '').trim().replace(/\s+/g, ' ');
        return list.upper ? text.toUpperCase() : text;
    };
    const invalid = label => {
        if (!label) return 'Enter a name.';
        if (list.numeric && !/^\d+(\.\d+)?$/.test(label)) return 'Use numbers only, for example 550.';
        return '';
    };

    const run = async (task, failure) => {
        setBusy(true);
        try {
            await task();
            invalidateMetadata(list.id);
            await onChanged();
        } catch (error) {
            console.error(failure, error);
            const stuck = error.stuck?.length
                ? ` These could not be put back and need fixing by hand: ${error.stuck.join(', ')}.`
                : error.stuck ? ' Nothing was changed.' : '';
            showAlert(`${failure}: ${error.message}${stuck}`, { title: 'Not saved', type: 'error' });
        } finally {
            setBusy(false);
        }
    };

    const add = event => {
        event.preventDefault();
        const label = clean(newLabel);
        const problem = invalid(label);
        if (problem) { showAlert(problem); return; }
        const existing = rows.find(row => sameText(row.label, label));
        if (existing?.is_active) { showAlert(`"${existing.label}" is already in the list.`); return; }
        run(async () => {
            const nextOrder = rows.reduce((max, row) => Math.max(max, row.sort_order ?? 0), 0) + 10;
            const res = existing
                ? await runWrite(supabase.from('metadata').update({ is_active: true }).eq('id', existing.id).select('id'), { action: 'change' })
                : await runWrite(supabase.from('metadata').insert({ category: list.id, label, sort_order: nextOrder }).select('id'), { action: 'addition' });
            if (!res.ok) throw res.error;
            setNewLabel('');
            logActivity(currentUser?.id, 'operations', `Added "${label}" to ${list.label}`);
        }, 'Could not add it');
    };

    const rename = row => {
        const label = clean(editing?.label);
        if (label === row.label) { setEditing(null); return; }
        const problem = invalid(label);
        if (problem) { showAlert(problem); return; }
        if (rows.some(other => other.id !== row.id && sameText(other.label, label))) { showAlert(`"${label}" is already in the list.`); return; }
        run(async () => {
            const res = await runWrite(supabase.from('metadata').update({ label }).eq('id', row.id).select('id'), { action: 'rename' });
            if (!res.ok) throw res.error;
            try {
                await renameEverywhere(list, row.label, label);
            } catch (error) {
                const back = await runWrite(supabase.from('metadata').update({ label: row.label }).eq('id', row.id).select('id'), { action: 'undo' });
                if (!back.ok) error.stuck = [...(error.stuck || []), 'the list entry'];
                throw error;
            }
            setEditing(null);
            logActivity(currentUser?.id, 'operations', `Renamed "${row.label}" to "${label}" in ${list.label}`);
        }, 'Could not rename it');
    };

    const remove = async row => {
        let used;
        try {
            used = await usageOf(list, row.label);
        } catch (error) {
            showAlert(`Could not check where "${row.label}" is used: ${error.message}`, { type: 'error' });
            return;
        }
        if (used === 0) {
            if (!(await showConfirm(`Remove "${row.label}" from ${list.label}?`, { title: 'Remove from list?', confirmLabel: 'Remove', type: 'danger' }))) return;
            run(async () => {
                const res = await runWrite(supabase.from('metadata').delete().eq('id', row.id).select('id'), { action: 'removal' });
                if (!res.ok) throw res.error;
                logActivity(currentUser?.id, 'operations', `Removed "${row.label}" from ${list.label}`);
            }, 'Could not remove it');
            return;
        }
        if (!row.is_active) {
            const where = used == null ? 'may still be used on existing records' : `is still used by ${used} ${used === 1 ? 'record' : 'records'}`;
            showAlert(`"${row.label}" ${where}, so it stays in the list as hidden.`, { title: 'Still in use', type: 'info' });
            return;
        }
        const usage = used == null ? 'It may be used on existing records.' : `It is used by ${used} ${used === 1 ? 'record' : 'records'}.`;
        if (!(await showConfirm(`${usage} It will no longer be offered for new entries, and existing records keep it.`, {
            title: `Hide "${row.label}"?`, confirmLabel: 'Hide', type: 'warning',
        }))) return;
        run(async () => {
            const res = await runWrite(supabase.from('metadata').update({ is_active: false }).eq('id', row.id).select('id'), { action: 'change' });
            if (!res.ok) throw res.error;
            logActivity(currentUser?.id, 'operations', `Hid "${row.label}" in ${list.label}`);
        }, 'Could not hide it');
    };

    const restore = row => run(async () => {
        const res = await runWrite(supabase.from('metadata').update({ is_active: true }).eq('id', row.id).select('id'), { action: 'change' });
        if (!res.ok) throw res.error;
        logActivity(currentUser?.id, 'operations', `Showed "${row.label}" again in ${list.label}`);
    }, 'Could not show it again');

    const move = (index, delta) => run(async () => {
        const next = [...sorted];
        const [item] = next.splice(index, 1);
        next.splice(index + delta, 0, item);
        const changes = next.map((row, i) => ({ row, order: (i + 1) * 10 })).filter(({ row, order }) => row.sort_order !== order);
        const results = await Promise.all(changes.map(({ row, order }) =>
            runWrite(supabase.from('metadata').update({ sort_order: order }).eq('id', row.id).select('id'), { action: 'reorder' })));
        const failed = results.find(res => !res.ok);
        if (failed) throw failed.error;
    }, 'Could not change the order');

    return (
        <Modal open title={list.label} onClose={onClose} busy={busy} size="lg" variant="sheet">
            <div className="space-y-4">
                <p className="text-xs text-stone-500">{list.help} Used in: {list.usedIn}.</p>
                <form onSubmit={add} className="flex gap-2">
                    <Input aria-label={`New entry for ${list.label}`} value={newLabel} onChange={e => setNewLabel(e.target.value)}
                        inputMode={list.numeric ? 'decimal' : undefined} placeholder={list.numeric ? 'e.g. 550' : 'Add a name'} className="flex-1" />
                    <button type="submit" disabled={busy || !newLabel.trim()} className="sf-btn-primary min-h-11 shrink-0">
                        <Plus size={16} aria-hidden="true" /> Add
                    </button>
                </form>
                {rows.length > 10 && <SearchInput value={search} onChange={setSearch} label={`Search ${list.label}`} placeholder="Search this list…" />}
                {visible.length === 0 ? (
                    <EmptyState icon={list.icon} title={rows.length ? 'Nothing matches' : 'The list is empty'}>
                        {rows.length ? 'Try another search.' : 'Add the first entry above.'}
                    </EmptyState>
                ) : (
                    <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                        {visible.map(row => {
                            const index = sorted.indexOf(row);
                            const isEditing = editing?.id === row.id;
                            return (
                                <li key={row.id} className="flex flex-wrap items-center gap-1 px-3 py-1.5">
                                    {isEditing ? (
                                        <form className="flex min-w-0 flex-1 gap-2" onSubmit={event => { event.preventDefault(); rename(row); }}>
                                            <Input aria-label={`New name for ${row.label}`} value={editing.label} autoFocus
                                                onChange={e => setEditing({ id: row.id, label: e.target.value })} className="flex-1" />
                                            <button type="submit" disabled={busy} className="sf-btn-primary min-h-11">Save</button>
                                            <button type="button" onClick={() => setEditing(null)} className="sf-btn-secondary min-h-11">Cancel</button>
                                        </form>
                                    ) : (
                                        <>
                                            <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${row.is_active ? 'text-stone-800' : 'text-stone-400'}`}>{row.label}</span>
                                            {!row.is_active && <Badge>Hidden</Badge>}
                                            {!q && <>
                                                <button type="button" className={iconButton} aria-label={`Move ${row.label} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
                                                <button type="button" className={iconButton} aria-label={`Move ${row.label} down`} disabled={busy || index === sorted.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
                                            </>}
                                            <button type="button" className={iconButton} aria-label={`Rename ${row.label}`} disabled={busy} onClick={() => setEditing({ id: row.id, label: row.label })}><Pencil size={16} aria-hidden="true" /></button>
                                            {!row.is_active && <button type="button" className={iconButton} aria-label={`Show ${row.label} again`} disabled={busy} onClick={() => restore(row)}><Eye size={16} aria-hidden="true" /></button>}
                                            <button type="button" className={dangerButton} aria-label={`Remove ${row.label}`} disabled={busy} onClick={() => remove(row)}><Trash2 size={16} aria-hidden="true" /></button>
                                        </>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {list.renames?.length > 0 && <p className="text-[11px] text-stone-500">Renaming also updates every record that uses the old name.</p>}
            </div>
        </Modal>
    );
}

// ─── Partner offices and their teams ─────────────────────────────────────────
function TeamsModal({ parents, profiles, leadCounts, onClose }) {
    const [openId, setOpenId] = useState(null);
    const teamOf = parent => profiles.filter(p => TEAM_TYPES.includes(p.user_type)
        && (p.parent_profile_id === parent.id || p.cpo_profile_id === parent.id || sameText(p.channel_partner, parent.channel_partner || parent.name)));
    return (
        <Modal open title={isOn('cpos') ? 'Partner offices & teams' : 'Partners & dealers'} onClose={onClose} size="lg" variant="sheet">
            {parents.length === 0 ? (
                <EmptyState icon={Building2} title="No partner logins yet">Create them in User Management and they appear here.</EmptyState>
            ) : (
                <ul className="space-y-2">
                    {parents.map(parent => {
                        const key = parent.channel_partner || parent.name;
                        const team = teamOf(parent);
                        const open = openId === parent.id;
                        return (
                            <li key={parent.id} className="rounded-xl border border-stone-200">
                                <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : parent.id)}
                                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left hover:bg-stone-50">
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-2">
                                            <span className="truncate text-sm font-bold text-stone-900">{parent.name}</span>
                                            {parent.status !== 'active' && <Badge>Switched off</Badge>}
                                        </span>
                                        <span className="block truncate text-xs text-stone-500">{roleLabel(parent.user_type)} · {key}{parent.email ? ` · ${parent.email}` : ''}</span>
                                    </span>
                                    <span className="shrink-0 text-right text-xs">
                                        <span className="block font-bold text-stone-900">{team.length} in team</span>
                                        {partnersOn && <span className="text-orange-700">{leadCounts[String(key).trim().toLowerCase()] || 0} leads</span>}
                                    </span>
                                </button>
                                {open && (
                                    <div className="border-t border-stone-100 px-4 py-3">
                                        {team.length === 0 ? <p className="text-xs text-stone-500">Nobody in this team yet.</p> : (
                                            <ul className="space-y-1.5">
                                                {team.map(member => (
                                                    <li key={member.id} className="flex items-center justify-between gap-3 text-xs">
                                                        <span className="min-w-0">
                                                            <span className="block truncate font-bold text-stone-800">{member.name}</span>
                                                            <span className="block truncate text-stone-500">{roleLabel(member.user_type)}{member.email ? ` · ${member.email}` : ''}</span>
                                                        </span>
                                                        <Badge tone={member.status === 'active' ? 'green' : 'stone'}>{member.status === 'active' ? 'Active' : 'Switched off'}</Badge>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className="mt-4 text-[11px] text-stone-500">Logins are added and changed in User Management.</p>
        </Modal>
    );
}

// ─── Installers ──────────────────────────────────────────────────────────────
function VendorsModal({ vendors, vendorLogins, currentUser, onClose, onChanged }) {
    const { showAlert, showConfirm } = useGlobalPopup();
    const loginsOn = isOn('vendorLogin');
    const [form, setForm] = useState({ name: '', email: '', phone: '' });
    const [editing, setEditing] = useState(null);     // { id, email, phone }
    const [busy, setBusy] = useState(false);
    const linkedIds = new Set(vendors.map(v => v.profile_id).filter(Boolean));
    const loginFor = id => vendorLogins.find(p => p.id === id);

    const run = async (task, failure) => {
        setBusy(true);
        try {
            await task();
            await onChanged();
        } catch (error) {
            console.error(failure, error);
            showAlert(`${failure}: ${error.message}`, { title: 'Not saved', type: 'error' });
        } finally {
            setBusy(false);
        }
    };

    const add = event => {
        event.preventDefault();
        const name = form.name.trim().replace(/\s+/g, ' ').toUpperCase();
        if (!name) { showAlert('Enter the installer name.'); return; }
        if (vendors.some(v => sameText(v.name, name))) { showAlert(`${name} is already in the list.`); return; }
        run(async () => {
            const res = await runWrite(supabase.from('vendors')
                .insert({ name, email: form.email.trim().toLowerCase() || null, phone: form.phone.trim() || null }).select('id'), { action: 'addition' });
            if (!res.ok) throw res.error;
            setForm({ name: '', email: '', phone: '' });
            logActivity(currentUser?.id, 'operations', `Added installer ${name}`);
        }, 'Could not add the installer');
    };

    const save = vendor => run(async () => {
        const res = await runWrite(supabase.from('vendors')
            .update({ email: editing.email.trim().toLowerCase() || null, phone: editing.phone.trim() || null, updated_at: new Date().toISOString() })
            .eq('id', vendor.id).select('id'), { action: 'change' });
        if (!res.ok) throw res.error;
        setEditing(null);
        logActivity(currentUser?.id, 'operations', `Updated installer ${vendor.name}`);
    }, 'Could not save the installer');

    const link = (vendor, profileId) => run(async () => {
        const res = await runWrite(supabase.from('vendors').update({ profile_id: profileId || null }).eq('id', vendor.id).select('id'), { action: 'login link' });
        if (!res.ok) throw res.error;
        const login = loginFor(profileId);
        logActivity(currentUser?.id, 'operations', profileId ? `Linked installer ${vendor.name} to login ${login?.email || login?.name}` : `Unlinked the login from installer ${vendor.name}`);
    }, 'Could not change the login link');

    const remove = async vendor => {
        let used = 0;
        try { used = await countRows('admin', 'vendor', vendor.name); } catch (error) { showAlert(error.message, { type: 'error' }); return; }
        const message = used
            ? `${vendor.name} is assigned to ${used} ${used === 1 ? 'customer' : 'customers'}. Those customers keep the name, but it will no longer be offered.`
            : `${vendor.name} will no longer be offered when assigning installations.`;
        if (!(await showConfirm(message, { title: `Remove ${vendor.name}?`, confirmLabel: 'Remove', type: 'danger' }))) return;
        run(async () => {
            const res = await runWrite(supabase.from('vendors').delete().eq('id', vendor.id).select('id'), { action: 'removal' });
            if (!res.ok) throw res.error;
            logActivity(currentUser?.id, 'operations', `Removed installer ${vendor.name}`);
        }, 'Could not remove the installer');
    };

    return (
        <Modal open title="Installers (vendors)" onClose={onClose} busy={busy} size="lg" variant="sheet">
            <div className="space-y-4">
                <form onSubmit={add} className="grid gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:grid-cols-3">
                    <Field label="Name" htmlFor="vendor-name" required>
                        <Input id="vendor-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Installer or firm" />
                    </Field>
                    <Field label="Email" htmlFor="vendor-email">
                        <Input id="vendor-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Optional" />
                    </Field>
                    <Field label="Phone" htmlFor="vendor-phone">
                        <Input id="vendor-phone" type="tel" inputMode="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/[^\d+\s-]/g, '') }))} placeholder="Optional" />
                    </Field>
                    <button type="submit" disabled={busy} className="sf-btn-primary min-h-11 sm:col-span-3"><Plus size={16} aria-hidden="true" /> Add installer</button>
                </form>
                {loginsOn && <p className="text-[11px] text-stone-500">An installer login created in User Management is linked to the installer with the same name or email. Link one by hand below if needed.</p>}
                {vendors.length === 0 ? <EmptyState icon={Wrench} title="No installers yet">Add the installers you assign jobs to.</EmptyState> : (
                    <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                        {vendors.map(vendor => {
                            const isEditing = editing?.id === vendor.id;
                            const login = loginFor(vendor.profile_id);
                            const free = vendorLogins.filter(p => !linkedIds.has(p.id) || p.id === vendor.profile_id);
                            return (
                                <li key={vendor.id} className="space-y-2 px-3 py-2.5">
                                    <div className="flex items-center gap-1">
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-bold text-stone-900">{vendor.name}</span>
                                            {!isEditing && <span className="block truncate text-xs text-stone-500">{[vendor.email, vendor.phone].filter(Boolean).join(' · ') || 'No contact details'}</span>}
                                        </span>
                                        {!isEditing && <>
                                            <button type="button" className={iconButton} aria-label={`Edit ${vendor.name}`} disabled={busy}
                                                onClick={() => setEditing({ id: vendor.id, email: vendor.email || '', phone: vendor.phone || '' })}><Pencil size={16} aria-hidden="true" /></button>
                                            <button type="button" className={dangerButton} aria-label={`Remove ${vendor.name}`} disabled={busy}
                                                onClick={() => remove(vendor)}><Trash2 size={16} aria-hidden="true" /></button>
                                        </>}
                                    </div>
                                    {isEditing && (
                                        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]" onSubmit={event => { event.preventDefault(); save(vendor); }}>
                                            <Input aria-label={`Email for ${vendor.name}`} type="email" value={editing.email} onChange={e => setEditing(v => ({ ...v, email: e.target.value }))} placeholder="Email" />
                                            <Input aria-label={`Phone for ${vendor.name}`} type="tel" value={editing.phone} onChange={e => setEditing(v => ({ ...v, phone: e.target.value.replace(/[^\d+\s-]/g, '') }))} placeholder="Phone" />
                                            <button type="submit" disabled={busy} className="sf-btn-primary min-h-11">Save</button>
                                            <button type="button" onClick={() => setEditing(null)} className="sf-btn-secondary min-h-11">Cancel</button>
                                            <p className="text-[11px] text-stone-500 sm:col-span-4">The name cannot be changed: customer records are assigned by name.</p>
                                        </form>
                                    )}
                                    {loginsOn && (
                                        <div className="flex flex-wrap items-center gap-2">
                                            {login ? (
                                                <>
                                                    <Badge tone={login.status === 'active' ? 'green' : 'stone'}><Link2 size={11} aria-hidden="true" /> Login: {login.email || login.name}</Badge>
                                                    <button type="button" disabled={busy} onClick={() => link(vendor, null)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-bold text-stone-600 hover:bg-stone-100">
                                                        <Unlink size={13} aria-hidden="true" /> Unlink
                                                    </button>
                                                </>
                                            ) : free.length ? (
                                                <Select aria-label={`Link a login to ${vendor.name}`} className="sm:w-72" value="" placeholder="Link an installer login…" disabled={busy}
                                                    options={free.map(p => ({ value: p.id, label: `${p.name}${p.email ? ` (${p.email})` : ''}` }))}
                                                    onChange={e => e.target.value && link(vendor, e.target.value)} />
                                            ) : <Badge tone="yellow">No login</Badge>}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </Modal>
    );
}

// ─── Drivers (delivery batches) ──────────────────────────────────────────────
function DriversModal({ drivers, currentUser, onClose, onChanged }) {
    const { showAlert, showConfirm } = useGlobalPopup();
    const empty = { name: '', phone: '', vehicle_number: '' };
    const [form, setForm] = useState(empty);
    const [editing, setEditing] = useState(null);     // driver being edited, with its draft values
    const [busy, setBusy] = useState(false);

    const check = (draft, id) => {
        const clean = { name: draft.name.trim(), phone: draft.phone.trim(), vehicle_number: draft.vehicle_number.trim().toUpperCase() };
        if (!clean.name || !clean.phone || !clean.vehicle_number) return { error: 'Enter the name, phone number and vehicle number.' };
        if (drivers.some(d => d.id !== id && sameText(d.name, clean.name))) return { error: `A driver called ${clean.name} already exists.` };
        return { clean };
    };
    const run = async (task, failure) => {
        setBusy(true);
        try {
            await task();
            await onChanged();
        } catch (error) {
            console.error(failure, error);
            showAlert(`${failure}: ${error.message}`, { title: 'Not saved', type: 'error' });
        } finally {
            setBusy(false);
        }
    };

    const add = event => {
        event.preventDefault();
        const { clean, error } = check(form);
        if (error) { showAlert(error); return; }
        run(async () => {
            const res = await runWrite(supabase.from('drivers').insert(clean).select('id'), { action: 'addition' });
            if (!res.ok) throw res.error;
            setForm(empty);
            logActivity(currentUser?.id, 'operations', `Added driver ${clean.name}`, `${clean.phone} | ${clean.vehicle_number}`);
        }, 'Could not add the driver');
    };

    const save = event => {
        event.preventDefault();
        const { clean, error } = check(editing, editing.id);
        if (error) { showAlert(error); return; }
        run(async () => {
            const res = await runWrite(supabase.from('drivers').update({ ...clean, updated_at: new Date().toISOString() }).eq('id', editing.id).select('id'), { action: 'change' });
            if (!res.ok) throw res.error;
            setEditing(null);
            logActivity(currentUser?.id, 'operations', `Updated driver ${clean.name}`, `${clean.phone} | ${clean.vehicle_number}`);
        }, 'Could not save the driver');
    };

    const remove = async driver => {
        if (!(await showConfirm(`Delivery batches already saved keep ${driver.name}'s details; new batches will not offer them.`, {
            title: `Remove ${driver.name}?`, confirmLabel: 'Remove', type: 'danger',
        }))) return;
        run(async () => {
            const res = await runWrite(supabase.from('drivers').delete().eq('id', driver.id).select('id'), { action: 'removal' });
            if (!res.ok) throw res.error;
            logActivity(currentUser?.id, 'operations', `Removed driver ${driver.name}`);
        }, 'Could not remove the driver');
    };

    const inputs = (draft, setDraft, prefix) => (
        <>
            <Field label="Name" htmlFor={`${prefix}-name`} required>
                <Input id={`${prefix}-name`} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </Field>
            <Field label="Phone" htmlFor={`${prefix}-phone`} required>
                <Input id={`${prefix}-phone`} type="tel" inputMode="tel" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value.replace(/[^\d+\s-]/g, '') }))} />
            </Field>
            <Field label="Vehicle number" htmlFor={`${prefix}-vehicle`} required>
                <Input id={`${prefix}-vehicle`} value={draft.vehicle_number} onChange={e => setDraft(d => ({ ...d, vehicle_number: e.target.value.toUpperCase() }))} />
            </Field>
        </>
    );

    return (
        <Modal open title="Drivers" onClose={onClose} busy={busy} size="lg" variant="sheet">
            <div className="space-y-4">
                <form onSubmit={add} className="grid gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:grid-cols-3">
                    {inputs(form, setForm, 'driver-new')}
                    <button type="submit" disabled={busy} className="sf-btn-primary min-h-11 sm:col-span-3"><Plus size={16} aria-hidden="true" /> Add driver</button>
                </form>
                <p className="text-[11px] text-stone-500">Picking a driver on a delivery batch fills in the phone and vehicle number.</p>
                {drivers.length === 0 ? <EmptyState icon={Truck} title="No drivers yet" /> : (
                    <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                        {drivers.map(driver => editing?.id === driver.id ? (
                            <li key={driver.id} className="px-3 py-2.5">
                                <form onSubmit={save} className="grid gap-2 sm:grid-cols-3">
                                    {inputs(editing, setEditing, `driver-${driver.id}`)}
                                    <div className="flex gap-2 sm:col-span-3">
                                        <button type="submit" disabled={busy} className="sf-btn-primary min-h-11">Save</button>
                                        <button type="button" onClick={() => setEditing(null)} className="sf-btn-secondary min-h-11">Cancel</button>
                                    </div>
                                </form>
                            </li>
                        ) : (
                            <li key={driver.id} className="flex items-center gap-1 px-3 py-2">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold text-stone-900">{driver.name}</span>
                                    <span className="flex flex-wrap gap-x-3 text-xs text-stone-500">
                                        <span className="inline-flex items-center gap-1"><Phone size={11} aria-hidden="true" /> {driver.phone || '–'}</span>
                                        <span className="inline-flex items-center gap-1"><Truck size={11} aria-hidden="true" /> {driver.vehicle_number || '–'}</span>
                                    </span>
                                </span>
                                <button type="button" className={iconButton} aria-label={`Edit ${driver.name}`} disabled={busy}
                                    onClick={() => setEditing({ id: driver.id, name: driver.name || '', phone: driver.phone || '', vehicle_number: driver.vehicle_number || '' })}><Pencil size={16} aria-hidden="true" /></button>
                                <button type="button" className={dangerButton} aria-label={`Remove ${driver.name}`} disabled={busy}
                                    onClick={() => remove(driver)}><Trash2 size={16} aria-hidden="true" /></button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Modal>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ChannelPartnerManagementView({ currentUser }) {
    const [data, setData] = useState({ metadata: [], profiles: [], vendors: [], drivers: [], leadCounts: {} });
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [open, setOpen] = useState(null);       // list id | 'teams' | 'vendors' | 'drivers'

    const load = useCallback(async () => {
        try {
            const [metadata, profiles, vendors, drivers, partnerRows] = await Promise.all([
                supabase.from('metadata').select('id, category, label, sort_order, is_active').in('category', LIST_IDS),
                supabase.from('profiles').select(PROFILE_COLUMNS).in('user_type', [CPO, 'agent', ...TEAM_TYPES, 'vendor']).order('name'),
                supabase.from('vendors').select('id, name, email, phone, profile_id').order('name'),
                isOn('deliveryBatches') ? supabase.from('drivers').select('id, name, phone, vehicle_number').order('name') : { data: [] },
                partnersOn ? fetchAllPages(() => supabase.from('admin').select('id, channel_partner').is('deleted_at', null).order('id')) : [],
            ]);
            const failed = [metadata, profiles, vendors, drivers].find(res => res.error);
            if (failed) throw failed.error;
            const leadCounts = {};
            partnerRows.forEach(row => {
                const key = String(row.channel_partner || '').trim().toLowerCase();
                if (key) leadCounts[key] = (leadCounts[key] || 0) + 1;
            });
            setData({ metadata: metadata.data || [], profiles: profiles.data || [], vendors: vendors.data || [], drivers: drivers.data || [], leadCounts });
            setLoadError('');
        } catch (error) {
            console.error('Operations page failed to load:', error);
            setLoadError(`Could not load the Operations page: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const rowsFor = id => data.metadata.filter(row => row.category === id);
    const teamParents = data.profiles.filter(p => (isOn('cpos') && p.user_type === CPO) || (isOn('dealers') && isOn('channelPartners') && p.user_type === 'agent'));
    const vendorLogins = data.profiles.filter(p => p.user_type === 'vendor');
    const topPartners = useMemo(() => {
        const names = new Map();
        data.metadata.filter(row => row.category === 'channel_partner').forEach(row => names.set(row.label.toLowerCase(), row.label));
        return Object.entries(data.leadCounts)
            .map(([key, count]) => ({ name: names.get(key) || key.toUpperCase(), count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }, [data.metadata, data.leadCounts]);
    const totalPartnerLeads = Object.values(data.leadCounts).reduce((sum, n) => sum + n, 0);
    const activeCount = id => rowsFor(id).filter(row => row.is_active).length;
    const openList = LISTS.find(list => list.id === open);

    return (
        <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-amber-500" aria-hidden="true" />
                <div>
                    <h2 className="text-base font-bold text-stone-900">Operations</h2>
                    <p className="text-xs font-medium text-stone-500">The lists your team picks from, partner teams, installers{isOn('deliveryBatches') ? ' and drivers' : ''}.</p>
                </div>
            </div>

            <ErrorBanner onRetry={load}>{loadError}</ErrorBanner>

            {loading ? <LoadingState label="Loading Operations…" /> : (
                <>
                    <SectionCard title="Teams and installers" icon={Users}>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {teamsOn && (
                                <StatTile icon={Building2} label={isOn('cpos') ? 'Partner offices & teams' : 'Partners & dealers'} value={teamParents.length}
                                    hint="See who works under each office." onClick={() => setOpen('teams')} />
                            )}
                            <StatTile icon={Wrench} label="Installers (vendors)" value={data.vendors.length}
                                hint={isOn('vendorLogin') ? 'Contact details and installer logins.' : 'The installers you assign jobs to.'} onClick={() => setOpen('vendors')} />
                            {isOn('deliveryBatches') && (
                                <StatTile icon={Truck} label="Drivers" value={data.drivers.length} hint="Offered on delivery batches." onClick={() => setOpen('drivers')} />
                            )}
                        </div>
                    </SectionCard>

                    <SectionCard title="Dropdown lists" subtitle="Add, rename, reorder or hide the choices people pick from." icon={Tag}>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {LISTS.map(list => (
                                <StatTile key={list.id} icon={list.icon} label={list.label} value={activeCount(list.id)} hint={`Used in ${list.usedIn}.`} onClick={() => setOpen(list.id)} />
                            ))}
                        </div>
                    </SectionCard>

                    {partnersOn && topPartners.length > 0 && (
                        <SectionCard title="Top channel partners" subtitle="By number of leads, excluding Trash." icon={Award}>
                            <ol className="space-y-3">
                                {topPartners.map(item => {
                                    const share = totalPartnerLeads ? (item.count / totalPartnerLeads) * 100 : 0;
                                    return (
                                        <li key={item.name}>
                                            <div className="mb-1 flex justify-between gap-3 text-xs font-bold text-stone-700">
                                                <span className="truncate">{item.name}</span>
                                                <span className="shrink-0 text-stone-500">{item.count} leads ({share.toFixed(0)}%)</span>
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                                                <div className="h-full rounded-full bg-amber-400" style={{ width: `${share}%` }} />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </SectionCard>
                    )}
                </>
            )}

            {openList && <ListModal list={openList} rows={rowsFor(openList.id)} currentUser={currentUser} onClose={() => setOpen(null)} onChanged={load} />}
            {open === 'teams' && <TeamsModal parents={teamParents} profiles={data.profiles} leadCounts={data.leadCounts} onClose={() => setOpen(null)} />}
            {open === 'vendors' && <VendorsModal vendors={data.vendors} vendorLogins={vendorLogins} currentUser={currentUser} onClose={() => setOpen(null)} onChanged={load} />}
            {open === 'drivers' && <DriversModal drivers={data.drivers} currentUser={currentUser} onClose={() => setOpen(null)} onChanged={load} />}
        </div>
    );
}
