import { useEffect, useId, useState } from 'react';
import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { formatINR } from '../../../template/src/lib/format.js';
import { Badge, Field, Input, SectionCard, Select, Textarea, describedBy } from '../../../template/src/ui/index.js';
import { ADD_ON_DECISIONS, ADD_ON_LIMITS, LAUNCH_DAYS, addOnList, newAddOnId, withAddOn, withoutAddOn } from '../catalog/menu.js';

const DECISION_LABEL = Object.fromEntries(ADD_ON_DECISIONS.map(option => [option.value, option.label]));
const DECISION_TONE = { '': 'yellow', menu: 'green', addon: 'orange', declined: 'stone' };

function AddOnRow({ entry, textId, onChange, onRemove }) {
    const id = useId();
    const set = patch => onChange({ ...entry, ...patch });
    const paid = entry.decision === 'addon';
    const priceHint = entry.price ? formatINR(entry.price, { zero: '₹0' }) : 'Whole rupees, for example 15000.';
    return (
        <li className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone={entry.from === 'client' ? 'blue' : 'stone'}>{entry.from === 'client' ? 'Client asked' : 'Added by you'}</Badge>
                <Badge tone={DECISION_TONE[entry.decision]}>{DECISION_LABEL[entry.decision]}</Badge>
            </div>
            {entry.from === 'client' ? <p className="whitespace-pre-line break-words text-sm text-stone-800">{entry.text}</p> : (
                <Field label="What it is" htmlFor={textId}>
                    <Textarea id={textId} rows={2} maxLength={ADD_ON_LIMITS.text} value={entry.text} placeholder="For example: a dispatch report for the bank"
                        onChange={event => set({ text: event.target.value })} />
                </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Decision" htmlFor={`${id}-decision`}>
                    <Select id={`${id}-decision`} value={entry.decision} options={ADD_ON_DECISIONS} onChange={event => set({ decision: event.target.value })} />
                </Field>
                {paid && (
                    <Field label="Price (₹)" htmlFor={`${id}-price`} hint={priceHint}>
                        <Input id={`${id}-price`} inputMode="numeric" value={entry.price} maxLength={ADD_ON_LIMITS.priceDigits}
                            aria-describedby={describedBy(`${id}-price`, { hint: priceHint })}
                            onChange={event => set({ price: event.target.value.replace(/\D/g, '') })} />
                    </Field>
                )}
                {paid && (
                    <Field label="Timeline" htmlFor={`${id}-timeline`}>
                        <Input id={`${id}-timeline`} value={entry.timeline} maxLength={ADD_ON_LIMITS.timeline} placeholder="For example 2 weeks after launch"
                            onChange={event => set({ timeline: event.target.value })} />
                    </Field>
                )}
                <Field label="Note (optional)" htmlFor={`${id}-note`}>
                    <Input id={`${id}-note`} value={entry.note} maxLength={ADD_ON_LIMITS.note} onChange={event => set({ note: event.target.value })} />
                </Field>
            </div>
            {onRemove && (
                <button type="button" onClick={onRemove} className="sf-btn-secondary min-h-11 text-red-700">
                    <Trash2 size={14} aria-hidden="true" /> Remove this item
                </button>
            )}
        </li>
    );
}

/**
 * Everything the client asked for outside the menu, plus items the admin
 * adds, each with the admin's decision. `addOns` is settings.addOns.
 */
export function AddOnsPanel({ submission, addOns = [], onChange }) {
    const id = useId();
    const [focusId, setFocusId] = useState('');
    useEffect(() => {
        if (focusId) document.getElementById(`${id}-${focusId}`)?.focus();
    }, [id, focusId]);
    const entries = addOnList(submission, addOns);
    const full = entries.filter(entry => entry.from === 'admin').length >= ADD_ON_LIMITS.adminItems;
    const add = () => {
        const entry = { id: newAddOnId(), from: 'admin', text: '' };
        onChange(withAddOn(addOns, entry));
        setFocusId(entry.id);
    };
    return (
        <SectionCard title="Add-ons" icon={PackagePlus} subtitle={`The launch takes ${LAUNCH_DAYS}. Paid add-ons follow on their own timeline.`}>
            {entries.length ? (
                <ul className="space-y-3">
                    {entries.map(entry => (
                        <AddOnRow key={`${entry.from}:${entry.id}`} entry={entry} textId={`${id}-${entry.id}`}
                            onChange={next => onChange(withAddOn(addOns, next))}
                            onRemove={entry.from === 'admin' ? () => onChange(withoutAddOn(addOns, entry)) : undefined} />
                    ))}
                </ul>
            ) : <p className="text-sm text-stone-500">The client did not ask for anything outside the form.</p>}
            <button type="button" onClick={add} disabled={full} className="sf-btn-secondary min-h-11">
                <Plus size={14} aria-hidden="true" /> Add an item
            </button>
            {full && <p className="text-xs text-stone-500">You can add at most {ADD_ON_LIMITS.adminItems} items of your own.</p>}
        </SectionCard>
    );
}
