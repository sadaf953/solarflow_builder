import { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, CalendarPlus, Check, CheckCheck, CheckCircle2, ChevronLeft, ChevronRight, Download, Users, X, XCircle } from 'lucide-react';
import { isOn } from '../config/index.js';
import { logActivity } from '../utils';
import { downloadBlob } from '../lib/download.js';
import { MONTH_NAMES, formatDate, todayIST } from '../lib/format.js';
import {
    EmptyState, ErrorBanner, Field, Input, LoadingState, Modal, SearchInput, Spinner, StatTile, SuccessBanner, TagPicker, Textarea, useRefreshOnFocus,
} from '../ui/index.js';
import {
    ATTENDANCE_STATUSES, MARKABLE_STATUSES, MAX_REQUEST_DAYS, attendanceCsv, datesBetween, fetchAttendance, fetchOfficeStaff,
    fetchPendingRequests, isPendingStatus, markStaffPresent, presentWeight, requestOwnAttendance, reviewRequests, setStaffAttendance,
} from '../utils/staffAttendance';

const HEAD_OFFICE = ['admin', 'sales'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_OPTIONS = MARKABLE_STATUSES.map(id => ({ id, label: ATTENDANCE_STATUSES[id].label }));

const dayDate = iso => new Date(`${iso}T00:00:00Z`);
const addDays = (iso, n) => {
    const date = dayDate(iso);
    date.setUTCDate(date.getUTCDate() + n);
    return date.toISOString().slice(0, 10);
};
const weekStart = iso => addDays(iso, -((dayDate(iso).getUTCDay() + 6) % 7)); // Monday
const shiftMonth = (iso, n) => {
    const [y, m] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};
const shortDay = iso => `${Number(iso.slice(8))} ${MONTH_NAMES[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;

// Consecutive days of one person's request show as one card.
function groupRequests(rows) {
    const sorted = [...rows].sort((a, b) => a.staff_name.localeCompare(b.staff_name) || a.status.localeCompare(b.status) || a.date.localeCompare(b.date));
    const groups = [];
    for (const row of sorted) {
        const last = groups[groups.length - 1];
        if (last && last.staff_name === row.staff_name && last.status === row.status && last.notes === row.notes && addDays(last.end, 1) === row.date) {
            last.end = row.date;
            last.rows.push(row);
        } else {
            groups.push({ key: row.id, staff_name: row.staff_name, status: row.status, notes: row.notes, start: row.date, end: row.date, rows: [row] });
        }
    }
    return groups.sort((a, b) => a.start.localeCompare(b.start));
}

function StatusChip({ status, compact }) {
    const cfg = ATTENDANCE_STATUSES[status];
    if (!cfg) return <span className="text-stone-300" aria-label="Not marked">–</span>;
    return (
        <span className={`inline-flex items-center justify-center rounded-lg border font-bold ${compact ? 'h-7 min-w-7 px-1 text-[10px]' : 'min-w-14 px-2 py-1 text-[11px]'} ${cfg.bg}`}>
            {compact ? cfg.short : cfg.label}
        </span>
    );
}

export default function AttendanceView({ currentUser }) {
    const today = todayIST();
    const userType = currentUser?.userType || currentUser?.user_type;
    const isHeadOffice = HEAD_OFFICE.includes(userType);
    const markedBy = currentUser?.name || '';

    const [viewMode, setViewMode] = useState('week');
    const [anchor, setAnchor] = useState(today);
    const [staff, setStaff] = useState([]);
    const [rows, setRows] = useState([]);
    const [pending, setPending] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);
    const [cell, setCell] = useState(null);
    const [request, setRequest] = useState(null);
    const [requestError, setRequestError] = useState('');

    const days = useMemo(() => {
        if (viewMode === 'week') return datesBetween(weekStart(anchor), addDays(weekStart(anchor), 6));
        const first = `${anchor.slice(0, 7)}-01`;
        return datesBetween(first, addDays(shiftMonth(first, 1), -1));
    }, [viewMode, anchor]);

    const self = useMemo(() => (currentUser?.id ? { id: currentUser.id, name: String(currentUser.name || '').trim(), role: currentUser.role || '' } : null), [currentUser?.id, currentUser?.name, currentUser?.role]);

    const load = useCallback(async () => {
        try {
            const [staffList, attendance, requests] = await Promise.all([
                isHeadOffice ? fetchOfficeStaff() : Promise.resolve(self?.name ? [self] : []),
                fetchAttendance(days[0], days[days.length - 1]),
                isHeadOffice ? fetchPendingRequests() : Promise.resolve([]),
            ]);
            setStaff(staffList);
            setRows(attendance);
            setPending(requests);
            setError('');
        } catch (err) {
            console.error('Could not load attendance:', err);
            setError(err.message || 'Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, [isHeadOffice, self, days]);

    useEffect(() => { load(); }, [load]);
    useRefreshOnFocus(load);

    // Rows are matched to people by login id, or by name for rows without one.
    const statusByKey = useMemo(() => {
        const map = new Map();
        for (const row of rows) {
            if (row.user_id) map.set(`${row.user_id}|${row.date}`, row);
            map.set(`name:${row.staff_name.toLowerCase()}|${row.date}`, row);
        }
        return map;
    }, [rows]);
    const entryFor = useCallback((person, day) => statusByKey.get(`${person.id}|${day}`) || statusByKey.get(`name:${person.name.toLowerCase()}|${day}`), [statusByKey]);
    const statusOf = useCallback((person, day) => entryFor(person, day)?.status, [entryFor]);

    const filteredStaff = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? staff.filter(p => `${p.name} ${p.role}`.toLowerCase().includes(q)) : staff;
    }, [staff, search]);

    const todayCounts = useMemo(() => {
        const tally = { present: 0, on_duty: 0, away: 0 };
        for (const person of staff) {
            const status = statusOf(person, today);
            if (status === 'present') tally.present += 1;
            else if (status === 'on_duty') tally.on_duty += 1;
            else if (['absent', 'leave', 'half_day', 'holiday'].includes(status)) tally.away += 1;
        }
        return tally;
    }, [staff, statusOf, today]);

    const pendingGroups = useMemo(() => groupRequests(pending), [pending]);
    const say = text => { setNotice(text); setTimeout(() => setNotice(current => (current === text ? '' : current)), 4000); };

    async function run(action, success) {
        setBusy(true);
        setError('');
        try {
            await action();
            if (success) say(success);
            await load();
            return true;
        } catch (err) {
            console.error('Attendance change failed:', err);
            setError(err.message || 'The change was not saved.');
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function applyStatus(status) {
        const { person, day } = cell;
        const ok = await run(() => setStaffAttendance({ staff: person, date: day, status, notes: cell.notes, markedBy }));
        if (!ok) return;
        setCell(null);
        const label = status ? ATTENDANCE_STATUSES[status].label : 'not marked';
        logActivity(currentUser?.id, 'attendance', `Attendance: ${person.name} set to ${label} for ${formatDate(day, 'short')}`, cell.notes ? `Notes: ${cell.notes}` : '');
    }

    async function markAllPresent() {
        const unmarked = staff.filter(person => !statusOf(person, today));
        if (!unmarked.length) { say('Everyone already has an entry for today.'); return; }
        const ok = await run(() => markStaffPresent(unmarked, today, markedBy), `${unmarked.length} marked present for today.`);
        if (ok) logActivity(currentUser?.id, 'attendance', `Attendance: ${unmarked.length} staff marked present for ${formatDate(today, 'short')}`, '');
    }

    async function review(group, approve) {
        const ok = await run(() => reviewRequests(group.rows, approve, markedBy),
            `${approve ? 'Approved' : 'Rejected'}: ${group.staff_name}, ${group.start === group.end ? formatDate(group.start, 'short') : `${formatDate(group.start, 'short')} – ${formatDate(group.end, 'short')}`}.`);
        if (ok) logActivity(currentUser?.id, 'attendance', `${approve ? 'Approved' : 'Rejected'} ${ATTENDANCE_STATUSES[group.status].label.toLowerCase()} for ${group.staff_name}`, `${group.start} to ${group.end}`);
    }

    async function submitRequest() {
        const { kind, start, end, notes } = request;
        if (!self?.name) { setRequestError('Your profile has no name. Ask head office to add one.'); return; }
        const last = kind === 'leave' ? end || start : today;
        if (!start || last < start) { setRequestError('The end date must be on or after the start date.'); return; }
        const dates = datesBetween(kind === 'leave' ? start : today, last);
        if (dates.length > MAX_REQUEST_DAYS) { setRequestError(`Ask for at most ${MAX_REQUEST_DAYS} days at a time.`); return; }
        setBusy(true);
        setRequestError('');
        try {
            const status = kind === 'leave' ? 'holiday_request' : 'pending_present';
            const { saved, skipped } = isHeadOffice && kind === 'present'
                ? await setStaffAttendance({ staff: self, date: today, status: 'present', notes, markedBy }).then(() => ({ saved: [today], skipped: [] }))
                : await requestOwnAttendance({ user: self, dates, status, notes });
            setRequest(null);
            const skippedText = skipped.length ? ` ${skipped.length} ${skipped.length === 1 ? 'day was' : 'days were'} already marked by the office and left as they are.` : '';
            say(saved.length
                ? `${kind === 'leave' ? 'Leave request sent' : isHeadOffice ? 'Marked present for today' : 'Check-in sent'}${isHeadOffice && kind === 'present' ? '' : ' for approval'}.${skippedText}`
                : `Nothing was sent.${skippedText}`);
            if (saved.length) logActivity(currentUser?.id, 'attendance', `${self.name}: ${kind === 'leave' ? 'leave requested' : 'checked in'} (${saved[0]}${saved.length > 1 ? ` to ${saved[saved.length - 1]}` : ''})`, notes ? `Notes: ${notes}` : '');
            await load();
        } catch (err) {
            console.error('Attendance request failed:', err);
            setRequestError(err.message || 'The request was not sent.');
        } finally {
            setBusy(false);
        }
    }

    function exportCsv() {
        const period = viewMode === 'week' ? `${days[0]}_to_${days[days.length - 1]}` : anchor.slice(0, 7);
        downloadBlob(attendanceCsv(filteredStaff, days, statusOf), 'text/csv;charset=utf-8', `attendance_${period}.csv`);
    }

    const step = n => setAnchor(viewMode === 'week' ? addDays(anchor, 7 * n) : shiftMonth(anchor, n));
    const periodLabel = viewMode === 'week'
        ? `${shortDay(days[0])} – ${shortDay(days[6])} ${days[6].slice(0, 4)}`
        : `${MONTH_NAMES[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`;
    const compact = viewMode === 'month';
    const inPeriod = days.includes(today);
    const openRequest = kind => { setRequestError(''); setRequest({ kind, start: kind === 'leave' ? addDays(today, 1) : today, end: '', notes: '' }); };

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-base font-bold text-stone-900">Attendance</h2>
                    <p className="text-xs text-stone-600">
                        {isHeadOffice ? 'Tap a day to mark it. Check-ins and leave requests from staff wait for your approval.' : 'Check in for today or ask for leave. Head office approves both.'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {isHeadOffice && (
                        <button type="button" onClick={markAllPresent} disabled={busy || !staff.length} className="sf-btn-success min-h-11 disabled:opacity-50">
                            <CheckCircle2 size={14} aria-hidden="true" /> Mark everyone present today
                        </button>
                    )}
                    <button type="button" onClick={() => openRequest('present')} disabled={busy} className="sf-btn-secondary min-h-11">
                        <CheckCheck size={14} aria-hidden="true" /> Check in today
                    </button>
                    <button type="button" onClick={() => openRequest('leave')} disabled={busy} className="sf-btn-secondary min-h-11">
                        <CalendarPlus size={14} aria-hidden="true" /> Ask for leave
                    </button>
                    {isOn('dataExports') && isHeadOffice && (
                        <button type="button" onClick={exportCsv} disabled={!filteredStaff.length} className="sf-btn-secondary min-h-11">
                            <Download size={14} aria-hidden="true" /> Export CSV
                        </button>
                    )}
                </div>
            </div>

            <ErrorBanner onRetry={load}>{error}</ErrorBanner>
            <SuccessBanner>{notice}</SuccessBanner>

            {isHeadOffice && pendingGroups.length > 0 && (
                <section aria-labelledby="attendance-pending" className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                    <h3 id="attendance-pending" className="text-xs font-bold uppercase tracking-wider text-amber-950">Waiting for approval ({pendingGroups.length})</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                        {pendingGroups.map(group => (
                            <div key={group.key} className="flex flex-col justify-between gap-2 rounded-xl border border-amber-200 bg-white p-3">
                                <div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-bold text-stone-900">{group.staff_name}</span>
                                        <StatusChip status={group.status} />
                                    </div>
                                    <p className="mt-1 text-xs text-stone-600">
                                        {group.start === group.end ? formatDate(group.start, 'short') : `${formatDate(group.start, 'short')} – ${formatDate(group.end, 'short')} (${group.rows.length} days)`}
                                    </p>
                                    {group.notes && <p className="mt-1.5 rounded-lg bg-stone-50 p-2 text-xs text-stone-700">{group.notes}</p>}
                                </div>
                                <div className="flex justify-end gap-2 border-t border-stone-100 pt-2">
                                    <button type="button" onClick={() => review(group, false)} disabled={busy} className="sf-btn-secondary min-h-11 text-rose-700">
                                        <X size={14} aria-hidden="true" /> Reject
                                    </button>
                                    <button type="button" onClick={() => review(group, true)} disabled={busy} className="sf-btn-success min-h-11 disabled:opacity-50">
                                        <Check size={14} aria-hidden="true" /> Approve
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {isHeadOffice && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatTile icon={Users} tone="stone" label="Staff" value={staff.length} />
                    <StatTile icon={CheckCircle2} tone="green" label="Present today" value={todayCounts.present} />
                    <StatTile icon={Briefcase} tone="orange" label="On duty today" value={todayCounts.on_duty} />
                    <StatTile icon={XCircle} tone="red" label="Away today" hint="Absent, leave, half day or holiday" value={todayCounts.away} />
                </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => step(-1)} aria-label={viewMode === 'week' ? 'Previous week' : 'Previous month'}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50">
                        <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                    <p className="min-w-44 text-center text-sm font-bold text-stone-900" aria-live="polite">{periodLabel}</p>
                    <button type="button" onClick={() => step(1)} aria-label={viewMode === 'week' ? 'Next week' : 'Next month'}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50">
                        <ChevronRight size={18} aria-hidden="true" />
                    </button>
                    {!inPeriod && <button type="button" onClick={() => setAnchor(today)} className="sf-btn-secondary ml-1 min-h-11">Today</button>}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {isHeadOffice && <SearchInput value={search} onChange={setSearch} label="Search staff" placeholder="Search staff…" className="sm:w-56" />}
                    <div className="w-full sm:w-48">
                        <TagPicker label="Show" columns={2} value={viewMode} onChange={setViewMode}
                            options={[{ id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }]} />
                    </div>
                </div>
            </div>

            {loading ? <LoadingState label="Loading attendance…" /> : filteredStaff.length === 0 ? (
                <EmptyState icon={Users} title={search ? 'No staff match your search' : 'No staff to show'}>
                    {isHeadOffice && !search ? 'Head-office logins (admin and office staff) appear here once they are added under Staff.' : null}
                </EmptyState>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-xs">
                            <thead>
                                <tr className="border-b border-stone-200 bg-stone-50 font-bold text-stone-600">
                                    <th scope="col" className="sticky left-0 z-10 min-w-40 border-r border-stone-200 bg-stone-50 p-3">Staff</th>
                                    {days.map(day => {
                                        const weekday = dayDate(day).getUTCDay();
                                        return (
                                            <th key={day} scope="col" className={`border-r border-stone-200 p-2 text-center ${compact ? 'min-w-10' : 'min-w-20'} ${day === today ? 'bg-orange-100 text-orange-900' : weekday === 0 ? 'text-rose-600' : ''}`}>
                                                <span className="block text-[10px] font-semibold uppercase text-stone-500">{WEEKDAYS[weekday]}</span>
                                                <span className="block font-bold">{compact ? Number(day.slice(8)) : shortDay(day)}</span>
                                            </th>
                                        );
                                    })}
                                    <th scope="col" className="min-w-16 p-2 text-center">Present</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {filteredStaff.map(person => (
                                    <tr key={person.id || person.name}>
                                        <th scope="row" className="sticky left-0 z-10 border-r border-stone-200 bg-white p-3 font-normal">
                                            <span className="block truncate font-bold text-stone-900">{person.name}</span>
                                            {person.role && <span className="block truncate text-[11px] text-stone-500">{person.role}</span>}
                                        </th>
                                        {days.map(day => {
                                            const entry = entryFor(person, day);
                                            const label = `${person.name}, ${formatDate(day, 'long')}: ${ATTENDANCE_STATUSES[entry?.status]?.label || 'not marked'}`;
                                            return (
                                                <td key={day} className={`border-r border-stone-100 p-1 text-center ${day === today ? 'bg-orange-50/50' : ''}`}>
                                                    {isHeadOffice ? (
                                                        <button type="button" aria-label={`${label}. Change`} title={entry?.notes || undefined}
                                                            onClick={() => setCell({ person, day, notes: entry?.notes || '', status: entry?.status || null })}
                                                            className="flex min-h-11 w-full items-center justify-center rounded-lg hover:bg-stone-100">
                                                            <StatusChip status={entry?.status} compact={compact} />
                                                        </button>
                                                    ) : (
                                                        <span className="flex min-h-11 items-center justify-center" aria-label={label} title={entry?.notes || undefined}>
                                                            <StatusChip status={entry?.status} compact={compact} />
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td className="bg-emerald-50/40 p-2 text-center font-bold text-emerald-800">
                                            {days.reduce((sum, day) => sum + presentWeight(statusOf(person, day)), 0)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <ul className="flex flex-wrap gap-2 text-[11px]" aria-label="Key">
                {Object.values(ATTENDANCE_STATUSES).map(cfg => (
                    <li key={cfg.id} className="flex items-center gap-1.5"><StatusChip status={cfg.id} compact /> <span className="text-stone-600">{cfg.label}</span></li>
                ))}
            </ul>

            <Modal open={Boolean(cell)} onClose={() => setCell(null)} busy={busy} size="sm"
                title={cell ? `${cell.person.name} · ${formatDate(cell.day, 'short')}` : ''}
                footer={cell?.status && (
                    <button type="button" onClick={() => applyStatus(null)} disabled={busy} className="sf-btn-secondary mr-auto min-h-11">Clear this day</button>
                )}>
                {cell && (
                    <div className="space-y-4">
                        {isPendingStatus(cell.status) && (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                {cell.person.name} asked for <strong>{ATTENDANCE_STATUSES[cell.status].label.toLowerCase()}</strong>. Pick a status to decide.
                            </p>
                        )}
                        <Field label="Notes (optional)" htmlFor="attendance-notes">
                            <Input id="attendance-notes" value={cell.notes} maxLength={200} onChange={e => setCell(prev => ({ ...prev, notes: e.target.value }))} />
                        </Field>
                        <TagPicker label="Status" columns={2} options={STATUS_OPTIONS} value={cell.status} disabled={busy} onChange={applyStatus} />
                        {busy && <p className="flex items-center gap-2 text-xs text-stone-500"><Spinner size={12} /> Saving…</p>}
                    </div>
                )}
            </Modal>

            <Modal open={Boolean(request)} onClose={() => setRequest(null)} busy={busy} size="sm"
                title={request?.kind === 'leave' ? 'Ask for leave' : 'Check in for today'}
                footer={(
                    <>
                        <button type="button" onClick={() => setRequest(null)} disabled={busy} className="sf-btn-secondary min-h-11">Cancel</button>
                        <button type="button" onClick={submitRequest} disabled={busy} className="sf-btn-primary min-h-11">
                            {busy && <Spinner size={14} />} {request?.kind === 'leave' ? 'Send request' : isHeadOffice ? 'Mark present' : 'Send check-in'}
                        </button>
                    </>
                )}>
                {request && (
                    <div className="space-y-4">
                        <ErrorBanner>{requestError}</ErrorBanner>
                        {request.kind === 'leave' ? (
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="From" htmlFor="leave-start" required>
                                    <Input id="leave-start" type="date" value={request.start} onChange={e => setRequest(prev => ({ ...prev, start: e.target.value }))} />
                                </Field>
                                <Field label="Until" htmlFor="leave-end" hint="Leave blank for one day.">
                                    <Input id="leave-end" type="date" value={request.end} min={request.start || undefined} onChange={e => setRequest(prev => ({ ...prev, end: e.target.value }))} />
                                </Field>
                            </div>
                        ) : (
                            <p className="text-sm text-stone-700">{self?.name}, {formatDate(today, 'long')}.</p>
                        )}
                        <Field label={request.kind === 'leave' ? 'Reason (optional)' : 'Notes (optional)'} htmlFor="request-notes">
                            <Textarea id="request-notes" rows={2} value={request.notes} maxLength={300}
                                onChange={e => setRequest(prev => ({ ...prev, notes: e.target.value }))} />
                        </Field>
                    </div>
                )}
            </Modal>
        </div>
    );
}
