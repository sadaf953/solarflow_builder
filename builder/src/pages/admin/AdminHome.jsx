import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { formatDate } from '../../../../template/src/lib/format.js';
import { Badge, EmptyState, ErrorBanner, FilterBar, LoadingState, SearchInput, Select, useRefreshOnFocus } from '../../../../template/src/ui/index.js';
import { adminList } from '../../api.js';
import { INVITE_STATUS, statusInfo } from './inviteStatus.js';

const STATUS_OPTIONS = [{ value: 'active', label: 'Not archived' }, ...Object.entries(INVITE_STATUS).map(([value, { label }]) => ({ value, label }))];

const matches = (row, query) => !query || [row.company, row.contact?.name, row.contact?.phone, row.contact?.email]
    .some(value => String(value || '').toLowerCase().includes(query));

export function AdminHome() {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('active');

    const load = useCallback(() => {
        adminList().then(list => { setRows(list); setError(''); }).catch(err => setError(err.message));
    }, []);
    useEffect(load, [load]);
    useRefreshOnFocus(load, { throttleMs: 15000 });

    const shown = useMemo(() => {
        const text = query.trim().toLowerCase();
        return (rows || []).filter(row => (status === 'active' ? row.status !== 'archived' : !status || row.status === status) && matches(row, text));
    }, [rows, query, status]);

    return (
        <div className="space-y-5">
            <h1 className="text-2xl font-bold text-stone-900">Clients</h1>
            <FilterBar>
                <SearchInput value={query} onChange={setQuery} label="Search clients" placeholder="Search company, name, phone or email" className="sm:flex-1" />
                <Select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)} placeholder="All" options={STATUS_OPTIONS} className="sm:w-56" />
            </FilterBar>
            <ErrorBanner onRetry={load}>{error}</ErrorBanner>
            {!rows && !error && <LoadingState />}
            {rows && !shown.length && (
                <EmptyState title={rows.length ? 'No client matches' : 'No invites yet'}
                    action={!rows.length && <a href="#/admin/new" className="sf-btn-primary min-h-11"><Plus size={14} aria-hidden="true" /> New invite</a>}>
                    {rows.length ? 'Change the search or the status filter.' : 'Create an invite and send the link to your client.'}
                </EmptyState>
            )}
            {shown.length > 0 && (
                <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                    {shown.map(row => {
                        const info = statusInfo(row.status);
                        return (
                            <li key={row.id}>
                                <a href={`#/admin/i/${row.id}`} className="flex min-h-11 items-center gap-3 px-4 py-3 hover:bg-stone-50">
                                    <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-2">
                                            <span className="font-bold text-stone-900">{row.company || 'No company name'}</span>
                                            <Badge tone={info.tone}>{info.label}</Badge>
                                        </span>
                                        <span className="mt-0.5 block truncate text-xs text-stone-500">
                                            {[row.contact?.name, row.contact?.phone].filter(Boolean).join(' · ') || 'No contact'}
                                            {' · '}{row.submitted_at ? `submitted ${formatDate(row.submitted_at, 'short')}` : `created ${formatDate(row.created_at, 'short')}`}
                                        </span>
                                    </span>
                                    <ChevronRight size={18} className="shrink-0 text-stone-400" aria-hidden="true" />
                                </a>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
