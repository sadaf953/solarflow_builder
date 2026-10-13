import { useId } from 'react';
import { Check } from 'lucide-react';
import { tone } from './tones.js';

/** The white card every tab and view section sits in. */
export function SectionCard({ title, subtitle, icon: Icon, tone: toneName = 'orange', actions, children, id, className = '' }) {
    const autoId = useId();
    const titleId = `${id || autoId}-title`;
    return (
        <section id={id} aria-labelledby={title ? titleId : undefined} className={`space-y-4 rounded-[24px] border border-stone-100 bg-white p-4 shadow-sm sm:p-6 ${className}`}>
            {(title || actions) && (
                <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        {Icon && <span className={`shrink-0 rounded-xl p-2 ${tone(toneName).soft}`}><Icon size={18} aria-hidden="true" /></span>}
                        <div className="min-w-0">
                            {title && <h3 id={titleId} className="text-xs font-bold uppercase tracking-widest text-stone-700">{title}</h3>}
                            {subtitle && <p className="mt-0.5 text-[11px] font-medium text-stone-500">{subtitle}</p>}
                        </div>
                    </div>
                    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
                </div>
            )}
            {children}
        </section>
    );
}

/**
 * Progress header for multi-step forms. Phones get "Step 2 of 5" and a bar;
 * wider screens get the numbered steps, clickable when `onStep` is given.
 */
export function Stepper({ steps, current, onStep }) {
    const index = Math.max(0, steps.findIndex(step => step.id === current));
    return (
        <nav aria-label="Progress" className="space-y-2">
            <div className="sm:hidden">
                <p className="text-xs font-bold text-orange-700">Step {index + 1} of {steps.length} · {steps[index]?.label}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200" aria-hidden="true">
                    <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
                </div>
            </div>
            <ol className="hidden items-center gap-2 sm:flex">
                {steps.map((step, i) => {
                    const done = i < index;
                    const active = i === index;
                    return (
                        <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
                            <button
                                type="button" disabled={!onStep} onClick={() => onStep?.(step.id)}
                                aria-current={active ? 'step' : undefined}
                                className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-1.5 text-left enabled:hover:bg-stone-100 disabled:cursor-default"
                            >
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                    active ? 'bg-orange-500 text-stone-900' : done ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500'
                                }`}>
                                    {done ? <Check size={14} aria-hidden="true" /> : i + 1}
                                </span>
                                <span className={`truncate text-xs font-bold ${active ? 'text-stone-900' : 'text-stone-500'}`}>{step.label}</span>
                            </button>
                            {i < steps.length - 1 && <span className="h-px min-w-4 flex-1 bg-stone-200" aria-hidden="true" />}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
