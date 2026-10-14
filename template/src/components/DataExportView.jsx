// Projects as a CSV or Excel file, by registration date (or by the day they
// were added when the pipeline has no Registration stage). Extra fields
// (admin.custom_fields) become their own columns.

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, FileSpreadsheet, Filter, Table2 } from 'lucide-react';
import { BRANDING, CLIENT } from '../config/index.js';
import { fetchAllPages } from '../lib/db.js';
import { downloadBlob, toCsv } from '../lib/download.js';
import { formatCount, todayIST } from '../lib/format.js';
import { ChoiceCards, Field, Input, StatTile } from '../ui/index.js';
import { liveCustomers } from '../dashboard/queries.js';
import { exportColumns, exportDateFilter, exportRange, exportsByRegistration, isValidRange } from '../dashboard/exports.js';

const MODES = [
    { value: 'daily', label: 'Daily' }, { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' }, { value: 'custom', label: 'Custom range' },
];
const FORMATS = [{ value: 'csv', label: 'CSV (.csv)' }, { value: 'excel', label: 'Excel (.xls)' }];
const BY_REGISTRATION = exportsByRegistration();
const WORDS = BY_REGISTRATION
    ? { day: 'Registration date', month: 'Registration month', year: 'Registration year', dates: 'Registration dates', date: 'registration date' }
    : { day: 'Date added', month: 'Month added', year: 'Year added', dates: 'Dates added', date: 'date added' };
const PROJECTS = BY_REGISTRATION ? 'registered projects' : 'projects';
const FILE_NOUN = BY_REGISTRATION ? 'registrations' : 'projects';

const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default function DataExportView({
    isChannelPartnerOffice = false,
    channelPartnerFilter = '',
    dealerFilter = '',
    showAlert,
}) {
    const today = useMemo(() => todayIST(), []);
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
    const range = exportRange(mode, { day, month, year, start, end });
    const invalidRange = !isValidRange(range);
    const scope = useMemo(() => ({ channelPartner: isChannelPartnerOffice ? '' : channelPartnerFilter, dealer: dealerFilter }), [isChannelPartnerOffice, channelPartnerFilter, dealerFilter]);

    const projectsBetween = (columns, options) => {
        const { field, start: from, end: until } = exportDateFilter(range.start, range.end);
        return liveCustomers(isChannelPartnerOffice, scope, columns, options).gte(field, from).lt(field, until).order(field, { ascending: true });
    };

    useEffect(() => {
        let cancelled = false;
        if (invalidRange) { setCount(null); return undefined; }
        setCounting(true);
        projectsBetween('id', { count: 'exact', head: true })
            .then(({ count: result, error }) => {
                if (cancelled) return;
                setCount(error ? null : (result || 0));
                setCounting(false);
            });
        return () => { cancelled = true; };
        // projectsBetween only reads the range, the login type and scope.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range.start, range.end, invalidRange, isChannelPartnerOffice, scope]);

    const exportRows = async () => {
        if (invalidRange) {
            showAlert?.(`Choose a valid ${WORDS.date} range.`, { type: 'error' });
            return;
        }
        setExporting(true);
        try {
            const rows = await fetchAllPages(() => projectsBetween('*').order('id', { ascending: true }));
            if (!rows.length) {
                showAlert?.(`No ${PROJECTS} were found in this date range.`);
                return;
            }
            const columns = exportColumns(rows);
            const basename = `${CLIENT.slug || 'solarflow'}-${FILE_NOUN}-${range.start}-to-${range.end}`;
            if (format === 'csv') {
                downloadBlob(toCsv(rows, columns), 'text/csv;charset=utf-8', `${basename}.csv`);
            } else {
                const cell = (row, column) => {
                    const value = column.get ? column.get(row) : row[column.key];
                    return escapeHtml(value != null && typeof value === 'object' ? JSON.stringify(value) : value);
                };
                const table = `<table><thead><tr>${columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(column => `<td>${cell(row, column)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
                const workbook = `\uFEFF<html><head><meta charset="UTF-8"><style>table{border-collapse:collapse;font-family:Arial;font-size:10pt}th{background:#1c1917;color:white;font-weight:bold}th,td{border:1px solid #aaa;padding:5px;vertical-align:top}</style></head><body><h2>${escapeHtml(BRANDING.companyName || BRANDING.appName)} ${FILE_NOUN}</h2><p>${WORDS.dates}: ${escapeHtml(range.start)} to ${escapeHtml(range.end)}</p>${table}</body></html>`;
                downloadBlob(workbook, 'application/vnd.ms-excel;charset=utf-8', `${basename}.xls`);
            }
            showAlert?.(`${formatCount(rows.length)} records exported.`, { type: 'success' });
        } catch (error) {
            console.error('Project export failed:', error);
            showAlert?.('The export could not be made. Please try again.', { type: 'error' });
        } finally {
            setExporting(false);
        }
    };

    return <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl border border-stone-200 bg-white p-6">
            <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 text-orange-600"><FileSpreadsheet aria-hidden="true" /></span>
                <div><p className="sf-kicker">{BY_REGISTRATION ? 'Registration reports' : 'Project reports'}</p><h1 className="mt-1 text-2xl font-black text-stone-900">Data Exports</h1><p className="mt-1 text-sm text-stone-500">Download {PROJECTS} by day, month, year or a custom {WORDS.date} range.</p></div>
            </div>
        </header>

        <section className="rounded-3xl border border-stone-200 bg-white p-5 md:p-7 space-y-5">
            <div className="flex items-center gap-2 text-sm font-bold text-stone-900"><Filter className="h-4 w-4 text-orange-500" aria-hidden="true" /> Reporting period</div>
            <ChoiceCards options={MODES} value={mode} onChange={setMode} columns={4} label="Reporting period" />

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                {mode === 'daily' && <Field label={WORDS.day} htmlFor="export-day" className="max-w-xs"><Input id="export-day" type="date" value={day} onChange={event => setDay(event.target.value)} /></Field>}
                {mode === 'monthly' && <Field label={WORDS.month} htmlFor="export-month" className="max-w-xs"><Input id="export-month" type="month" value={month} onChange={event => setMonth(event.target.value)} /></Field>}
                {mode === 'yearly' && <Field label={WORDS.year} htmlFor="export-year" className="max-w-xs"><Input id="export-year" type="number" min="2000" max="2100" value={year} onChange={event => setYear(event.target.value)} /></Field>}
                {mode === 'custom' && (
                    <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label={`From ${WORDS.date}`} htmlFor="export-start"><Input id="export-start" type="date" value={start} onChange={event => setStart(event.target.value)} /></Field>
                        <Field label={`To ${WORDS.date}`} htmlFor="export-end"><Input id="export-end" type="date" value={end} onChange={event => setEnd(event.target.value)} /></Field>
                    </div>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                    <p className="text-xs font-bold text-stone-700">File format</p>
                    <ChoiceCards options={FORMATS} value={format} onChange={setFormat} columns={2} label="File format" />
                </div>
                <button type="button" onClick={exportRows} disabled={exporting || invalidRange || count === 0} className="sf-btn-primary min-h-12">
                    <Download className="h-4 w-4" aria-hidden="true" /> {exporting ? 'Preparing export…' : `Download ${format === 'csv' ? 'CSV' : 'Excel'}`}
                </button>
            </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
            <StatTile icon={CalendarDays} tone="orange" label={WORDS.dates} value={invalidRange ? 'Choose valid dates' : `${range.start} to ${range.end}`} />
            <StatTile icon={Table2} tone="green" label="Matching records" value={counting ? 'Checking…' : count == null ? 'Unavailable' : formatCount(count)} />
        </section>
    </div>;
}
