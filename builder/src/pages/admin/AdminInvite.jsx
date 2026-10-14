import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeft, History, Link2, RotateCcw } from 'lucide-react';
import { formatDate } from '../../../../template/src/lib/format.js';
import { Badge, EmptyState, ErrorBanner, LoadingState, Modal, Select, Spinner, useAutosave } from '../../../../template/src/ui/index.js';
import { adminGet, adminGetSettings, adminMarkDownloaded, adminResetToken, adminSaveSettings, adminSetStatus } from '../../api.js';
import { InviteLink } from '../../components/InviteLink.jsx';
import { SubmissionReview } from '../../components/SubmissionReview.jsx';
import { Expander, SaveStatus } from '../../components/common.jsx';
import { normalizeSettings, normalizeSubmission, storage } from '../../components/wizardData.js';
import { statusInfo } from './inviteStatus.js';

const EVENT_LABELS = {
    created: 'Invite created', opened: 'Client opened the link', submitted: 'Client sent the form', locked: 'Link locked after wrong attempts',
    token_reset: 'New link made', archived: 'Archived', reopened: 'Reopened', downloaded: 'Zip downloaded',
};
const when = value => formatDate(value, 'datetime');
const RETRY_MS = 5000;

// The admin's settings for this client, kept with the invite on the server.
// Settings that older builder versions kept in this browser are moved to the
// server the first time the page opens.
function useInviteSettings(inviteId) {
    const [settings, setSettings] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [saveError, setSaveError] = useState('');

    useEffect(() => {
        let alive = true;
        const legacyKey = `sf-builder-invite-${inviteId}`;
        (async () => {
            let saved = await adminGetSettings(inviteId);
            const legacy = storage.get(legacyKey);
            if (!saved && legacy) {
                saved = normalizeSettings(legacy);
                await adminSaveSettings(inviteId, saved);
            }
            if (legacy) storage.remove(legacyKey);
            if (alive) { setSettings(normalizeSettings(saved)); setLoadError(''); }
        })().catch(err => { if (alive) setLoadError(err.message); });
        return () => { alive = false; };
    }, [inviteId, attempt]);

    const save = useCallback(async value => {
        try {
            await adminSaveSettings(inviteId, value);
            setSaveError('');
        } catch (err) {
            setSaveError(err.message);
            throw err;
        }
    }, [inviteId]);
    const { status, flush } = useAutosave({ value: settings, save, enabled: settings !== null });
    useEffect(() => {
        if (status !== 'error') return undefined;
        const timer = setTimeout(flush, RETRY_MS);
        return () => clearTimeout(timer);
    }, [status, flush]);

    return { settings, setSettings, loadError, retry: () => setAttempt(n => n + 1), status, saveError };
}

// Versions the admin can review: each sent version, then the latest autosave.
function versionsOf(data) {
    const sent = (data.submissions || []).map(item => ({
        value: `sub:${item.id}`, label: `Sent ${when(item.submitted_at)} · version ${item.version}`, submission: normalizeSubmission(item.payload),
    }));
    const draft = data.draft?.payload
        ? [{ value: 'draft', label: `Latest autosave ${when(data.draft.updated_at)}${sent.length ? '' : ' (not sent yet)'}`, submission: normalizeSubmission(data.draft.payload) }]
        : [];
    return [...sent, ...draft];
}

export function AdminInvite({ inviteId }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [picked, setPicked] = useState('');
    const [busy, setBusy] = useState('');
    const [actionError, setActionError] = useState('');
    const [linkOpen, setLinkOpen] = useState(false);
    const [newLink, setNewLink] = useState('');
    const settingsState = useInviteSettings(inviteId);

    const load = useCallback(() => adminGet(inviteId)
        .then(result => { setData(result); setError(''); })
        .catch(err => setError(err.message)), [inviteId]);
    useEffect(() => { load(); }, [load]);
    const versions = useMemo(() => (data ? versionsOf(data) : []), [data]);

    const act = async (kind, task) => {
        setBusy(kind);
        setActionError('');
        try {
            await task();
            await load();
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy('');
        }
    };
    const makeLink = () => act('link', async () => setNewLink((await adminResetToken(inviteId)).link));
    const setStatus = status => act('status', () => adminSetStatus(inviteId, status));
    const markDownloaded = () => adminMarkDownloaded(inviteId).then(load).catch(err => setActionError(`The zip was downloaded, but the status was not updated: ${err.message}`));

    if (error && !data) return <ErrorBanner title="Could not load this client" onRetry={load}>{error}</ErrorBanner>;
    if (!data) return <LoadingState />;

    const invite = data.invite;
    const contact = { company: invite.company, ...(invite.contact || {}) };
    const info = statusInfo(invite.status);
    const archived = invite.status === 'archived';
    const current = versions.find(item => item.value === picked) || versions[0];

    return (
        <div className="space-y-5">
            <a href="#/admin" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-stone-900">
                <ArrowLeft size={16} aria-hidden="true" /> All clients
            </a>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-stone-900">
                        {invite.company || 'No company name'} <Badge tone={info.tone}>{info.label}</Badge>
                    </h1>
                    <p className="mt-1 text-sm text-stone-500">
                        Invited {formatDate(invite.created_at, 'short')}
                        {!archived && invite.expires_at && ` · link works until ${formatDate(invite.expires_at, 'short')}`}
                        {invite.locked_until && new Date(invite.locked_until) > new Date() && ' · link locked for a few minutes after wrong attempts'}
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={() => { setNewLink(''); setLinkOpen(true); }} disabled={Boolean(busy)} className="sf-btn-secondary min-h-11">
                        <Link2 size={14} aria-hidden="true" /> Copy client link
                    </button>
                    <button type="button" onClick={() => setStatus(archived ? 'open' : 'archived')} disabled={Boolean(busy)} className="sf-btn-secondary min-h-11">
                        {busy === 'status' ? <Spinner size={14} /> : archived ? <RotateCcw size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
                        {archived ? 'Reopen' : 'Archive'}
                    </button>
                </div>
            </div>
            <ErrorBanner>{actionError || (error && `Could not refresh: ${error}`)}</ErrorBanner>

            {versions.length > 1 && (
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <label htmlFor="sf-version" className="text-xs font-bold text-stone-700">Reviewing</label>
                    <Select id="sf-version" value={current.value} onChange={event => setPicked(event.target.value)}
                        options={versions.map(({ value, label }) => ({ value, label }))} className="sm:w-auto" />
                </div>
            )}

            {current && settingsState.loadError ? (
                <ErrorBanner title="Could not load your settings for this client" onRetry={settingsState.retry}>{settingsState.loadError}</ErrorBanner>
            ) : current && !settingsState.settings ? <LoadingState /> : current ? (
                <>
                    {settingsState.status === 'error' && <ErrorBanner>{`Your changes are not saved yet: ${settingsState.saveError}`}</ErrorBanner>}
                    <SubmissionReview
                        submission={current.submission}
                        settings={settingsState.settings}
                        onSettings={settingsState.setSettings}
                        saveStatus={<SaveStatus status={settingsState.status} />}
                        onDownloaded={markDownloaded}
                    />
                </>
            ) : (
                <EmptyState title="Nothing filled in yet">
                    {contact.name || 'The client'} has not started the form. Send them the link again with “Copy client link”.
                </EmptyState>
            )}

            {data.events?.length > 0 && (
                <Expander title="Activity" subtitle={`${data.submissions.length} version${data.submissions.length === 1 ? '' : 's'} sent`}>
                    <ul className="space-y-2 text-sm">
                        {data.events.map((event, index) => (
                            <li key={`${event.at}-${index}`} className="flex flex-wrap items-baseline gap-x-2">
                                <History size={12} className="shrink-0 text-stone-400" aria-hidden="true" />
                                <span className="font-semibold text-stone-800">{EVENT_LABELS[event.kind] || event.kind}</span>
                                <span className="text-xs text-stone-500">{when(event.at)}{event.actor && event.actor !== 'client' ? ` · ${event.actor}` : ''}</span>
                            </li>
                        ))}
                    </ul>
                </Expander>
            )}

            <Modal open={linkOpen} onClose={() => setLinkOpen(false)} busy={busy === 'link'} title="Client link" size="lg">
                {newLink ? <InviteLink link={newLink} contact={contact} /> : (
                    <div className="space-y-4">
                        <p className="text-sm text-stone-700">
                            For safety the link is not stored, so copying it makes a new one. The old link stops working; the client’s answers are kept.
                        </p>
                        {archived && <p className="text-sm font-semibold text-yellow-800">This client is archived. Reopen it first, or the new link will not open.</p>}
                        <ErrorBanner>{actionError}</ErrorBanner>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setLinkOpen(false)} className="sf-btn-secondary min-h-11">Cancel</button>
                            <button type="button" onClick={makeLink} disabled={busy === 'link'} className="sf-btn-primary min-h-11">
                                {busy === 'link' && <Spinner size={14} />} Make a new link
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
