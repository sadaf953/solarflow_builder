import { isOn } from '../../config/index.js';

// Documents and checklist items asked for in the Registration tab.
// The Subsidy Token Photo belongs to subsidy tracking.
export const REGISTRATION_DOCUMENTS = [
    { field: 'application_acknowledgment', label: 'Application Acknowledgment' },
    { field: 'feasibilty_document', label: 'Feasibility Document' },
    ...(isOn('subsidyTracking') ? [{ field: 'subsidy_token_photo', label: 'Subsidy Token Photo' }] : []),
];
