import { useState } from 'react';
import { Check } from 'lucide-react';
import { ErrorBanner } from '../../../../template/src/ui/index.js';
import { QUESTION_STEPS, isVisible } from '../../catalog/questions.js';
import { QuestionCard } from '../../components/QuestionCard.jsx';
import { StepNav } from '../../components/common.jsx';
import { unansweredIds } from './checks.js';

/** One group of questions per screen. `part` indexes QUESTION_STEPS. */
export function FeaturesStep({ answers, onAnswer, part, onPart, onBack, onNext }) {
    const [tried, setTried] = useState(false);
    const step = QUESTION_STEPS[part];
    const missing = tried ? unansweredIds(answers, step.id) : [];

    const go = index => { setTried(false); onPart(index); };
    const next = () => {
        const open = unansweredIds(answers, step.id);
        if (open.length) {
            setTried(true);
            document.getElementById(`question-${open[0]}`)?.focus();
            return;
        }
        if (part < QUESTION_STEPS.length - 1) go(part + 1);
        else onNext();
    };

    return (
        <div className="space-y-5">
            <ol aria-label="Question groups" className="hidden flex-wrap gap-1.5 sm:flex">
                {QUESTION_STEPS.map((item, index) => {
                    const done = !unansweredIds(answers, item.id).length;
                    const active = index === part;
                    return (
                        <li key={item.id}>
                            <button
                                type="button" onClick={() => go(index)} aria-current={active ? 'step' : undefined}
                                className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${
                                    active ? 'border-orange-400 bg-orange-50 text-stone-900' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                                }`}
                            >
                                {done && <Check size={12} className="text-emerald-600" aria-label="All answered" />}
                                {item.title}
                            </button>
                        </li>
                    );
                })}
            </ol>
            <div className="space-y-1 text-sm text-stone-600">
                <p>{step.intro}</p>
                <p>Not sure about a question? Choose “Not sure”. It is a safe answer: we go through it with you before your app is built.</p>
            </div>
            <div className="space-y-3">
                {step.questions.filter(question => isVisible(question, answers)).map(question => (
                    <QuestionCard
                        key={question.id} question={question} value={answers[question.id]} followUp={Boolean(question.showIf)}
                        missing={missing.includes(question.id)} onChange={value => onAnswer(question.id, value)}
                    />
                ))}
            </div>
            {missing.length > 0 && <ErrorBanner>Please answer every question on this page. Pick “Not sure” if you don’t know yet; we will talk it through.</ErrorBanner>}
            <StepNav onBack={part > 0 ? () => go(part - 1) : onBack} onNext={next}
                nextLabel={part < QUESTION_STEPS.length - 1 ? 'Next' : 'See my features'} />
        </div>
    );
}
