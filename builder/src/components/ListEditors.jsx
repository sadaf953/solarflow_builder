import { useId, useState } from 'react';
import { Lock, Plus, RotateCcw, X } from 'lucide-react';
import { DROPDOWN_CATALOG } from '../../../template/src/config/catalog/dropdowns.js';
import { LIMITS } from '../../../template/src/config/resolve.js';
import { Input } from '../../../template/src/ui/index.js';
import { Expander } from './common.jsx';

// Lists that only matter while a feature is on.
const LIST_FEATURE = { loan_tags: 'loanTracking', subsidy_tags: 'subsidyTracking', payment_method_modes: 'cashPayments' };

/** Text input + Add button; Enter adds too. `check(text)` returns an error message or ''. */
function AddRow({ label, placeholder, onAdd, check, inputMode }) {
    const id = useId();
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const add = () => {
        const value = text.trim();
        if (!value) return;
        const problem = check(value);
        if (problem) { setError(problem); return; }
        onAdd(value);
        setText('');
        setError('');
    };
    return (
        <div className="space-y-1">
            <div className="flex gap-2">
                <Input
                    id={id} aria-label={label} placeholder={placeholder} value={text} maxLength={LIMITS.option} inputMode={inputMode}
                    aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
                    onChange={event => { setText(event.target.value); setError(''); }}
                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }}
                />
                <button type="button" onClick={add} disabled={!text.trim()} className="sf-btn-secondary min-h-11 shrink-0">
                    <Plus size={14} aria-hidden="true" /> Add
                </button>
            </div>
            {error && <p id={`${id}-error`} role="alert" className="text-xs font-semibold text-red-600">{error}</p>}
        </div>
    );
}

/** Editable list of plain text values shown as chips. */
export function ChipListEditor({ values, onChange, label, placeholder = 'Add an item', numeric = false }) {
    const check = value => {
        if (numeric && !/^\d{2,5}$/.test(value)) return 'Use numbers only, for example 550.';
        if (values.some(item => item.toLowerCase() === value.toLowerCase())) return `“${value}” is already in the list.`;
        if (values.length >= LIMITS.listItems) return `A list can hold at most ${LIMITS.listItems} items.`;
        return '';
    };
    return (
        <div className="space-y-2">
            {values.length > 0 ? (
                <ul aria-label={label} className="flex flex-wrap gap-2">
                    {values.map(value => (
                        <li key={value} className="flex items-center rounded-full border border-stone-200 bg-stone-50 pl-3 text-sm font-semibold text-stone-800">
                            {value}
                            <button type="button" onClick={() => onChange(values.filter(item => item !== value))} aria-label={`Remove ${value}`}
                                className="flex h-11 w-10 items-center justify-center rounded-full text-stone-400 hover:text-red-600">
                                <X size={14} aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            ) : <p className="text-xs text-stone-500">The list is empty.</p>}
            <AddRow label={`Add to ${label}`} placeholder={placeholder} onAdd={value => onChange([...values, value])} check={check} inputMode={numeric ? 'numeric' : undefined} />
        </div>
    );
}

/** Status tags: fixed ids with editable labels. Locked ids cannot be removed. */
function TagListEditor({ catalog, tags, onChange }) {
    const locked = new Set(catalog.lockedIds);
    const rename = (id, label) => onChange(tags.map(tag => (tag.id === id ? { ...tag, label } : tag)));
    const check = value => {
        if (tags.some(tag => tag.id.toLowerCase() === value.toLowerCase() || tag.label.trim().toLowerCase() === value.toLowerCase())) return `“${value}” is already in the list.`;
        if (tags.length >= LIMITS.listItems) return `A list can hold at most ${LIMITS.listItems} items.`;
        return '';
    };
    return (
        <div className="space-y-2">
            <ul className="space-y-2">
                {tags.map(tag => (
                    <li key={tag.id} className="flex items-center gap-2">
                        <Input aria-label={`Name for “${tag.id}”`} value={tag.label} maxLength={LIMITS.label} onChange={event => rename(tag.id, event.target.value)} />
                        {locked.has(tag.id) ? (
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center text-stone-400" title="SolarFlow needs this status, so it can be renamed but not removed.">
                                <Lock size={14} aria-label="Needed by SolarFlow, cannot be removed" />
                            </span>
                        ) : (
                            <button type="button" onClick={() => onChange(tags.filter(item => item.id !== tag.id))} aria-label={`Remove ${tag.label || tag.id}`}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-600">
                                <X size={16} aria-hidden="true" />
                            </button>
                        )}
                    </li>
                ))}
            </ul>
            {catalog.extendable
                ? <AddRow label={`Add to ${catalog.label}`} placeholder="Add a status" onAdd={value => onChange([...tags, { id: value, label: value }])} check={check} />
                : <p className="text-xs text-stone-500">You can rename these, but not add or remove them.</p>}
        </div>
    );
}

/** Every dropdown list the client can set up, prefilled with the standard values. */
export function ListsEditor({ dropdowns = {}, features, onChange }) {
    const ids = Object.keys(DROPDOWN_CATALOG).filter(id => !LIST_FEATURE[id] || features[LIST_FEATURE[id]]);
    const setList = (id, list) => onChange({ ...dropdowns, [id]: list });
    const reset = id => {
        const next = { ...dropdowns };
        delete next[id];
        onChange(next);
    };
    return (
        <div className="space-y-2">
            {ids.map(id => {
                const catalog = DROPDOWN_CATALOG[id];
                const changed = Array.isArray(dropdowns[id]);
                const list = changed ? dropdowns[id] : catalog.defaults.map(item => (typeof item === 'string' ? item : { ...item }));
                return (
                    <Expander key={id} title={`${catalog.label}${changed ? ' · changed' : ''}`} subtitle={`${list.length} item${list.length === 1 ? '' : 's'} · used in ${catalog.usedIn}`}>
                        <div className="space-y-3">
                            <p className="text-xs text-stone-500">{catalog.help}</p>
                            {catalog.storage === 'config'
                                ? <TagListEditor catalog={catalog} tags={list} onChange={next => setList(id, next)} />
                                : <ChipListEditor label={catalog.label} values={list} numeric={catalog.numeric} onChange={next => setList(id, next)}
                                    placeholder={catalog.numeric ? 'For example 550' : 'Add an item'} />}
                            {changed && (
                                <button type="button" onClick={() => reset(id)} className="sf-btn-secondary min-h-11">
                                    <RotateCcw size={14} aria-hidden="true" /> Back to the standard list
                                </button>
                            )}
                        </div>
                    </Expander>
                );
            })}
        </div>
    );
}
