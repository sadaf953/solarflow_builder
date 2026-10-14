// ─── ActivityLogView.jsx ──────────────────────────────────────────────────────
// Full-page activity log, newest first, filtered and paged on the server.
// Refreshes when opened, when you come back to the tab, with the Refresh
// button, and live when activity_log is in the realtime publication.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { supabase } from '../supabase';
import { ACTION_COLORS, APP_ROLES } from '../constants';
import { isOn, stageLabel } from '../config/index.js';
import { EmptyState, ErrorBanner, LoadingState, LoadMoreButton, Select, useRefreshOnFocus } from '../ui/index.js';

const PAGE_SIZE = 75;
const roleLabel = userType => APP_ROLES.find(role => role.user_type === userType)?.label || userType;
const LOG_COLUMNS = 'id, user_id, customer_id, action, message, new_value, created_at';

// Filters for actions that only exist while their feature is on.
const ACTION_FILTER_OPTIONS = [
    { value: 'stage_change', label: 'Stage changes' },
    { value: 'create', label: 'Creations' },
    { value: 'update', label: 'Updates & edits' },
    { value: 'delete', label: 'Deletions' },
    { value: 'operations', label: 'Operations & directory' },
    { value: 'attendance', label: 'Staff attendance', feature: 'attendance' },
    { value: 'vendor', label: roleLabel('vendor'), feature: 'vendorLogin' },
    { value: 'payment', label: 'Installation payments', feature: 'installationCommission' },
    { value: 'dispatch', label: 'Delivery & dispatch', feature: 'deliveryBatches' },
    { value: 'error_occurred', label: 'Errors' },
].filter(option => !option.feature || isOn(option.feature));

// move_stage logs "OLD STAGE → NEW STAGE" with stage ids; show the client's stage names.
const STAGE_MOVE = /^(?:Stage: )?([A-Z][A-Z0-9 ]*?) → ([A-Z][A-Z0-9 ]*)$/;
const prettyStageMove = text => {
    const match = STAGE_MOVE.exec(String(text || '').trim());
    return match ? `${stageLabel(match[1])} → ${stageLabel(match[2])}` : null;
};

function describe(log, customerNames) {
    if (log.action !== 'stage_change') return { message: log.message, detail: log.new_value };
    const move = prettyStageMove(log.message);
    if (!move) return { message: log.message, detail: prettyStageMove(log.new_value) || log.new_value };
    const name = customerNames.get(log.customer_id);
    return { message: name ? `${name}: ${move}` : move, detail: log.new_value ? `Remark: ${log.new_value}` : '' };
}

const when = value => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' });

export default function ActivityLogView() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [lastLoadedAt, setLastLoadedAt] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [userFilter, setUserFilter] = useState('all');   // 'all' | 'unattributed' | a person's name
    const [actionFilter, setActionFilter] = useState('all');
    const [allProfiles, setAllProfiles] = useState([]);
    const [customerNames, setCustomerNames] = useState(() => new Map());
    const inFlight = useRef(false);
    // Lets fetchLogs read the current offset without depending on `logs`.
    const logsRef = useRef([]);
    useEffect(() => { logsRef.current = logs; }, [logs]);

    const actorNames = useMemo(() => new Map(allProfiles.map(p => [p.id, p.name])), [allProfiles]);
    // One entry per name, even when a person has more than one login.
    const uniqueActors = useMemo(() => {
        const byName = new Map();
        for (const profile of allProfiles) {
            const name = (profile.name || '').trim();
            if (!name) continue;
            if (!byName.has(name)) byName.set(name, { name, ids: [profile.id] });
            else byName.get(name).ids.push(profile.id);
        }
        return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [allProfiles]);

    const matchedIds = useMemo(() => uniqueActors.find(actor => actor.name === userFilter)?.ids || [], [uniqueActors, userFilter]);

    const fetchLogs = useCallback(async ({ silent = false, append = false } = {}) => {
        if (inFlight.current) return;
        inFlight.current = true;
        if (append) setLoadingMore(true);
        else if (!silent) setRefreshing(true);
        try {
            const from = append ? logsRef.current.length : 0;
            let query = supabase.from('activity_log').select(LOG_COLUMNS).order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
            if (userFilter === 'unattributed') query = query.is('user_id', null);
            else if (userFilter !== 'all' && matchedIds.length) query = query.in('user_id', matchedIds);
            if (actionFilter !== 'all') query = query.eq('action', actionFilter);

            const { data, error } = await query;
            if (error) {
                console.error('Failed to load activity log:', error);
                setLoadError('The activity log could not be loaded. Check your connection and try again.');
                return;
            }
            setLoadError('');
            const page = data || [];
            setLogs(prev => {
                if (!append) return page;
                // A row inserted while paging shifts the window; do not show it twice.
                const seen = new Set(prev.map(log => log.id));
                return [...prev, ...page.filter(log => !seen.has(log.id))];
            });
            setHasMore(page.length === PAGE_SIZE);
            setLastLoadedAt(new Date());
        } finally {
            inFlight.current = false;
            setLoadingMore(false);
            setRefreshing(false);
            setLoading(false);
        }
    }, [userFilter, actionFilter, matchedIds]);

    useEffect(() => { fetchLogs({ silent: true }); }, [fetchLogs]);
    useRefreshOnFocus(() => fetchLogs({ silent: true }));

    useEffect(() => {
        let cancelled = false;
        supabase.from('profiles').select('id, name').order('name').then(({ data, error }) => {
            if (!cancelled && !error) setAllProfiles(data || []);
        });
        return () => { cancelled = true; };
    }, []);

    // Stage moves are logged by the database without the customer's name.
    useEffect(() => {
        const missing = [...new Set(logs.filter(log => log.action === 'stage_change' && log.customer_id && !customerNames.has(log.customer_id)).map(log => log.customer_id))];
        if (!missing.length) return undefined;
        let cancelled = false;
        supabase.from('admin').select('id, customer_name').in('id', missing).then(({ data, error }) => {
            if (cancelled || error) return;
            setCustomerNames(prev => {
                const next = new Map(prev);
                missing.forEach(id => next.set(id, ''));
                (data || []).forEach(row => next.set(row.id, row.customer_name || ''));
                return next;
            });
        });
        return () => { cancelled = true; };
    }, [logs, customerNames]);

    // Live inserts, if activity_log is in the realtime publication.
    useEffect(() => {
        const channel = supabase.channel('activity_log_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, async payload => {
                const { data } = await supabase.from('activity_log').select(LOG_COLUMNS).eq('id', payload.new.id).maybeSingle();
                if (!data) return;
                const matchesUser = userFilter === 'all' || (userFilter === 'unattributed' ? data.user_id === null : matchedIds.includes(data.user_id));
                const matchesAction = actionFilter === 'all' || data.action === actionFilter;
                if (matchesUser && matchesAction) setLogs(prev => [data, ...prev.filter(log => log.id !== data.id)]);
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [userFilter, actionFilter, matchedIds]);

    if (loading) return <LoadingState label="Loading activity…" />;

    const filtered = userFilter !== 'all' || actionFilter !== 'all';
    const userOptions = [...uniqueActors.map(actor => actor.name), { value: 'unattributed', label: 'System / unattributed' }];

    return (
        <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex flex-wrap items-center gap-2 pb-1">
                <Select aria-label="Filter by person" value={userFilter === 'all' ? '' : userFilter} onChange={event => setUserFilter(event.target.value || 'all')}
                    placeholder="Everyone" options={userOptions} className="w-auto max-w-[220px]" />
                <Select aria-label="Filter by action" value={actionFilter === 'all' ? '' : actionFilter} onChange={event => setActionFilter(event.target.value || 'all')}
                    placeholder="All activities" options={ACTION_FILTER_OPTIONS} className="w-auto" />
                {filtered && (
                    <button type="button" onClick={() => { setUserFilter('all'); setActionFilter('all'); }}
                        className="min-h-11 px-2 text-xs font-bold text-stone-500 hover:text-amber-600 underline underline-offset-2 cursor-pointer">
                        Clear
                    </button>
                )}
                <p className="text-[11px] font-medium text-stone-500 ml-auto">
                    {logs.length} loaded{lastLoadedAt ? ` · updated ${lastLoadedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
                <button type="button" onClick={() => fetchLogs()} disabled={refreshing} className="sf-btn-secondary min-h-11">
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            <ErrorBanner onRetry={() => fetchLogs()}>{loadError}</ErrorBanner>

            {loadError && logs.length === 0 ? null : logs.length === 0 ? (
                <EmptyState icon={Activity} title={filtered ? 'No activity matches these filters' : 'No activity logged yet'}>
                    {userFilter !== 'all' ? `${userFilter === 'unattributed' ? 'System entries' : userFilter} have no matching entries.` : filtered ? 'Try a different action type.' : null}
                </EmptyState>
            ) : logs.map(log => {
                const colors = ACTION_COLORS[log.action] || { bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-200' };
                const label = log.action === 'vendor' ? roleLabel('vendor') : ACTION_COLORS[log.action]?.label || log.action?.replace(/_/g, ' ');
                const { message, detail } = describe(log, customerNames);
                return (
                    <div key={log.id} className="bg-white rounded-xl p-4 border border-stone-100 shadow-sm flex items-start gap-3">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider flex-shrink-0 border ${colors.bg} ${colors.text} ${colors.border || ''}`}>
                            {label}
                        </span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-stone-800">{message}</p>
                            {detail && <p className="text-xs text-stone-500 mt-0.5">{detail}</p>}
                            <p className="text-[10px] text-stone-500 mt-1 font-bold uppercase">
                                {actorNames.get(log.user_id) || (log.user_id ? 'Unknown' : 'System')} • {when(log.created_at)}
                            </p>
                        </div>
                    </div>
                );
            })}

            {logs.length > 0 && (
                <div className="pt-1 pb-2 flex flex-col items-center gap-1.5">
                    <LoadMoreButton onClick={() => fetchLogs({ append: true })} loading={loadingMore} hasMore={hasMore} label={`Load ${PAGE_SIZE} more`} />
                    {!hasMore && <p className="text-[11px] text-stone-500 font-medium">That’s everything{filtered ? ' for these filters' : ''}.</p>}
                    <p className="text-[10px] text-stone-500">{logs.length} entries shown</p>
                </div>
            )}
        </div>
    );
}
