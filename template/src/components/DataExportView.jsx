import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, FileSpreadsheet, Filter, Table2 } from 'lucide-react';
import { supabase } from '../supabase';

const todayInIndia = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const escapeCsv = value => {
    const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `"${text.replace(/"/g, '""')}"`;
};

const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const downloadBlob = (content, type, filename) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

function rangeFor(mode, { day, month, year, start, end }) {
    if (mode === 'daily') return { start: day, end: day };
    if (mode === 'monthly') {
        const [selectedYear, selectedMonth] = month.split('-').map(Number);
        const last = new Date(selectedYear, selectedMonth, 0).getDate();
        return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
    }
    if (mode === 'yearly') return { start: `${year}-01-01`, end: `${year}-12-31` };
    return { start, end };
}

export default function DataExportView({
    isChannelPartnerOffice = false,
    channelPartnerFilter = '',
    dealerFilter = '',
    showAlert,
}) {
    const today = useMemo(todayInIndia, []);
    const [mode, setMode] = useState('daily');
    const [day, setDay] = useState(today);
    const [month, setMonth] = useState(today.slice(0, 7));
    const [year, setYear] = useState(today.slice(0, 4));
    const [start, setStart] = useState(`${today.slice(0, 4)}-01-01`);
    const [end, setEnd] = useState(today);
    const [format, setFormat] = useState('csv');
    const [count, setCount] = useState(null);
    const [counting, setCounting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const range = rangeFor(mode, { day, month, year, start, end });
    const invalidRange = !range.start || !range.end || range.start > range.end;

    const scopeQuery = query => {
        let scoped = query;
        if (!isChannelPartnerOffice && channelPartnerFilter.trim()) scoped = scoped.ilike('channel_partner', channelPartnerFilter.trim());
        if (dealerFilter) scoped = scoped.ilike('sub_channel_partner', dealerFilter);
        return scoped;
    };

    useEffect(() => {
        let cancelled = false;
        if (invalidRange) { setCount(null); return undefined; }
        const loadCount = async () => {
            setCounting(true);
            let query = supabase
                .from(isChannelPartnerOffice ? 'cpo_leads' : 'admin')
                .select('id', { count: 'exact', head: true })
                .is('deleted_at', null)
                .gte('registration_date', range.start)
                .lte('registration_date', range.end);
            query = scopeQuery(query);
            const { count: result, error } = await query;
            if (!cancelled) {
                setCount(error ? null : (result || 0));
                setCounting(false);
            }
        };
        loadCount();
        return () => { cancelled = true; };
    }, [mode, day, month, year, start, end, isChannelPartnerOffice, channelPartnerFilter, dealerFilter]);

    const fetchRows = async () => {
        let rows = [];
        let from = 0;
        const chunkSize = 1000;
        while (true) {
            let query = supabase
                .from(isChannelPartnerOffice ? 'cpo_leads' : 'admin')
                .select('*')
                .is('deleted_at', null)
                .gte('registration_date', range.start)
                .lte('registration_date', range.end)
                .order('registration_date', { ascending: true })
                .range(from, from + chunkSize - 1);
            query = scopeQuery(query);
            const { data, error } = await query;
            if (error) throw error;
            rows = rows.concat(data || []);
            if (!data || data.length < chunkSize) break;
            from += chunkSize;
        }
        return rows;
    };

    const exportRows = async () => {
        if (invalidRange) {
            showAlert?.('Choose a valid registration date range.', { type: 'error' });
            return;
        }
        setExporting(true);
        try {
            const rows = await fetchRows();
            if (!rows.length) {
                showAlert?.('No registered projects were found in this date range.');
                return;
            }
            const preferred = ['registration_date', 'registration_no', 'customer_name', 'phone_number', 'consumer_no', 'stage', 'system_capacity_kwp', 'channel_partner', 'sub_channel_partner', 'village', 'district', 'created_at', 'updated_at'];
            const found = new Set(rows.flatMap(row => Object.keys(row)));
            const columns = [...preferred.filter(key => found.has(key)), ...[...found].filter(key => !preferred.includes(key) && key !== 'deleted_at').sort()];
            const basename = `solarflow-registration-${range.start}-to-${range.end}`;
            if (format === 'csv') {
                const csv = '\uFEFF' + [columns.map(escapeCsv).join(','), ...rows.map(row => columns.map(column => escapeCsv(row[column])).join(','))].join('\r\n');
                downloadBlob(csv, 'text/csv;charset=utf-8', `${basename}.csv`);
            } else {
                const table = `<table><thead><tr>${columns.map(column => `<th>${escapeHtml(column.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()))}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(column => `<td>${escapeHtml(typeof row[column] === 'object' ? JSON.stringify(row[column]) : row[column])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
                const workbook = `\uFEFF<html><head><meta charset="UTF-8"><style>table{border-collapse:collapse;font-family:Arial;font-size:10pt}th{background:#1c1917;color:white;font-weight:bold}th,td{border:1px solid #aaa;padding:5px;vertical-align:top}</style></head><body><h2>SolarFlow Registration Export</h2><p>Registration dates: ${escapeHtml(range.start)} to ${escapeHtml(range.end)}</p>${table}</body></html>`;
                downloadBlob(workbook, 'application/vnd.ms-excel;charset=utf-8', `${basename}.xls`);
            }
            showAlert?.(`${rows.length.toLocaleString('en-IN')} records exported successfully.`, { type: 'success' });
        } catch (error) {
            console.error('Registration export failed:', error);
            showAlert?.('The export could not be generated. Please try again.', { type: 'error' });
        } finally {
            setExporting(false);
        }
    };

    const modes = [
        ['daily', 'Daily'], ['monthly', 'Monthly'], ['yearly', 'Yearly'], ['custom', 'Custom Range'],
    ];

    return <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <header className="rounded-3xl border border-stone-200 bg-white p-6">
            <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 text-orange-600"><FileSpreadsheet /></span>
                <div><p className="sf-kicker">Registration-based reporting</p><h1 className="mt-1 text-2xl font-black text-stone-900">Data Exports</h1><p className="mt-1 text-sm text-stone-500">Download registered project records by day, month, year, or a custom registration-date range.</p></div>
            </div>
        </header>

        <section className="rounded-3xl border border-stone-200 bg-white p-5 md:p-7">
            <div className="flex items-center gap-2 text-sm font-bold text-stone-900"><Filter className="h-4 w-4 text-orange-500" /> Select reporting period</div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {modes.map(([value, label]) => <button type="button" key={value} onClick={() => setMode(value)} className={`rounded-xl border px-4 py-3 text-xs font-bold ${mode === value ? 'border-orange-500 bg-orange-500 text-stone-950' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`}>{label}</button>)}
            </div>

            <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                {mode === 'daily' && <label className="block max-w-xs text-xs font-bold text-stone-700">Registration Date<input type="date" value={day} onChange={event => setDay(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3" /></label>}
                {mode === 'monthly' && <label className="block max-w-xs text-xs font-bold text-stone-700">Registration Month<input type="month" value={month} onChange={event => setMonth(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3" /></label>}
                {mode === 'yearly' && <label className="block max-w-xs text-xs font-bold text-stone-700">Registration Year<input type="number" min="2000" max="2100" value={year} onChange={event => setYear(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3" /></label>}
                {mode === 'custom' && <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-stone-700">From Registration Date<input type="date" value={start} onChange={event => setStart(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3" /></label><label className="text-xs font-bold text-stone-700">To Registration Date<input type="date" value={end} onChange={event => setEnd(event.target.value)} className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3" /></label></div>}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div><div className="text-xs font-bold text-stone-700">File Format</div><div className="mt-2 flex gap-2"><button type="button" onClick={() => setFormat('csv')} className={`rounded-xl border px-4 py-3 text-xs font-bold ${format === 'csv' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200'}`}>CSV (.csv)</button><button type="button" onClick={() => setFormat('excel')} className={`rounded-xl border px-4 py-3 text-xs font-bold ${format === 'excel' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200'}`}>Excel (.xls)</button></div></div>
                <button type="button" onClick={exportRows} disabled={exporting || invalidRange || count === 0} className="sf-btn-primary min-h-12 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" /> {exporting ? 'Preparing Export…' : `Download ${format === 'csv' ? 'CSV' : 'Excel'}`}</button>
            </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-5"><CalendarDays className="h-5 w-5 text-orange-500" /><p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-500">Registration Date Range</p><p className="mt-1 text-lg font-black text-stone-900">{invalidRange ? 'Choose valid dates' : `${range.start} to ${range.end}`}</p></div>
            <div className="rounded-2xl border border-stone-200 bg-white p-5"><Table2 className="h-5 w-5 text-green-600" /><p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-500">Matching Records</p><p className="mt-1 text-lg font-black text-stone-900">{counting ? 'Checking…' : count == null ? 'Unavailable' : count.toLocaleString('en-IN')}</p></div>
        </section>
    </div>;
}
