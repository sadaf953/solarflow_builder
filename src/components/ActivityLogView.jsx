// ─── ActivityLogView.jsx ──────────────────────────────────────────────────────
// Full-page activity log.
//
// activity_log was removed from the `supabase_realtime` publication: it gets an
// INSERT on EVERY action by EVERY user, making it the highest-volume WAL
// producer in the system, and it was being decoded continuously for a page that
// is almost never open. realtime.list_changes was consuming 61% of database CPU.
//
// This page now refreshes on demand instead: when you open it, when you return
// to the tab, and via the Refresh button. If the table is put back into the
// publication the live path below picks up again automatically.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../supabase';
import { Activity, RefreshCw } from 'lucide-react';
import { ACTION_COLORS } from '../constants';

const ACTION_FILTER_OPTIONS = [
    { value: 'all', label: 'All activities' },
    { value: 'attendance', label: 'Staff Attendance' },
    { value: 'operations', label: 'Operations & Directory' },
    { value: 'vendor', label: 'Vendor Availability' },
    { value: 'payment', label: 'Installation Payments' },
    { value: 'dispatch', label: 'Delivery & Dispatch' },
    { value: 'stage_change', label: 'Stage Transitions' },
    { value: 'create', label: 'Creations' },
    { value: 'update', label: 'Updates & Edits' },
    { value: 'delete', label: 'Deletions' },
    { value: 'email', label: 'Emails' },
    { value: 'error_occurred', label: 'Errors' }
];

export default function ActivityLogView() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastLoadedAt, setLastLoadedAt] = useState(null);
    const inFlight = useRef(false);
    // Mirrors `logs` so fetchLogs can read the current offset without
    // taking `logs` as a dependency (which would rebuild it on every load).
    const logsRef = useRef([]);

    // Who to show. Filtering happens SERVER-side: filtering the 200 already
    // fetched would show only that user's share of the newest 200 overall -
    // for a quiet user, usually nothing at all. With .eq() you get their
    // latest 200, which is what "filter by user" has to mean.
    const [userFilter, setUserFilter] = useState('all');   // 'all' | 'unattributed' | <profile id>
    const [actionFilter, setActionFilter] = useState('all');
    const [allProfiles, setAllProfiles] = useState([]);              // [{ id, name }]
    const actorNames = useMemo(() => new Map(allProfiles.map(p => [p.id, p.name])), [allProfiles]);

    // Group unique names so each person appears only once in the dropdown
    const uniqueActors = useMemo(() => {
        const map = new Map();
        for (const p of allProfiles) {
            const name = (p.name || '').trim();
            if (!name) continue;
            if (!map.has(name)) {
                map.set(name, { name, ids: [p.id] });
            } else {
                map.get(name).ids.push(p.id);
            }
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [allProfiles]);

    // Paging. PAGE_SIZE at a time; `hasMore` is true while the last page came
    // back full, which is the only reliable signal without a count query.
    const PAGE_SIZE = 75;
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    // `append` loads the NEXT page and keeps what is already on screen.
    // Paging is server-side via .range(), and the filters are part of the same
    // query - so "load more" respects whatever filter is active rather than
    // pulling 200 unfiltered rows and hiding most of them.
    const fetchLogs = useCallback(async ({ silent = false, append = false } = {}) => {
        if (inFlight.current) return;      // never stack refreshes
        inFlight.current = true;
        if (append) setLoadingMore(true);
        else if (!silent) setRefreshing(true);
        try {
            const from = append ? logsRef.current.length : 0;

            let query = supabase
                .from('activity_log')
                .select('id, user_id, customer_id, action, message, new_value, created_at')
                .order('created_at', { ascending: false })
                .range(from, from + PAGE_SIZE - 1);

            if (userFilter === 'unattributed') {
                query = query.is('user_id', null);
            } else if (userFilter !== 'all') {
                const matched = uniqueActors.find(a => a.name === userFilter);
                if (matched?.ids?.length === 1) {
                    query = query.eq('user_id', matched.ids[0]);
                } else if (matched?.ids?.length > 1) {
                    query = query.in('user_id', matched.ids);
                }
            }

            if (actionFilter !== 'all') query = query.eq('action', actionFilter);

            const { data, error } = await query;
            if (!error) {
                const page = data || [];
                setLogs(prev => {
                    if (!append) return page;
                    // De-duplicate: a row inserted while paging would otherwise
                    // shift the window and appear twice.
                    const seen = new Set(prev.map(l => l.id));
                    return [...prev, ...page.filter(l => !seen.has(l.id))];
                });
                setHasMore(page.length === PAGE_SIZE);
                setLastLoadedAt(new Date());
            } else {
                console.error('Failed to load activity log:', error);
            }
        } finally {
            inFlight.current = false;
            setLoadingMore(false);
            setRefreshing(false);
            setLoading(false);
        }
    }, [userFilter, actionFilter, uniqueActors]);

    useEffect(() => { logsRef.current = logs; }, [logs]);

    useEffect(() => { fetchLogs({ silent: true }); }, [fetchLogs]);

    // Load profiles to resolve names and populate actor list
    useEffect(() => {
        let cancelled = false;
        supabase.from('profiles').select('id, name').order('name').then(({ data, error }) => {
            if (!cancelled && !error) setAllProfiles(data || []);
        });
        return () => { cancelled = true; };
    }, []);

    // Refresh when the operator comes back to the tab - covers the common case
    // (leave it open, come back later) at no idle cost.
    useEffect(() => {
        const onFocus = () => { if (document.visibilityState === 'visible') fetchLogs({ silent: true }); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [fetchLogs]);

    // Still honours realtime IF activity_log is in the publication. When it is
    // not, this subscribes and simply never fires - no errors, no polling.
    useEffect(() => {
        const channel = supabase.channel('activity_log_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, async (payload) => {
                const { data } = await supabase
                    .from('activity_log')
                    .select('id, user_id, customer_id, action, message, new_value, created_at')
                    .eq('id', payload.new.id)
                    .single();
                if (!data) return;
                // Do not let a live insert bypass the active filter.
                const matched = uniqueActors.find(a => a.name === userFilter);
                const matchesUser = userFilter === 'all'
                    || (userFilter === 'unattributed' ? data.user_id === null : matched?.ids?.includes(data.user_id));
                const matchesAction = actionFilter === 'all' || data.action === actionFilter;
                if (!matchesUser || !matchesAction) return;
                setLogs(prev => [data, ...prev.filter(l => l.id !== data.id)]);
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [userFilter, actionFilter, uniqueActors]);

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-stone-900 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex flex-wrap items-center gap-2 pb-1">
                <select
                    value={userFilter}
                    onChange={e => setUserFilter(e.target.value)}
                    className="bg-white border border-stone-200 rounded-xl px-3 py-1.5 text-[11px] font-bold text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer shadow-xs max-w-[190px]"
                >
                    <option value="all">Everyone</option>
                    {uniqueActors.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                    <option value="unattributed">System / unattributed</option>
                </select>

                <select
                    value={actionFilter}
                    onChange={e => setActionFilter(e.target.value)}
                    className="bg-white border border-stone-200 rounded-xl px-3 py-1.5 text-[11px] font-bold text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer shadow-xs"
                >
                    {ACTION_FILTER_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>

                {(userFilter !== 'all' || actionFilter !== 'all') && (
                    <button
                        type="button"
                        onClick={() => { setUserFilter('all'); setActionFilter('all'); }}
                        className="text-[11px] font-bold text-stone-500 hover:text-amber-600 underline underline-offset-2 cursor-pointer"
                    >
                        Clear
                    </button>
                )}

                <p className="text-[11px] font-medium text-stone-400 ml-auto">
                    {lastLoadedAt
                        ? `${logs.length} loaded · updated ${lastLoadedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                        : `${logs.length} loaded`}
                </p>
                <button
                    type="button"
                    onClick={() => fetchLogs()}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-3 py-1.5 text-[11px] font-bold text-stone-600 hover:text-amber-600 hover:border-amber-200 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                    <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>
            {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-stone-400">
                    <Activity className="w-12 h-12 mb-3 text-stone-300" />
                    <p className="font-medium text-stone-500">
                        {userFilter === 'all' && actionFilter === 'all'
                            ? 'No activity logged yet'
                            : 'No activity matches these filters'}
                    </p>
                    {(userFilter !== 'all' || actionFilter !== 'all') && (
                        <p className="text-[11px] mt-1">
                            {userFilter !== 'all'
                                ? `${userFilter} has no matching entries.`
                                : 'Try a different action type.'}
                        </p>
                    )}
                </div>
            ) : logs.map(log => (
                <div key={log.id} className="bg-white rounded-xl p-4 border border-stone-100 shadow-sm flex items-start gap-3">
                    {(() => {
                        const c = ACTION_COLORS[log.action] || { bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-200' };
                        const label = ACTION_COLORS[log.action]?.label || log.action?.replace('_', ' ');
                        return (
                            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider flex-shrink-0 border ${c.bg} ${c.text} ${c.border || ''}`}>
                                {label}
                            </span>
                        );
                    })()}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm text-stone-800">{log.message}</p>
                        {log.new_value && <p className="text-xs text-stone-500 mt-0.5">{log.new_value}</p>}
                        <p className="text-[10px] text-stone-400 mt-1 font-bold uppercase">
                            {actorNames.get(log.user_id) || (log.user_id ? 'Unknown' : 'System')} • {new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                    </div>
                </div>
            ))}

            {logs.length > 0 && (
                <div className="pt-1 pb-2 flex flex-col items-center gap-1.5">
                    {hasMore ? (
                        <button
                            type="button"
                            onClick={() => fetchLogs({ append: true })}
                            disabled={loadingMore}
                            className="bg-white border border-stone-200 rounded-xl px-4 py-2 text-[11px] font-bold text-stone-600 hover:text-amber-600 hover:border-amber-200 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                        >
                            {loadingMore ? 'Loading…' : `Load ${PAGE_SIZE} more`}
                        </button>
                    ) : (
                        <p className="text-[11px] text-stone-400 font-medium">
                            That&rsquo;s everything{userFilter !== 'all' || actionFilter !== 'all' ? ' for these filters' : ''}.
                        </p>
                    )}
                    <p className="text-[10px] text-stone-400">{logs.length} entries shown</p>
                </div>
            )}
        </div>
    );
}
