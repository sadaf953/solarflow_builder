import { useId, useState } from 'react';
import { Upload } from 'lucide-react';
import { cleanPhone, formatFieldValue, toIndianCommas } from '../lib/format.js';
import { describedBy } from './helpers.js';
import { Field, Input, Select, Textarea } from './fields.jsx';
import { TagPicker } from './choices.jsx';

const YES_NO = [
    { id: 'Yes', label: 'Yes', activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10' },
    { id: 'No', label: 'No', activeClass: 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/10' },
];
const orNull = text => (text === '' ? null : text);
const toAmount = value => {
    if (value == null || String(value).trim() === '') return null;
    const n = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
};
const readPath = (record, key) => String(key).split('.').reduce((obj, part) => obj?.[part], record);

// Shows Indian commas while typing (a trailing '.' and up to 2 decimals are
// kept) but reports a plain number, or null when empty.
function MoneyInput({ value, onChange, className = '', ...props }) {
    const amount = toAmount(value);
    const [draft, setDraft] = useState({ text: toIndianCommas(amount ?? ''), amount });
    if (draft.amount !== amount) setDraft({ text: toIndianCommas(amount ?? ''), amount });

    const handleChange = event => {
        let clean = event.target.value.replace(/[^\d.]/g, '');
        const dot = clean.indexOf('.');
        if (dot !== -1) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '').slice(0, 2);
        const [whole, decimals] = clean.split('.');
        const next = clean === '' || clean === '.' ? null : Number(clean);
        const text = clean === '' ? '' : `${toIndianCommas(whole || '0')}${decimals !== undefined ? `.${decimals}` : ''}`;
        setDraft({ text, amount: next });
        onChange(next);
    };
    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-stone-500" aria-hidden="true">₹</span>
            <Input {...props} type="text" inputMode="decimal" autoComplete="off" value={draft.text} onChange={handleChange} className={`pl-8 ${className}`} />
        </div>
    );
}

function FieldValue({ field, value }) {
    const text = formatFieldValue(field, value);
    if (field.type === 'phone' && /\d/.test(String(value ?? ''))) {
        return <a href={`tel:${String(value).replace(/[^\d+]/g, '')}`} className="text-blue-700 underline-offset-2 hover:underline">{text}</a>;
    }
    return <span className={field.type === 'textarea' ? 'whitespace-pre-line' : ''}>{text}</span>;
}

function Tile({ field, value }) {
    return (
        <div className="min-w-0 rounded-xl bg-stone-50 p-3">
            <dt className="mb-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">{field.label}</dt>
            <dd className="break-words text-sm font-semibold text-stone-800"><FieldValue field={field} value={value} /></dd>
        </div>
    );
}

/**
 * One config field ({ key, label, type, options?, required?, help? }) as a
 * labelled control. `onChange` gets the new value: a number for number and
 * money, 'Yes'/'No' for yesno, a 10-digit string for phone, 'YYYY-MM-DD'
 * for date, and null whenever the field is emptied. `readOnly` shows the
 * formatted value instead. File fields render `renderFile(field)`, or a
 * disabled "Upload after saving" button when there is no record to attach to yet.
 */
export function FieldRenderer({ field, value, onChange, readOnly = false, disabled = false, renderFile, error, id }) {
    const autoId = useId();
    const controlId = id || `field-${field.key}-${autoId.replace(/:/g, '')}`;
    const hint = field.help;

    if (readOnly && !(field.type === 'file' && renderFile)) return <dl><Tile field={field} value={value} /></dl>;

    const set = next => onChange?.(next);
    const common = {
        id: controlId, disabled, required: field.required,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy(controlId, { hint, error }),
    };
    let control;
    let grouped = false;
    switch (field.type) {
        case 'textarea':
            control = <Textarea {...common} value={value ?? ''} onChange={e => set(orNull(e.target.value))} />;
            break;
        case 'number':
            control = <Input {...common} type="number" inputMode="decimal" step="any" value={value ?? ''}
                onChange={e => set(e.target.value === '' ? null : Number(e.target.value))} />;
            break;
        case 'money':
            control = <MoneyInput {...common} value={value} onChange={set} />;
            break;
        case 'date':
            control = <Input {...common} type="date" value={value ?? ''} onChange={e => set(orNull(e.target.value))} />;
            break;
        case 'select':
            control = <Select {...common} options={field.options} placeholder="Select…" value={value} onChange={e => set(orNull(e.target.value))} />;
            break;
        case 'phone':
            control = <Input {...common} type="tel" inputMode="numeric" autoComplete="tel" placeholder="10-digit mobile number"
                value={value ?? ''} onChange={e => set(orNull(cleanPhone(e.target.value)))} />;
            break;
        case 'yesno':
            grouped = true;
            control = <TagPicker label={field.label} options={YES_NO} value={value === true ? 'Yes' : value === false ? 'No' : value}
                onChange={set} allowDeselect disabled={disabled} columns={2} />;
            break;
        case 'file':
            grouped = true;
            control = renderFile ? renderFile(field) : (
                <button type="button" disabled className="sf-btn-secondary min-h-11 w-full">
                    <Upload size={14} aria-hidden="true" /> Upload after saving
                </button>
            );
            break;
        default:
            control = <Input {...common} type="text" value={value ?? ''} onChange={e => set(orNull(e.target.value))} />;
    }
    return (
        <Field label={field.label} htmlFor={grouped ? undefined : controlId} required={field.required} hint={hint} error={error}>
            {control}
        </Field>
    );
}

/**
 * Read-only label/value list for config fields. Values are read from
 * `record[field.key]` (dotted keys allowed) unless `getValue(record, field)`
 * is given; for extra fields pass `record={customer.custom_fields}`.
 */
export function FieldList({ fields, record, getValue, variant = 'tiles', className = '' }) {
    const valueOf = field => (getValue ? getValue(record, field) : readPath(record, field.key));
    if (variant === 'rows') {
        return (
            <dl className={`divide-y divide-stone-100 ${className}`}>
                {fields.map(field => (
                    <div key={field.key} className="flex items-start justify-between gap-4 py-2 text-sm">
                        <dt className="text-stone-500">{field.label}</dt>
                        <dd className="min-w-0 break-words text-right font-semibold text-stone-800"><FieldValue field={field} value={valueOf(field)} /></dd>
                    </div>
                ))}
            </dl>
        );
    }
    return (
        <dl className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${className}`}>
            {fields.map(field => <Tile key={field.key} field={field} value={valueOf(field)} />)}
        </dl>
    );
}
