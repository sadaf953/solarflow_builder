import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileJson, RotateCcw } from 'lucide-react';
import { ErrorBanner, LoadingState, Stepper, useAutosave } from '../../../template/src/ui/index.js';
import { openInvite, saveDraft, submitSetup } from '../api.js';
import { QUESTION_STEPS, answersToFeatures } from '../catalog/questions.js';
import { emptySubmission } from '../catalog/submission.js';
import { LiveSummary } from '../components/FeatureViews.jsx';
import { PageShell, SaveStatus } from '../components/common.jsx';
import { downloadJson, normalizeSubmission, storage } from '../components/wizardData.js';
import { businessErrors, unansweredIds, workflowErrors } from './wizard/checks.js';
import { FeaturesStep } from './wizard/FeaturesStep.jsx';
import { ReviewStep } from './wizard/ReviewStep.jsx';
import { BusinessStep, DoneStep, SendStep, WelcomeStep } from './wizard/SimpleSteps.jsx';
import { WorkflowStep } from './wizard/WorkflowStep.jsx';

const STEPS = [
    { id: 'welcome', label: 'Welcome' },
    { id: 'business', label: 'Your business' },
    { id: 'features', label: 'Features' },
    { id: 'review', label: 'Review' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'send', label: 'Send' },
];
const TITLES = {
    welcome: 'Set up your SolarFlow',
    business: 'Your business',
    review: 'Your features',
    workflow: 'Your workflow',
    send: 'Check and send',
    done: 'Thank you',
};
const PREVIEW_KEY = 'sf-setup-preview';
const RETRY_MS = 5000;

// What still needs doing, as [{step, part?, text}], in step order.
function findProblems(submission) {
    const problems = [];
    if (Object.keys(businessErrors(submission.contact)).length) problems.push({ step: 'business', text: 'Your business details are not complete.' });
    const open = unansweredIds(submission.answers);
    if (open.length) {
        const part = QUESTION_STEPS.findIndex(step => step.questions.some(question => question.id === open[0]));
        problems.push({ step: 'features', part, text: `${open.length} question${open.length === 1 ? ' is' : 's are'} not answered yet.` });
    }
    if (workflowErrors(submission).length) problems.push({ step: 'workflow', text: 'Your workflow needs a fix.' });
    return problems;
}

function LinkProblem({ title, children }) {
    return (
        <PageShell width="max-w-xl">
            <ErrorBanner title={title}>{children}</ErrorBanner>
        </PageShell>
    );
}

/**
 * The client setup form. With `preview` it runs entirely in this browser:
 * answers are kept on this device and can be downloaded as JSON.
 */
export default function SetupWizard({ inviteId, token, preview = false }) {
    const [load, setLoad] = useState(() => (preview
        ? { state: 'ready', submission: normalizeSubmission(storage.get(PREVIEW_KEY)), meta: {} }
        : { state: 'loading' }));
    const [attempt, setAttempt] = useState(0);
    const [step, setStep] = useState('welcome');
    const [part, setPart] = useState(0);
    const [conflict, setConflict] = useState(false);
    const [linkGone, setLinkGone] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const versionRef = useRef(0);
    const headingRef = useRef(null);
    const firstStep = useRef(true);

    useEffect(() => {
        if (preview) return undefined;
        let alive = true;
        openInvite(inviteId, token)
            .then(data => {
                if (!alive) return;
                if (!data) { setLoad({ state: 'invalid' }); return; }
                versionRef.current = data.version || 0;
                const submission = normalizeSubmission(data.payload, { contact: { ...(data.contact || {}), company: data.company || data.contact?.company || '' } });
                setLoad({ state: 'ready', submission, meta: { status: data.status, submittedAt: data.submitted_at } });
                if (data.submitted_at) setStep('done');
            })
            .catch(error => { if (alive) setLoad({ state: 'error', error: error.message }); });
        return () => { alive = false; };
    }, [preview, inviteId, token, attempt]);

    const ready = load.state === 'ready';
    const submission = load.submission;
    const save = useCallback(async payload => {
        if (preview) { storage.set(PREVIEW_KEY, payload); return; }
        try {
            versionRef.current = await saveDraft(inviteId, token, payload, versionRef.current);
            setSaveError('');
        } catch (error) {
            if (error.code === 'conflict') setConflict(true);
            else if (error.code === 'invalid_link') setLinkGone(true);
            else setSaveError(error.message);
            throw error;
        }
    }, [preview, inviteId, token]);
    const { status, flush } = useAutosave({ value: submission, save, enabled: ready && !conflict && !linkGone });

    // A failed save is retried until it goes through.
    useEffect(() => {
        if (status !== 'error' || conflict || linkGone) return undefined;
        const timer = setTimeout(flush, RETRY_MS);
        return () => clearTimeout(timer);
    }, [status, conflict, linkGone, flush]);

    // A new screen starts at the top, with its heading focused for screen readers.
    useEffect(() => {
        if (firstStep.current) { firstStep.current = false; return; }
        window.scrollTo(0, 0);
        headingRef.current?.focus({ preventScroll: true });
    }, [step, part]);

    const features = useMemo(() => (submission ? answersToFeatures(submission.answers, submission.featureOverrides) : null), [submission]);

    if (load.state === 'loading') return <PageShell width="max-w-xl"><LoadingState label="Opening your setup form…" /></PageShell>;
    if (load.state === 'invalid') {
        return (
            <LinkProblem title="This setup link does not work">
                It may be incomplete, expired or closed. Copy the whole link again from our message, or ask the SolarFlow team for a new one.
            </LinkProblem>
        );
    }
    if (load.state === 'error') {
        return (
            <PageShell width="max-w-xl">
                <ErrorBanner title="Could not open your setup form" onRetry={() => { setLoad({ state: 'loading' }); setAttempt(n => n + 1); }}>{load.error}</ErrorBanner>
            </PageShell>
        );
    }

    const update = fn => setLoad(current => ({ ...current, submission: fn(current.submission) }));
    const setContact = (key, value) => update(s => ({ ...s, contact: { ...s.contact, [key]: value } }));
    const setAnswer = (id, value) => update(s => ({ ...s, answers: { ...s.answers, [id]: value } }));
    const setWorkflow = patch => update(s => ({ ...s, workflow: { ...s.workflow, ...patch } }));
    const goTo = (id, toPart) => {
        setStep(id);
        if (toPart != null) setPart(Math.max(0, toPart));
    };
    const problems = findProblems(submission);
    const resend = Boolean(load.meta.submittedAt);
    const downloadAnswers = () => downloadJson(submission, `${(submission.contact.company || 'solarflow').trim().replace(/[^\w-]+/g, '-').toLowerCase()}-setup-answers.json`);
    const startOver = () => {
        if (!window.confirm('Clear every answer on this device and start again?')) return;
        storage.remove(PREVIEW_KEY);
        update(() => emptySubmission());
        goTo('welcome', 0);
    };
    const continueFrom = () => {
        const first = problems[0];
        goTo(first ? first.step : 'send', first?.part);
    };
    const send = async () => {
        if (preview) { goTo('done'); return; }
        setSending(true);
        setSendError('');
        try {
            if (!(await flush())) throw new Error('Your latest changes are not saved yet. Check your internet connection and try again.');
            const submittedAt = await submitSetup(inviteId, token);
            setLoad(current => ({ ...current, meta: { ...current.meta, status: 'submitted', submittedAt } }));
            goTo('done');
        } catch (error) {
            if (error.code === 'invalid_link') setLinkGone(true);
            setSendError(error.message);
        } finally {
            setSending(false);
        }
    };

    const started = Boolean(Object.keys(submission.answers).length || submission.contact.name);
    const title = step === 'features' ? QUESTION_STEPS[part].title : TITLES[step];
    const showSummary = step === 'features';

    let body;
    switch (step) {
        case 'business':
            body = <BusinessStep contact={submission.contact} onChange={setContact} onBack={() => goTo('welcome')} onNext={() => goTo('features', 0)} />;
            break;
        case 'features':
            body = <FeaturesStep answers={submission.answers} onAnswer={setAnswer} part={part} onPart={setPart}
                onBack={() => goTo('business')} onNext={() => goTo('review')} />;
            break;
        case 'review':
            body = <ReviewStep answers={submission.answers} overrides={submission.featureOverrides}
                onOverrides={featureOverrides => update(s => ({ ...s, featureOverrides }))}
                onBack={() => goTo('features', QUESTION_STEPS.length - 1)} onNext={() => goTo('workflow')} />;
            break;
        case 'workflow':
            body = <WorkflowStep submission={submission} onWorkflow={setWorkflow} onBack={() => goTo('review')} onNext={() => goTo('send')} />;
            break;
        case 'send':
            body = <SendStep submission={submission} problems={problems} onGo={(id, toPart) => goTo(id, toPart)}
                notes={submission.notes} onNotes={notes => update(s => ({ ...s, notes }))}
                onBack={() => goTo('workflow')} onSend={send} busy={sending} error={sendError} resend={resend} preview={preview} />;
            break;
        case 'done':
            body = <DoneStep submittedAt={load.meta.submittedAt} preview={preview} onEdit={() => goTo('review')} onDownload={preview ? downloadAnswers : undefined} />;
            break;
        default:
            body = <WelcomeStep company={submission.contact.company} started={started} onNext={started ? continueFrom : () => goTo('business')} />;
    }

    const actions = (
        <>
            {preview && (
                <>
                    <button type="button" onClick={downloadAnswers} className="sf-btn-secondary min-h-11">
                        <FileJson size={14} aria-hidden="true" /> <span className="hidden sm:inline">Download my answers (JSON)</span><span className="sm:hidden">Answers</span>
                    </button>
                    <button type="button" onClick={startOver} className="sf-btn-secondary min-h-11" aria-label="Start over">
                        <RotateCcw size={14} aria-hidden="true" /> <span className="hidden sm:inline">Start over</span>
                    </button>
                </>
            )}
            <SaveStatus status={preview && status === 'saved' ? 'local' : status} />
        </>
    );

    return (
        <PageShell actions={actions} width="max-w-6xl" className={showSummary ? 'pb-24 lg:pb-8' : ''}>
            <div className="space-y-5">
                {preview && (
                    <p className="rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-semibold text-yellow-900">
                        Preview: nothing is sent. Answers stay on this device until you download them.
                    </p>
                )}
                {conflict && (
                    <ErrorBanner title="This form was changed in another tab — reload" onRetry={() => window.location.reload()} retryLabel="Reload">
                        Your last change here was not saved. Reload to see the latest answers, then make the change again.
                    </ErrorBanner>
                )}
                {linkGone && (
                    <ErrorBanner title="This setup link was closed">
                        Your answers up to now are saved. Ask the SolarFlow team for a new link to keep editing.
                    </ErrorBanner>
                )}
                {status === 'error' && saveError && !conflict && !linkGone && <ErrorBanner>{saveError}</ErrorBanner>}
                {step !== 'done' && <Stepper steps={STEPS} current={step} onStep={id => goTo(id)} />}
                <div className={showSummary ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]' : 'mx-auto max-w-3xl'}>
                    <div className="min-w-0 space-y-5">
                        <div>
                            {step === 'features' && <p className="sf-kicker">Questions {part + 1} of {QUESTION_STEPS.length}</p>}
                            <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-stone-900 outline-none">{title}</h1>
                        </div>
                        {body}
                    </div>
                    {showSummary && <LiveSummary result={features} />}
                </div>
            </div>
        </PageShell>
    );
}
