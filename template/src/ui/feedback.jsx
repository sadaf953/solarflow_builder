import { AlertCircle, CheckCircle2, Inbox, Loader2 } from 'lucide-react';
import { tone } from './tones.js';

export function Spinner({ size = 16, className = '' }) {
    return <Loader2 size={size} className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function LoadingState({ label = 'Loading…', className = '' }) {
    return (
        <div role="status" className={`flex items-center justify-center gap-2 py-10 text-sm font-semibold text-stone-500 ${className}`}>
            <Spinner size={18} /> {label}
        </div>
    );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action, className = '' }) {
    return (
        <div className={`rounded-2xl border border-dashed border-stone-200 bg-white px-6 py-10 text-center ${className}`}>
            <Icon size={28} className="mx-auto text-stone-300" aria-hidden="true" />
            {title && <p className="mt-3 text-sm font-bold text-stone-800">{title}</p>}
            {children && <div className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-stone-500">{children}</div>}
            {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
    );
}

/** Renders nothing without content, so `<ErrorBanner>{error}</ErrorBanner>` is safe. */
export function ErrorBanner({ title, children, onRetry, retryLabel = 'Try again', className = '' }) {
    if (!title && !children) return null;
    return (
        <div role="alert" className={`flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 ${className}`}>
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                {title && <p className="font-bold">{title}</p>}
                {children && <div className={title ? 'mt-0.5' : 'font-semibold'}>{children}</div>}
            </div>
            {onRetry && <button type="button" onClick={onRetry} className="sf-btn-secondary min-h-11 shrink-0">{retryLabel}</button>}
        </div>
    );
}

export function SuccessBanner({ title, children, className = '' }) {
    if (!title && !children) return null;
    return (
        <div role="status" className={`flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 ${className}`}>
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                {title && <p className="font-bold">{title}</p>}
                {children && <div className={title ? 'mt-0.5' : 'font-semibold'}>{children}</div>}
            </div>
        </div>
    );
}

/** Number tile for dashboards. With onClick it becomes a button (e.g. to filter a list). */
export function StatTile({ label, value, tone: toneName = 'orange', icon: Icon, hint, onClick, active, className = '' }) {
    const body = (
        <>
            {Icon && <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone(toneName).soft}`}><Icon size={18} aria-hidden="true" /></span>}
            <span className={`block truncate text-2xl font-bold text-stone-900 ${Icon ? 'mt-3' : ''}`} title={String(value ?? '')}>{value}</span>
            <span className="mt-1 block text-xs font-semibold text-stone-700">{label}</span>
            {hint && <span className="mt-1 block text-xs leading-relaxed text-stone-500">{hint}</span>}
        </>
    );
    const shell = `block min-w-0 rounded-2xl border bg-white p-4 text-left sm:p-5 ${active ? 'border-orange-400 ring-2 ring-orange-100' : 'border-stone-200'} ${className}`;
    return onClick
        ? <button type="button" onClick={onClick} aria-pressed={active} className={`${shell} w-full transition-colors hover:border-orange-300`}>{body}</button>
        : <div className={shell}>{body}</div>;
}

export function Badge({ tone: toneName = 'stone', children, className = '' }) {
    const { soft, border } = tone(toneName);
    return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${soft} ${border} ${className}`}>{children}</span>;
}
