import { ClipboardCheck } from 'lucide-react';
import { BRANDING, STAGE_IDS, isRoleEnabled, stageLabel } from '../../config/index.js';
import { SectionCard, TagPicker } from '../../ui/index.js';

const YES_NO = [
    { id: 'No', label: 'No', activeClass: 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/10' },
    { id: 'Yes', label: 'Yes', activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10' },
];
const EDITOR_TYPES = ['admin', 'vendor', 'channel_partner_office'];
const editorsText = () => ['the admin', isRoleEnabled('vendor') && 'the assigned vendor', isRoleEnabled('channel_partner_office') && 'partner offices']
    .filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' or $1');

export default function DiscomInspectionTab({ editData, setEditData, isEditable, user }) {
    const canEdit = isEditable && EDITOR_TYPES.includes(user?.userType);
    const title = stageLabel(STAGE_IDS.DISCOM_INSPECTION);

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {!canEdit && (
                <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                    Only {editorsText()} can change the inspection status. You can view it.
                </p>
            )}
            <SectionCard
                title={<>{title}<span className="text-red-500" aria-hidden="true"> *</span></>}
                subtitle={`Has ${BRANDING.discomName} inspected and approved the installation?`}
                icon={ClipboardCheck}
                tone="green"
            >
                <TagPicker
                    label={title}
                    options={YES_NO}
                    columns={2}
                    value={editData.discom_inspection || 'No'}
                    disabled={!canEdit}
                    onChange={value => setEditData(prev => ({ ...prev, discom_inspection: value }))}
                />
            </SectionCard>
        </div>
    );
}
