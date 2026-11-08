// Import customers: an Excel or CSV file becomes SolarFlow customers, so a
// new client starts with the data they already keep in a sheet.
//
// Steps: choose the file, match its columns, match its stages (only when a
// column is saved as the stage), check, import. Nothing is written before
// the last step, and a finished import can be undone (its customers move to
// Trash) until the page is left. Reading and matching live in lib/import,
// shared with the agency's scripts/import-customers.mjs.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { supabase } from '../supabase';
import { logActivity } from '../utils';
import { CLIENT, CUSTOM_FIELDS, FEATURES, PRIMARY_STAGES, stageLabel } from '../config/index.js';
import { fetchAllPages } from '../lib/db.js';
import { downloadBlob, toCsv } from '../lib/download.js';
import { formatCount, formatDate, formatINR, formatKwp, todayIST } from '../lib/format.js';
import { ChoiceCards, ErrorBanner, Field, LoadingState, SectionCard, Select, Spinner, StatTile, Stepper, SuccessBanner } from '../ui/index.js';
import { useGlobalPopup } from './GlobalPopup';
import {
    LIMITS, NAME_TARGET, STAGE_TARGET, SpreadsheetError, TARGET_GROUPS, blankSheetHeaders, buildImport, columnNames, detectHeaderRow,
    distinctValues, guessMapping, guessStageMap, importTargets, insertInBatches, mappingProblem, readSpreadsheet, usableSheets,
} from '../lib/import/index.js';

const CONFIG = { features: FEATURES, stages: PRIMARY_STAGES, customFields: CUSTOM_FIELDS };
const TARGETS = importTargets(CONFIG);
const TARGET_BY_KEY = new Map(TARGETS.map(target => [target.key, target]));
const STAGE_OPTIONS = PRIMARY_STAGES.map(stage => ({ value: stage.id, label: stage.label }));
const STEP_LABELS = { file: 'Choose file', columns: 'Match columns', stages: 'Match stages', check: 'Check', import: 'Import' };
const ACCEPT = '.xlsx,.xlsm,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
const BATCH = 100;
const PREVIEW_ROWS = 20;
const LIST_LIMIT = 100;
const STAGE_VALUE_LIMIT = 50;
const HEADER_CHOICES = 15;
const DUPLICATE_CHOICES = [
    { value: 'skip', label: 'Leave them out', description: 'Recommended. Customers already in SolarFlow, or repeated in the file, are not added again.' },
    { value: 'import', label: 'Import them anyway', description: 'Every row is added, even if the mobile or consumer number is already used.' },
];

const plural = (count, word) => `${formatCount(count)} ${word}${count === 1 ? '' : 's'}`;
const fileSlug = () => CLIENT.slug || 'solarflow';

// The first few filled values of each column, below the header row.
function columnSamples(rows, headerRow, width) {
    const samples = Array.from({ length: width }, () => []);
    for (const row of rows.slice(headerRow + 1)) {
        let missing = false;
        for (let col = 0; col < width; col += 1) {
            if (samples[col].length >= 3) continue;
            if (row[col]) samples[col].push(row[col]);
            missing = true;
        }
        if (!missing) break;
    }
    return samples;
}

// A saved value as the check step shows it.
function shownValue(target, payload) {
    if (target.kind === 'stage') return stageLabel(payload.stage);
    const value = target.custom ? payload.custom_fields?.[target.field] : payload[target.key];
    if (value == null || value === '') return '–';
    if (target.kind === 'money') return formatINR(value, { zero: '₹0' });
    if (target.kind === 'kilowatts') return formatKwp(value);
    if (target.kind === 'date' || target.kind === 'timestamp') return formatDate(value, 'short');
    return String(value);
}

// New channel partner and panel brand names join their dropdown lists, as they do for a new lead.
async function addListLabels(payloads) {
    for (const category of ['channel_partner', 'module_brand']) {
        const labels = new Map();
        for (const payload of payloads) {
            const label = String(payload[category] || '').trim();
            if (label && !labels.has(label.toLowerCase())) labels.set(label.toLowerCase(), label);
        }
        if (!labels.size) continue;
        const { data, error } = await supabase.from('metadata').select('label').eq('category', category);
        if (error) { console.warn(`Could not read the ${category} list:`, error.message); continue; }
        for (const row of data || []) labels.delete(String(row.label || '').trim().toLowerCase());
        if (!labels.size) continue;
        const { error: insertError } = await supabase.from('metadata').insert([...labels.values()].map(label => ({ category, label })));
        if (insertError) console.warn(`Could not add new names to the ${category} list:`, insertError.message);
    }
}

function TargetSelect({ id, value, onChange }) {
    return (
        <select id={id} value={value || ''} onChange={event => onChange(event.target.value || null)} className="sf-input min-h-11">
            <option value="">Don't import</option>
            {TARGET_GROUPS.map(group => {
                const items = TARGETS.filter(target => target.group === group.id);
                return items.length ? (
                    <optgroup key={group.id} label={group.label}>
                        {items.map(target => <option key={target.key} value={target.key}>{target.label}{target.required ? ' (required)' : ''}</option>)}
                    </optgroup>
                ) : null;
            })}
        </select>
    );
}

function NavButtons({ onBack, backLabel = 'Back', onNext, nextLabel, nextDisabled }) {
    return (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            {onBack ? <button type="button" onClick={onBack} className="sf-btn-secondary min-h-11"><ArrowLeft size={16} aria-hidden="true" /> {backLabel}</button> : <span />}
            {onNext && <button type="button" onClick={onNext} disabled={nextDisabled} className="sf-btn-primary min-h-11">{nextLabel} <ArrowRight size={16} aria-hidden="true" /></button>}
        </div>
    );
}

function RowList({ items, render, more }) {
    return (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto px-4 pb-4 text-xs text-stone-700">
            {items.slice(0, LIST_LIMIT).map((item, index) => <li key={`${item.rowNumber}-${index}`}>{render(item)}</li>)}
            {items.length > LIST_LIMIT && <li className="font-semibold text-stone-500">…and {formatCount(items.length - LIST_LIMIT)} more. {more}</li>}
        </ul>
    );
}

export default function ImportCustomersView({ user, showAlert, refreshMetrics, setTrashCount, goHome }) {
    const { showConfirm } = useGlobalPopup();
    const [step, setStep] = useState('file');
    const [fileName, setFileName] = useState('');
    const [reading, setReading] = useState(false);
    const [fileError, setFileError] = useState('');
    const [dragging, setDragging] = useState(false);
    const [sheets, setSheets] = useState([]);
    const [sheetIndex, setSheetIndex] = useState(0);
    const [headerRow, setHeaderRow] = useState(0);
    const [mapping, setMapping] = useState([]);
    const [mappingNote, setMappingNote] = useState('');
    const [columnsError, setColumnsError] = useState('');
    const [stageChoices, setStageChoices] = useState({});
    const [existing, setExisting] = useState(null);
    const [existingError, setExistingError] = useState('');
    const [duplicatePolicy, setDuplicatePolicy] = useState('skip');
    const [progress, setProgress] = useState(null);
    const [outcome, setOutcome] = useState(null);
    const [undo, setUndo] = useState(null);
    const inputRef = useRef(null);
    const headingRef = useRef(null);

    const sheet = sheets[sheetIndex] || null;
    const names = useMemo(() => (sheet ? columnNames(sheet.rows[headerRow] || [], sheet.columnLetters) : []), [sheet, headerRow]);
    const samples = useMemo(() => (sheet ? columnSamples(sheet.rows, headerRow, names.length) : []), [sheet, headerRow, names.length]);
    const stageColumn = mapping.indexOf(STAGE_TARGET);
    const stageValues = useMemo(() => (sheet && stageColumn !== -1 ? distinctValues(sheet.rows, headerRow, stageColumn) : []), [sheet, headerRow, stageColumn]);
    const stageMap = useMemo(() => ({ ...guessStageMap(stageValues, PRIMARY_STAGES), ...stageChoices }), [stageValues, stageChoices]);
    const steps = ['file', 'columns', ...(stageColumn !== -1 ? ['stages'] : []), 'check', 'import'].map(id => ({ id, label: STEP_LABELS[id] }));
    const stepIndex = steps.findIndex(item => item.id === step);
    const importing = step === 'import' && !outcome;

    const plan = useMemo(() => {
        if (!sheet || !existing || mappingProblem(mapping, TARGETS)) return null;
        return buildImport({
            rows: sheet.rows, headerRow, rowNumbers: sheet.rowNumbers, mapping, stageMap, existing, duplicatePolicy, config: CONFIG,
            defaults: { lead_creator_profile_id: user?.id || null },
        });
    }, [sheet, headerRow, mapping, stageMap, existing, duplicatePolicy, user?.id]);

    // Screen readers hear the new step; the first render keeps focus where it was.
    const firstRender = useRef(true);
    useEffect(() => {
        if (firstRender.current) { firstRender.current = false; return; }
        headingRef.current?.focus();
    }, [step]);

    // Leaving mid-import would stop it halfway.
    useEffect(() => {
        if (!importing) return undefined;
        const warn = event => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [importing]);

    // Customers already saved, for the duplicate check. Head office sees every row.
    const loadExisting = () => {
        setExistingError('');
        fetchAllPages(() => supabase.from('admin').select('id, phone_number, consumer_no').is('deleted_at', null).order('id', { ascending: true }))
            .then(setExisting)
            .catch(error => {
                console.error('Could not load customers for the duplicate check:', error);
                setExistingError('SolarFlow could not check which customers are already saved. Check your connection and try again.');
            });
    };
    useEffect(() => {
        if (step === 'check' && !existing) loadExisting();
        // Loaded once per visit to the check step.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    const pickSheet = (list, index) => {
        const rows = list[index]?.rows || [];
        const header = detectHeaderRow(rows);
        setSheetIndex(index);
        setHeaderRow(header);
        setMapping(guessMapping(columnNames(rows[header] || [], list[index]?.columnLetters || []), TARGETS));
        setStageChoices({});
        setMappingNote('');
        setColumnsError('');
    };

    const reset = () => {
        setStep('file'); setFileName(''); setSheets([]); setSheetIndex(0); setMapping([]); setStageChoices({});
        setOutcome(null); setUndo(null); setProgress(null); setFileError(''); setExisting(null); setDuplicatePolicy('skip');
    };

    const readFile = async file => {
        if (!file) return;
        setFileError('');
        setSheets([]);
        if (file.size > LIMITS.fileBytes) {
            setFileError(`This file is larger than ${Math.round(LIMITS.fileBytes / 1024 / 1024)} MB. Split it into smaller files, or remove pictures and extra sheets, then try again.`);
            return;
        }
        setReading(true);
        setFileName(file.name);
        try {
            const { sheets: read } = await readSpreadsheet({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
            const usable = usableSheets(read);
            if (!usable.length) {
                setFileError('This file has no rows to import. Check that you chose the right file.');
                return;
            }
            // Sheets that could not be read come last, so the first one failing means none can be used.
            if (usable[0].error) {
                setFileError(usable.length > 1 ? `No sheet in this file can be imported. "${usable[0].name}": ${usable[0].error}` : usable[0].error);
                return;
            }
            setSheets(usable);
            pickSheet(usable, 0);
            if (usable.length === 1) setStep('columns');
        } catch (error) {
            if (!(error instanceof SpreadsheetError)) console.error('Could not read the file:', error);
            setFileError(error instanceof SpreadsheetError ? error.message
                : 'This file could not be read. Open it in Excel and save it again as .xlsx or CSV, then try again.');
        } finally {
            setReading(false);
        }
    };

    const chooseHeaderRow = index => {
        setHeaderRow(index);
        setMapping(guessMapping(columnNames(sheet.rows[index] || [], sheet.columnLetters), TARGETS));
        setStageChoices({});
        setMappingNote('');
    };

    const setTarget = (col, key) => {
        const other = key ? mapping.findIndex((current, index) => current === key && index !== col) : -1;
        setMapping(prev => prev.map((current, index) => (index === col ? key : key && current === key ? null : current)));
        setMappingNote(other === -1 ? '' : `${TARGET_BY_KEY.get(key).label} was taken off "${names[other]}", so that column is now not imported.`);
        setColumnsError('');
    };

    const leaveColumns = () => {
        const problem = mappingProblem(mapping, TARGETS);
        if (problem) { setColumnsError(problem); return; }
        setStep(stageColumn !== -1 ? 'stages' : 'check');
    };

    const notImportedCsv = rows => {
        if (!sheet) return;
        const byNumber = new Map(sheet.rowNumbers.map((number, index) => [number, sheet.rows[index]]));
        const columns = [
            { key: 'row', label: 'Row in your file' },
            { key: 'reason', label: 'Why it was not imported' },
            ...names.map((name, col) => ({ key: `col${col}`, label: name, get: item => byNumber.get(item.rowNumber)?.[col] ?? '' })),
        ];
        const lines = rows.map(item => ({ ...item, row: item.rowNumber }));
        downloadBlob(toCsv(lines, columns), 'text/csv;charset=utf-8', `${fileSlug()}-not-imported-${todayIST()}.csv`);
    };

    const downloadBlankSheet = () => {
        const columns = blankSheetHeaders(TARGETS).map(label => ({ key: label, label }));
        downloadBlob(toCsv([], columns), 'text/csv;charset=utf-8', `${fileSlug()}-customer-sheet.csv`);
    };

    const runImport = async () => {
        // Built again so the new rows carry the time they are saved.
        const final = buildImport({
            rows: sheet.rows, headerRow, rowNumbers: sheet.rowNumbers, mapping, stageMap, existing, duplicatePolicy, config: CONFIG,
            now: new Date(), defaults: { lead_creator_profile_id: user?.id || null },
        });
        const total = final.ready.length;
        setStep('import');
        setOutcome(null);
        setProgress({ saved: 0, total });
        // Ids are made in the browser so a batch whose reply is lost can still be found, counted and undone.
        const { ids, savedIndexes, failure } = await insertInBatches({
            rows: final.ready,
            batchSize: BATCH,
            insert: batch => supabase.from('admin').insert(batch, { defaultToNull: false }).select('id'),
            findSaved: batchIds => supabase.from('admin').select('id').in('id', batchIds),
            onProgress: saved => setProgress({ saved, total }),
        });
        if (failure) console.error('Import batch failed:', failure.message);
        const saved = ids.length;
        const savedSet = new Set(savedIndexes);
        const unsaved = failure
            ? final.readyRowNumbers.flatMap((rowNumber, index) => (savedSet.has(index) ? [] : [{ rowNumber, reason: `Not saved: ${failure.message}` }]))
            : [];
        setOutcome({
            ids,
            saved,
            failure: failure && { message: failure.message, row: final.readyRowNumbers[failure.index] },
            notImported: [...final.skipped, ...unsaved].sort((a, b) => a.rowNumber - b.rowNumber),
        });
        if (ids.length) {
            const left = final.skipped.length + unsaved.length;
            void logActivity(user?.id, 'create', `Imported ${plural(ids.length, 'customer')} from ${fileName}`,
                `Done by: ${user?.name || 'Admin'}.${left ? ` ${plural(left, 'row')} not imported.` : ''}`, null);
            await addListLabels(final.ready.filter((_, index) => savedSet.has(index)));
            refreshMetrics?.();
        }
    };

    const undoImport = async () => {
        const count = outcome.ids.length;
        const ok = await showConfirm(`The ${plural(count, 'customer')} from this import will move to Trash. You can recover them from Trash later.`, {
            title: 'Undo this import?', confirmLabel: 'Move to Trash', cancelLabel: 'Keep them', type: 'warning',
        });
        if (!ok) return;
        setUndo({ working: true });
        const deletedAt = new Date().toISOString();
        let moved = 0;
        let error = null;
        for (let start = 0; start < count; start += BATCH) {
            const batch = outcome.ids.slice(start, start + BATCH);
            const result = await supabase.from('admin').update({ deleted_at: deletedAt }).in('id', batch).is('deleted_at', null).select('id');
            if (result.error) { error = result.error; break; }
            moved += result.data?.length || 0;
        }
        if (moved) {
            setTrashCount?.(current => current + moved);
            void logActivity(user?.id, 'delete', `Undid an import: moved ${plural(moved, 'customer')} from ${fileName} to Trash`, `Done by: ${user?.name || 'Admin'}`, null);
            refreshMetrics?.();
        }
        if (error) {
            console.error('Undo import failed:', error);
            setUndo({ error: `${plural(moved, 'customer')} moved to Trash, then SolarFlow stopped: ${error.message}. Try again to move the rest.` });
            return;
        }
        setUndo({ done: true, moved });
        showAlert?.(`${plural(moved, 'customer')} moved to Trash.`, { type: 'success', title: 'Import undone' });
    };

    const goBack = () => setStep(steps[Math.max(0, stepIndex - 1)].id);

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <header className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 text-orange-600"><FileSpreadsheet aria-hidden="true" /></span>
                        <div>
                            <p className="sf-kicker">Bring your old data</p>
                            <h1 className="mt-1 text-2xl font-black text-stone-900">Import customers</h1>
                            <p className="mt-1 text-sm text-stone-500">Add the customers you keep in Excel or Google Sheets. Nothing is saved until the last step.</p>
                        </div>
                    </div>
                    <button type="button" onClick={downloadBlankSheet} className="sf-btn-secondary min-h-11 shrink-0">
                        <Download size={16} aria-hidden="true" /> Download a blank sheet
                    </button>
                </div>
                <div className="mt-5">
                    <Stepper steps={steps} current={step} onStep={step === 'import' ? undefined : id => {
                        if (steps.findIndex(item => item.id === id) < stepIndex) setStep(id);
                    }} />
                </div>
            </header>

            <h2 ref={headingRef} tabIndex={-1} className="sr-only">{STEP_LABELS[step]}</h2>

            {step === 'file' && (
                <SectionCard title="Choose your file" icon={Upload} subtitle="Excel (.xlsx) or CSV, up to 20,000 customers">
                    <div
                        onDragOver={event => { event.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={event => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files?.[0]); }}
                        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors sm:p-10 ${dragging ? 'border-orange-400 bg-orange-50' : 'border-stone-300 bg-stone-50'}`}
                    >
                        <Upload size={28} className="mx-auto text-orange-500" aria-hidden="true" />
                        <p className="mt-3 text-sm font-bold text-stone-800">Drop the file here, or</p>
                        <input
                            ref={inputRef} type="file" accept={ACCEPT} className="hidden" aria-label="Customer file"
                            onChange={event => { readFile(event.target.files?.[0]); event.target.value = ''; }}
                        />
                        <button type="button" onClick={() => inputRef.current?.click()} disabled={reading} className="sf-btn-primary mt-3 min-h-11">
                            <FileSpreadsheet size={16} aria-hidden="true" /> Choose a file
                        </button>
                        {reading && <p role="status" className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-stone-600"><Spinner /> Reading {fileName}…</p>}
                    </div>
                    {fileError && <ErrorBanner title="This file could not be used">{fileError}</ErrorBanner>}

                    {sheets.length > 1 && (
                        <div className="space-y-3">
                            <p className="text-sm font-bold text-stone-800">{fileName} has {sheets.length} sheets. Which one has your customers?</p>
                            <ChoiceCards
                                label="Sheet to import" columns={2} value={sheetIndex} onChange={index => pickSheet(sheets, index)}
                                options={sheets.map((item, index) => ({
                                    value: index, label: item.hidden ? `${item.name} (hidden)` : item.name,
                                    description: item.error ? 'Cannot be imported' : `${plural(Math.max(0, item.rows.length - 1), 'row')} below the column names`,
                                }))}
                            />
                            {sheet?.error && <ErrorBanner title={`"${sheet.name}" cannot be imported`}>{sheet.error}</ErrorBanner>}
                            <NavButtons onNext={() => setStep('columns')} nextLabel="Next: match columns" nextDisabled={Boolean(sheet?.error)} />
                        </div>
                    )}

                    <div className="space-y-1.5 rounded-xl bg-stone-50 p-4 text-xs leading-relaxed text-stone-600">
                        <p><strong className="text-stone-800">Using Google Sheets?</strong> Choose File → Download → Microsoft Excel (.xlsx), then pick that file here.</p>
                        <p><strong className="text-stone-800">Old Excel file (.xls)?</strong> Open it in Excel and choose File → Save As → Excel Workbook (.xlsx).</p>
                        <p><strong className="text-stone-800">No sheet yet?</strong> Download a blank sheet (button above), fill one customer per row, and import it.</p>
                    </div>
                </SectionCard>
            )}

            {step === 'columns' && sheet && (
                <SectionCard title="Match your columns" icon={FileSpreadsheet}
                    subtitle={`${fileName}${sheets.length > 1 ? ` · ${sheet.name}` : ''} · ${plural(mapping.filter(Boolean).length, 'column')} of ${names.length} matched`}>
                    <p className="text-sm text-stone-600">For each column in your file, choose where it goes in SolarFlow. Choose <strong>Don't import</strong> for anything you don't need. Every customer needs a name.</p>
                    <Field label="Column names are in" htmlFor="import-header-row" className="max-w-xl">
                        <Select
                            id="import-header-row" value={String(headerRow)} onChange={event => chooseHeaderRow(Number(event.target.value))}
                            options={sheet.rows.slice(0, HEADER_CHOICES).map((row, index) => ({
                                value: String(index), label: `Row ${sheet.rowNumbers[index]}: ${row.filter(Boolean).slice(0, 4).join(', ').slice(0, 70)}`,
                            }))}
                        />
                    </Field>
                    {mappingNote && <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">{mappingNote}</p>}
                    <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200">
                        {names.map((name, col) => (
                            <li key={`${col}-${name}`} className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_minmax(0,16rem)] sm:items-center">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Column {sheet.columnLetters[col]}</p>
                                    <p className="truncate text-sm font-bold text-stone-900" title={name}>{name}</p>
                                </div>
                                <p className="min-w-0 text-xs text-stone-500">
                                    {samples[col]?.length ? samples[col].map(value => (value.length > 40 ? `${value.slice(0, 40)}…` : value)).join(' · ') : 'No values'}
                                </p>
                                <Field label={`Save "${name}" as`} htmlFor={`import-col-${col}`}>
                                    <TargetSelect id={`import-col-${col}`} value={mapping[col]} onChange={key => setTarget(col, key)} />
                                </Field>
                            </li>
                        ))}
                    </ul>
                    <ErrorBanner>{columnsError}</ErrorBanner>
                    <NavButtons onBack={() => setStep('file')} backLabel="Choose another file" onNext={leaveColumns}
                        nextLabel={stageColumn !== -1 ? 'Next: match stages' : 'Next: check'} />
                </SectionCard>
            )}

            {step === 'stages' && sheet && (
                <SectionCard title="Match your stages" icon={FileSpreadsheet} subtitle={`Values in "${names[stageColumn]}"`}>
                    <p className="text-sm text-stone-600">Choose the SolarFlow stage for each status in your file. Statuses SolarFlow did not recognise are set to {stageLabel('LEADS')}; change any of them.</p>
                    {stageValues.length > STAGE_VALUE_LIMIT && (
                        <p role="status" className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                            <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
                            This column has {formatCount(stageValues.length)} different values. If it is not really the stage, go back and choose Don't import for it. Only the {STAGE_VALUE_LIMIT} most common are shown; the rest start in {stageLabel('LEADS')}.
                        </p>
                    )}
                    <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200">
                        {stageValues.filter(value => value.key).slice(0, STAGE_VALUE_LIMIT).map(value => (
                            <li key={value.key} className="grid gap-3 p-4 sm:grid-cols-[1fr_minmax(0,16rem)] sm:items-center">
                                <p className="min-w-0 text-sm text-stone-800"><strong className="break-words">“{value.value}”</strong> <span className="text-stone-500">· {plural(value.count, 'customer')}</span></p>
                                <Field label={`Stage for “${value.value}”`} htmlFor={`import-stage-${value.key}`}>
                                    <Select id={`import-stage-${value.key}`} options={STAGE_OPTIONS} value={stageMap[value.key]}
                                        onChange={event => setStageChoices(prev => ({ ...prev, [value.key]: event.target.value }))} />
                                </Field>
                            </li>
                        ))}
                    </ul>
                    {stageValues.some(value => !value.key) && (
                        <p className="text-xs text-stone-500">{plural(stageValues.find(value => !value.key).count, 'row')} with no status will start in {stageLabel('LEADS')}.</p>
                    )}
                    <NavButtons onBack={goBack} onNext={() => setStep('check')} nextLabel="Next: check" />
                </SectionCard>
            )}

            {step === 'check' && (
                <SectionCard title="Check before importing" icon={FileSpreadsheet} subtitle={fileName}>
                    {!existing && !existingError && <LoadingState label="Checking which customers are already in SolarFlow…" />}
                    <ErrorBanner onRetry={loadExisting}>{existingError}</ErrorBanner>
                    {plan && <CheckSummary plan={plan} duplicatePolicy={duplicatePolicy} onPolicy={setDuplicatePolicy} mapping={mapping}
                        onDownload={() => notImportedCsv(plan.skipped)} />}
                    <NavButtons onBack={goBack} onNext={plan?.ready.length ? runImport : undefined}
                        nextLabel={plan ? `Import ${plural(plan.ready.length, 'customer')}` : 'Import'} />
                    {plan && !plan.ready.length && <ErrorBanner>No row can be imported. Go back and check the column matches.</ErrorBanner>}
                </SectionCard>
            )}

            {step === 'import' && (
                <SectionCard title={outcome ? 'Import finished' : 'Importing…'} icon={Upload} subtitle={fileName}>
                    {!outcome && progress && (
                        <div className="space-y-3" role="status">
                            <p className="text-sm font-semibold text-stone-700">Saving customers: {formatCount(progress.saved)} of {formatCount(progress.total)}. Keep this page open.</p>
                            <div role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.saved}
                                className="h-3 overflow-hidden rounded-full bg-stone-200">
                                <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${progress.total ? (progress.saved / progress.total) * 100 : 100}%` }} />
                            </div>
                        </div>
                    )}
                    {outcome && (
                        <div className="space-y-4">
                            {outcome.failure ? (
                                <ErrorBanner title="The import stopped">
                                    Saved: {plural(outcome.saved, 'customer')}. Row {outcome.failure.row} and the rows after it were not saved because: {outcome.failure.message}
                                </ErrorBanner>
                            ) : (
                                <SuccessBanner title={`${plural(outcome.saved, 'customer')} imported`}>
                                    They are in their stages now. {outcome.notImported.length ? `${plural(outcome.notImported.length, 'row')} from the file were not imported.` : 'Every row was imported.'}
                                </SuccessBanner>
                            )}
                            {undo?.done && <SuccessBanner>{plural(undo.moved, 'customer')} from this import moved to Trash. You can recover them from Trash.</SuccessBanner>}
                            <ErrorBanner>{undo?.error}</ErrorBanner>
                            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                                {outcome.notImported.length > 0 && (
                                    <button type="button" onClick={() => notImportedCsv(outcome.notImported)} className="sf-btn-secondary min-h-11">
                                        <Download size={16} aria-hidden="true" /> Download rows that were not imported (CSV)
                                    </button>
                                )}
                                {outcome.ids.length > 0 && !undo?.done && (
                                    <button type="button" onClick={undoImport} disabled={undo?.working} className="sf-btn-secondary min-h-11">
                                        <RotateCcw size={16} aria-hidden="true" /> {undo?.working ? 'Moving to Trash…' : 'Undo this import'}
                                    </button>
                                )}
                                <button type="button" onClick={reset} className="sf-btn-secondary min-h-11"><Upload size={16} aria-hidden="true" /> Import another file</button>
                                {goHome && <button type="button" onClick={goHome} className="sf-btn-primary min-h-11">Go to the dashboard <ArrowRight size={16} aria-hidden="true" /></button>}
                            </div>
                            {outcome.ids.length > 0 && !undo?.done && <p className="text-xs text-stone-500">Undo is available until you leave this page.</p>}
                        </div>
                    )}
                </SectionCard>
            )}
        </div>
    );
}

function CheckSummary({ plan, duplicatePolicy, onPolicy, mapping, onDownload }) {
    const duplicates = plan.skipped.filter(item => item.duplicate);
    const others = plan.skipped.filter(item => !item.duplicate);
    const shown = [...mapping.flatMap(key => (key && key !== STAGE_TARGET ? [TARGET_BY_KEY.get(key)] : [])), TARGET_BY_KEY.get(STAGE_TARGET)].filter(Boolean);
    const name = TARGET_BY_KEY.get(NAME_TARGET);
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile tone="green" label="Ready to import" value={formatCount(plan.counts.ready)} />
                <StatTile tone="yellow" label={duplicatePolicy === 'import' ? 'Possible duplicates (kept)' : 'Already in SolarFlow or repeated'} value={formatCount(plan.counts.duplicates)} />
                <StatTile tone="red" label="Skipped" value={formatCount(others.length)} hint={others.length ? 'Missing a name, or not a customer row' : undefined} />
                <StatTile tone="stone" label="Warnings" value={formatCount(plan.counts.warnings)} hint={plan.counts.warnings ? 'Saved, but worth a look' : undefined} />
            </div>

            {plan.counts.duplicates > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-bold text-stone-800">{plural(plan.counts.duplicates, 'row')} have a mobile or consumer number that is already used. What should happen to them?</p>
                    <ChoiceCards label="Duplicate customers" options={DUPLICATE_CHOICES} value={duplicatePolicy} onChange={onPolicy} columns={2} />
                </div>
            )}

            {plan.skipped.length > 0 && (
                <details className="rounded-2xl border border-stone-200 bg-white">
                    <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-bold text-stone-800">Why {plural(plan.skipped.length, 'row')} will not be imported</summary>
                    <RowList items={[...duplicates, ...others].sort((a, b) => a.rowNumber - b.rowNumber)} more="Download the list to see them all."
                        render={item => <><strong>Row {item.rowNumber}</strong> · {item.reason}</>} />
                    <div className="px-4 pb-4">
                        <button type="button" onClick={onDownload} className="sf-btn-secondary min-h-11"><Download size={16} aria-hidden="true" /> Download these rows (CSV)</button>
                    </div>
                </details>
            )}

            {plan.warnings.length > 0 && (
                <details className="rounded-2xl border border-stone-200 bg-white">
                    <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-bold text-stone-800">{plural(plan.warnings.length, 'warning')}: these rows will be imported, but check them</summary>
                    <RowList items={plan.warnings} more="Fix them in SolarFlow after importing, or in your file before."
                        render={item => <><strong>Row {item.rowNumber}</strong> · {item.column}: {item.message}</>} />
                </details>
            )}

            {plan.ready.length > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-bold text-stone-800">
                        {plan.ready.length === 1 ? 'The customer, as it will be saved' : `The first ${Math.min(PREVIEW_ROWS, plan.ready.length)} customers, as they will be saved`}
                    </p>
                    <div className="overflow-x-auto rounded-2xl border border-stone-200">
                        <table className="min-w-full text-left text-xs">
                            <thead className="bg-stone-50 text-[10px] uppercase tracking-wide text-stone-500">
                                <tr>
                                    <th scope="col" className="px-3 py-2 font-bold">Row</th>
                                    {shown.map(target => <th key={target.key} scope="col" className="whitespace-nowrap px-3 py-2 font-bold">{target.label}</th>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {plan.ready.slice(0, PREVIEW_ROWS).map((payload, index) => (
                                    <tr key={plan.readyRowNumbers[index]}>
                                        <td className="px-3 py-2 font-semibold text-stone-500">{plan.readyRowNumbers[index]}</td>
                                        {shown.map(target => (
                                            <td key={target.key} className={`max-w-[16rem] truncate px-3 py-2 ${target.key === name.key ? 'font-bold text-stone-900' : 'text-stone-700'}`}>
                                                {shownValue(target, payload)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
