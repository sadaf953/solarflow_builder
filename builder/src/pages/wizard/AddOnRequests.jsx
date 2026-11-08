import { useEffect, useId, useState } from 'react';
import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { SectionCard, Textarea } from '../../../../template/src/ui/index.js';
import { ADD_ON_EXAMPLES, ADD_ON_LIMITS, ADD_ON_RULE, CUSTOMIZATION_MENU, LAUNCH_DAYS, featureLabel, newAddOnId } from '../../catalog/menu.js';
import { Expander } from '../../components/common.jsx';

/** The fixed menu from menu.js: what the launch includes at no extra cost. */
export function WhatsIncluded() {
    return (
        <Expander title="What's included at no extra cost" subtitle={`All of this is part of your launch in ${LAUNCH_DAYS}.`}>
            <div className="space-y-4 text-sm">
                {CUSTOMIZATION_MENU.map(section => (
                    <div key={section.id}>
                        <p className="font-bold text-stone-900">{section.title}</p>
                        <p className="text-stone-600">{section.text}</p>
                        {section.groups && (
                            <ul className="mt-1 space-y-1 text-stone-700">
                                {section.groups.map(group => (
                                    <li key={group.id}><span className="font-semibold">{group.label}:</span> {group.features.map(featureLabel).join(', ')}</li>
                                ))}
                            </ul>
                        )}
                        {section.features && <p className="mt-1 text-stone-700">{section.features.map(featureLabel).join(', ')}</p>}
                        {section.items && (
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-700">
                                {section.items.map(item => <li key={item}>{item}</li>)}
                            </ul>
                        )}
                    </div>
                ))}
            </div>
        </Expander>
    );
}

// The client's requests outside the menu. "Add a request" adds an empty one
// to type into, so nothing typed is lost before it is saved; empty requests
// are left out on our side.
function RequestList({ requests, onChange }) {
    const id = useId();
    const [focusId, setFocusId] = useState('');
    useEffect(() => {
        if (focusId) document.getElementById(`${id}-${focusId}`)?.focus();
    }, [id, focusId]);
    const full = requests.length >= ADD_ON_LIMITS.requests;
    const add = () => {
        const request = { id: newAddOnId(), text: '' };
        onChange([...requests, request]);
        setFocusId(request.id);
    };
    const setText = (requestId, text) => onChange(requests.map(item => (item.id === requestId ? { ...item, text } : item)));
    return (
        <div className="space-y-3">
            {requests.length > 0 && (
                <ol className="space-y-3">
                    {requests.map((request, index) => {
                        const controlId = `${id}-${request.id}`;
                        return (
                            <li key={request.id} className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3">
                                <label htmlFor={controlId} className="block text-xs font-bold text-stone-700">Request {index + 1}</label>
                                <Textarea id={controlId} rows={3} maxLength={ADD_ON_LIMITS.text} value={request.text}
                                    placeholder="For example: a monthly report of installations by district for our bank."
                                    aria-describedby={`${controlId}-hint`} onChange={event => setText(request.id, event.target.value)} />
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <p id={`${controlId}-hint`} className="text-[11px] text-stone-500">
                                        {request.text.length} of {ADD_ON_LIMITS.text} characters{request.text.trim() ? '' : ' · an empty request is left out'}
                                    </p>
                                    <button type="button" onClick={() => onChange(requests.filter(item => item.id !== request.id))}
                                        aria-label={`Remove request ${index + 1}`} className="sf-btn-secondary min-h-11 text-red-700">
                                        <Trash2 size={14} aria-hidden="true" /> Remove
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
            <button type="button" onClick={add} disabled={full} className="sf-btn-secondary min-h-11 w-full sm:w-auto">
                <Plus size={14} aria-hidden="true" /> {requests.length ? 'Add another request' : 'Add a request'}
            </button>
            <p className="text-xs text-stone-500">
                {full ? `You can add at most ${ADD_ON_LIMITS.requests} requests.` : `Up to ${ADD_ON_LIMITS.requests} requests, ${ADD_ON_LIMITS.text} characters each.`}
            </p>
        </div>
    );
}

/** "Need something that isn't in this form?" on the Send step. */
export function AddOnRequests({ requests = [], onChange }) {
    return (
        <SectionCard title="Need something that isn't in this form?" icon={PackagePlus}>
            <p className="text-sm text-stone-700">{ADD_ON_RULE}</p>
            <p className="text-sm text-stone-600">
                For example {ADD_ON_EXAMPLES.slice(0, -1).join(', ')} or {ADD_ON_EXAMPLES.at(-1)}. Tell us what you need and we will send you a price and a timeline.
            </p>
            <WhatsIncluded />
            <RequestList requests={requests} onChange={onChange} />
        </SectionCard>
    );
}
