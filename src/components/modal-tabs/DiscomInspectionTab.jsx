import React from 'react';
import { ShieldAlert, ClipboardCheck } from 'lucide-react';

export default function DiscomInspectionTab({
    customer,
    editData,
    setEditData,
    handleChange,
    isEditable,
    isOffice,
    onUpdate,
    logActivity,
    fetchLogs,
    user
}) {
    // Admin, Vendor, and Channel Partner Office can edit. Office is view-only.
    const isVendor = user?.userType === 'vendor';
    const isAdmin = user?.userType === 'admin';
    const isChannelPartnerOffice = user?.userType === 'channel_partner_office';
    const canEditInspection = (isVendor || isAdmin || isChannelPartnerOffice) && isEditable;

    const inspectionData = editData.discom_inspection || 'No';

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Permission info banner for Office / Non-Vendor & Non-Admin users */}
            {!canEditInspection && (
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                        <p className="text-xs font-bold text-amber-900">Vendor & Admin Controlled Stage</p>
                        <p className="text-[11px] text-amber-700 font-medium">
                            Discom Inspection verification reports are configured directly by the Allotted Vendor or Admin. Office users have view-only access.
                        </p>
                    </div>
                </div>
            )}

            <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 border-b border-stone-100 pb-3">
                    <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                        <ClipboardCheck size={18} />
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest">Discom Inspection Status <span className="text-red-500">*</span></h4>
                        <p className="text-[11px] text-stone-500 font-medium mt-0.5">Utility official inspection schedules and joint verification status.</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 w-full">
                        {[
                            { id: 'No', label: 'No', activeClass: 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/10', dotClass: 'bg-white' },
                            { id: 'Yes', label: 'Yes', activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10', dotClass: 'bg-white' }
                        ].map(tag => {
                            const isSelected = inspectionData === tag.id;
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    disabled={!canEditInspection}
                                    onClick={() => {
                                        setEditData(prev => ({ ...prev, discom_inspection: tag.id }));
                                    }}
                                    className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 w-full cursor-pointer ${
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
        </div>
    );
}
