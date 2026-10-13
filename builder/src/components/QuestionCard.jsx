import { useId } from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import { ChoiceCards } from '../../../template/src/ui/index.js';
import { YES_NO } from '../catalog/questions.js';

const PICKED = {
    yes: 'border-emerald-600 bg-emerald-600 text-white',
    no: 'border-stone-800 bg-stone-800 text-white',
    unsure: 'border-yellow-400 bg-yellow-100 text-yellow-900',
};

// Yes / No / Not sure as one row of big buttons. Native radios underneath
// keep arrow keys and screen readers working.
function YesNoButtons({ name, value, onChange, labelledBy }) {
    return (
        <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-3 gap-2">
            {YES_NO.map(option => {
                const on = value === option.value;
                return (
                    <label
                        key={option.value}
                        className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm font-bold transition-colors focus-within:ring-2 focus-within:ring-yellow-400 focus-within:ring-offset-2 ${
                            on ? PICKED[option.value] : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50'
                        }`}
                    >
                        <input type="radio" name={name} value={option.value} checked={on} onChange={() => onChange(option.value)} className="sr-only" />
                        {option.label}
                    </label>
                );
            })}
        </div>
    );
}

/** One plain-language question: text, example, note and the answer buttons. */
export function QuestionCard({ question, value, onChange, followUp = false, missing = false }) {
    const id = useId();
    const titleId = `${id}-q`;
    return (
        <div
            id={`question-${question.id}`} tabIndex={-1}
            className={`space-y-3 rounded-2xl border bg-white p-4 shadow-sm outline-none sm:p-5 ${
                missing ? 'border-red-300 ring-2 ring-red-100' : 'border-stone-200'
            } ${followUp ? 'ml-3 border-l-4 border-l-orange-300 sm:ml-6' : ''}`}
        >
            {followUp && <p className="sf-kicker">Follow-up</p>}
            <div className="flex items-start gap-2">
                <p id={titleId} className="min-w-0 flex-1 text-base font-bold leading-snug text-stone-900">{question.question}</p>
                {value && <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Answered" />}
            </div>
            {question.example && <p className="text-sm leading-relaxed text-stone-500"><span className="font-semibold">For example:</span> {question.example}</p>}
            {question.note && (
                <p className="flex gap-2 rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-800">
                    <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {question.note}
                </p>
            )}
            {question.kind === 'choice' ? (
                <ChoiceCards
                    label={question.question} name={`${id}-choice`} value={value ?? ''} onChange={onChange}
                    options={question.options.map(option => ({ value: option.value, label: option.label, description: option.description }))}
                />
            ) : (
                <YesNoButtons name={`${id}-yesno`} value={value} onChange={onChange} labelledBy={titleId} />
            )}
            {missing && <p role="alert" className="text-xs font-semibold text-red-600">Please choose an answer. Pick “Not sure” if you don’t know yet.</p>}
        </div>
    );
}
