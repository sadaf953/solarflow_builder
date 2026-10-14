// SETUP-SUMMARY.md: what the client asked for, in one page for the agency.

import { FEATURE_REGISTRY, FEATURE_GROUPS } from '../../../template/src/config/catalog/features.js';
import { DROPDOWN_CATALOG, CUSTOM_FIELD_TYPES } from '../../../template/src/config/catalog/dropdowns.js';
import { resolveClientConfig } from '../../../template/src/config/resolve.js';
import { visibleQuestions, describeAnswer, questionById } from '../catalog/questions.js';
import { effectiveWorkflow, restoredStages, submissionFeatures } from '../catalog/submission.js';

// Client text on one line, with markdown that could change the layout escaped.
const inline = value => String(value ?? '').replace(/\s+/g, ' ').trim().replace(/([\\`*_[\]<>|#])/g, '\\$1');
const list = items => (items.length ? items : ['None.']);

export function setupSummaryMarkdown({ submission, adminOverrides = {}, adminWorkflow, config, validation, generatedAt }) {
    const resolved = resolveClientConfig(config);
    const fromAnswers = submission ? submissionFeatures(submission, adminOverrides) : { reasons: {}, discuss: [], unanswered: [] };
    const contact = submission?.contact || {};
    const workflow = effectiveWorkflow(submission, adminWorkflow);
    const lines = [];
    const section = (title, body) => lines.push(`## ${title}`, '', ...body, '');

    lines.push(`# Setup summary: ${inline(config.client.name)}`, '');
    lines.push(`Generated ${inline(generatedAt || new Date().toISOString())} for the SolarFlow team. The app does not need this file.`, '');

    section('Contact', [
        `- Company: ${inline(contact.company || config.client.name)}`,
        ...(contact.name ? [`- Contact: ${inline(contact.name)}`] : []),
        ...(contact.phone ? [`- Phone: ${inline(contact.phone)}`] : []),
        ...(contact.email ? [`- Email: ${inline(contact.email)}`] : []),
        ...(contact.city || contact.state ? [`- Location: ${inline([contact.city, contact.state].filter(Boolean).join(', '))}`] : []),
        `- Owner login (first admin): ${inline(config.client.ownerEmail) || 'not set'}`,
        `- Folder name: ${inline(config.client.slug)}-solarflow`,
    ]);

    const selectable = Object.entries(FEATURE_REGISTRY).filter(([, feature]) => feature.status === 'available');
    const reasonFor = id => {
        const on = resolved.features[id];
        const answerReason = fromAnswers.reasons[id];
        // The resolver gives a reason for a feature it keeps on against the
        // config (checklists, when document uploads is off).
        if (on) return resolved.featureReasons[id] || answerReason || 'Switched on.';
        // An answer may ask for a feature that a missing dependency switches off.
        return config.features?.[id] === false && answerReason ? answerReason : resolved.featureReasons[id] || 'Not chosen.';
    };
    const featureLines = wanted => FEATURE_GROUPS.flatMap(group => selectable
        .filter(([id, feature]) => feature.group === group.id && Boolean(resolved.features[id]) === wanted)
        .map(([id, feature]) => `- **${feature.label}** (${group.label}): ${reasonFor(id)}`));
    const core = Object.entries(FEATURE_REGISTRY).filter(([id, feature]) => feature.status === 'core' && resolved.features[id]).map(([, feature]) => feature.label);
    section('Features on', [...list(featureLines(true)), '', `Always included: ${core.join(', ')}.`]);
    section('Features off', list(featureLines(false)));

    if (submission) {
        const discuss = fromAnswers.discuss.map(id => `- ${inline(questionById(id)?.question || id)} (answered “Not sure”)`);
        const unanswered = fromAnswers.unanswered.map(id => `- ${inline(questionById(id)?.question || id)} (not answered)`);
        section('To discuss', list([...discuss, ...unanswered]));
        section('Answers', visibleQuestions(submission.answers || {})
            .map(question => `- ${inline(question.question)} **${inline(describeAnswer(question, submission.answers?.[question.id]))}**`));
    }

    const source = config.workflowSource || {};
    const restored = submission ? restoredStages(submission, { adminOverrides, workflow: adminWorkflow }) : [];
    section('Workflow', [
        source.type === 'sheet'
            ? `The client shared a sheet instead of filling in the form: ${inline(source.sheetUrl)}`
            : 'The client filled in the workflow form.',
        ...(source.note ? ['', `Client note: ${inline(source.note)}`] : []),
        ...(adminWorkflow ? ['', 'The SolarFlow team set up the stages, lists and extra fields on the client page.']
            : workflow.stagesMode === 'custom' && source.type !== 'sheet' ? ['', 'The client changed the stages.'] : []),
        ...(restored.length ? ['', ...restored.map(stage => `- ${inline(stage.label)} stage added back: ${inline(stage.reason)}.`)] : []),
    ]);

    const groupLabel = Object.fromEntries(resolved.groups.map(group => [group.id, group.label]));
    section('Stages', resolved.stages.map((stage, index) => {
        const notes = [groupLabel[stage.terminal ? 'closed' : stage.group], stage.custom ? 'custom stage' : ''].filter(Boolean);
        return `${index + 1}. ${inline(stage.label)} (\`${stage.id}\`)${notes.length ? `: ${notes.join(', ')}` : ''}`;
    }));

    const changed = new Set(Object.keys(workflow.dropdowns || {}));
    section('Lists', Object.entries(DROPDOWN_CATALOG).map(([id, catalog]) => {
        const values = catalog.storage === 'metadata'
            ? resolved.dropdowns.metadata[id] || []
            : (resolved.dropdowns.tags[id] || []).map(tag => tag.label);
        const shown = values.length ? values.map(inline).join(', ') : 'empty (filled in later on the Operations page)';
        return `- **${catalog.label}**${changed.has(id) ? ` (changed by ${adminWorkflow ? 'the SolarFlow team' : 'the client'})` : ''}: ${shown}`;
    }));

    const stageLabel = Object.fromEntries(resolved.stages.map(stage => [stage.id, stage.label]));
    section('Extra fields', list(resolved.customFields.map(field => {
        const details = [
            CUSTOM_FIELD_TYPES[field.type],
            `on ${inline(stageLabel[field.stage] || field.stage)}`,
            field.required ? 'must be filled before moving on' : '',
            field.showInAddLead ? 'asked when adding a lead' : '',
            field.options?.length ? `options: ${field.options.map(inline).join(', ')}` : '',
        ].filter(Boolean);
        return `- **${inline(field.label)}** (\`${field.key}\`): ${details.join('; ')}`;
    })));

    if (submission?.notes) section('Client notes', [inline(submission.notes)]);
    if (validation?.warnings?.length) section('Check before sending', validation.warnings.map(warning => `- ${inline(warning)}`));
    return `${lines.join('\n').trimEnd()}\n`;
}
