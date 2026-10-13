import { ClipboardList, MapPin } from 'lucide-react';
import { STAGE_IDS, isRoleEnabled, stageLabel } from '../../config/index.js';
import { Badge, SectionCard, TagPicker } from '../../ui/index.js';
import { CheckboxRemarkItem } from './shared';

const GEO_TAG_STATUSES = [
    { id: 'No', label: 'No', activeClass: 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/10' },
    { id: 'Pending', label: 'Pending', activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/10' },
    { id: 'Proceed', label: 'Proceed', activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10' },
];

export default function GeoTagPhotoTab({
    editData,
    setEditData,
    isEditable,
    user,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark,
}) {
    const userType = user?.userType;
    const isVendor = userType === 'vendor';
    const isOffice = userType === 'sales';
    // The vendor, admin and partner offices set the status; the office can
    // only upload the photo (which sets the status to Proceed by itself).
    const canEditStatus = isVendor || (isEditable && ['admin', 'channel_partner_office'].includes(userType));
    const canUploadImage = canEditStatus || (isEditable && isOffice);
    const canDeleteDocs = ['admin', 'sales'].includes(userType);
    const statusEditors = ['the admin', isRoleEnabled('vendor') && 'the assigned vendor', isRoleEnabled('channel_partner_office') && 'partner offices']
        .filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' or $1');
    const title = `${stageLabel(STAGE_IDS.GEO_TAG_PHOTO)} status`;

    // Uploading the photo moves the status to Proceed; removing it moves a
    // Proceed status back to No.
    const handleChange = (field, value) => setEditData(prev => {
        const next = { ...prev, [field]: value };
        if (field === 'geo_tag_image') {
            if (value) next.geo_tag_status = 'Proceed';
            else if (prev.geo_tag_status === 'Proceed') next.geo_tag_status = 'No';
        }
        return next;
    });

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {isOffice && isEditable ? (
                <p role="note" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-medium text-blue-900">
                    Upload the geo tag photo below. Uploading it sets the status to <strong>Proceed</strong>.
                </p>
            ) : !canUploadImage && (
                <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
                    Only {statusEditors} can change the geo tag status and photo. You can view them.
                </p>
            )}

            <SectionCard
                title={<>{title}<span className="text-red-500" aria-hidden="true"> *</span></>}
                subtitle="Is the site geo-tagged and ready to move on?"
                icon={MapPin}
                tone="blue"
            >
                <TagPicker
                    label={title}
                    options={GEO_TAG_STATUSES}
                    columns={3}
                    value={editData.geo_tag_status || 'No'}
                    disabled={!canEditStatus}
                    onChange={value => setEditData(prev => ({ ...prev, geo_tag_status: value }))}
                />
            </SectionCard>

            <SectionCard title="Geo tag photo" icon={ClipboardList} actions={<Badge tone="yellow">Optional</Badge>}>
                <CheckboxRemarkItem
                    label="Geo tag photo"
                    field="geo_tag_image"
                    value={editData.geo_tag_image}
                    onChange={handleChange}
                    isEditing={canUploadImage}
                    documents={documents}
                    onUpload={onFileUpload}
                    onDelete={onFileDelete}
                    onPreview={onFilePreview}
                    onUpdateRemark={onUpdateRemark}
                    canDelete={canDeleteDocs}
                />
                {editData.geo_tag_status === 'Proceed' && !editData.geo_tag_image && (
                    <p className="text-xs font-medium text-stone-500">No photo yet. You can upload it later.</p>
                )}
            </SectionCard>
        </div>
    );
}
