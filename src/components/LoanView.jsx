import {useDemoTourNavigation} from '../demo/tour';
import { useState, useEffect, useCallback } from 'react';
import { IndianRupee, Search, RefreshCw, ChevronDown } from 'lucide-react';
import { LOAN_TAGS, LOAN_TAG_COLORS, CUSTOMER_CARD_COLUMNS, getCustomerCardColumns, STAGE_IDS } from '../constants';
import { normalizeLoanTag } from '../utils';
import { supabase } from '../supabase';

const PAGE_SIZE = 50;

export default function LoanView({ onSelectCustomer, isChannelPartnerOffice, partnerName, channelPartnerFilter, dealerFilter }) {
    const [activeFilter, setActiveFilter] = useState(null);
    useDemoTourNavigation((entry)=>{if(entry.view==='loan_tags'){setActiveFilter(entry.tag || null);setSearchTerm('');setPage(0);}});
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [customers, setCustomers] = useState([]);
    const [loadError, setLoadError] = useState(null);
    const [tagCounts, setTagCounts] = useState({});
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm.trim());
            setPage(0);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Fetch True Exact Counts via Supabase HEAD queries
    const fetchCounts = useCallback(async () => {
        try {
            const targetPartner = isChannelPartnerOffice ? null : (channelPartnerFilter?.trim() || null);

            // 1. Total Count Query for all Loan customers
            let loanStageQuery = supabase
                .from(isChannelPartnerOffice ? 'cpo_leads' : 'admin')
                .select('*', { count: 'exact', head: true })
                .is('deleted_at', null)
                .eq('stage', STAGE_IDS.LOAN);
            let taggedOutsideLoanQuery = supabase
                .from(isChannelPartnerOffice ? 'cpo_leads' : 'admin')
                .select('*', { count: 'exact', head: true })
                .is('deleted_at', null)
                .neq('stage', STAGE_IDS.COMPLETED)
                .neq('stage', STAGE_IDS.LOAN)
                .not('loan_tag', 'is', null)
                .neq('loan_tag', '');

            if (targetPartner) {
                loanStageQuery = loanStageQuery.ilike('channel_partner', `%${targetPartner}%`);
                taggedOutsideLoanQuery = taggedOutsideLoanQuery.ilike('channel_partner', `%${targetPartner}%`);
            }
            if (dealerFilter) {
                loanStageQuery = loanStageQuery.ilike('sub_channel_partner', dealerFilter);
                taggedOutsideLoanQuery = taggedOutsideLoanQuery.ilike('sub_channel_partner', dealerFilter);
            }

            // 2. Parallel Head queries for every specific tag in LOAN_TAGS
            const countPromises = LOAN_TAGS.map(async (tag) => {
                let tagQuery = supabase
                    .from(isChannelPartnerOffice ? 'cpo_leads' : 'admin')
                    .select('*', { count: 'exact', head: true })
                    .is('deleted_at', null)
                    .neq('stage', STAGE_IDS.COMPLETED)
                    .ilike('loan_tag', `%${tag.id}%`);

                if (targetPartner) {
                    tagQuery = tagQuery.ilike('channel_partner', `%${targetPartner}%`);
                }
                if (dealerFilter) tagQuery = tagQuery.ilike('sub_channel_partner', dealerFilter);

                const { count, error } = await tagQuery;
                return { tagId: tag.id, count: (!error && count !== null) ? count : 0 };
            });

            const [loanStageRes, taggedOutsideLoanRes, ...tagResults] = await Promise.all([loanStageQuery, taggedOutsideLoanQuery, ...countPromises]);

            const countsMap = {};
            tagResults.forEach(({ tagId, count }) => {
                countsMap[tagId] = count;
            });
            setTagCounts(countsMap);

            if (!loanStageRes.error && !taggedOutsideLoanRes.error) {
                setTotalCount((loanStageRes.count || 0) + (taggedOutsideLoanRes.count || 0));
            } else {
                const sum = Object.values(countsMap).reduce((a, b) => a + b, 0);
                setTotalCount(sum);
            }
        } catch (err) {
            console.error('Error fetching loan counts:', err);
        }
    }, [isChannelPartnerOffice, partnerName, channelPartnerFilter, dealerFilter]);

    // Fetch Paginated Customer Records with Backend Search
    const fetchCustomers = useCallback(async (pageNum = 0, isAppend = false) => {
        if (pageNum === 0) setLoading(true);
        else setLoadingMore(true);

        try {
            const targetPartner = isChannelPartnerOffice ? null : (channelPartnerFilter?.trim() || null);

            let query = supabase
                .from(isChannelPartnerOffice ? 'cpo_leads' : 'admin')
                // Was select('*'): ~90 columns per row for a card that renders a
                // handful. CUSTOMER_CARD_COLUMNS was already imported here
                // and unused. The detail modal fetches the full record on open.
                .select(getCustomerCardColumns(isChannelPartnerOffice))
                .is('deleted_at', null)
                .neq('stage', STAGE_IDS.COMPLETED)
                .order('created_at', { ascending: false })
                .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

            if (targetPartner) {
                query = query.ilike('channel_partner', `%${targetPartner}%`);
            }
            if (dealerFilter) query = query.ilike('sub_channel_partner', dealerFilter);

            if (activeFilter) {
                query = query.ilike('loan_tag', `%${activeFilter}%`);
            } else {
                query = query.not('loan_tag', 'is', null).neq('loan_tag', '');
            }

            // Direct Backend Search across name, phone, consumer_no
            if (debouncedSearch) {
                query = query.or(`customer_name.ilike.%${debouncedSearch}%,phone_number.ilike.%${debouncedSearch}%,consumer_no.ilike.%${debouncedSearch}%`);
            }

            const { data, error } = await query;
            // The error used to be discarded here. When the search failed
            // (42883: ilike on the numeric phone_number column) the list simply
            // did not update, so the box looked like it had found nothing -
            // indistinguishable from a genuine empty result.
            if (error) {
                console.error('Search/filter query failed:', error);
                setLoadError(error.message || 'The list could not be loaded.');
            } else {
                setLoadError(null);
            }
            if (!error && data) {
                const visibleData = activeFilter
                    ? data
                    : data.filter(row => String(row.loan_tag || '').trim());
                if (isAppend) {
                    setCustomers(prev => {
                        const existingIds = new Set(prev.map(c => c.id));
                        const fresh = visibleData.filter(c => !existingIds.has(c.id));
                        return [...prev, ...fresh];
                    });
                } else {
                    setCustomers(visibleData);
                }
                setHasMore(data.length === PAGE_SIZE);
            } else {
                console.error('Supabase error fetching loan data:', error);
                if (!isAppend) setCustomers([]);
                setHasMore(false);
            }
        } catch (err) {
            console.error('Error fetching loan customers:', err);
            if (!isAppend) setCustomers([]);
            setHasMore(false);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            if (pageNum === 0) void fetchCounts();
        }
    }, [activeFilter, debouncedSearch, isChannelPartnerOffice, partnerName, channelPartnerFilter, dealerFilter, fetchCounts]);

    useEffect(() => {
        setPage(0);
        fetchCustomers(0, false);
    }, [activeFilter, debouncedSearch, fetchCustomers]);

    const handleLoadMore = () => {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchCustomers(nextPage, true);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">

            {loadError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start gap-2">
                    <span className="text-xs font-bold text-red-800">This list could not be loaded.</span>
                    <span className="text-[11px] text-red-700 font-medium">{loadError}</span>
                </div>
            )}
            {/* Header Controls: Search & Counts */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                {/* Real-time Backend Search */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3.5 top-3 w-4 h-4 text-stone-400" />
                    <input
                        type="text"
                        placeholder="Search name, phone, consumer no..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-stone-200 rounded-2xl text-xs font-semibold text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-2xs transition-all"
                    />
                    {searchTerm && (
                        <button 
                            onClick={() => setSearchTerm('')}
                            className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600 text-xs font-bold cursor-pointer"
                        >
                            ✕
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                        onClick={() => fetchCustomers(0, false)}
                        className="p-2.5 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl text-stone-600 transition-colors shadow-2xs cursor-pointer"
                        title="Refresh counts"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin text-amber-500" : ""} />
                    </button>
                    <span className="text-xs font-bold text-stone-500 bg-stone-100 px-3 py-2 rounded-xl">
                        Total: <span className="text-stone-900 font-extrabold">{totalCount.toLocaleString('en-IN')}</span> Loans
                    </span>
                </div>
            </div>

            {/* Tag Filter Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <button 
                    onClick={() => setActiveFilter(null)}
                    className={`rounded-2xl p-3.5 border text-left transition-all cursor-pointer ${
                        activeFilter === null 
                            ? 'bg-stone-900 border-stone-900 text-white shadow-lg shadow-stone-900/10 scale-[1.02]' 
                            : 'bg-white border-stone-200/80 text-stone-800 hover:border-stone-300'
                    }`}
                >
                    <p className="text-[9px] font-bold uppercase tracking-widest mb-1 opacity-60">All Loans</p>
                    <p className="text-xl font-black">{totalCount.toLocaleString('en-IN')}</p>
                </button>

                {LOAN_TAGS.map(tag => {
                    const count = tagCounts[tag.id] || 0;
                    const colors = LOAN_TAG_COLORS[tag.id] || {};
                    const isSelected = activeFilter === tag.id;
                    return (
                        <button
                            key={tag.id}
                            onClick={() => setActiveFilter(isSelected ? null : tag.id)}
                            className={`rounded-2xl p-3 border transition-all text-left cursor-pointer ${
                                isSelected ? 'ring-2 ring-stone-900 ring-offset-2 shadow-md' : 'hover:shadow-xs'
                            } ${colors.bg || 'bg-stone-50'} ${colors.border || 'border-stone-200'}`}
                        >
                            <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 truncate ${colors.text || 'text-stone-700'}`}>
                                {tag.label}
                            </p>
                            <p className={`text-xl font-black ${colors.text || 'text-stone-900'}`}>
                                {count.toLocaleString('en-IN')}
                            </p>
                        </button>
                    );
                })}
            </div>

            {/* Customer List Display */}
            {loading ? (
                <div className="flex flex-col items-center justify-center p-16 text-stone-400 space-y-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
                    <p className="text-xs font-bold text-stone-600">Loading records from database...</p>
                </div>
            ) : customers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl border border-dashed border-stone-200 p-8 text-stone-400 text-center">
                    <IndianRupee className="w-10 h-10 mb-3 text-stone-300" />
                    <p className="font-bold text-stone-600 text-sm">No matching loan records found</p>
                    <p className="text-xs text-stone-400 mt-1 max-w-sm">
                        {debouncedSearch ? `No records matched "${debouncedSearch}".` : 'No customers found under this filter.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-stone-500 font-semibold px-1">
                        <span>Showing {customers.length} loaded records {debouncedSearch ? `for "${debouncedSearch}"` : ''}</span>
                        {activeFilter && <span className="font-bold text-amber-700">Filter: {activeFilter}</span>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {customers.map(c => {
                            const normTag = normalizeLoanTag(c.loan_tag);
                            const tagStyle = (normTag && LOAN_TAG_COLORS[normTag]) ? LOAN_TAG_COLORS[normTag] : { bg: 'bg-stone-100', text: 'text-stone-700', border: 'border-stone-200' };
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => onSelectCustomer(c)}
                                    className="w-full bg-white rounded-2xl border border-stone-150 p-4 text-left hover:border-amber-400 hover:shadow-md transition-all group cursor-pointer"
                                >
                                    <div className="flex justify-between items-start mb-2 gap-2">
                                        <div className="min-w-0">
                                            <p className="font-bold text-stone-900 text-sm group-hover:text-amber-700 transition-colors truncate">
                                                {c.customer_name || 'Unnamed Customer'}
                                            </p>
                                            <p className="text-[10px] text-stone-400 font-mono mt-0.5 truncate">
                                                {[c.villages, c.phone_number].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                        {c.loan_tag ? (
                                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0 border ${tagStyle.bg} ${tagStyle.text} ${tagStyle.border}`}>
                                                {LOAN_TAGS.find(t => t.id === c.loan_tag)?.label || c.loan_tag}
                                            </span>
                                        ) : (
                                            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0 border bg-stone-100 text-stone-500 border-stone-200">
                                                Pending Tag
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-stone-100 text-[10px]">
                                        <div>
                                            <p className="text-stone-400 font-bold uppercase tracking-wide">File No.</p>
                                            <p className="text-xs font-semibold text-stone-700 mt-0.5 truncate">{c.folder_no || '–'}</p>
                                        </div>
                                        <div>
                                            <p className="text-stone-400 font-bold uppercase tracking-wide">Panel</p>
                                            <p className="text-xs font-semibold text-stone-700 mt-0.5 truncate">{c.module_brand || '–'}</p>
                                        </div>
                                        <div>
                                            <p className="text-stone-400 font-bold uppercase tracking-wide">WP</p>
                                            <p className="text-xs font-semibold text-stone-700 mt-0.5">{c.module_wp || '–'}</p>
                                        </div>
                                        <div>
                                            <p className="text-stone-400 font-bold uppercase tracking-wide">Capacity</p>
                                            <p className="text-xs font-semibold text-stone-700 mt-0.5">
                                                {c.system_capacity_kwp ? `${c.system_capacity_kwp} kWp` : '–'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-stone-400 font-bold uppercase tracking-wide">Current Stage</p>
                                            <p className="text-xs font-bold text-amber-600 truncate mt-0.5">
                                                {c.stage || 'LEADS'}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Load More Button */}
                    {hasMore && (
                        <div className="text-center pt-4 pb-8">
                            <button
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="px-6 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl text-xs font-extrabold shadow-md transition-all flex items-center gap-2 mx-auto cursor-pointer disabled:opacity-60"
                            >
                                {loadingMore ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        <span>Loading More from Database...</span>
                                    </>
                                ) : (
                                    <>
                                        <ChevronDown size={14} />
                                        <span>Load More Records (50 more)</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
