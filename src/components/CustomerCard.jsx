import React, { useState, useEffect, useRef, memo } from 'react';
import { Zap, User, Building2, Package, FolderOpen, ShieldCheck, Phone, Edit3, Truck, Calendar, Clock, MapPin, ExternalLink, HardDrive, CheckCircle2 } from 'lucide-react';
import { PRIMARY_STAGES, SUBSIDY_TAGS, SUBSIDY_TAG_COLORS } from '../constants';
import { getTelephoneHref } from '../utils';

const CustomerCard = memo(function CustomerCard({ customer, onSelect, onMoveStage, currentUser }) {
    const [showStageMenu, setShowStageMenu] = useState(false);
    const [menuDirection, setMenuDirection] = useState('down');
    const dropdownRef = useRef(null);

    useEffect(() => {
        if (!showStageMenu) return;
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowStageMenu(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showStageMenu]);

    const isCompleted = customer.stage === 'COMPLETED';
    const isAdmin = currentUser?.userType === 'admin';

    const currentStageRemark = (() => {
        if (!customer.stages_remarks) return '';
        if (typeof customer.stages_remarks === 'object') {
            return customer.stages_remarks[customer.stage] || '';
        }
        if (typeof customer.stages_remarks === 'string') {
            try {
                const parsed = JSON.parse(customer.stages_remarks);
                if (typeof parsed === 'object' && parsed) {
                    return parsed[customer.stage] || '';
                }
                return parsed || '';
            } catch {
                return customer.stages_remarks;
            }
        }
        return '';
    })();

    const tagInfo   = SUBSIDY_TAGS.find(f => f.id === customer.subsidy_tag);
    const tagColors = customer.subsidy_tag ? (SUBSIDY_TAG_COLORS[customer.subsidy_tag] || {}) : {};

    return (
        <div className={`demo-customer-card min-w-0 rounded-2xl border shadow-xs hover:shadow-md transition-all border-l-4 group flex flex-col relative ${showStageMenu ? 'z-50' : 'z-10'} ${isCompleted ? 'bg-stone-50/80 border-stone-200 border-l-emerald-500' : 'bg-white border-stone-200 border-l-amber-400'} ${isCompleted && !showStageMenu ? 'opacity-80' : ''}`}>
            {/* Clickable top section */}
            <div className="p-5 cursor-pointer flex-1" onClick={() => onSelect(customer)}>
                <div className="flex justify-between items-start mb-3">
                    <h3 className="min-w-0 break-words font-bold text-stone-800 group-hover:text-amber-600 transition-colors leading-tight">
                        {customer?.customer_name || 'Unnamed Customer'}
                    </h3>
                    {tagInfo && (
                        <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ml-2 whitespace-nowrap border ${tagColors.bg} ${tagColors.text} ${tagColors.border}`}>
                            {tagInfo.label}
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 mb-3">
                    <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                        <FolderOpen size={11} className="text-stone-300 flex-shrink-0" />
                        <span className="truncate">File: {customer.folder_no || '–'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                        <Package size={11} className="text-stone-300 flex-shrink-0" />
                        <span className="truncate">Panel: {customer.module_brand || '–'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                        <Zap size={11} className="text-amber-500 flex-shrink-0" />
                        <span>WP: {customer.module_wp || '–'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                        <Zap size={11} className="text-amber-500 flex-shrink-0" />
                        <span>{customer.system_capacity_kwp ? `${customer.system_capacity_kwp} kWp` : '–'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                        <User size={11} className="text-stone-300 flex-shrink-0" />
                        <span className="truncate">{customer.channel_partner || 'No Channel Partner'}</span>
                    </div>
                    {customer.phone_number && (
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                            {getTelephoneHref(customer.phone_number) ? (
                                <a
                                    href={getTelephoneHref(customer.phone_number)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer group/phone"
                                    title={`Click to call ${customer.phone_number}`}
                                >
                                    <Phone size={11} className="text-emerald-500 flex-shrink-0 group-hover/phone:scale-110 transition-transform" />
                                    <span>{customer.phone_number}</span>
                                </a>
                            ) : (
                                <div className="flex items-center gap-1.5 text-stone-500">
                                    <Phone size={11} className="text-stone-300 flex-shrink-0" />
                                    <span>{customer.phone_number}</span>
                                </div>
                            )}
                        </div>
                    )}
                    {customer.vendor && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium col-span-2">
                            <Package size={11} className="text-stone-300 flex-shrink-0" />
                            <span>Vendor: {customer.vendor}</span>
                        </div>
                    )}
                    {customer.delivery_batch_id && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-2 py-0.5 col-span-2 font-bold">
                            <Truck size={11} className="text-amber-600 flex-shrink-0" />
                            <span className="truncate">Batch: {customer.delivery_batch_id}</span>
                        </div>
                    )}
                    {customer.created_at && (
                        <div className="flex items-center gap-1.5 text-[10px] text-stone-400 font-medium col-span-2 pt-0.5">
                            <Calendar size={11} className="text-stone-300 flex-shrink-0" />
                            <span>Created: {new Date(customer.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        </div>
                    )}
                    {customer.updated_at && customer.updated_at !== customer.created_at && (
                        <div className="flex items-center gap-1.5 text-[10px] text-amber-700/80 font-medium col-span-2">
                            <Clock size={11} className="text-amber-500/80 flex-shrink-0" />
                            <span>Updated: {new Date(customer.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        </div>
                    )}
                    {customer.completed_at && (
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-semibold col-span-2">
                            <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />
                            <span>Completed: {new Date(customer.completed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        </div>
                    )}
                    {(customer.google_drive_link || customer.location_link) && (
                        <div className="col-span-2 flex flex-wrap items-center gap-2 pt-1 border-t border-stone-100">
                            {customer.google_drive_link && (
                                <a
                                    href={customer.google_drive_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50/80 hover:bg-blue-100 border border-blue-200/80 px-2 py-0.5 rounded-md transition-colors"
                                    title={`Open Google Drive: ${customer.google_drive_link}`}
                                >
                                    <HardDrive size={11} className="text-blue-500 flex-shrink-0" />
                                    <span>Google Drive</span>
                                    <ExternalLink size={9} className="text-blue-400 ml-0.5 opacity-70" />
                                </a>
                            )}
                            {customer.location_link && (
                                <a
                                    href={customer.location_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200/80 px-2 py-0.5 rounded-md transition-colors"
                                    title={`Open Location Link: ${customer.location_link}`}
                                >
                                    <MapPin size={11} className="text-emerald-600 flex-shrink-0" />
                                    <span>Site Location</span>
                                    <ExternalLink size={9} className="text-emerald-500 ml-0.5 opacity-70" />
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* The lower card area opens the customer too; only its action buttons opt out. */}
            <div
                className="border-t border-stone-100 bg-stone-50/60 rounded-b-2xl animate-in fade-in duration-300 cursor-pointer"
                onClick={() => onSelect(customer)}
            >
                {/* Stage remarks preview */}
                {currentStageRemark && (
                    <div className="px-4 pb-3 border-t border-stone-100 pt-2">
                        <p className="text-[10px] text-stone-500 italic leading-tight line-clamp-2">
                            💬 {currentStageRemark}
                        </p>
                    </div>
                )}

                {/* Stage Display Strip */}
                <div className="px-4 pb-4 pt-2 border-t border-stone-100">
                    <div className="relative" ref={dropdownRef}>
                        <div className={`w-full flex items-center justify-between border rounded-xl px-3 py-2 text-xs font-bold ${isCompleted ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-stone-50 border-stone-200 text-stone-600'}`}>
                            <div className="flex items-center gap-2 truncate">
                                {isCompleted && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                                <span>{PRIMARY_STAGES.find(s => s.id === customer.stage)?.label || customer.stage}</span>
                            </div>
                            {isAdmin && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const nextShow = !showStageMenu;
                                        setShowStageMenu(nextShow);
                                        if (nextShow) {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const spaceBelow = window.innerHeight - rect.bottom;
                                            setMenuDirection(spaceBelow < 280 ? 'up' : 'down');
                                        }
                                    }}
                                    className="p-1 text-stone-400 hover:text-amber-600 transition-colors ml-2 bg-stone-100 hover:bg-stone-200/60 rounded"
                                    title="Admin Override Stage"
                                >
                                    <Edit3 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                        {showStageMenu && (
                            <div className={`absolute left-0 right-0 bg-white rounded-xl shadow-xl border border-stone-100 py-1 z-20 max-h-64 overflow-y-auto ${menuDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                                <div className="px-3 py-1.5 text-[9px] font-bold text-amber-700 bg-amber-50 uppercase tracking-widest border-b border-stone-100">
                                    Admin Override
                                </div>
                                {PRIMARY_STAGES.map(stage => (
                                    <button key={stage.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onMoveStage(customer.id, stage.id);
                                            setShowStageMenu(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-stone-50 transition-colors ${customer.stage === stage.id ? 'bg-amber-50 font-bold text-amber-700' : 'text-stone-600'}`}>
                                        <stage.icon className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                                        {stage.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});
export default CustomerCard;
