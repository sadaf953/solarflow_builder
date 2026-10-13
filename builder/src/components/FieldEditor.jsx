import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CUSTOM_FIELD_TYPES } from '../../../template/src/config/catalog/dropdowns.js';
import { keyFromLabel, LIMITS } from '../../../template/src/config/resolve.js';
import { Field, FieldRenderer, Input, Select, Toggle } from '../../../template/src/ui/index.js';
import { ChipListEditor } from './ListEditors.jsx';
import { stageName } from './wizardData.js';

const TYPE_OPTIONS = Object.entries(CUSTOM_FIELD_TYPES).map(([value, label]) => ({ value, label }));

// A key no other field uses: site_survey, site_survey_2, ...
function uniqueKey(label, fields, self) {
    const base = keyFromLabel(label);
    const taken = new Set(fields.filter(field => field !== self).map(field => field.key));
    let key = base;
    for (let n = 2; taken.has(key); n += 1) key = `${base.slice(0, 36)}_${n}`;
    return key;
}

function FieldRow({ field, fields, stages, onChange, onRemove }) {
    const id = useId();
    const [preview, setPreview] = useState(null);
    const set = patch => onChange({ ...field, ...patch });
    const stageKnown = stages.some(stage => stage.id === field.stage);
    const stageOptions = stages.filter(stage => stage.id !== 'LOST PROJECT').map(stage => ({ value: stage.id, label: stageName(stage) }));
    const setLabel = label => set(label.trim() ? { label, key: uniqueKey(label, fields, field) } : { label });
    const setType = type => {
        setPreview(null);
        set({ type, options: type === 'select' ? field.options || [] : undefined, required: type === 'file' ? false : field.required });
    };
    const setStage = stage => set({ stage, showInAddLead: stage === 'LEADS' ? field.showInAddLead : false });
    return (
        <li className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 lg:grid-cols-[1fr_280px]">
            <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Field name" htmlFor={`${id}-label`} error={field.label.trim() ? '' : 'Give this field a name.'}>
                        <Input id={`${id}-label`} value={field.label} maxLength={LIMITS.label} onChange={event => setLabel(event.target.value)} />
                    </Field>
                    <Field label="Type" htmlFor={`${id}-type`}>
                        <Select id={`${id}-type`} value={field.type} options={TYPE_OPTIONS} onChange={event => setType(event.target.value)} />
                    </Field>
                    <Field label="Stage where it is filled" htmlFor={`${id}-stage`} error={stageKnown ? '' : 'That stage was removed. Pick another one.'}>
                        <Select id={`${id}-stage`} value={stageKnown ? field.stage : ''} placeholder={stageKnown ? undefined : 'Pick a stage'}
                            options={stageOptions} onChange={event => setStage(event.target.value)} />
                    </Field>
                    <Field label="Hint for your team (optional)" htmlFor={`${id}-help`}>
                        <Input id={`${id}-help`} value={field.help || ''} maxLength={LIMITS.guidance} placeholder="For example: as written on the light bill"
                            onChange={event => set({ help: event.target.value })} />
                    </Field>
                </div>
                {field.type === 'select' && (
                    <Field label="Choices in the dropdown" error={field.options?.length ? '' : 'Add at least one choice.'}>
                        <ChipListEditor label={`choices for ${field.label || 'this field'}`} values={field.options || []} placeholder="Add a choice"
                            onChange={options => set({ options })} />
                    </Field>
                )}
                <div className="divide-y divide-stone-100 rounded-xl border border-stone-100 px-3">
                    {field.type !== 'file' && (
                        <Toggle checked={Boolean(field.required)} onChange={required => set({ required })} label="Must be filled before moving on"
                            description="The customer cannot move to the next stage while this is empty." />
                    )}
                    {field.stage === 'LEADS' && (
                        <Toggle checked={Boolean(field.showInAddLead)} onChange={showInAddLead => set({ showInAddLead })} label="Ask when adding a lead"
                            description="Shown in the Add Lead form." />
                    )}
                </div>
                <button type="button" onClick={onRemove} className="sf-btn-secondary min-h-11 text-red-700">
                    <Trash2 size={14} aria-hidden="true" /> Remove this field
                </button>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
                <p className="sf-kicker mb-2">Preview</p>
                <FieldRenderer field={{ ...field, label: field.label || 'Field name' }} value={preview} onChange={setPreview} />
            </div>
        </li>
    );
}

/** The client's own extra fields, with a live preview of each. */
export function FieldEditor({ fields = [], stages, onChange }) {
    const id = useId();
    const [label, setLabel] = useState('');
    const add = () => {
        if (!label.trim()) return;
        onChange([...fields, { key: uniqueKey(label, fields), label: label.trim(), type: 'text', stage: 'LEADS', required: false, showInAddLead: false }]);
        setLabel('');
    };
    const full = fields.length >= LIMITS.customFields;
    return (
        <div className="space-y-3">
            {fields.length > 0 && (
                <ul className="space-y-3">
                    {fields.map((field, index) => (
                        <FieldRow
                            key={index} field={field} fields={fields} stages={stages}
                            onChange={next => onChange(fields.map((item, i) => (i === index ? next : item)))}
                            onRemove={() => onChange(fields.filter((_, i) => i !== index))}
                        />
                    ))}
                </ul>
            )}
            <div className="space-y-2 rounded-2xl border border-dashed border-stone-300 p-4">
                <label htmlFor={`${id}-new`} className="block text-sm font-bold text-stone-900">Add a field</label>
                <p className="text-xs text-stone-500">Something you track today that SolarFlow does not ask for, like “Site survey date” or “Roof type”.</p>
                <div className="flex gap-2">
                    <Input id={`${id}-new`} value={label} maxLength={LIMITS.label} placeholder="Field name" disabled={full}
                        onChange={event => setLabel(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
                    <button type="button" onClick={add} disabled={!label.trim() || full} className="sf-btn-primary min-h-11 shrink-0">
                        <Plus size={14} aria-hidden="true" /> Add
                    </button>
                </div>
                {full && <p className="text-xs text-stone-500">You can add at most {LIMITS.customFields} fields.</p>}
            </div>
        </div>
    );
}
