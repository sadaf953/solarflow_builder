import { useEffect, useId, useState } from 'react';
import { ArrowLeft, FileUp } from 'lucide-react';
import { ErrorBanner, SectionCard } from '../../../../template/src/ui/index.js';
import { parseSubmissionJson } from '../../zip/index.js';
import { PageShell } from '../../components/common.jsx';
import { SubmissionReview } from '../../components/SubmissionReview.jsx';
import { normalizeSettings, normalizeSubmission, storage } from '../../components/wizardData.js';

const MAX_BYTES = 1024 * 1024;
const STORAGE_KEY = 'sf-builder-offline';

// The last loaded file and the admin's settings for it, from this browser.
function restore() {
    const saved = storage.get(STORAGE_KEY);
    if (!saved?.submission) return null;
    return { submission: normalizeSubmission(saved.submission), settings: normalizeSettings(saved.settings), fileName: saved.fileName || '', key: 0 };
}

/**
 * Build a client zip from a saved answers file. Runs in the browser; no
 * sign-in or backend needed. The file and the settings made here stay in
 * this browser until another file is loaded.
 */
export default function AdminOffline() {
    const id = useId();
    const [loaded, setLoaded] = useState(restore);
    const [error, setError] = useState('');
    useEffect(() => {
        if (loaded) storage.set(STORAGE_KEY, { submission: loaded.submission, settings: loaded.settings, fileName: loaded.fileName });
    }, [loaded]);

    const pick = async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setError('');
        try {
            if (file.size > MAX_BYTES) throw new Error('This file is too large to be a setup answers file.');
            const { submission, ...settings } = parseSubmissionJson(await file.text());
            setLoaded({ submission: normalizeSubmission(submission), settings: normalizeSettings(settings), fileName: file.name, key: Date.now() });
        } catch (err) {
            setLoaded(null);
            setError(err.message);
        }
    };

    return (
        <PageShell>
            <div className="space-y-5">
                <a href="#/admin" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-stone-900">
                    <ArrowLeft size={16} aria-hidden="true" /> Admin
                </a>
                <h1 className="text-2xl font-bold text-stone-900">Build from a saved answers file</h1>
                <SectionCard>
                    <p className="text-sm text-stone-600">
                        Load a setup answers file (.json) downloaded from the setup form or a client page. Everything happens in this browser.
                    </p>
                    <div>
                        <input id={`${id}-file`} type="file" accept="application/json,.json" onChange={pick} className="peer sr-only" />
                        <label htmlFor={`${id}-file`} className="sf-btn-primary min-h-11 w-full cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-yellow-400 peer-focus-visible:ring-offset-2 sm:w-auto">
                            <FileUp size={14} aria-hidden="true" /> {loaded ? 'Load another file' : 'Choose a file'}
                        </label>
                    </div>
                    {loaded && <p className="text-xs font-semibold text-stone-500">Loaded {loaded.fileName}</p>}
                    <ErrorBanner>{error}</ErrorBanner>
                </SectionCard>
                {loaded && (
                    <SubmissionReview key={loaded.key} submission={loaded.submission} settings={loaded.settings}
                        onSettings={settings => setLoaded(current => ({ ...current, settings }))} />
                )}
            </div>
        </PageShell>
    );
}
