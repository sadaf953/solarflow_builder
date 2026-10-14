import { useId, useMemo, useState } from 'react';
import { Columns3, Download, ExternalLink, FileCode2, FileJson, ListChecks, ListPlus, ListTree, Settings2, User, Workflow } from 'lucide-react';
import { DROPDOWN_CATALOG, CUSTOM_FIELD_TYPES } from '../../../template/src/config/catalog/dropdowns.js';
import { BRANDING_FIELDS, brandingErrors, isAllowedSheetUrl, resolveClientConfig, slugify } from '../../../template/src/config/resolve.js';
import { Badge, ErrorBanner, Field, Input, SectionCard, Spinner, SuccessBanner, Textarea, describedBy } from '../../../template/src/ui/index.js';
import { QUESTION_STEPS, describeAnswer, isVisible } from '../catalog/questions.js';
import { brandingOverrides, effectiveWorkflow, restoredStages, submissionFeatures, submissionToClientConfig } from '../catalog/submission.js';
import { buildOptions, checkClientConfig, downloadBytes, generateClientZip, generateSetupSql } from '../zip/index.js';
import { FeatureColumns, FeatureToggles } from './FeatureViews.jsx';
import { FieldEditor } from './FieldEditor.jsx';
import { ListsEditor } from './ListEditors.jsx';
import { StageEditor } from './StageEditor.jsx';
import { Expander, MessageList } from './common.jsx';
import { BUILTIN_BY_ID, adminWorkflowFrom, currentStages, downloadJson } from './wizardData.js';

const CONTACT_ROWS = [['company', 'Company'], ['name', 'Name'], ['phone', 'Phone'], ['email', 'Email (first admin login)'], ['city', 'City'], ['state', 'State']];

function Rows({ rows }) {
    return (
        <dl className="divide-y divide-stone-100">
            {rows.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:justify-between sm:gap-4">
                    <dt className="text-stone-500">{label}</dt>
                    <dd className="min-w-0 break-words font-semibold text-stone-800 sm:text-right">{value || '–'}</dd>
                </div>
            ))}
        </dl>
    );
}

function Answers({ answers }) {
    return (
        <div className="space-y-4">
            {QUESTION_STEPS.map(step => (
                <div key={step.id}>
                    <p className="sf-kicker">{step.title}</p>
                    <ul className="mt-1 divide-y divide-stone-100">
                        {step.questions.filter(question => isVisible(question, answers)).map(question => {
                            const answer = answers[question.id];
                            return (
                                <li key={question.id} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                    <span className="text-stone-600">{question.question}</span>
                                    <span className="shrink-0">
                                        {answer === 'unsure' ? <Badge tone="yellow">Not sure</Badge>
                                            : !answer ? <Badge tone="red">Not answered</Badge>
                                                : <span className="font-bold text-stone-900">{describeAnswer(question, answer)}</span>}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function SheetLink({ workflow }) {
    const url = String(workflow.sheetUrl || '').trim();
    return (
        <div className="space-y-2 text-sm">
            <p className="font-bold text-stone-900">The client shared a sheet instead of filling in the workflow.</p>
            {isAllowedSheetUrl(url)
                ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 break-all font-semibold text-blue-700 underline">
                    Open the sheet <ExternalLink size={14} aria-hidden="true" /></a>
                : <p className="text-red-700">The sheet link is missing or not a Google Sheets / OneDrive link{url ? `: ${url}` : '.'}</p>}
            {workflow.sheetNote && <p className="whitespace-pre-line text-stone-600">{workflow.sheetNote}</p>}
        </div>
    );
}

// The workflow the zip is built from: the admin's when set, else the client's.
function WorkflowSummary({ submission, config, settings }) {
    const workflow = effectiveWorkflow(submission, settings.workflow);
    const resolved = useMemo(() => resolveClientConfig(config), [config]);
    const restored = useMemo(() => restoredStages(submission, settings), [submission, settings]);
    const stageLabel = Object.fromEntries(resolved.stages.map(stage => [stage.id, stage.label]));
    const changedLists = Object.keys(workflow.dropdowns || {}).filter(id => DROPDOWN_CATALOG[id] && Array.isArray(workflow.dropdowns[id]));
    const stagesFrom = settings.workflow ? 'set up by you' : workflow.stagesMode === 'custom' ? 'changed by the client' : 'standard';
    return (
        <div className="space-y-5 text-sm">
            {restored.length > 0 && (
                <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-900">
                    Added back because the features need them: {restored.map(stage => `${stage.label} (${stage.reason})`).join(', ')}.
                </p>
            )}
            <div>
                <p className="sf-kicker">Stages · {stagesFrom}</p>
                <ol className="mt-2 flex flex-wrap gap-1.5">
                    {resolved.stages.map((stage, index) => {
                        const builtin = BUILTIN_BY_ID[stage.id];
                        return (
                            <li key={stage.id} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                                {index + 1}. {stage.label}
                                {stage.custom && <span className="text-orange-700"> · new</span>}
                                {builtin && builtin.label !== stage.label && <span className="text-stone-500"> · was {builtin.label}</span>}
                            </li>
                        );
                    })}
                </ol>
            </div>
            <div>
                <p className="sf-kicker">Dropdown lists</p>
                {changedLists.length ? (
                    <ul className="mt-2 space-y-1.5">
                        {changedLists.map(id => (
                            <li key={id}>
                                <span className="font-bold text-stone-900">{DROPDOWN_CATALOG[id].label}:</span>{' '}
                                <span className="text-stone-600">{workflow.dropdowns[id].map(item => (typeof item === 'string' ? item : item.label || item.id)).join(', ') || 'empty'}</span>
                            </li>
                        ))}
                    </ul>
                ) : <p className="mt-1 text-stone-500">All lists use the standard values.</p>}
            </div>
            <div>
                <p className="sf-kicker">Extra fields</p>
                {config.customFields.length ? (
                    <ul className="mt-2 divide-y divide-stone-100">
                        {config.customFields.map(field => (
                            <li key={field.key} className="py-1.5">
                                <span className="font-bold text-stone-900">{field.label}</span>
                                <span className="text-stone-600"> · {CUSTOM_FIELD_TYPES[field.type] || field.type} · {stageLabel[field.stage] || field.stage}</span>
                                {field.required && <span className="text-stone-600"> · must be filled</span>}
                                {field.showInAddLead && <span className="text-stone-600"> · asked when adding a lead</span>}
                                {field.type === 'select' && <span className="block text-xs text-stone-500">Choices: {(field.options || []).join(', ')}</span>}
                            </li>
                        ))}
                    </ul>
                ) : <p className="mt-1 text-stone-500">No extra fields.</p>}
            </div>
        </div>
    );
}

// Company details the admin adds for the client's documents. Labels and
// length limits come from BRANDING_FIELDS.
const COMPANY_FIELDS = [
    { key: 'discomName', label: 'DISCOM name', max: 60, placeholder: 'For example MSEDCL', hint: 'The electricity company the client files with. Used on DISCOM stages and quotations.' },
    { key: 'chargesLabel', label: 'Registration charges label', max: 60, hint: 'Printed on quotations as “… Charge”. Leave empty for the usual label shown here.' },
    { key: 'address', multiline: true, hint: 'Printed in the quotation footer and as the EPC contractor address on feasibility reports.' },
    { key: 'gstin', upper: true, hint: 'Printed at the top of quotations.' },
    { key: 'website', placeholder: 'www.example.com', hint: 'Printed in the quotation footer.' },
    { key: 'logoUrl', type: 'url', placeholder: 'https://', hint: 'A direct https:// link to a PNG or JPG image. Without one, the company name is printed in its place.' },
    { key: 'epcCode', hint: 'Printed on feasibility reports.' },
];
const BANK_FIELDS = [
    { key: 'bankAccountName' },
    { key: 'bankAccountNumber', inputMode: 'numeric' },
    { key: 'bankName' },
    { key: 'bankBranch' },
    { key: 'bankIfsc', upper: true, placeholder: 'SBIN0001234' },
];

// `fallback` is the branding without the admin's details (placeholders).
function CompanyDetails({ value, fallback, errors, onChange }) {
    const id = useId();
    const [touched, setTouched] = useState({});
    const filled = Object.keys(brandingOverrides(value)).length;
    const placeholders = {
        discomName: fallback.discomName,
        chargesLabel: fallback.chargesLabel || `${String(value.discomName || '').trim() || fallback.discomName} registration`,
    };
    const renderField = ({ key, multiline, upper, hint, label, max, ...props }) => {
        const fieldId = `${id}-${key}`;
        const error = touched[key] ? errors[key] : '';
        const Control = multiline ? Textarea : Input;
        return (
            <Field key={key} label={label || BRANDING_FIELDS[key].label} htmlFor={fieldId} hint={hint} error={error} className={multiline ? 'sm:col-span-2' : ''}>
                <Control id={fieldId} value={value[key] || ''} maxLength={max || BRANDING_FIELDS[key].max} placeholder={placeholders[key]} {...props}
                    aria-invalid={error ? true : undefined} aria-describedby={describedBy(fieldId, { hint, error })}
                    onBlur={() => setTouched(current => ({ ...current, [key]: true }))}
                    onChange={event => onChange({ ...value, [key]: upper ? event.target.value.toUpperCase() : event.target.value })} />
            </Field>
        );
    };
    return (
        <Expander title="Company details for documents"
            subtitle={filled ? `${filled} filled in · used on quotations and feasibility reports` : 'Optional · used on quotations and feasibility reports'}>
            <div className="space-y-4">
                <p className="text-sm text-stone-600">
                    These are printed on the client’s quotations and feasibility reports. All are optional: anything left empty is left off,
                    or printed blank to fill in by hand. They are built into the app, so changing them later needs a new zip.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">{COMPANY_FIELDS.map(renderField)}</div>
                <div>
                    <p className="sf-kicker">Bank account</p>
                    <p className="mt-1 text-xs text-stone-500">
                        Quotations show the bank details once the account number is filled in. Feasibility reports print the account number and IFSC code.
                    </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">{BANK_FIELDS.map(renderField)}</div>
            </div>
        </Expander>
    );
}

// The admin's own stages, lists and fields for this client (for example
// from the client's sheet). They replace the client's in the zip.
function AdminWorkflowEditor({ submission, features, workflow, onChange }) {
    const sheet = submission.workflow?.source === 'sheet';
    if (!workflow) {
        return (
            <div className="space-y-3 text-sm text-stone-600">
                <p>
                    {sheet
                        ? 'Enter the stages, lists and extra fields from the client’s sheet here. The zip uses them instead of the standard ones.'
                        : 'Correct the client’s stages, lists or extra fields here if needed. The zip uses your version instead of theirs.'}
                </p>
                <button type="button" onClick={() => onChange(adminWorkflowFrom(submission))} className="sf-btn-primary min-h-11">
                    <Columns3 size={14} aria-hidden="true" /> Set up the workflow here
                </button>
            </div>
        );
    }
    const set = patch => onChange({ ...workflow, ...patch });
    const undo = () => {
        if (window.confirm('Remove your stages, lists and fields and use the client’s again?')) onChange(null);
    };
    return (
        <div className="space-y-4">
            <SectionCard title="Stages" icon={Columns3}>
                <StageEditor workflow={workflow} features={features} onChange={set} />
            </SectionCard>
            <SectionCard title="Dropdown lists" icon={ListTree}>
                <ListsEditor dropdowns={workflow.dropdowns} features={features} onChange={dropdowns => set({ dropdowns })} />
            </SectionCard>
            <SectionCard title="Extra fields" icon={ListPlus}>
                <FieldEditor fields={workflow.customFields} stages={currentStages(workflow, features)} onChange={customFields => set({ customFields })} />
            </SectionCard>
            <button type="button" onClick={undo} className="sf-btn-secondary min-h-11">Use the client’s workflow again</button>
        </div>
    );
}

/**
 * Everything the agency needs about one submission, plus the downloads.
 * `settings` ({adminOverrides, slug, ownerEmail, branding, workflow}, see
 * normalizeSettings) belong to the page, which decides where they are kept;
 * every change goes to `onSettings`. `saveStatus` is shown next to them.
 */
export function SubmissionReview({ submission, settings, onSettings, saveStatus, onDownloaded }) {
    const id = useId();
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const options = useMemo(() => buildOptions(settings), [settings]);
    const config = useMemo(() => submissionToClientConfig(submission, options), [submission, options]);
    const fallbackBranding = useMemo(() => submissionToClientConfig(submission).branding, [submission]);
    const validation = useMemo(() => checkClientConfig(config, { adminWorkflow: options.workflow }), [config, options]);
    const companyErrors = useMemo(() => brandingErrors(config.branding), [config]);
    const featureResult = submissionFeatures(submission, settings.adminOverrides);
    const baseline = submissionFeatures(submission).features;
    const contact = submission.contact || {};
    const defaultSlug = slugify(contact.company);
    const update = patch => { onSettings({ ...settings, ...patch }); setNotice(''); };

    const run = async (kind, task) => {
        setBusy(kind);
        setError('');
        setNotice('');
        try {
            setNotice(await task());
        } catch (err) {
            setError(err.message || 'Something went wrong.');
        } finally {
            setBusy('');
        }
    };
    const downloadZip = () => run('zip', async () => {
        const result = await generateClientZip({ submission, ...options, generatedAt: new Date().toISOString() });
        downloadBytes(result.bytes, result.fileName);
        await onDownloaded?.();
        return `Downloaded ${result.fileName}.`;
    });
    const downloadSql = () => run('sql', async () => {
        const result = generateSetupSql({ submission, ...options });
        downloadBytes(result.sql, result.fileName, 'application/sql');
        return `Downloaded ${result.fileName}.`;
    });
    const downloadAnswers = () => {
        downloadJson({ submission, ...settings }, `${config.client.slug}-setup.json`);
    };
    const overrideCount = Object.keys(settings.adminOverrides).length;

    return (
        <div className="space-y-4">
            {saveStatus && <div className="flex justify-end">{saveStatus}</div>}
            <SectionCard title="Contact" icon={User}>
                <Rows rows={CONTACT_ROWS.map(([key, label]) => [label, contact[key]])} />
            </SectionCard>

            <SectionCard title="Features" icon={ListChecks} subtitle="From the client's answers, their own switches and yours.">
                <FeatureColumns result={featureResult} />
                <Expander title="Change features (admin)" subtitle={overrideCount ? `${overrideCount} changed by you` : 'Only where the answers need correcting'}>
                    <FeatureToggles current={featureResult.features} baseline={baseline} overrides={settings.adminOverrides}
                        onChange={adminOverrides => update({ adminOverrides })} />
                </Expander>
                <Expander title="All answers">
                    <Answers answers={submission.answers || {}} />
                </Expander>
                {submission.notes && (
                    <div className="rounded-xl bg-stone-50 p-3 text-sm">
                        <p className="sf-kicker">Client's note</p>
                        <p className="mt-1 whitespace-pre-line text-stone-700">{submission.notes}</p>
                    </div>
                )}
            </SectionCard>

            <SectionCard title="Workflow" icon={Workflow}>
                {submission.workflow?.source === 'sheet' && <SheetLink workflow={submission.workflow} />}
                {(submission.workflow?.source !== 'sheet' || settings.workflow) && <WorkflowSummary submission={submission} config={config} settings={settings} />}
                <Expander title="Set up the workflow (admin)" defaultOpen={Boolean(settings.workflow)}
                    subtitle={settings.workflow ? 'Your stages, lists and fields are used for the zip' : 'Optional · for example from the client’s sheet'}>
                    <AdminWorkflowEditor submission={submission} features={featureResult.features} workflow={settings.workflow}
                        onChange={workflow => update({ workflow })} />
                </Expander>
            </SectionCard>
            <SectionCard title="Build the client app" icon={Settings2}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Owner email (first admin login)" htmlFor={`${id}-owner`} hint={`Leave empty to use ${contact.email || 'the client email'}.`}>
                        <Input id={`${id}-owner`} type="email" value={settings.ownerEmail} placeholder={contact.email || 'owner@example.com'}
                            aria-describedby={`${id}-owner-hint`} onChange={event => update({ ownerEmail: event.target.value })} />
                    </Field>
                    <Field label="Folder name (slug)" htmlFor={`${id}-slug`} hint={`Leave empty to use ${defaultSlug}.`}>
                        <Input id={`${id}-slug`} value={settings.slug} placeholder={defaultSlug} aria-describedby={`${id}-slug-hint`}
                            onChange={event => update({ slug: event.target.value.toLowerCase() })} />
                    </Field>
                </div>
                <CompanyDetails value={settings.branding} fallback={fallbackBranding} errors={companyErrors} onChange={branding => update({ branding })} />
                {validation.errors.length > 0 && <ErrorBanner title="Fix these before downloading"><MessageList items={validation.errors} /></ErrorBanner>}
                {validation.warnings.length > 0 && (
                    <div role="status" className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                        <p className="font-bold">Check these</p>
                        <div className="mt-1"><MessageList items={validation.warnings} /></div>
                    </div>
                )}
                <ErrorBanner>{error}</ErrorBanner>
                <SuccessBanner>{notice}</SuccessBanner>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button type="button" onClick={downloadZip} disabled={Boolean(busy) || validation.errors.length > 0} className="sf-btn-primary min-h-11">
                        {busy === 'zip' ? <Spinner size={14} /> : <Download size={14} aria-hidden="true" />} Download zip ({config.client.slug}-solarflow.zip)
                    </button>
                    <button type="button" onClick={downloadSql} disabled={Boolean(busy) || validation.errors.length > 0} className="sf-btn-secondary min-h-11">
                        {busy === 'sql' ? <Spinner size={14} /> : <FileCode2 size={14} aria-hidden="true" />} Download setup.sql
                    </button>
                    <button type="button" onClick={downloadAnswers} className="sf-btn-secondary min-h-11">
                        <FileJson size={14} aria-hidden="true" /> Download answers (JSON)
                    </button>
                </div>
            </SectionCard>
        </div>
    );
}
