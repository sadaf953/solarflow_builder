import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Pencil, Plus, Trash2, User, X } from 'lucide-react';
import { supabase } from '../supabase';
import { customerSource } from '../lib/db.js';
import { MONTH_NAMES, formatDate, todayIST } from '../lib/format.js';
import { ChoiceCards, EmptyState, ErrorBanner, Field, Input, LoadingState, Modal, SearchInput, Spinner, Textarea } from '../ui/index.js';
import { useGlobalPopup } from './GlobalPopup';

const EVENT_KINDS = [
    { value: 'event', label: 'Event', chip: 'bg-stone-100 text-stone-800 border-stone-300', dot: 'bg-stone-500' },
    { value: 'site_visit', label: 'Site visit', chip: 'bg-orange-100 text-orange-900 border-orange-300', dot: 'bg-orange-500' },
    { value: 'meeting', label: 'Meeting', chip: 'bg-blue-100 text-blue-900 border-blue-300', dot: 'bg-blue-500' },
    { value: 'follow_up', label: 'Follow-up', chip: 'bg-yellow-100 text-yellow-900 border-yellow-300', dot: 'bg-yellow-500' },
    { value: 'leave', label: 'Leave', chip: 'bg-purple-100 text-purple-900 border-purple-300', dot: 'bg-purple-500' },
    { value: 'unavailable', label: 'Not available', chip: 'bg-red-100 text-red-900 border-red-300', dot: 'bg-red-500' },
];
const KIND = Object.fromEntries(EVENT_KINDS.map(kind => [kind.value, kind]));
const kindOf = value => KIND[value] || KIND.event;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HEAD_OFFICE = ['admin', 'sales'];
const MAX_CHIPS = 3;

// Calendar days as 'YYYY-MM-DD' strings, counted in UTC so the device timezone never shifts them.
const dayDate = iso => new Date(`${iso}T00:00:00Z`);
const addDays = (iso, n) => {
    const date = dayDate(iso);
    date.setUTCDate(date.getUTCDate() + n);
    return date.toISOString().slice(0, 10);
};
const shiftMonth = (month, n) => {
    const [y, m] = month.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1 + n, 1));
    return date.toISOString().slice(0, 7);
};
const endOf = event => event.ends_on || event.starts_on;

function formatTime(value) {
    if (!value) return '';
    const [h, m] = String(value).split(':').map(Number);
    const suffix = h >= 12 ? 'pm' : 'am';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function timeRange(event) {
    if (!event.start_time) return 'All day';
    return event.end_time ? `${formatTime(event.start_time)} – ${formatTime(event.end_time)}` : formatTime(event.start_time);
}

function dateRange(event) {
    const start = formatDate(event.starts_on, 'short');
    return event.ends_on && event.ends_on !== event.starts_on ? `${start} – ${formatDate(event.ends_on, 'short')}` : start;
}

const blankForm = (date, isVendor) => ({
    id: null, title: '', kind: isVendor ? 'unavailable' : 'event', starts_on: date, ends_on: '',
    start_time: '', end_time: '', notes: '', customer: null, vendor_name: null,
});

const formFromEvent = event => ({
    id: event.id, title: event.title || '', kind: event.kind || 'event', starts_on: event.starts_on,
    ends_on: event.ends_on && event.ends_on !== event.starts_on ? event.ends_on : '',
    start_time: (event.start_time || '').slice(0, 5), end_time: (event.end_time || '').slice(0, 5),
    notes: event.notes || '', customer: event.customer?.id ? event.customer : null, vendor_name: event.vendor_name || null,
});

function formProblem(form) {
    if (!form.starts_on) return 'Pick a date.';
    if (form.ends_on && form.ends_on < form.starts_on) return 'The end date must be on or after the start date.';
    if (form.end_time && !form.start_time) return 'Add a start time, or clear the end time.';
    if (form.start_time && form.end_time && !form.ends_on && form.end_time < form.start_time) return 'The end time must be after the start time.';
    return '';
}

function EventChip({ event, onOpen }) {
    const kind = kindOf(event.kind);
    return (
        <button type="button" onClick={() => onOpen(event)} title={event.title}
            className={`flex w-full min-w-0 items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] font-semibold ${kind.chip}`}>
            {event.start_time && <span className="shrink-0 font-bold">{formatTime(event.start_time)}</span>}
            <span className="truncate">{event.title}</span>
        </button>
    );
}

function EventCard({ event, canEdit, onEdit, onDelete }) {
    const kind = kindOf(event.kind);
    return (
        <article className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-bold text-stone-900">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${kind.dot}`} aria-hidden="true" />
                        <span className="min-w-0 break-words">{event.title}</span>
                    </p>
                    <p className="mt-1 text-xs font-semibold text-stone-600">
                        {kind.label}{event.vendor_name ? ` · ${event.vendor_name}` : ''}
                    </p>
                </div>
                {canEdit && (
                    <div className="flex shrink-0">
                        <button type="button" onClick={() => onEdit(event)} aria-label={`Edit ${event.title}`}
                            className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-900">
                            <Pencil size={16} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => onDelete(event)} aria-label={`Delete ${event.title}`}
                            className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-500 hover:bg-red-50 hover:text-red-700">
                            <Trash2 size={16} aria-hidden="true" />
                        </button>
                    </div>
                )}
            </div>
            <dl className="mt-2 space-y-1 text-xs text-stone-600">
                <div className="flex items-center gap-1.5"><dt className="sr-only">When</dt><CalendarDays size={13} aria-hidden="true" /><dd>{dateRange(event)}</dd></div>
                <div className="flex items-center gap-1.5"><dt className="sr-only">Time</dt><Clock size={13} aria-hidden="true" /><dd>{timeRange(event)}</dd></div>
                {event.customer?.customer_name && (
                    <div className="flex items-center gap-1.5"><dt className="sr-only">Customer</dt><User size={13} aria-hidden="true" /><dd className="truncate">{event.customer.customer_name}</dd></div>
                )}
            </dl>
            {event.notes && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-stone-700">{event.notes}</p>}
            {event.created_by_name && <p className="mt-2 text-[11px] text-stone-500">Added by {event.created_by_name}</p>}
        </article>
    );
}

function CustomerPicker({ value, onChange, isCpo }) {
    const [term, setTerm] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const text = term.replace(/[,()]/g, ' ').trim();
        if (!text) { setResults([]); return; }
        let cancelled = false;
        setSearching(true);
        supabase.from(customerSource(isCpo))
            .select('id, customer_name, consumer_no, phone_number')
            .is('deleted_at', null)
            .or(`customer_name.ilike.%${text}%,consumer_no.ilike.%${text}%,phone_number.ilike.%${text}%`)
            .order('customer_name')
            .limit(8)
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) console.error('Customer search failed:', error);
                setResults(data || []);
                setSearching(false);
            });
        return () => { cancelled = true; };
    }, [term, isCpo]);

    if (value) {
        return (
            <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 pl-3.5">
                <span className="truncate text-sm font-semibold text-stone-900">{value.customer_name || 'Customer'}</span>
                <button type="button" onClick={() => onChange(null)} aria-label="Remove linked customer"
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-stone-500 hover:text-stone-900">
                    <X size={16} aria-hidden="true" />
                </button>
            </div>
        );
    }
    return (
        <div className="space-y-2">
            <SearchInput value={term} onChange={setTerm} label="Search customers" placeholder="Search name, consumer no, phone…" />
            {searching && <p className="flex items-center gap-2 text-xs text-stone-500"><Spinner size={12} /> Searching…</p>}
            {!searching && term && results.length === 0 && <p className="text-xs text-stone-500">No customers match.</p>}
            {results.length > 0 && (
                <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
                    {results.map(customer => (
                        <li key={customer.id}>
                            <button type="button" onClick={() => { onChange(customer); setTerm(''); }}
                                className="flex min-h-11 w-full flex-col items-start px-3.5 py-2 text-left hover:bg-orange-50">
                                <span className="text-sm font-semibold text-stone-900">{customer.customer_name || 'Unnamed customer'}</span>
                                <span className="text-[11px] text-stone-500">{[customer.consumer_no, customer.phone_number].filter(Boolean).join(' · ')}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function EventForm({ form, setForm, isCpo, isVendor, vendorName, error, idPrefix }) {
    const set = key => event => setForm(prev => ({ ...prev, [key]: event.target.value }));
    const id = name => `${idPrefix}-${name}`;
    return (
        <div className="space-y-4">
            <ErrorBanner>{error}</ErrorBanner>
            <Field label="What kind of entry?">
                <ChoiceCards columns={3} label="Kind" value={form.kind} onChange={kind => setForm(prev => ({ ...prev, kind }))}
                    options={EVENT_KINDS.map(kind => ({ value: kind.value, label: kind.label }))} />
            </Field>
            {isVendor && form.kind === 'unavailable' && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    The office will see that <strong>{vendorName}</strong> cannot take deliveries or installations on these days.
                </p>
            )}
            <Field label="Title" htmlFor={id('title')} required={!['unavailable', 'leave'].includes(form.kind)}
                hint={['unavailable', 'leave'].includes(form.kind) ? `Leave blank to show "${kindOf(form.kind).label}".` : undefined}>
                <Input id={id('title')} value={form.title} onChange={set('title')} maxLength={120} data-autofocus />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Date" htmlFor={id('start')} required>
                    <Input id={id('start')} type="date" value={form.starts_on} onChange={set('starts_on')} required />
                </Field>
                <Field label="Until (optional)" htmlFor={id('end')} hint="For entries that run over several days.">
                    <Input id={id('end')} type="date" value={form.ends_on} min={form.starts_on || undefined} onChange={set('ends_on')} />
                </Field>
                <Field label="Start time (optional)" htmlFor={id('start-time')} hint="Leave blank for all day.">
                    <Input id={id('start-time')} type="time" value={form.start_time} onChange={set('start_time')} />
                </Field>
                <Field label="End time (optional)" htmlFor={id('end-time')}>
                    <Input id={id('end-time')} type="time" value={form.end_time} onChange={set('end_time')} />
                </Field>
            </div>
            <Field label="Customer (optional)">
                <CustomerPicker value={form.customer} onChange={customer => setForm(prev => ({ ...prev, customer }))} isCpo={isCpo} />
            </Field>
            <Field label="Notes (optional)" htmlFor={id('notes')}>
                <Textarea id={id('notes')} value={form.notes} onChange={set('notes')} maxLength={1000} />
            </Field>
        </div>
    );
}

/**
 * Shared calendar. Everyone signed in sees every entry and can add their own;
 * the person who added an entry, or head office, can change or delete it.
 */
export default function CalendarView({ currentUser }) {
    const { showConfirm } = useGlobalPopup();
    const idPrefix = useId();
    const today = todayIST();
    const userType = currentUser?.userType || currentUser?.user_type;
    const isHeadOffice = HEAD_OFFICE.includes(userType);
    const isVendor = userType === 'vendor';
    const isCpo = userType === 'channel_partner_office';

    const [month, setMonth] = useState(today.slice(0, 7));
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [vendorName, setVendorName] = useState(currentUser?.name || '');
    const [dayOpen, setDayOpen] = useState(null);
    const [form, setForm] = useState(null);
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    // A vendor's calendar name is its vendors-directory name, which deliveries are assigned by.
    useEffect(() => {
        if (!isVendor || !currentUser?.id) return;
        let cancelled = false;
        supabase.from('vendors').select('name').eq('profile_id', currentUser.id).maybeSingle()
            .then(({ data }) => { if (!cancelled && data?.name) setVendorName(data.name); });
        return () => { cancelled = true; };
    }, [isVendor, currentUser?.id]);

    const grid = useMemo(() => {
        const first = `${month}-01`;
        const start = addDays(first, -dayDate(first).getUTCDay());
        const next = `${shiftMonth(month, 1)}-01`;
        const cells = Math.ceil((dayDate(next) - dayDate(start)) / 864e5 / 7) * 7;
        const days = Array.from({ length: cells }, (_, i) => addDays(start, i));
        return { start, end: days[days.length - 1], days };
    }, [month]);

    const load = useCallback(async () => {
        const { start, end } = grid;
        const { data, error } = await supabase
            .from('calendar_events')
            .select('*, customer:admin(id, customer_name)')
            .lte('starts_on', end)
            .or(`ends_on.gte.${start},and(ends_on.is.null,starts_on.gte.${start})`)
            .order('starts_on')
            .order('start_time', { ascending: true, nullsFirst: true });
        if (error) {
            console.error('Could not load the calendar:', error);
            setLoadError(error.message || 'Check your connection and try again.');
        } else {
            setLoadError('');
            setEvents(data || []);
        }
        setLoading(false);
    }, [grid]);

    useEffect(() => { setLoading(true); load(); }, [load]);

    useEffect(() => {
        const channel = supabase
            .channel(`calendar-events-${idPrefix}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => load())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [load, idPrefix]);

    const byDay = useMemo(() => {
        const map = {};
        for (const event of events) {
            const from = event.starts_on > grid.start ? event.starts_on : grid.start;
            const to = endOf(event) < grid.end ? endOf(event) : grid.end;
            for (let day = from; day <= to; day = addDays(day, 1)) (map[day] ||= []).push(event);
        }
        return map;
    }, [events, grid]);

    const monthDays = grid.days.filter(day => day.startsWith(month) && byDay[day]?.length);
    const canEdit = event => isHeadOffice || (event.created_by && event.created_by === currentUser?.id);
    const [year, monthNumber] = month.split('-').map(Number);

    const openNew = date => { setDayOpen(null); setFormError(''); setForm(blankForm(date || today, isVendor)); };
    const openEdit = event => { setDayOpen(null); setFormError(''); setForm(formFromEvent(event)); };
    const openEvent = event => (canEdit(event) ? openEdit(event) : setDayOpen(event.starts_on > grid.start ? event.starts_on : grid.start));

    async function save() {
        const problem = formProblem(form);
        if (problem) { setFormError(problem); return; }
        const title = form.title.trim() || (['unavailable', 'leave'].includes(form.kind) ? kindOf(form.kind).label : '');
        if (!title) { setFormError('Give the entry a title.'); return; }
        const row = {
            title, kind: form.kind, starts_on: form.starts_on,
            ends_on: form.ends_on && form.ends_on !== form.starts_on ? form.ends_on : null,
            start_time: form.start_time || null, end_time: form.start_time ? form.end_time || null : null,
            notes: form.notes.trim() || null, customer_id: form.customer?.id || null,
            vendor_name: form.kind === 'unavailable' ? form.vendor_name || (isVendor ? vendorName || null : null) : null,
            updated_at: new Date().toISOString(),
        };
        setSaving(true);
        setFormError('');
        const { data, error } = form.id
            ? await supabase.from('calendar_events').update(row).eq('id', form.id).select('id')
            : await supabase.from('calendar_events').insert({ ...row, created_by_name: currentUser?.name || null }).select('id');
        setSaving(false);
        if (error) { setFormError(error.message); return; }
        if (!data?.length) { setFormError('Only the person who added this entry, or head office, can change it.'); return; }
        setForm(null);
        load();
    }

    async function remove(event) {
        const ok = await showConfirm(`Delete "${event.title}" from the calendar?`, { title: 'Delete entry', confirmLabel: 'Delete', type: 'danger' });
        if (!ok) return;
        const { data, error } = await supabase.from('calendar_events').delete().eq('id', event.id).select('id');
        if (error || !data?.length) {
            const message = error?.message || 'Only the person who added this entry, or head office, can delete it.';
            if (form) setFormError(message);
            else setLoadError(message);
            return;
        }
        setForm(null);
        load();
    }

    const dayEvents = dayOpen ? byDay[dayOpen] || [] : [];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50">
                        <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                    <h2 className="min-w-40 text-center text-base font-bold text-stone-900" aria-live="polite">{MONTH_NAMES[monthNumber - 1]} {year}</h2>
                    <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50">
                        <ChevronRight size={18} aria-hidden="true" />
                    </button>
                    {month !== today.slice(0, 7) && (
                        <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="sf-btn-secondary ml-1 min-h-11">Today</button>
                    )}
                </div>
                <button type="button" onClick={() => openNew(month === today.slice(0, 7) ? today : `${month}-01`)} className="sf-btn-primary min-h-11">
                    <Plus size={16} aria-hidden="true" /> Add to calendar
                </button>
            </div>

            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-stone-600" aria-label="Colour key">
                {EVENT_KINDS.map(kind => (
                    <li key={kind.value} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${kind.dot}`} aria-hidden="true" />{kind.label}</li>
                ))}
            </ul>

            <ErrorBanner title="Calendar problem" onRetry={load}>{loadError}</ErrorBanner>

            {loading ? <LoadingState label="Loading calendar…" /> : (
                <>
                    <div className="hidden overflow-hidden rounded-2xl border border-stone-200 bg-white sm:block">
                        <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50">
                            {WEEKDAYS.map(day => <div key={day} className="py-2 text-center text-[11px] font-bold uppercase tracking-wider text-stone-500">{day}</div>)}
                        </div>
                        <div className="grid grid-cols-7">
                            {grid.days.map(day => {
                                const list = byDay[day] || [];
                                const inMonth = day.startsWith(month);
                                return (
                                    <div key={day} className={`min-h-28 border-b border-r border-stone-100 p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? 'bg-white' : 'bg-stone-50/70'}`}>
                                        <button type="button" onClick={() => setDayOpen(day)} aria-label={`${formatDate(day, 'long')}, ${list.length} ${list.length === 1 ? 'entry' : 'entries'}`}
                                            className={`mb-1 flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold hover:bg-orange-100 ${
                                                day === today ? 'bg-orange-500 text-stone-900' : inMonth ? 'text-stone-800' : 'text-stone-400'}`}>
                                            {Number(day.slice(8))}
                                        </button>
                                        <div className="space-y-1">
                                            {list.slice(0, MAX_CHIPS).map(event => <EventChip key={event.id} event={event} onOpen={openEvent} />)}
                                            {list.length > MAX_CHIPS && (
                                                <button type="button" onClick={() => setDayOpen(day)} className="px-1.5 text-[11px] font-bold text-stone-600 hover:text-stone-900">
                                                    +{list.length - MAX_CHIPS} more
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-4 sm:hidden">
                        {monthDays.length === 0 ? (
                            <EmptyState icon={CalendarDays} title="Nothing on the calendar this month">Tap “Add to calendar” to add a visit, meeting or day off.</EmptyState>
                        ) : monthDays.map(day => (
                            <section key={day} aria-label={formatDate(day, 'long')}>
                                <h3 className={`mb-2 text-xs font-bold uppercase tracking-wider ${day === today ? 'text-orange-700' : 'text-stone-500'}`}>
                                    {day === today ? 'Today · ' : ''}{new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' }).format(dayDate(day))} {formatDate(day, 'short')}
                                </h3>
                                <div className="space-y-2">
                                    {byDay[day].map(event => <EventCard key={event.id} event={event} canEdit={canEdit(event)} onEdit={openEdit} onDelete={remove} />)}
                                </div>
                            </section>
                        ))}
                    </div>
                </>
            )}

            <Modal open={Boolean(dayOpen)} onClose={() => setDayOpen(null)} title={dayOpen ? formatDate(dayOpen, 'long') : ''}
                footer={<button type="button" onClick={() => openNew(dayOpen)} className="sf-btn-primary min-h-11"><Plus size={16} aria-hidden="true" /> Add on this day</button>}>
                {dayEvents.length === 0
                    ? <p className="py-4 text-center text-sm text-stone-500">Nothing on this day yet.</p>
                    : <div className="space-y-2">{dayEvents.map(event => <EventCard key={event.id} event={event} canEdit={canEdit(event)} onEdit={openEdit} onDelete={remove} />)}</div>}
            </Modal>

            <Modal open={Boolean(form)} onClose={() => setForm(null)} busy={saving} size="lg"
                title={form?.id ? 'Edit calendar entry' : 'Add to calendar'}
                footer={(
                    <>
                        {form?.id && (
                            <button type="button" onClick={() => remove({ id: form.id, title: form.title || kindOf(form.kind).label })} disabled={saving}
                                className="sf-btn-secondary mr-auto min-h-11 text-red-700"><Trash2 size={16} aria-hidden="true" /> Delete</button>
                        )}
                        <button type="button" onClick={() => setForm(null)} disabled={saving} className="sf-btn-secondary min-h-11">Cancel</button>
                        <button type="button" onClick={save} disabled={saving} className="sf-btn-primary min-h-11">
                            {saving && <Spinner size={14} />} {form?.id ? 'Save changes' : 'Add'}
                        </button>
                    </>
                )}>
                {form && <EventForm form={form} setForm={setForm} isCpo={isCpo} isVendor={isVendor} vendorName={vendorName} error={formError} idPrefix={idPrefix} />}
            </Modal>
        </div>
    );
}
