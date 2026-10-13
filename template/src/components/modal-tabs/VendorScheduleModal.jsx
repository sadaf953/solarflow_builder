import { useEffect, useState } from 'react';
import { CalendarX } from 'lucide-react';
import { supabase } from '../../supabase';
import { formatDate, todayIST } from '../../lib/format.js';
import { Badge, EmptyState, ErrorBanner, LoadingState, Modal } from '../../ui/index.js';

const dateRange = (start, end) => (end && end !== start
    ? `${formatDate(start, 'short')} – ${formatDate(end, 'short')}`
    : formatDate(start, 'short'));
const covers = (entry, day) => Boolean(day) && entry.starts_on <= day && (entry.ends_on || entry.starts_on) >= day;

/** Upcoming days vendors marked unavailable in the shared calendar. */
export default function VendorScheduleModal({ vendorName, deliveryDate, onClose }) {
    const [load, setLoad] = useState({ status: 'loading', entries: [] });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        const today = todayIST();
        supabase.from('calendar_events')
            .select('id, title, notes, starts_on, ends_on, vendor_name')
            .eq('kind', 'unavailable')
            .not('vendor_name', 'is', null)
            .or(`ends_on.gte.${today},and(ends_on.is.null,starts_on.gte.${today})`)
            .order('starts_on')
            .limit(200)
            .then(({ data, error }) => {
                if (!active) return;
                if (error) console.warn('Could not load vendor schedule:', error.message);
                setLoad(error ? { status: 'error', entries: [] } : { status: 'ready', entries: data || [] });
            });
        return () => { active = false; };
    }, [attempt]);

    const retry = () => {
        setLoad({ status: 'loading', entries: [] });
        setAttempt(count => count + 1);
    };

    return (
        <Modal open onClose={onClose} title="Vendor schedule" size="lg">
            <p className="mb-3 text-xs text-stone-500">Days vendors have marked as unavailable in the calendar, from today on.</p>
            {load.status === 'loading' && <LoadingState label="Loading the calendar…" />}
            {load.status === 'error' && <ErrorBanner onRetry={retry}>Could not load the calendar. Check your connection.</ErrorBanner>}
            {load.status === 'ready' && load.entries.length === 0 && (
                <EmptyState icon={CalendarX} title="No days marked unavailable">No vendor has blocked out any upcoming days.</EmptyState>
            )}
            {load.status === 'ready' && load.entries.length > 0 && (
                <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                    {load.entries.map(entry => {
                        const picked = Boolean(vendorName) && entry.vendor_name === vendorName;
                        return (
                            <li key={entry.id} className={`flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 ${picked ? 'bg-orange-50/70' : ''}`}>
                                <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-stone-900">
                                        {entry.vendor_name}
                                        {picked && <Badge tone="orange">Selected vendor</Badge>}
                                    </p>
                                    <p className="text-xs text-stone-600">{[entry.title, entry.notes].filter(Boolean).join(' · ')}</p>
                                </div>
                                <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-700">
                                    {dateRange(entry.starts_on, entry.ends_on)}
                                    {picked && covers(entry, deliveryDate) && <Badge tone="red">Delivery day</Badge>}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Modal>
    );
}
