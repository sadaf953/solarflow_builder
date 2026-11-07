import { useId, useState } from 'react';
import { CheckCircle2, Clock, FileJson, Info, ListChecks, Rocket, Save, Workflow } from 'lucide-react';
import { formatDate } from '../../../../template/src/lib/format.js';
import { ErrorBanner, Field, Input, SectionCard, SuccessBanner, Textarea } from '../../../../template/src/ui/index.js';
import { emptyGoLive, normalizeGoLive } from '../../catalog/goLive.js';
import { LAUNCH_DAYS } from '../../catalog/menu.js';
import { answersToFeatures } from '../../catalog/questions.js';
import { normalizePhone, restoredStages } from '../../catalog/submission.js';
import { featureLists, summaryLine } from '../../components/wizardData.js';
import { StepNav } from '../../components/common.jsx';
import { AddOnRequests } from './AddOnRequests.jsx';
import { businessErrors } from './checks.js';

export function WelcomeStep({ company, started, onNext }) {
    const points = [
        [Clock, 'About 5 minutes', 'Short questions about how your business works. No technical words.'],
        [ListChecks, 'Features follow your answers', 'You will see what you get and why, before you send anything.'],
        [Workflow, 'Your stages and lists', 'Then you choose your pipeline stages, dropdown lists and any extra fields, or share your sheet with us. Keep your Excel or Google Sheet handy for this part.'],
        [Rocket, 'Going live', 'Near the end: your web address and two free accounts, Supabase for your data and Brevo for emails. Not ready? We can do this part with you on a call.'],
        [Save, 'Saved as you go', 'Everything saves by itself. Close the page any time and open the same link to carry on.'],
    ];
    return (
        <div className="space-y-6">
            <p className="text-base leading-relaxed text-stone-600">
                This form sets up SolarFlow{company ? ` for ${company}` : ''}: the app your team will use to follow every customer from enquiry to installation.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
                {points.map(([Icon, title, text]) => (
                    <li key={title} className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-4">
                        <Icon size={20} className="mt-0.5 shrink-0 text-orange-600" aria-hidden="true" />
                        <span>
                            <span className="block text-sm font-bold text-stone-900">{title}</span>
                            <span className="mt-0.5 block text-sm text-stone-600">{text}</span>
                        </span>
                    </li>
                ))}
            </ul>
            <StepNav onNext={onNext} nextLabel={started ? 'Continue' : 'Start'} />
        </div>
    );
}

const BUSINESS_FIELDS = [
    { key: 'company', label: 'Company name', autoComplete: 'organization', required: true },
    { key: 'name', label: 'Your name', autoComplete: 'name', required: true },
    { key: 'phone', label: 'Mobile number', autoComplete: 'tel', type: 'tel', inputMode: 'tel', required: true, placeholder: '10-digit mobile number', maxLength: 20 },
    { key: 'email', label: 'Email', autoComplete: 'email', type: 'email', required: true, hint: 'This email becomes the first admin login of your SolarFlow app.' },
    { key: 'city', label: 'City', autoComplete: 'address-level2' },
    { key: 'state', label: 'State', autoComplete: 'address-level1', placeholder: 'For example Gujarat' },
];

export function BusinessStep({ contact, onChange, onBack, onNext }) {
    const id = useId();
    const [tried, setTried] = useState(false);
    const errors = tried ? businessErrors(contact) : {};
    const next = () => {
        setTried(true);
        const found = Object.keys(businessErrors(contact));
        if (found.length) document.getElementById(`${id}-${found[0]}`)?.focus();
        else onNext();
    };
    return (
        <div className="space-y-6">
            <SectionCard>
                <div className="grid gap-4 sm:grid-cols-2">
                    {BUSINESS_FIELDS.map(field => {
                        const controlId = `${id}-${field.key}`;
                        const describedBy = [field.hint && `${controlId}-hint`, errors[field.key] && `${controlId}-error`].filter(Boolean).join(' ') || undefined;
                        return (
                            <Field key={field.key} label={field.label} htmlFor={controlId} required={field.required} hint={field.hint} error={errors[field.key]}>
                                <Input
                                    id={controlId} type={field.type || 'text'} inputMode={field.inputMode} autoComplete={field.autoComplete}
                                    placeholder={field.placeholder} value={contact[field.key] || ''} maxLength={field.maxLength || 120}
                                    aria-invalid={errors[field.key] ? true : undefined} aria-describedby={describedBy}
                                    onChange={event => onChange(field.key, field.key === 'phone' ? event.target.value.replace(/[^\d+\s()-]/g, '') : event.target.value)}
                                    onBlur={field.key === 'phone' ? event => onChange('phone', normalizePhone(event.target.value)) : undefined}
                                />
                            </Field>
                        );
                    })}
                </div>
            </SectionCard>
            <StepNav onBack={onBack} onNext={next} />
        </div>
    );
}

// True once the client has filled in any go-live detail.
const goLiveStarted = goLive => {
    const value = normalizeGoLive(goLive);
    return Object.entries(emptyGoLive()).some(([key, blank]) => value[key] !== blank && String(value[key]).trim() !== '');
};

// `blocked` is why the form cannot be sent right now ('' when it can).
export function SendStep({ submission, problems, onGo, notes, onNotes, onAddOnRequests, onBack, onSend, busy, error, blocked, resend, preview }) {
    const id = useId();
    const lists = featureLists(answersToFeatures(submission.answers, submission.featureOverrides));
    const sheet = submission.workflow?.source === 'sheet';
    const restored = sheet ? [] : restoredStages(submission);
    const goLive = goLiveStarted(submission.goLive);
    return (
        <div className="space-y-6">
            <SectionCard>
                <ul className="space-y-2 text-sm text-stone-700">
                    <li className="flex gap-2"><CheckCircle2 size={18} className="shrink-0 text-emerald-600" aria-hidden="true" />{summaryLine(lists)}</li>
                    <li className="flex gap-2"><CheckCircle2 size={18} className="shrink-0 text-emerald-600" aria-hidden="true" />
                        {sheet ? 'You shared your sheet for your stages and fields.' : 'Your stages, lists and extra fields are set.'}</li>
                    {restored.map(stage => (
                        <li key={stage.id} className="flex gap-2"><Info size={18} className="shrink-0 text-blue-600" aria-hidden="true" />
                            We added the {stage.label} stage back to your stages. {stage.reason}, which you chose.</li>
                    ))}
                    {goLive
                        ? <li className="flex gap-2"><CheckCircle2 size={18} className="shrink-0 text-emerald-600" aria-hidden="true" />You gave us your go-live details. Anything missing we will do with you on a call.</li>
                        : <li className="flex gap-2"><Info size={18} className="shrink-0 text-blue-600" aria-hidden="true" />Go-live details: we will set them up with you on a short call.</li>}
                </ul>
                <Field label="Anything else we should know? (optional)" htmlFor={`${id}-notes`}>
                    <Textarea id={`${id}-notes`} rows={4} maxLength={2000} value={notes || ''} onChange={event => onNotes(event.target.value)}
                        placeholder="For example: we also do commercial rooftops, or we want to start next month." />
                </Field>
            </SectionCard>
            <AddOnRequests requests={submission.addOnRequests} onChange={onAddOnRequests} />
            {problems.length > 0 && (
                <ErrorBanner title="A few things are missing">
                    <ul className="mt-1 space-y-1">
                        {problems.map(problem => (
                            <li key={problem.step}>
                                {problem.text}{' '}
                                <button type="button" onClick={() => onGo(problem.step, problem.part)} className="min-h-11 font-bold underline">Go there</button>
                            </li>
                        ))}
                    </ul>
                </ErrorBanner>
            )}
            <ErrorBanner>{blocked || error}</ErrorBanner>
            {resend && <p className="text-sm text-stone-600">You sent this form before. Sending again saves a new version for us.</p>}
            <StepNav onBack={onBack} onNext={onSend} busy={busy} nextDisabled={problems.length > 0 || Boolean(blocked)}
                nextLabel={preview ? 'Finish' : resend ? 'Send again' : 'Send to SolarFlow'} />
        </div>
    );
}

export function DoneStep({ submittedAt, preview, onEdit, onDownload }) {
    return (
        <div className="space-y-6">
            <SuccessBanner title={preview ? 'All done (preview)' : 'Thank you! We have your answers.'}>
                {preview
                    ? 'Nothing was sent. Download your answers to keep them or to load them on the admin page.'
                    : `Sent${submittedAt ? ` on ${formatDate(submittedAt, 'long')}` : ''}. We will look at them and get back to you on WhatsApp or email.`}
            </SuccessBanner>
            {!preview && (
                <p className="text-sm text-stone-600">
                    Once your accounts are ready, your app goes live in {LAUNCH_DAYS}. Anything you asked for outside the form follows on its own timeline.
                    Need to change something? Open the same link again any time. When you send again, we keep it as a new version.
                </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={onEdit} className="sf-btn-secondary min-h-11 px-6">Change my answers</button>
                {onDownload && (
                    <button type="button" onClick={onDownload} className="sf-btn-primary min-h-11 px-6">
                        <FileJson size={14} aria-hidden="true" /> Download my answers (JSON)
                    </button>
                )}
            </div>
        </div>
    );
}
