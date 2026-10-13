// The features form: plain questions instead of a feature checklist.
//
// Clients answer about how their business works; the features follow from
// the answers, each with a "because you said..." reason. "Not sure" never
// switches anything on silently - it goes to the "To discuss" list.
//
// answer kinds
//   yesno   'yes' | 'no' | 'unsure'
//   choice  one of `options[].value` (each option lists the features it turns on)
// showIf   (answers) => boolean; hidden questions count as unanswered and off

import { FEATURE_REGISTRY } from '../../../template/src/config/catalog/features.js';

export const YES_NO = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'unsure', label: 'Not sure' },
];

export const QUESTION_STEPS = [
    {
        id: 'sales',
        title: 'How you get customers',
        intro: 'Tell us who brings you customers. This decides which logins your partners get.',
        questions: [
            {
                id: 'partners', kind: 'yesno', features: ['channelPartners'],
                question: 'Do agents or partners bring you customers, and should they log in to add leads and follow their customers?',
                example: 'A local electrician sends you rooftop leads for a commission and wants to see how far each customer has reached.',
                because: 'agents or partners bring you customers',
            },
            {
                id: 'partnerOffices', kind: 'yesno', features: ['cpos'],
                question: 'Do partner companies run their own office under your brand, with their own staff?',
                example: '“Sunrise Solar, Surat” sells your systems from its own office. It should only see its own customers.',
                note: 'This is not your own branch. Your own staff and branches use normal staff logins.',
                because: 'partner companies run their own office under your brand',
            },
            {
                id: 'partnerManagers', kind: 'yesno', features: ['branches'],
                showIf: answers => answers.partnerOffices === 'yes',
                question: 'Does each partner office need a manager login that sees only that office’s customers?',
                example: 'The Surat office manager checks their own pipeline every morning.',
                because: 'each partner office has a manager',
            },
            {
                id: 'dealers', kind: 'yesno', features: ['dealers'],
                showIf: answers => answers.partners === 'yes' || answers.partnerOffices === 'yes',
                question: 'Do your partners have dealers or sub-agents under them who need their own login?',
                example: 'Sunrise Solar has 5 village dealers. Each dealer adds their own leads and sees only those.',
                because: 'your partners have dealers under them',
            },
            {
                id: 'quotations', kind: 'yesno', features: ['quotationMaker'],
                question: 'Do you want to make customer quotations inside SolarFlow?',
                example: 'Send a 3-option quotation (budget, standard, premium) as a PDF, then turn it into a lead in one click.',
                because: 'you want to make quotations',
            },
        ],
    },
    {
        id: 'money',
        title: 'Payments & subsidy',
        intro: 'How your customers pay decides which payment stages you get.',
        questions: [
            {
                id: 'payments', kind: 'choice',
                question: 'How do your customers pay?',
                example: 'Most PM Surya Ghar customers take a bank solar loan; some pay cash.',
                options: [
                    { value: 'both', label: 'Loan and cash', description: 'Some take a loan, some pay directly.', features: ['loanTracking', 'cashPayments'] },
                    { value: 'loan', label: 'Mostly loan', description: 'Almost every customer takes a solar loan.', features: ['loanTracking'] },
                    { value: 'cash', label: 'Only cash / direct payment', description: 'No loans.', features: ['cashPayments'] },
                    { value: 'unsure', label: 'Not sure', description: 'We’ll discuss it.', features: [] },
                ],
                because: 'of how your customers pay',
            },
            {
                id: 'subsidy', kind: 'yesno', features: ['subsidyTracking'],
                question: 'Do you apply for the PM Surya Ghar subsidy for your customers?',
                example: 'Follow each customer’s subsidy from “In process” to “Received”.',
                because: 'you apply for the subsidy for customers',
            },
        ],
    },
    {
        id: 'materials',
        title: 'Material & documents',
        intro: 'How you handle material and customer papers.',
        questions: [
            {
                id: 'bom', kind: 'yesno', features: ['bomMaker'],
                question: 'Do you prepare a material list (BOM) for each installation?',
                example: 'Panels, inverter, cables and structure for each house, printed for the store team with serial numbers.',
                because: 'you prepare a material list for each installation',
            },
            {
                id: 'trucks', kind: 'yesno', features: ['deliveryBatches'],
                question: 'Do you send material by truck, with several customers in one trip?',
                example: 'One truck carries material for 4 houses in the same area, with a loading sheet and delivery challans.',
                because: 'you send material by truck',
            },
            {
                id: 'godown', kind: 'yesno', features: ['inventory'],
                question: 'Do you keep stock in a godown and want it to go down automatically when material is delivered?',
                example: 'You hold 120 panels; after a delivery of 6, stock shows 114 without anyone typing it.',
                because: 'you keep stock in a godown',
            },
            {
                id: 'documents', kind: 'choice',
                question: 'Customer documents (Aadhaar, light bill, photos): what should SolarFlow do with them?',
                example: 'Uploading keeps every file in one place. Ticking only records that you received it.',
                options: [
                    { value: 'both', label: 'Upload files and tick them off', description: 'Your team chooses per customer.', features: ['documentUploads', 'checklists'] },
                    { value: 'upload', label: 'Upload the files', description: 'Files are stored in SolarFlow.', features: ['documentUploads'] },
                    { value: 'tick', label: 'Just tick them off', description: 'No files are stored.', features: ['checklists'] },
                    { value: 'unsure', label: 'Not sure', description: 'We’ll discuss it.', features: ['checklists'] },
                ],
                because: 'of how you handle customer documents',
            },
        ],
    },
    {
        id: 'installation',
        title: 'Installation',
        intro: 'Who installs, and how you pay them.',
        questions: [
            {
                id: 'installerLogins', kind: 'yesno', features: ['vendorLogin'],
                question: 'Do outside installation teams need a phone login to see their jobs, update status and upload site photos?',
                example: 'A contractor team opens SolarFlow on site, marks “Installed” and uploads the geo-tag photo.',
                note: 'Choose No if only your own staff install.',
                because: 'outside teams install for you',
            },
            {
                id: 'installerPayouts', kind: 'yesno', features: ['vendorCommission'],
                showIf: answers => answers.installerLogins === 'yes',
                question: 'Should installers see in their login how much they will be paid for each job?',
                example: 'The contractor sees ₹2,000 per kW for each job and which payments are done.',
                because: 'installers should see their payouts',
            },
            {
                id: 'installationPayments', kind: 'yesno', features: ['installationCommission'],
                question: 'Do you want to track what you owe and have paid installers for each installation?',
                example: 'Your accounts person marks each installation “Paid” with the date.',
                because: 'you track installer payments',
            },
            {
                id: 'installationPage', kind: 'yesno', features: ['installationView'],
                question: 'Do you want one page listing every installation by status: pending, in progress, installed?',
                example: 'See at a glance which 12 houses are still waiting for installation.',
                because: 'you want an installation status page',
            },
        ],
    },
    {
        id: 'team',
        title: 'Your team',
        intro: 'Tools for your office team.',
        questions: [
            {
                id: 'calendar', kind: 'yesno', features: ['calendar'],
                question: 'Would a shared calendar help: site visits, meetings, follow-ups and days off that everyone can add to?',
                example: 'Sales adds a site visit for Tuesday; the installer marks Friday as not available.',
                because: 'you want a shared calendar',
            },
            {
                id: 'attendance', kind: 'yesno', features: ['attendance'],
                question: 'Should staff mark attendance and request leave in SolarFlow?',
                example: 'Staff tap “Present” each morning; you approve leave requests.',
                because: 'staff mark attendance in SolarFlow',
            },
            {
                id: 'chat', kind: 'yesno', features: ['teamChat'],
                question: 'Do you want a simple team chat inside SolarFlow?',
                example: 'Post “Truck leaves at 9” for the whole team without WhatsApp.',
                because: 'you want a team chat',
            },
            {
                id: 'exports', kind: 'yesno', features: ['dataExports'],
                question: 'Do you need to download customer lists to Excel?',
                example: 'Download this month’s registrations for your accountant.',
                because: 'you download lists to Excel',
            },
        ],
    },
];

export const ALL_QUESTIONS = QUESTION_STEPS.flatMap(step => step.questions.map(question => ({ ...question, step: step.id })));
const QUESTION_BY_ID = Object.fromEntries(ALL_QUESTIONS.map(question => [question.id, question]));

export const isVisible = (question, answers) => !question.showIf || question.showIf(answers || {});
export const visibleQuestions = answers => ALL_QUESTIONS.filter(question => isVisible(question, answers));

// Features a single answer turns on.
function featuresFor(question, answer) {
    if (question.kind === 'choice') return question.options.find(option => option.value === answer)?.features || [];
    return answer === 'yes' ? question.features : [];
}

// Answers -> { features, reasons, discuss, unanswered }.
// `features` holds every selectable feature (true/false). Dependencies a chosen
// feature needs are switched on too, with a reason naming what needed them.
export function answersToFeatures(answers = {}, overrides = {}) {
    const features = Object.fromEntries(Object.entries(FEATURE_REGISTRY)
        .filter(([, feature]) => feature.status === 'available').map(([id]) => [id, false]));
    const reasons = {};
    const discuss = [];
    const unanswered = [];
    for (const question of visibleQuestions(answers)) {
        const answer = answers[question.id];
        if (!answer) { unanswered.push(question.id); continue; }
        if (answer === 'unsure') discuss.push(question.id);
        for (const id of featuresFor(question, answer)) {
            if (!(id in features)) continue;
            features[id] = true;
            reasons[id] ||= `Because ${question.because}.`;
        }
    }
    // Manual changes from the review step win over answers.
    for (const [id, value] of Object.entries(overrides || {})) {
        if (id in features && typeof value === 'boolean') {
            features[id] = value;
            reasons[id] = value ? 'You switched this on.' : 'You switched this off.';
        }
    }
    // Pull in what chosen features need (BOM for truck deliveries, ...).
    let changed = true;
    while (changed) {
        changed = false;
        for (const [id, on] of Object.entries(features)) {
            if (!on) continue;
            for (const dep of FEATURE_REGISTRY[id].dependsOn || []) {
                if (dep in features && !features[dep]) {
                    features[dep] = true;
                    reasons[dep] = `Added because ${FEATURE_REGISTRY[id].label} needs it.`;
                    changed = true;
                }
            }
        }
    }
    return { features, reasons, discuss, unanswered };
}

export const questionById = id => QUESTION_BY_ID[id];

// A short, human summary of one answer for the admin page.
export function describeAnswer(question, answer) {
    if (!answer) return 'Not answered';
    if (question.kind === 'choice') return question.options.find(option => option.value === answer)?.label || answer;
    return YES_NO.find(option => option.value === answer)?.label || answer;
}
