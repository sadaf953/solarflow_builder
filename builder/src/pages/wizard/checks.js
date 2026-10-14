// What still needs fixing before each part of the setup form is complete.
import { hasControlChars, isAllowedSheetUrl, validateClientConfig } from '../../../../template/src/config/resolve.js';
import { visibleQuestions } from '../../catalog/questions.js';
import { normalizePhone, submissionToClientConfig } from '../../catalog/submission.js';
import { isEmail } from '../../components/wizardData.js';

export function businessErrors(contact = {}) {
    const errors = {};
    if (!String(contact.company || '').trim()) errors.company = 'Enter your company name.';
    else if (hasControlChars(contact.company)) errors.company = 'The company name has a hidden character or line break. Please type it again.';
    if (!String(contact.name || '').trim()) errors.name = 'Enter your name.';
    else if (hasControlChars(contact.name)) errors.name = 'Your name has a hidden character or line break. Please type it again.';
    if (!/^\d{10}$/.test(normalizePhone(contact.phone))) errors.phone = 'Enter a 10-digit mobile number.';
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
        .filter(message => !/^(Client name|Client slug|Owner email|The client name|Company detail)/.test(message));
}
