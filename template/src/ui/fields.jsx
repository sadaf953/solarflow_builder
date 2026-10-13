import { forwardRef, useId } from 'react';
import { selectState } from './helpers.js';

const CONTROL = 'sf-input min-h-11 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500';

/** Label + control + hint + error. Give the control id={htmlFor}. */
export function Field({ label, htmlFor, required, hint, error, children, className = '' }) {
    return (
        <div className={`space-y-1.5 ${className}`}>
            {label && (
                <label htmlFor={htmlFor} className="block text-xs font-bold text-stone-700">
                    {label}{required && <span className="text-red-500" aria-hidden="true"> *</span>}
                </label>
            )}
            {children}
            {hint && <p id={htmlFor && `${htmlFor}-hint`} className="text-[11px] leading-snug text-stone-500">{hint}</p>}
            {error && <p id={htmlFor && `${htmlFor}-error`} role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
        </div>
    );
}

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${CONTROL} ${className}`} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className = '', rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={`${CONTROL} ${className}`} {...props} />;
});

/**
 * <select> over string[] or {value,label}[] options. A stored value in another
 * case still selects its option, and one missing from the list stays visible.
 */
export const Select = forwardRef(function Select({ options, placeholder, value, className = '', ...props }, ref) {
    const { options: list, selected } = selectState(options, value);
    return (
        <select ref={ref} value={selected} className={`${CONTROL} ${className}`} {...props}>
            {placeholder != null && <option value="">{placeholder}</option>}
            {list.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
    );
});

/** On/off switch; the whole row is the touch target. */
export function Toggle({ checked, onChange, label, description, disabled, id, className = '' }) {
    const autoId = useId();
    const base = id || autoId;
    return (
        <button
            type="button" role="switch" id={id} aria-checked={Boolean(checked)} disabled={disabled}
            aria-labelledby={`${base}-label`} aria-describedby={description ? `${base}-desc` : undefined}
            onClick={() => onChange?.(!checked)}
            className={`flex min-h-11 w-full items-center justify-between gap-4 rounded-xl text-left disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        >
            <span className="min-w-0">
                <span id={`${base}-label`} className="block text-sm font-bold text-stone-900">{label}</span>
                {description && <span id={`${base}-desc`} className="mt-0.5 block text-xs text-stone-500">{description}</span>}
            </span>
            <span aria-hidden="true" className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-orange-500' : 'bg-stone-300'}`}>
                <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </span>
        </button>
    );
}
