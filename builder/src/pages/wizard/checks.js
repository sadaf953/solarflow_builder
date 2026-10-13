// What still needs fixing before each part of the setup form is complete.

import { cleanPhone } from '../../../../template/src/lib/format.js';
import { isAllowedSheetUrl, validateClientConfig } from '../../../../template/src/config/resolve.js';
import { visibleQuestions } from '../../catalog/questions.js';
import { submissionToClientConfig } from '../../catalog/submission.js';
import { isEmail } from '../../components/wizardData.js';

export function businessErrors(contact = {}) {
    const errors = {};
    if (!String(contact.company || '').trim()) errors.company = 'Enter your company name.';
    if (!String(contact.name || '').trim()) errors.name = 'Enter your name.';
    if (cleanPhone(contact.phone).length !== 10) errors.phone = 'Enter a 10-digit mobile number.';
    if (!isEmail(contact.email)) errors.email = 'Enter a valid email address.';
    return errors;
}

export const unansweredIds = (answers = {}, stepId) => visibleQuestions(answers)
    .filter(question => (!stepId || question.step === stepId) && !answers[question.id])
    .map(question => question.id);

export function workflowErrors(submission) {
    const workflow = submission.workflow || {};
    if (workflow.source === 'sheet') {
        const url = String(workflow.sheetUrl || '').trim();
        if (!url) return ['Paste the link to your sheet, or choose “Fill it in here”.'];
        return isAllowedSheetUrl(url) ? [] : ['The link must be a Google Sheets, OneDrive or SharePoint link that starts with https://.'];
    }
    // Contact problems are reported on their own step.
    return validateClientConfig(submissionToClientConfig(submission)).errors
        .filter(message => !/^(Client name|Client slug|Owner email)/.test(message));
}
