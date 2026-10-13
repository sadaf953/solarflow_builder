import { useState } from 'react';
import { CheckCircle2, CircleHelp, ListChecks, MinusCircle } from 'lucide-react';
import { FEATURE_GROUPS, FEATURE_REGISTRY } from '../../../template/src/config/catalog/features.js';
import { Badge, Modal, Toggle } from '../../../template/src/ui/index.js';
import { AVAILABLE_FEATURES, featureLists, summaryLine } from './wizardData.js';

function Column({ title, icon: Icon, tone, count, children }) {
    return (
        <section aria-label={title} className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
                <Icon size={18} className={tone} aria-hidden="true" /> {title}
                <span className="ml-auto rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{count}</span>
            </h3>
            <ul className="mt-3 space-y-3">{children}</ul>
        </section>
    );
}

/** You'll get / Not included / To discuss. */
export function FeatureColumns({ result }) {
    const lists = featureLists(result);
    return (
        <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
                <Column title="You'll get" icon={CheckCircle2} tone="text-emerald-600" count={lists.on.length}>
                    {lists.on.map(item => (
                        <li key={item.id}>
                            <p className="text-sm font-bold text-stone-900">{item.label}</p>
                            {item.reason && <p className="text-xs text-stone-500">{item.reason}</p>}
                        </li>
                    ))}
                    {!lists.on.length && <li className="text-xs text-stone-500">Nothing extra yet.</li>}
                </Column>
                <Column title="Not included" icon={MinusCircle} tone="text-stone-400" count={lists.off.length}>
                    {lists.off.map(item => (
                        <li key={item.id}>
                            <p className="text-sm font-bold text-stone-700">{item.label}</p>
                            <p className="text-xs text-stone-500">{item.description}</p>
                        </li>
                    ))}
                    {!lists.off.length && <li className="text-xs text-stone-500">Nothing left out.</li>}
                </Column>
                <Column title="To discuss" icon={CircleHelp} tone="text-yellow-600" count={lists.discuss.length}>
                    {lists.discuss.map(item => (
                        <li key={item.id}>
                            <p className="text-sm font-semibold text-stone-800">{item.text}</p>
                            <p className="text-xs text-stone-500">{item.note}</p>
                        </li>
                    ))}
                    {!lists.discuss.length && <li className="text-xs text-stone-500">Nothing to discuss.</li>}
                </Column>
            </div>
            <p className="text-xs text-stone-500"><span className="font-bold text-stone-700">Always included:</span> {lists.core.join(', ')}.</p>
        </div>
    );
}

/**
 * Switches for every available feature. `baseline` is the feature map
 * without these overrides; an override equal to it is dropped again, so
 * `overrides` only ever holds real changes.
 */
export function FeatureToggles({ current, baseline, overrides = {}, onChange }) {
    const set = (id, value) => {
        const next = { ...overrides };
        if (baseline[id] === value) delete next[id];
        else next[id] = value;
        onChange(next);
    };
    const neededBy = id => AVAILABLE_FEATURES.filter(other => current[other] && FEATURE_REGISTRY[other].dependsOn?.includes(id))
        .map(other => FEATURE_REGISTRY[other].label);
    return (
        <div className="space-y-5">
            {FEATURE_GROUPS.filter(group => AVAILABLE_FEATURES.some(id => FEATURE_REGISTRY[id].group === group.id)).map(group => (
                <fieldset key={group.id} className="space-y-1">
                    <legend className="sf-kicker mb-1">{group.label}</legend>
                    {AVAILABLE_FEATURES.filter(id => FEATURE_REGISTRY[id].group === group.id).map(id => {
                        const needed = current[id] ? neededBy(id) : [];
                        const changed = id in overrides;
                        const anyOf = FEATURE_REGISTRY[id].dependsOnAny || [];
                        const missingAny = current[id] && anyOf.length && !anyOf.some(dep => current[dep])
                            ? ` Works only with ${anyOf.map(dep => FEATURE_REGISTRY[dep].label).join(' or ')} switched on.` : '';
                        return (
                            <div key={id} className="rounded-xl border border-stone-100 px-3 py-1">
                                <Toggle
                                    checked={Boolean(current[id])} disabled={needed.length > 0} onChange={value => set(id, value)}
                                    label={FEATURE_REGISTRY[id].label}
                                    description={`${FEATURE_REGISTRY[id].description}${needed.length ? ` Needed for ${needed.join(', ')}.` : ''}${missingAny}`}
                                />
                                {changed && <Badge tone="orange" className="mb-2">Changed</Badge>}
                            </div>
                        );
                    })}
                </fieldset>
            ))}
            {Object.keys(overrides).length > 0 && (
                <button type="button" onClick={() => onChange({})} className="sf-btn-secondary min-h-11">Undo these changes</button>
            )}
        </div>
    );
}

function SummaryBody({ lists }) {
    return (
        <div className="space-y-4">
            <ul className="space-y-2.5">
                {lists.on.map(item => (
                    <li key={item.id} className="flex gap-2">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                        <span className="min-w-0">
                            <span className="block text-sm font-bold text-stone-900">{item.label}</span>
                            {item.reason && <span className="block text-xs text-stone-500">{item.reason}</span>}
                        </span>
                    </li>
                ))}
                {!lists.on.length && <li className="text-xs text-stone-500">Answer the questions and your features appear here.</li>}
            </ul>
            {lists.discuss.length > 0 && (
                <div>
                    <p className="sf-kicker">To discuss</p>
                    <ul className="mt-2 space-y-2">
                        {lists.discuss.map(item => (
                            <li key={item.id} className="flex gap-2 text-xs text-stone-600">
                                <CircleHelp size={14} className="mt-0.5 shrink-0 text-yellow-600" aria-hidden="true" />
                                <span>{item.text} <span className="text-stone-400">{item.note}</span></span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

/** Live feature summary: a sticky panel on desktop, a bottom bar on phones. */
export function LiveSummary({ result }) {
    const [open, setOpen] = useState(false);
    const lists = featureLists({ ...result, unanswered: [] });
    const line = summaryLine(lists);
    return (
        <>
            <aside aria-label="Your features so far" className="sticky top-6 hidden max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-4 shadow-sm lg:block">
                <p className="flex items-center gap-2 text-sm font-bold text-stone-900"><ListChecks size={18} className="text-orange-600" aria-hidden="true" /> So far</p>
                <p className="mb-4 mt-1 text-xs font-semibold text-stone-600" aria-live="polite">{line}</p>
                <SummaryBody lists={lists} />
            </aside>
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
                <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl text-left">
                    <span className="min-w-0 truncate text-sm font-bold text-stone-900" aria-live="polite">{line}</span>
                    <span className="shrink-0 text-xs font-bold text-orange-700">See list</span>
                </button>
            </div>
            <Modal open={open} onClose={() => setOpen(false)} title={line} variant="sheet">
                <SummaryBody lists={lists} />
            </Modal>
        </>
    );
}
