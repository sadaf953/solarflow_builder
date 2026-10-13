import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Copy, Sun } from 'lucide-react';
import { Spinner } from '../../../template/src/ui/index.js';

/** Top bar + centred content column used by every page. */
export function PageShell({ children, actions, width = 'max-w-5xl', className = '' }) {
    return (
        <div className="sf-page">
            <header className="border-b border-stone-200 bg-white">
                <div className={`mx-auto flex min-h-14 ${width} items-center justify-between gap-3 px-4 py-2`}>
                    <a href="#/" className="flex min-h-11 items-center gap-2 text-sm font-bold text-stone-900">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500 text-stone-900">
                            <Sun size={18} aria-hidden="true" />
                        </span>
                        SolarFlow setup
                    </a>
                    {actions && <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
                </div>
            </header>
            <main className={`mx-auto ${width} px-4 py-6 sm:py-8 ${className}`}>{children}</main>
        </div>
    );
}

/** Copies `text`; says "Copied" for a moment. */
export function CopyButton({ text, label = 'Copy', className = 'sf-btn-secondary min-h-11' }) {
    const [state, setState] = useState('idle');
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setState('copied');
        } catch {
            setState('failed');
        }
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setState('idle'), 2000);
    };
    return (
        <button type="button" onClick={copy} disabled={!text} className={className}>
            {state === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy it yourself' : label}</span>
        </button>
    );
}

const SAVE_TEXT = {
    saved: 'Saved',
    saving: 'Saving…',
    error: 'Not saved — retrying',
    local: 'Saved on this device',
};

/** Autosave status line. */
export function SaveStatus({ status }) {
    return (
        <p role="status" className={`flex items-center gap-1.5 text-xs font-semibold ${status === 'error' ? 'text-red-700' : 'text-stone-500'}`}>
            {status === 'saving' ? <Spinner size={12} />
                : status === 'error' ? <AlertCircle size={12} aria-hidden="true" />
                    : <Check size={12} aria-hidden="true" />}
            {SAVE_TEXT[status] || SAVE_TEXT.saved}
        </p>
    );
}

/** Collapsible section built on <details>, so it works without JS state. */
export function Expander({ title, subtitle, children, defaultOpen = false, className = '' }) {
    return (
        <details open={defaultOpen} className={`group rounded-2xl border border-stone-200 bg-white ${className}`}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                    <span className="block text-sm font-bold text-stone-900">{title}</span>
                    {subtitle && <span className="mt-0.5 block text-xs text-stone-500">{subtitle}</span>}
                </span>
                <ChevronDown size={18} className="shrink-0 text-stone-400 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="border-t border-stone-100 p-4">{children}</div>
        </details>
    );
}

/** Back / Next row at the bottom of a wizard screen. */
export function StepNav({ onBack, onNext, nextLabel = 'Next', backLabel = 'Back', busy = false, nextDisabled = false }) {
    return (
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
            {onBack ? <button type="button" onClick={onBack} className="sf-btn-secondary min-h-11 px-6">{backLabel}</button> : <span />}
            {onNext && (
                <button type="button" onClick={onNext} disabled={busy || nextDisabled} className="sf-btn-primary min-h-12 px-8 text-sm">
                    {busy && <Spinner size={14} />} {nextLabel}
                </button>
            )}
        </div>
    );
}

/** Bulleted list of messages (validation errors or warnings). */
export function MessageList({ items }) {
    if (!items?.length) return null;
    if (items.length === 1) return <span>{items[0]}</span>;
    return <ul className="list-disc space-y-1 pl-4">{items.map(item => <li key={item}>{item}</li>)}</ul>;
}
