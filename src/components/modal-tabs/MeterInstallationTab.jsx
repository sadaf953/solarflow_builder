import React from 'react';
import { ShieldAlert, Zap } from 'lucide-react';
import { normalizeMeterInstallation } from '../../utils';

export default function MeterInstallationTab({
    customer,
    editData,
    setEditData,
    handleChange,
    isEditable,
    isOffice,
    onUpdate,
    logActivity,
    fetchLogs,
    user,
    documents = [],
    onFileUpload,
    onFileDelete,
    onFilePreview,
    onUpdateRemark
}) {
    // Admin, Vendor, and Channel Partner Office can edit. Office is view-only.
    const isVendor = user?.userType === 'vendor';
    const isAdmin = user?.userType === 'admin';
    const isChannelPartnerOffice = user?.userType === 'channel_partner_office';
    const canEditMeter = (isVendor || isAdmin || isChannelPartnerOffice) && isEditable;

    // Tolerates the legacy object form so the 2 records stored that way render
    // correctly; they rewrite as a plain string on the next save.
    const meterData = normalizeMeterInstallation(editData.meter_installation) || 'No';

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Permission info banner for Office / Non-Vendor & Non-Admin users */}
            {!canEditMeter && (
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 flex items-center gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                        <p className="text-xs font-bold text-amber-900">Vendor & Admin Controlled Stage</p>
                        <p className="text-[11px] text-amber-700 font-medium">
                            Meter installation status and verification date are configured directly by the Allotted Vendor or Admin. Office users have view-only access.
                        </p>
                    </div>
                </div>
            )}

            {/* Meter Installation Status Card */}
            <div className="bg-white p-6 rounded-[24px] border border-stone-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 border-b border-stone-100 pb-3">
                    <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                        <Zap size={18} />
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-stone-700 uppercase tracking-widest">Meter Installation Status <span className="text-red-500">*</span></h4>
                        <p className="text-[11px] text-stone-500 font-medium mt-0.5">Has the net meter been successfully installed?</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 w-full">
                        {[
                            { id: 'No', label: 'No', activeClass: 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/10', dotClass: 'bg-white' },
                            { id: 'Yes', label: 'Yes', activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10', dotClass: 'bg-white' }
                        ].map(tag => {
                            const isSelected = meterData === tag.id;
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    disabled={!canEditMeter}
                                    onClick={() => {
                                        const todayStr = new Date().toISOString().split('T')[0];
                                        setEditData(prev => ({
                                            ...prev,
                                            meter_installation: tag.id,
                                            installation_date: tag.id === 'Yes' ? (prev.installation_date || todayStr) : ''
                                        }));
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

                    {/* Conditional Date Input */}
                    {meterData === 'Yes' && (
                        <div className="pt-2 space-y-1 animate-in slide-in-from-top-2 duration-300">
                            <label className="text-[11px] font-bold text-stone-700 uppercase tracking-wide block">
                                Meter Installation Date <span className="text-red-500 font-black">*</span>
                            </label>
                            <input
                                type="date"
                                disabled={!canEditMeter}
                                value={editData.installation_date || ''}
                                onChange={e => {
                                    setEditData(prev => ({ ...prev, installation_date: e.target.value }));
                                }}
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white font-semibold text-stone-800 disabled:bg-stone-100 disabled:text-stone-500"
                            />
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
