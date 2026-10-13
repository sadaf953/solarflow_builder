import { useId, useState } from 'react';
import { ArrowLeft, FileUp } from 'lucide-react';
import { ErrorBanner, SectionCard } from '../../../../template/src/ui/index.js';
import { parseSubmissionJson } from '../../zip/index.js';
import { PageShell } from '../../components/common.jsx';
import { SubmissionReview } from '../../components/SubmissionReview.jsx';
import { normalizeSubmission } from '../../components/wizardData.js';

const MAX_BYTES = 1024 * 1024;

/** Build a client zip from a saved answers file. Runs in the browser; no sign-in or backend needed. */
export default function AdminOffline() {
    const id = useId();
    const [loaded, setLoaded] = useState(null);
    const [error, setError] = useState('');

    const pick = async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setError('');
        try {
            if (file.size > MAX_BYTES) throw new Error('This file is too large to be a setup answers file.');
            const parsed = parseSubmissionJson(await file.text());
            setLoaded({ ...parsed, submission: normalizeSubmission(parsed.submission), fileName: file.name, key: Date.now() });
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
                    <SubmissionReview key={loaded.key} submission={loaded.submission}
                        initial={{ adminOverrides: loaded.adminOverrides, slug: loaded.slug, ownerEmail: loaded.ownerEmail, branding: loaded.branding }} />
                )}
            </div>
        </PageShell>
    );
}
