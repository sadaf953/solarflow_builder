import { useId, useState } from 'react';
import { ArrowRight, Link2 } from 'lucide-react';
import { EmptyState, Field, Input } from '../../../template/src/ui/index.js';
import { PageShell } from '../components/common.jsx';
import { go } from '../components/router.js';

// The '#/s/<id>/<token>' part of a pasted setup link.
const setupPath = text => String(text || '').trim().match(/#\/s\/[^/\s]+\/[^/\s?#]+/)?.[0];

export function Landing() {
    const id = useId();
    const [link, setLink] = useState('');
    const [error, setError] = useState('');
    const open = event => {
        event.preventDefault();
        const path = setupPath(link);
        if (path) go(path.slice(1));
        else setError('That does not look like a setup link. Copy the whole link from the message we sent you.');
    };
    return (
        <PageShell width="max-w-xl">
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-stone-900">Set up your SolarFlow</h1>
                    <p className="mt-2 text-base leading-relaxed text-stone-600">
                        Have a setup link? Open it to answer a few short questions about your business. It takes about 5 minutes.
                    </p>
                </div>
                <form onSubmit={open} className="sf-card space-y-3 p-4 sm:p-5">
                    <Field label="Paste your setup link" htmlFor={`${id}-link`} error={error}>
                        <Input id={`${id}-link`} type="url" inputMode="url" value={link} placeholder="https://…#/s/…"
                            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-link-error` : undefined}
                            onChange={event => { setLink(event.target.value); setError(''); }} />
                    </Field>
                    <button type="submit" disabled={!link.trim()} className="sf-btn-primary min-h-11 w-full sm:w-auto">
                        Open my setup form <ArrowRight size={14} aria-hidden="true" />
                    </button>
                </form>
                <p className="flex items-start gap-2 text-sm text-stone-500">
                    <Link2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    No link yet? Ask the SolarFlow team to send you one on WhatsApp or email.
                </p>
                <nav aria-label="Other pages" className="flex flex-wrap gap-x-4 text-xs font-semibold text-stone-500">
                    <a href="#/preview" className="inline-flex min-h-11 items-center underline-offset-2 hover:text-stone-800 hover:underline">Try the form without a link</a>
                    <a href="#/admin" className="inline-flex min-h-11 items-center underline-offset-2 hover:text-stone-800 hover:underline">SolarFlow team sign-in</a>
                </nav>
            </div>
        </PageShell>
    );
}

export function NotFound() {
    return (
        <PageShell width="max-w-xl">
            <EmptyState title="This page does not exist" action={<a href="#/" className="sf-btn-primary min-h-11">Go to the start page</a>}>
                Check the link you opened. Setup links are long, so make sure you copied all of it.
            </EmptyState>
        </PageShell>
    );
}
