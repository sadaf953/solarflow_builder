import { useId } from 'react';
import { Gauge } from 'lucide-react';
import { STAGE_IDS, isRoleEnabled, stageLabel } from '../../config/index.js';
import { todayIST } from '../../lib/format.js';
import { Field, Input, SectionCard, TagPicker } from '../../ui/index.js';
import { normalizeMeterInstallation } from '../../utils';

const YES_NO = [
    { id: 'No', label: 'No', activeClass: 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/10' },
    { id: 'Yes', label: 'Yes', activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10' },
];
const EDITOR_TYPES = ['admin', 'vendor', 'channel_partner_office'];
const editorsText = () => ['the admin', isRoleEnabled('vendor') && 'the assigned vendor', isRoleEnabled('channel_partner_office') && 'partner offices']
    .filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' or $1');

export default function MeterInstallationTab({ editData, setEditData, isEditable, user }) {
    const dateId = useId();
    const canEdit = isEditable && EDITOR_TYPES.includes(user?.userType);
    const title = stageLabel(STAGE_IDS.METER_INSTALLATION);
    // Older records stored an object here; normalizeMeterInstallation reads both.
    const meterStatus = normalizeMeterInstallation(editData.meter_installation) || 'No';

    // "Yes" fills in today's date unless one is already set; "No" clears it.
    const setStatus = value => setEditData(prev => ({
        ...prev,
        meter_installation: value,
        installation_date: value === 'Yes' ? (prev.installation_date || todayIST()) : '',
    }));

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {!canEdit && (
                <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                    Only {editorsText()} can change the meter status and date. You can view them.
                </p>
            )}
            <SectionCard
                title={<>{title}<span className="text-red-500" aria-hidden="true"> *</span></>}
                subtitle="Has the net meter been installed?"
                icon={Gauge}
                tone="blue"
            >
                <TagPicker label={title} options={YES_NO} columns={2} value={meterStatus} disabled={!canEdit} onChange={setStatus} />
                {meterStatus === 'Yes' && (
                    <Field label="Meter installation date" htmlFor={dateId} required>
                        <Input
                            id={dateId}
                            type="date"
                            disabled={!canEdit}
                            value={editData.installation_date || ''}
                            onChange={event => setEditData(prev => ({ ...prev, installation_date: event.target.value }))}
                        />
                    </Field>
                )}
            </SectionCard>
        </div>
    );
}
