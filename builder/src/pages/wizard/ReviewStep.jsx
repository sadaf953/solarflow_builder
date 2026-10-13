import { answersToFeatures } from '../../catalog/questions.js';
import { FeatureColumns, FeatureToggles } from '../../components/FeatureViews.jsx';
import { Expander, StepNav } from '../../components/common.jsx';

export function ReviewStep({ answers, overrides, onOverrides, onBack, onNext }) {
    const result = answersToFeatures(answers, overrides);
    const baseline = answersToFeatures(answers).features;
    const changed = Object.keys(overrides || {}).length;
    return (
        <div className="space-y-5">
            <FeatureColumns result={result} />
            <Expander
                title="Adjust individual features"
                subtitle={changed ? `You changed ${changed} feature${changed === 1 ? '' : 's'}.` : 'Only if something above is not right. Your answers usually decide this best.'}
            >
                <FeatureToggles current={result.features} baseline={baseline} overrides={overrides || {}} onChange={onOverrides} />
            </Expander>
            <StepNav onBack={onBack} onNext={onNext} nextLabel="Looks right — next" />
        </div>
    );
}
