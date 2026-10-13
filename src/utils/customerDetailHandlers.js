import { SUBSIDY_TAGS, LOAN_TAGS, PRIMARY_STAGES } from '../constants';

export const getStageRemarkFromData = (stagesRemarksObj, stageName) => {
    if (!stagesRemarksObj) return '';
    if (typeof stagesRemarksObj === 'object') return stagesRemarksObj[stageName] || '';
    if (typeof stagesRemarksObj === 'string') {
        try {
            const parsed = JSON.parse(stagesRemarksObj);
            if (typeof parsed === 'object' && parsed) return parsed[stageName] || '';
            return parsed || '';
        } catch { return stagesRemarksObj; }
    }
    return '';
};

// You can move the other handler functions (handleToggleSubsidyTag, handleSaveInstallationDetails, etc.) here.
