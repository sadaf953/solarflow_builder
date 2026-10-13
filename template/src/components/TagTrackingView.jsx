import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../supabase';
import { STAGE_IDS, getCustomerCardColumns } from '../constants';
import { stageLabel, tagLabel } from '../config/index.js';
import { customerSource } from '../lib/db.js';
import { EMPTY, formatCount, formatDate, formatKwp } from '../lib/format.js';
import { EmptyState, ErrorBanner, LoadMoreButton, LoadingState, SearchInput, StatTile } from '../ui/index.js';
import { TAG_VIEWS } from './tagViews.js';

const PAGE_SIZE = 50;
const NEUTRAL = { bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-200' };
const TILE_COLUMNS = {
    4: 'grid-cols-2 sm:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
    7: 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7',
    8: 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-8',
};

// PostgREST reads commas and brackets inside or() as syntax.
const searchText = value => String(value || '').replace(/[,()]/g, ' ').trim();

// One tag as a filter; legacy values (e.g. 'Yes' for 'Installed') match too.
function withTag(query, view, tagId) {
    const alias = view.aliases?.[tagId];
    return alias
        ? query.or(`${view.column}.ilike.%${tagId}%,${view.column}.ilike.%${alias}%`)
        : query.ilike(view.column, `%${tagId}%`);
}

const withAnyTag = (query, column) => query.not(column, 'is', null).neq(column, '');

function tagFor(view, value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return null;
    return view.tags.find(tag => tag.id.toLowerCase() === text)
        || view.tags.find(tag => view.aliases?.[tag.id] === text)
        || null;
}

function TagBadge({ view, value }) {
    const tag = tagFor(view, value);
    const colors = view.colors[tag?.id] || view.colors[String(value || '').trim()] || NEUTRAL;
    return (
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colors.bg} ${colors.text} ${colors.border}`}>
            {tag ? tagLabel(view.tags, tag.id) : String(value || '').trim() || 'Pending'}
        </span>
    );
}

function CardField({ label, children, accent = false }) {
    return (
        <div className="min-w-0">
            <p className="font-bold uppercase tracking-wide text-stone-500">{label}</p>
            <p className={`mt-0.5 truncate text-xs ${accent ? 'font-bold text-orange-700' : 'font-semibold text-stone-800'}`}>{children || EMPTY}</p>
        </div>
    );
}

function CustomerTagCard({ view, customer: c, onSelect }) {
    return (
        <button type="button" onClick={() => onSelect?.(c)}
            className="group w-full rounded-2xl border border-stone-200 bg-white p-4 text-left transition-all hover:border-orange-300 hover:shadow-md">
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-stone-900 group-hover:text-orange-700">{c.customer_name || 'Unnamed customer'}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-stone-500">{[c.villages, c.phone_number].filter(Boolean).join(' · ')}</p>
                </div>
                <TagBadge view={view} value={c[view.column]} />
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-stone-100 pt-2.5 text-[10px]">
                <CardField label="File no.">{c.folder_no}</CardField>
                <CardField label="Panel">{c.module_brand}</CardField>
                <CardField label="Wp">{c.module_wp}</CardField>
                <CardField label="Capacity">{formatKwp(c.system_capacity_kwp)}</CardField>
                {view.card === 'installation' ? (
                    <>
                        <CardField label="Delivery date">{formatDate(c.material_delivery_date || c.installation_date, 'short')}</CardField>
                        <CardField label="Vendor / tech" accent>{c.vendor}</CardField>
                    </>
                ) : (
                    <CardField label="Current stage" accent>{stageLabel(c.stage || STAGE_IDS.LEADS)}</CardField>
                )}
            </div>
        </button>
    );
}

/**
 * Searchable, tag-filtered customer list for one tracker (kind: subsidy | loan
 * | installation). Tiles show exact counts from HEAD queries, so they stay
 * right past the 1,000-row page limit.
 */
export default function TagTrackingView({ kind, onSelectCustomer, isChannelPartnerOffice, channelPartnerFilter, dealerFilter }) {
    const view = TAG_VIEWS[kind];
    const [activeTag, setActiveTag] = useState(null);
    const [search, setSearch] = useState('');
    const [customers, setCustomers] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [counts, setCounts] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const listRequest = useRef(0);
    const countRequest = useRef(0);

    const partner = isChannelPartnerOffice ? '' : String(channelPartnerFilter || '').trim();

    // Every query starts here: live rows in the caller's partner / dealer scope.
    const scoped = useCallback((select, options) => {
        let query = supabase.from(customerSource(isChannelPartnerOffice)).select(select, options).is('deleted_at', null);
        if (partner) query = query.ilike('channel_partner', `%${partner}%`);
        if (dealerFilter) query = query.ilike('sub_channel_partner', dealerFilter);
        return query;
    }, [isChannelPartnerOffice, partner, dealerFilter]);

    const fetchCounts = useCallback(async () => {
        if (!view) return;
        const request = ++countRequest.current;
        setCounts(null);
        const head = () => {
            const query = scoped('id', { count: 'exact', head: true });
            return view.activeOnly ? query.neq('stage', STAGE_IDS.COMPLETED) : query;
        };
        const totalQueries = view.total === 'loan'
            ? [
                scoped('id', { count: 'exact', head: true }).eq('stage', STAGE_IDS.LOAN),
                withAnyTag(head().neq('stage', STAGE_IDS.LOAN), view.column),
            ]
            : [withAnyTag(head(), view.column)];
        try {
            const results = await Promise.all([
                ...totalQueries,
                ...view.tags.map(tag => withTag(head(), view, tag.id)),
            ]);
            if (request !== countRequest.current) return;
            const totals = results.slice(0, totalQueries.length);
            const byTag = Object.fromEntries(view.tags.map((tag, i) => {
                const result = results[totalQueries.length + i];
                return [tag.id, result.error ? 0 : result.count || 0];
            }));
            const total = totals.some(result => result.error)
                ? Object.values(byTag).reduce((sum, n) => sum + n, 0)
                : totals.reduce((sum, result) => sum + (result.count || 0), 0);
            setCounts({ total, byTag });
        } catch (error) {
            console.error(`Could not count ${view.noun} records:`, error);
            if (request === countRequest.current) setCounts({ total: 0, byTag: {} });
        }
    }, [view, scoped]);

    const fetchCustomers = useCallback(async (pageNum) => {
        if (!view) return;
        const request = ++listRequest.current;
        if (pageNum === 0) setLoading(true);
        else setLoadingMore(true);
        try {
            const columns = getCustomerCardColumns(isChannelPartnerOffice);
            let query = scoped(view.extraColumns ? `${columns}, ${view.extraColumns}` : columns)
                .order('created_at', { ascending: false })
                .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);
            if (view.activeOnly) query = query.neq('stage', STAGE_IDS.COMPLETED);
            query = activeTag ? withTag(query, view, activeTag) : withAnyTag(query, view.column);
            const term = searchText(search);
            if (term) query = query.or(`customer_name.ilike.%${term}%,phone_number.ilike.%${term}%,consumer_no.ilike.%${term}%`);

            const { data, error } = await query;
            if (request !== listRequest.current) return;
            if (error) throw error;
            const rows = view.dropBlank && !activeTag ? data.filter(row => String(row[view.column] || '').trim()) : data;
            setLoadError('');
            setCustomers(prev => {
                if (pageNum === 0) return rows;
                const seen = new Set(prev.map(c => c.id));
                return [...prev, ...rows.filter(c => !seen.has(c.id))];
            });
            setHasMore(data.length === PAGE_SIZE);
            setPage(pageNum);
        } catch (error) {
            if (request !== listRequest.current) return;
            console.error(`Could not load ${view.noun} records:`, error);
            setLoadError(error?.message || 'Check your connection and try again.');
            if (pageNum === 0) setCustomers([]);
            setHasMore(false);
        } finally {
            if (request === listRequest.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [view, scoped, isChannelPartnerOffice, activeTag, search]);

    useEffect(() => { fetchCounts(); }, [fetchCounts]);
    useEffect(() => { fetchCustomers(0); }, [fetchCustomers]);

    if (!view) return null;
    const refresh = () => { fetchCounts(); fetchCustomers(0); };
    const countText = n => (counts ? formatCount(n) : '…');
    const tiles = view.tags.length + 1;

    return (
        <div className="space-y-6">
            <ErrorBanner title="This list could not be loaded." onRetry={refresh}>{loadError}</ErrorBanner>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <SearchInput value={search} onChange={setSearch} className="max-w-md flex-1"
                    label={`Search ${view.noun} records`} placeholder="Search name, phone, consumer no…" />
                <div className="flex items-center gap-2 self-end sm:self-center">
                    <button type="button" onClick={refresh} aria-label="Refresh" title="Refresh"
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50">
                        <RefreshCw size={14} className={loading ? 'animate-spin text-orange-500' : ''} aria-hidden="true" />
                    </button>
                    <span className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600">
                        Total: <span className="font-extrabold text-stone-900">{countText(counts?.total)}</span>
                    </span>
                </div>
            </div>

            <div className={`grid gap-3 ${TILE_COLUMNS[tiles] || TILE_COLUMNS[6]}`}>
                <StatTile label={view.allLabel} value={countText(counts?.total)} active={activeTag === null} onClick={() => setActiveTag(null)} />
                {view.tags.map(tag => (
                    <StatTile key={tag.id} label={tag.label} value={countText(counts?.byTag[tag.id])}
                        active={activeTag === tag.id} onClick={() => setActiveTag(activeTag === tag.id ? null : tag.id)} />
                ))}
            </div>

            {loading ? (
                <LoadingState label="Loading records…" />
            ) : customers.length === 0 ? (
                !loadError && (
                    <EmptyState icon={view.icon} title={`No ${view.noun} records found`}>
                        {search ? `Nothing matched "${search}".` : 'No customers have this status yet.'}
                    </EmptyState>
                )
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1 text-xs font-semibold text-stone-500">
                        <span>Showing {formatCount(customers.length)} {search ? `for "${search}"` : ''}</span>
                        {activeTag && <span className="font-bold text-orange-700">Filter: {tagLabel(view.tags, activeTag)}</span>}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {customers.map(c => <CustomerTagCard key={c.id} view={view} customer={c} onSelect={onSelectCustomer} />)}
                    </div>
                    <LoadMoreButton hasMore={hasMore} loading={loadingMore} onClick={() => fetchCustomers(page + 1)} />
                </div>
            )}
        </div>
    );
}
