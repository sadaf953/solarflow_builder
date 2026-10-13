import { useId, useState } from 'react';
import { Columns3, FileSpreadsheet, ListPlus, ListTree } from 'lucide-react';
import { isAllowedSheetUrl } from '../../../../template/src/config/resolve.js';
import { ChoiceCards, ErrorBanner, Field, Input, SectionCard, Textarea } from '../../../../template/src/ui/index.js';
import { answersToFeatures } from '../../catalog/questions.js';
import { FieldEditor } from '../../components/FieldEditor.jsx';
import { ListsEditor } from '../../components/ListEditors.jsx';
import { StageEditor } from '../../components/StageEditor.jsx';
import { MessageList, StepNav } from '../../components/common.jsx';
import { currentStages } from '../../components/wizardData.js';
import { workflowErrors } from './checks.js';

const SOURCES = [
    { value: 'sheet', label: 'Share a view-only link to my sheet', description: 'We set up your stages and fields from it.', icon: FileSpreadsheet },
    { value: 'form', label: 'Fill it in here', description: 'Choose your stages, dropdown lists and extra fields now.', icon: ListTree },
];

function SheetLink({ workflow, onChange }) {
    const id = useId();
    const url = String(workflow.sheetUrl || '').trim();
    const error = url && !isAllowedSheetUrl(url) ? 'This must be a Google Sheets, OneDrive or SharePoint link that starts with https://.' : '';
    return (
        <SectionCard title="Your sheet" icon={FileSpreadsheet}>
            <div className="grid gap-3 text-sm text-stone-700 sm:grid-cols-2">
                <div className="rounded-xl bg-stone-50 p-3">
                    <p className="font-bold text-stone-900">Google Sheets</p>
                    <p className="mt-1">Click <b>Share</b> → under General access choose <b>Anyone with the link</b> → set it to <b>Viewer</b> → <b>Copy link</b>.</p>
                </div>
                <div className="rounded-xl bg-stone-50 p-3">
                    <p className="font-bold text-stone-900">Excel / OneDrive</p>
                    <p className="mt-1">Click <b>Share</b> → choose <b>Can view</b> (not Can edit) → <b>Copy link</b>.</p>
                </div>
            </div>
            <Field label="Link to your sheet" htmlFor={`${id}-url`} required error={error}>
                <Input id={`${id}-url`} type="url" inputMode="url" placeholder="https://docs.google.com/spreadsheets/…" value={workflow.sheetUrl || ''}
                    aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-url-error` : undefined}
                    onChange={event => onChange({ sheetUrl: event.target.value })} />
            </Field>
            <Field label="Anything we should know about the sheet? (optional)" htmlFor={`${id}-note`}>
                <Textarea id={`${id}-note`} rows={3} maxLength={2000} value={workflow.sheetNote || ''}
                    placeholder="For example: the “Pipeline” tab has our stages; column F is our own site survey date."
                    onChange={event => onChange({ sheetNote: event.target.value })} />
            </Field>
        </SectionCard>
    );
}

export function WorkflowStep({ submission, onWorkflow, onBack, onNext }) {
    const [tried, setTried] = useState(false);
    const workflow = submission.workflow;
    const { features } = answersToFeatures(submission.answers, submission.featureOverrides);
    const errors = tried ? workflowErrors(submission) : [];
    const next = () => {
        if (workflowErrors(submission).length) setTried(true);
        else onNext();
    };
    return (
        <div className="space-y-5">
            <p className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900">
                Open your Excel / Google Sheet next to this page before you decide your stages and fields.
            </p>
            <ChoiceCards label="How do you want to share your workflow?" value={workflow.source} onChange={source => onWorkflow({ source })} options={SOURCES} />
            {workflow.source === 'sheet' ? <SheetLink workflow={workflow} onChange={onWorkflow} /> : (
                <>
                    <SectionCard title="Stages" icon={Columns3} subtitle="The steps every customer moves through, from enquiry to completion.">
                        <StageEditor workflow={workflow} features={features} onChange={onWorkflow} />
                    </SectionCard>
                    <SectionCard title="Dropdown lists" icon={ListTree} subtitle="Choices your team picks from. Already filled with the usual values.">
                        <ListsEditor dropdowns={workflow.dropdowns} features={features} onChange={dropdowns => onWorkflow({ dropdowns })} />
                    </SectionCard>
                    <SectionCard title="Extra fields" icon={ListPlus} subtitle="Optional. Add the columns from your sheet that SolarFlow does not have yet.">
                        <FieldEditor fields={workflow.customFields} stages={currentStages(workflow, features)}
                            onChange={customFields => onWorkflow({ customFields })} />
                    </SectionCard>
                </>
            )}
            <ErrorBanner title={errors.length ? 'Please fix these first' : undefined}>{errors.length > 0 && <MessageList items={errors} />}</ErrorBanner>
            <StepNav onBack={onBack} onNext={next} />
        </div>
    );
}
