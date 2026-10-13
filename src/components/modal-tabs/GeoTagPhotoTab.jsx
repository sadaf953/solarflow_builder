import React from 'react';
import { Camera, ClipboardList, ShieldAlert, MapPin } from 'lucide-react';
import { CheckboxRemarkItem } from './shared';

export default function GeoTagPhotoTab({
    customer,
    editData,
    setEditData,
    isEditable,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    saving,
    setSaving,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark
}) {
    // Vendor, Channel Partner Office, Office/Sales, and Admin can edit geo tag photo
    const isVendor = user?.userType === 'vendor';
    const isAdmin = user?.userType === 'admin';
    const isChannelPartnerOffice = user?.userType === 'channel_partner_office';
    const isSales = user?.userType === 'sales' || user?.userType === 'office' || (user?.role && user.role.toLowerCase().includes('office')) || (user?.role && user.role.toLowerCase().includes('sales'));
    
    // Status buttons (No / Pending / Proceed) can be manually clicked by Vendor, Admin, CPO (not Sales/Office)
    const canEditStatus = (isVendor || ((isAdmin || isChannelPartnerOffice) && isEditable)) && !isSales;
    // Image upload is permitted for Vendor, Admin, CPO, and Sales/Office
    const canUploadImage = isVendor || ((isAdmin || isChannelPartnerOffice || isSales) && isEditable);
    const canDeleteDocs = user?.userType === "admin" || user?.userType === "sales" || user?.userType === "office";

    const handleChange = (field, val) => {
        setEditData(prev => {
            const updated = { ...prev, [field]: val };
            // When photo is uploaded, automatically change status to 'Proceed'
            if (field === 'geo_tag_image') {
                if (val) {
                    updated.geo_tag_status = 'Proceed';
                } else if (prev.geo_tag_status === 'Proceed') {
                    updated.geo_tag_status = 'No';
                }
            }
            return updated;
        });
    };


    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Permission info banner for Sales/Office or view-only users */}
            {isSales ? (
                <div className="bg-blue-50/80 border border-blue-200/80 rounded-2xl p-4 flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div>
                        <p className="text-xs font-bold text-blue-900">Office Geo Tag Access</p>
                        <p className="text-[11px] text-blue-700 font-medium">
                            Upload the Geo Tag photograph below. Uploading will automatically advance the status to <b className="font-bold text-blue-950">Proceed</b>.
                        </p>
                    </div>
                </div>
            ) : !canUploadImage ? (
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                        <p className="text-xs font-bold text-amber-900">Vendor Controlled Stage</p>
                        <p className="text-[11px] text-amber-700 font-medium">
                            Geo Tag Photo verification and status are configured directly by the Vendor. You have view-only access.
                        </p>
                    </div>
                </div>
            ) : null}

            {/* Geo Tag Status Tag Selector */}
            <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 border-b border-stone-100 pb-3">
                    <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                        <MapPin size={18} />
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest">Geo Tag Photo Status <span className="text-red-500">*</span></h4>
                        <p className="text-[11px] text-stone-500 font-medium mt-0.5">Verify site geo-tagging and site readiness.</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 w-full">
                        {[
                            { id: 'No', label: 'No', activeClass: 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/10', dotClass: 'bg-white' },
                            { id: 'Pending', label: 'Pending', activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/10', dotClass: 'bg-white' },
                            { id: 'Proceed', label: 'Proceed', activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10', dotClass: 'bg-white' }
                        ].map(tag => {
                            const isSelected = (editData.geo_tag_status || 'No') === tag.id;
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    disabled={!canEditStatus}
                                    onClick={() => {
                                        setEditData(prev => ({ ...prev, geo_tag_status: tag.id }));
                                    }}
                                    className={`py-3 px-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 w-full cursor-pointer disabled:cursor-not-allowed ${
                                        isSelected
                                            ? tag.activeClass
                                            : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                                    }`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${isSelected ? tag.dotClass : 'bg-stone-300'}`} />
                                    {tag.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Checklist Section */}
            <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                    <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-amber-500" /> Geo Tag Photo Checklist
                    </h4>
                    <span className="text-[9px] font-bold text-amber-600 uppercase bg-amber-50 px-2 py-0.5 rounded">
                        Optional Photo
                    </span>
                </div>
                {!canUploadImage && (
                    <p className="text-[10px] text-stone-400 font-semibold italic">Only vendors can edit this section. You have view-only access.</p>
                )}
                <div className="flex flex-col gap-2">
                    <CheckboxRemarkItem 
                        label="Geo Tag Image Uploaded (optional)"
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
                </div>

                {/* Optional photo reminder */}
                {editData.geo_tag_status === 'Proceed' && !editData.geo_tag_image && (
                    <div className="pt-2 border-t border-stone-100">
                        <p className="text-[11px] font-bold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-center">
                            You can upload a site photo later. Set the status to Proceed to move to Discom Submission.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
