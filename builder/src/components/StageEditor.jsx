import { useId, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react';
import {
    BUILTIN_STAGES, CUSTOM_STAGE_ID, RESERVED_STAGE_IDS, STAGE_GROUP_DEFAULTS, STAGE_ICON_NAMES,
} from '../../../template/src/config/catalog/stages.js';
import { keyFromLabel, LIMITS } from '../../../template/src/config/resolve.js';
import { stageIcon } from '../../../template/src/config/icons.js';
import { ChoiceCards, Field, Input, Select } from '../../../template/src/ui/index.js';
import { availableBuiltinStages, defaultStageList, stageLocks } from '../catalog/submission.js';
import { BUILTIN_BY_ID, currentStages, isPinned, stageName } from './wizardData.js';

const GROUPS = STAGE_GROUP_DEFAULTS.filter(group => group.id !== 'closed');
const GROUP_LABEL = Object.fromEntries(STAGE_GROUP_DEFAULTS.map(group => [group.id, group.label]));
const ORDER = Object.fromEntries(BUILTIN_STAGES.map((stage, index) => [stage.id, index]));
const MODES = [
    { value: 'default', label: 'Use the standard stages', description: 'The stages most solar companies use. You can still change them later.' },
    { value: 'custom', label: 'Change them', description: 'Rename, reorder, remove or add stages.' },
];
const pinnedEntry = (list, id) => list.find(stage => stage.id === id) || { id, label: BUILTIN_BY_ID[id].label, group: BUILTIN_BY_ID[id].group };

function IconButton({ label, onClick, disabled, children, danger = false }) {
    return (
        <button
            type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 disabled:cursor-not-allowed disabled:opacity-30 ${danger ? 'enabled:hover:border-red-200 enabled:hover:bg-red-50 enabled:hover:text-red-600' : 'enabled:hover:bg-stone-100'}`}
        >
            {children}
        </button>
    );
}

function IconPicker({ value, onChange }) {
    const name = useId();
    return (
        <div role="radiogroup" aria-label="Icon" className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
            {STAGE_ICON_NAMES.map(iconName => {
                const Icon = stageIcon(iconName);
                const on = value === iconName;
                return (
                    <label key={iconName} title={iconName}
                        className={`flex h-11 cursor-pointer items-center justify-center rounded-xl border focus-within:ring-2 focus-within:ring-yellow-400 ${on ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>
                        <input type="radio" name={name} value={iconName} checked={on} onChange={() => onChange(iconName)} className="sr-only" aria-label={iconName} />
                        <Icon size={18} aria-hidden="true" />
                    </label>
                );
            })}
        </div>
    );
}

function AddStageForm({ stages, onAdd }) {
    const id = useId();
    const [label, setLabel] = useState('');
    const [group, setGroup] = useState('materials');
    const [icon, setIcon] = useState('ClipboardList');
    const [error, setError] = useState('');
    const add = () => {
        const name = label.trim();
        const stageId = keyFromLabel(name, { stage: true });
        let problem = '';
        if (!CUSTOM_STAGE_ID.test(stageId)) problem = 'Use a name of at least 2 letters or numbers, starting with a letter.';
        else if (stages.some(stage => stage.id === stageId || stageName(stage).toLowerCase() === name.toLowerCase())) problem = 'You already have a stage with this name.';
        else if (RESERVED_STAGE_IDS.includes(stageId)) problem = 'SolarFlow already uses this name. Pick another name, or add the standard stage back above.';
        else if (stages.filter(stage => stage.custom).length >= LIMITS.customStages) problem = `You can add at most ${LIMITS.customStages} stages of your own.`;
        if (problem) { setError(problem); return; }
        onAdd({ id: stageId, label: name, custom: true, group, icon });
        setLabel('');
        setError('');
    };
    return (
        <div className="space-y-3 rounded-2xl border border-dashed border-stone-300 p-4">
            <p className="text-sm font-bold text-stone-900">Add a stage of your own</p>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Stage name" htmlFor={`${id}-name`} error={error}>
                    <Input id={`${id}-name`} value={label} maxLength={LIMITS.label} placeholder="For example Site Survey"
                        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-name-error` : undefined}
                        onChange={event => { setLabel(event.target.value); setError(''); }}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
                </Field>
                <Field label="Section" htmlFor={`${id}-group`}>
                    <Select id={`${id}-group`} value={group} onChange={event => setGroup(event.target.value)}
                        options={GROUPS.map(item => ({ value: item.id, label: item.label }))} />
                </Field>
            </div>
            <Field label="Icon"><IconPicker value={icon} onChange={setIcon} /></Field>
            <button type="button" onClick={add} disabled={!label.trim()} className="sf-btn-primary min-h-11">
                <Plus size={14} aria-hidden="true" /> Add stage
            </button>
        </div>
    );
}

/** Choose standard stages or edit them: rename, reorder, remove, add. */
export function StageEditor({ workflow, features, onChange }) {
    const custom = workflow.stagesMode === 'custom';
    const list = currentStages(workflow, features);
    const locks = stageLocks(features);
    const middle = list.filter(stage => !isPinned(stage.id));
    const ids = new Set(list.map(stage => stage.id));

    const write = nextMiddle => onChange({
        stagesMode: 'custom',
        stages: [pinnedEntry(list, 'LEADS'), ...nextMiddle, pinnedEntry(list, 'COMPLETED'), pinnedEntry(list, 'LOST PROJECT')],
    });
    const setMode = mode => onChange(mode === 'custom' && !workflow.stages?.length
        ? { stagesMode: mode, stages: defaultStageList(features) }
        : { stagesMode: mode });
    const rename = (id, label) => onChange({ stages: list.map(stage => (stage.id === id ? { ...stage, label } : stage)) });
    const move = (index, step) => {
        const next = [...middle];
        [next[index], next[index + step]] = [next[index + step], next[index]];
        write(next);
    };
    const addBuiltin = id => {
        const stage = BUILTIN_BY_ID[id];
        let at = 0;
        middle.forEach((item, index) => { if (!item.custom && ORDER[item.id] < ORDER[id]) at = index + 1; });
        write([...middle.slice(0, at), { id, label: stage.label, group: stage.group }, ...middle.slice(at)]);
    };
    const missing = availableBuiltinStages(features).filter(stage => !ids.has(stage.id));
    const missingLocked = missing.filter(stage => locks[stage.id]);

    if (!custom) {
        return (
            <div className="space-y-4">
                <ChoiceCards label="Stages" value="default" onChange={setMode} options={MODES} />
                <ol className="flex flex-wrap gap-1.5 text-xs font-semibold text-stone-700">
                    {list.map((stage, index) => <li key={stage.id} className="rounded-full bg-stone-100 px-2.5 py-1">{index + 1}. {stageName(stage)}</li>)}
                </ol>
            </div>
        );
    }

    const row = (stage, index) => {
        const Icon = stageIcon(stage.custom ? stage.icon : BUILTIN_BY_ID[stage.id]?.icon);
        const pinned = isPinned(stage.id);
        const lock = locks[stage.id];
        const name = stageName(stage);
        return (
            <li key={stage.id} className="space-y-1.5 rounded-xl border border-stone-200 bg-white p-2.5">
                <div className="flex items-center gap-2">
                    <Icon size={18} className="hidden shrink-0 text-orange-600 sm:block" aria-hidden="true" />
                    <Input aria-label={`Name of the ${name} stage`} value={stage.label ?? ''} maxLength={LIMITS.label}
                        placeholder={BUILTIN_BY_ID[stage.id]?.label || 'Stage name'} onChange={event => rename(stage.id, event.target.value)} />
                    {pinned ? (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center text-stone-400" title={stage.id === 'LEADS' ? 'Always first' : 'Always last'}>
                            <Lock size={16} aria-label={stage.id === 'LEADS' ? 'Always first' : 'Always last'} />
                        </span>
                    ) : (
                        <>
                            <IconButton label={`Move ${name} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></IconButton>
                            <IconButton label={`Move ${name} down`} disabled={index === middle.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></IconButton>
                            <IconButton label={lock ? `${name} cannot be removed: ${lock}` : `Remove ${name}`} danger disabled={Boolean(lock)}
                                onClick={() => write(middle.filter(item => item.id !== stage.id))}>
                                <Trash2 size={16} aria-hidden="true" />
                            </IconButton>
                        </>
                    )}
                </div>
                <p className="pl-1 text-[11px] text-stone-500">
                    {pinned ? (stage.id === 'LEADS' ? 'Always the first stage' : 'Always at the end') : GROUP_LABEL[stage.group] || 'Your own stage'}
                    {stage.custom && ' · your own stage'}
                    {lock && <span className="font-semibold text-stone-600"> · {lock}, so it stays</span>}
                </p>
            </li>
        );
    };

    return (
        <div className="space-y-4">
            <ChoiceCards label="Stages" value="custom" onChange={setMode} options={MODES} />
            {missingLocked.length > 0 && (
                <div role="alert" className="flex gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="space-y-2">
                        {missingLocked.map(stage => (
                            <p key={stage.id}>
                                {locks[stage.id]}, so the {stage.label} stage is added back at its usual place.{' '}
                                <button type="button" onClick={() => addBuiltin(stage.id)} className="sf-btn-secondary ml-1 min-h-11">Add it back now</button>
                            </p>
                        ))}
                    </div>
                </div>
            )}
            <ol className="space-y-2">
                {row(pinnedEntry(list, 'LEADS'), -1)}
                {middle.map(row)}
                {row(pinnedEntry(list, 'COMPLETED'), -1)}
                {row(pinnedEntry(list, 'LOST PROJECT'), -1)}
            </ol>
            {missing.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-stone-700">Add a standard stage back:</span>
                    {missing.map(stage => (
                        <button key={stage.id} type="button" onClick={() => addBuiltin(stage.id)} className="sf-btn-secondary min-h-11">
                            <Plus size={14} aria-hidden="true" /> {stage.label}
                        </button>
                    ))}
                </div>
            )}
            <AddStageForm stages={list} onAdd={stage => write([...middle, stage])} />
        </div>
    );
}
