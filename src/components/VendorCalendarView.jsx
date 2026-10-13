import { useState, useEffect, useMemo } from 'react';
import { 
    Calendar as CalendarIcon, ChevronLeft, ChevronRight, CheckCircle2, 
    XCircle, Clock, AlertCircle, Plus, Trash2, Edit3, ShieldAlert, Sparkles, Check,
    Info, Eye, Filter
} from 'lucide-react';
import { 
    getVendorUnavailability, 
    setVendorDateUnavailability, 
    getAllVendorUnavailabilities,
    getUnavailableVendorsForDate
} from '../utils/vendorAvailability';
import { logActivity } from '../utils';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const REASON_PRESETS = [
    'Full installation capacity / fully booked',
    'Team on scheduled leave',
    'Site equipment & vehicle maintenance',
    'Heavy rain / adverse weather hold',
    'Public / Festival holiday'
];

function formatTimestamp(isoString) {
    if (!isoString) return 'Earlier record';
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return String(isoString);
    }
}

export default function VendorCalendarView({ vendorName = 'Vendor 1', isAdmin = false, currentUser }) {
    // In Admin mode, allow selecting 'All Vendors' or individual vendors
    const [selectedVendorFilter, setSelectedVendorFilter] = useState('All Vendors');
    const effectiveVendor = isAdmin ? selectedVendorFilter : (vendorName || 'Vendor 1');
    
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [allUnavailabilities, setAllUnavailabilities] = useState(() => getAllVendorUnavailabilities());
    
    // Vendor self-editing modal (Vendors ONLY)
    const [editingDate, setEditingDate] = useState(null); // 'YYYY-MM-DD'
    const [editReason, setEditReason] = useState('');
    const [saveFeedback, setSaveFeedback] = useState('');

    // Admin read-only inspection modal (Admin ONLY)
    const [inspectingDate, setInspectingDate] = useState(null); // { dateStr, vendors: [...] }

    const reloadData = () => {
        setAllUnavailabilities(getAllVendorUnavailabilities());
    };

    useEffect(() => {
        const handleSync = () => reloadData();
        window.addEventListener('solarflow-vendor-availability-changed', handleSync);
        return () => window.removeEventListener('solarflow-vendor-availability-changed', handleSync);
    }, []);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = useMemo(() => {
        return new Date(year, month + 1, 0).getDate();
    }, [year, month]);

    const firstDayOfWeek = useMemo(() => {
        return new Date(year, month, 1).getDay(); // 0 = Sunday
    }, [year, month]);

    const handlePrevMonth = () => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    // Click handler for a calendar date cell
    const handleCellClick = (dateStr) => {
        if (isAdmin) {
            // Admin opens read-only inspector modal
            const records = getUnavailableVendorsForDate(dateStr);
            const filteredRecords = selectedVendorFilter === 'All Vendors' 
                ? records 
                : records.filter(r => r.vendor === selectedVendorFilter);
            
            setInspectingDate({
                dateStr,
                records: filteredRecords
            });
        } else {
            // Vendor opens self-editing modal
            const vendorRecords = allUnavailabilities[vendorName] || {};
            const existingEntry = vendorRecords[dateStr];
            const currentReason = typeof existingEntry === 'object' ? (existingEntry?.reason || '') : (existingEntry || '');
            setEditingDate(dateStr);
            setEditReason(currentReason);
        }
    };

    const handleVendorSaveDate = (isUnavailable) => {
        if (!editingDate || isAdmin) return;
        setVendorDateUnavailability(vendorName, editingDate, isUnavailable, editReason || '');
        reloadData();
        logActivity(
            currentUser?.id,
            'vendor',
            `Vendor Availability: ${vendorName} marked ${editingDate} as ${isUnavailable ? 'Unavailable' : 'Available'}`,
            editReason ? `Reason: ${editReason}` : `Status: ${isUnavailable ? 'Unavailable' : 'Available'}`
        );
        setSaveFeedback(isUnavailable ? 'Date marked unavailable' : 'Date marked available');
        setTimeout(() => {
            setSaveFeedback('');
            setEditingDate(null);
        }, 1100);
    };

    // Calculate month stats for current filter view
    const monthStats = useMemo(() => {
        let unavailableDaysCount = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const unavs = getUnavailableVendorsForDate(dateStr);
            const filtered = selectedVendorFilter === 'All Vendors' || !isAdmin
                ? (isAdmin ? unavs : unavs.filter(r => r.vendor === vendorName))
                : unavs.filter(r => r.vendor === selectedVendorFilter);
            if (filtered.length > 0) {
                unavailableDaysCount++;
            }
        }
        return {
            totalDays: daysInMonth,
            availableDays: daysInMonth - unavailableDaysCount,
            unavailableDays: unavailableDaysCount
        };
    }, [daysInMonth, year, month, selectedVendorFilter, allUnavailabilities, isAdmin, vendorName]);

    return (
        <div className="space-y-6">
            
            {/* Header & Controls */}
            <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                            <CalendarIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-bold text-stone-900">
                                    {isAdmin ? 'Vendor Availability & Schedule' : `My Availability & Schedule — ${vendorName}`}
                                </h2>
                                {isAdmin && (
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center gap-1">
                                        <Eye className="w-3 h-3" /> Read-Only Admin View
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-stone-500">
                                {isAdmin 
                                    ? 'Inspect vendor declared availability, dates logged, and reasons before scheduling installation batches.'
                                    : 'Mark dates when your crew is unavailable. Admin views your schedule to avoid assigning delivery or site works.'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {isAdmin && (
                        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200">
                            {['All Vendors', 'Vendor 1', 'Vendor 2', 'Vendor 3'].map(v => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => setSelectedVendorFilter(v)}
                                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                        selectedVendorFilter === v 
                                            ? 'bg-white text-stone-900 shadow-xs border border-stone-200' 
                                            : 'text-stone-500 hover:text-stone-800'
                                    }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleToday}
                        className="px-3 py-1.5 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
                    >
                        Today
                    </button>
                    <div className="flex items-center border border-stone-200 rounded-lg overflow-hidden bg-white shadow-xs">
                        <button
                            type="button"
                            onClick={handlePrevMonth}
                            className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-50 border-r border-stone-200 cursor-pointer"
                            title="Previous Month"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="px-3 py-1 text-xs font-bold text-stone-800 min-w-[130px] text-center">
                            {MONTH_NAMES[month]} {year}
                        </div>
                        <button
                            type="button"
                            onClick={handleNextMonth}
                            className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-50 cursor-pointer"
                            title="Next Month"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
                    <div>
                        <div className="text-[11px] font-bold uppercase text-stone-400">Total Month Days</div>
                        <div className="text-xl font-black text-stone-800 mt-0.5">{monthStats.totalDays} Days</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center font-bold">
                        <CalendarIcon className="w-5 h-5" />
                    </div>
                </div>

                <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 shadow-xs flex items-center justify-between">
                    <div>
                        <div className="text-[11px] font-bold uppercase text-emerald-700">Fully Available Days</div>
                        <div className="text-xl font-black text-emerald-900 mt-0.5">{monthStats.availableDays} Days</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                </div>

                <div className="p-4 bg-rose-50/70 rounded-xl border border-rose-200 shadow-xs flex items-center justify-between">
                    <div>
                        <div className="text-[11px] font-bold uppercase text-rose-700">Vendor Unavailability</div>
                        <div className="text-xl font-black text-rose-900 mt-0.5">{monthStats.unavailableDays} Days</div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                        <XCircle className="w-5 h-5" />
                    </div>
                </div>
            </div>

            {/* Main Calendar Grid */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
                
                {/* Day of Week Headers */}
                <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 text-center py-2.5 text-xs font-bold text-stone-600">
                    <span className="text-rose-600">Sun</span>
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span className="text-stone-700">Sat</span>
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-stone-100 bg-stone-100/50">
                    {/* Blank cells for offset before 1st of month */}
                    {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                        <div key={`blank-${idx}`} className="bg-stone-50/40 min-h-[105px] p-2 select-none" />
                    ))}

                    {/* Month Days */}
                    {Array.from({ length: daysInMonth }).map((_, idx) => {
                        const dayNum = idx + 1;
                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        
                        // Get all unavailabilities for this date
                        const allUnavs = getUnavailableVendorsForDate(dateStr);
                        
                        // Filter according to view
                        const unavList = isAdmin
                            ? (selectedVendorFilter === 'All Vendors' 
                                ? allUnavs 
                                : allUnavs.filter(u => u.vendor === selectedVendorFilter))
                            : allUnavs.filter(u => u.vendor === vendorName);

                        const hasUnavailabilities = unavList.length > 0;
                        const isToday = new Date().toISOString().slice(0, 10) === dateStr;

                        return (
                            <div
                                key={dateStr}
                                onClick={() => handleCellClick(dateStr)}
                                className={`min-h-[105px] p-2 transition-all cursor-pointer relative group flex flex-col justify-between ${
                                    hasUnavailabilities 
                                        ? 'bg-rose-50/60 hover:bg-rose-100/70 border-rose-200' 
                                        : 'bg-white hover:bg-amber-50/40'
                                }`}
                                title={isAdmin ? 'Click to inspect vendor details' : 'Click to manage availability'}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                                        isToday 
                                            ? 'bg-amber-600 text-white' 
                                            : hasUnavailabilities 
                                                ? 'text-rose-900 font-extrabold' 
                                                : 'text-stone-700'
                                    }`}>
                                        {dayNum}
                                    </span>

                                    {hasUnavailabilities ? (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-0.5">
                                            <XCircle className="w-2.5 h-2.5" /> Unavailable
                                        </span>
                                    ) : (
                                        <span className="opacity-0 group-hover:opacity-100 text-[9px] font-bold text-emerald-600 flex items-center gap-0.5 transition-opacity">
                                            <Check className="w-2.5 h-2.5" /> Open
                                        </span>
                                    )}
                                </div>

                                {/* Calendar Cell Body: SHOW VENDOR NAME BADGES (DO NOT SHOW REASON TEXT HERE) */}
                                <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                                    {hasUnavailabilities ? (
                                        unavList.map((entry) => (
                                            <div 
                                                key={entry.vendor}
                                                className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[11px] shadow-2xs flex items-center justify-between"
                                            >
                                                <span className="truncate">{entry.vendor}</span>
                                                <span className="text-[9px] bg-rose-800/80 px-1 py-0.2 rounded font-semibold text-rose-100">
                                                    Off
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="h-full flex items-center justify-center">
                                            <span className="text-[10px] text-stone-300 font-medium group-hover:text-stone-400 select-none">
                                                Available
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Hover Prompt */}
                                <div className="mt-1 pt-1 border-t border-stone-100/70 text-[9px] text-stone-400 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span>{isAdmin ? 'View Details' : 'Change Date'}</span>
                                    {isAdmin ? <Eye className="w-2.5 h-2.5 text-stone-500" /> : <Edit3 className="w-2.5 h-2.5 text-stone-500" />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ========================================================= */}
            {/* ADMIN READ-ONLY INSPECTION MODAL */}
            {/* ========================================================= */}
            {isAdmin && inspectingDate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 max-w-lg w-full p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                                    <Eye className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-stone-900">
                                        Vendor Availability for {inspectingDate.dateStr}
                                    </h3>
                                    <p className="text-xs text-stone-500">
                                        Read-only vendor declared status & reasons
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setInspectingDate(null)}
                                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {inspectingDate.records.length === 0 ? (
                            <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-200 text-center space-y-2">
                                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                                <h4 className="text-sm font-bold text-emerald-900">All Vendors Available</h4>
                                <p className="text-xs text-emerald-700">
                                    No vendor has marked unavailability on <strong>{inspectingDate.dateStr}</strong>. Crews are open for material deliveries and installations.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                                    Unavailable Vendors on this Date ({inspectingDate.records.length})
                                </div>

                                {inspectingDate.records.map((rec) => (
                                    <div 
                                        key={rec.vendor} 
                                        className="p-4 rounded-xl border border-rose-200 bg-rose-50/50 space-y-3"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-black text-xs shadow-2xs">
                                                    {rec.vendor}
                                                </span>
                                                <span className="text-xs font-bold text-rose-800">
                                                    Marked Unavailable
                                                </span>
                                            </div>
                                            <span className="text-[11px] text-stone-500 flex items-center gap-1">
                                                <Clock className="w-3 h-3 text-stone-400" />
                                                Logged: <strong>{formatTimestamp(rec.markedAt)}</strong>
                                            </span>
                                        </div>

                                        <div className="bg-white p-3 rounded-lg border border-rose-100 text-xs text-stone-700">
                                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
                                                Reason Given by Vendor
                                            </span>
                                            {rec.reason ? (
                                                <div className="font-semibold text-stone-800 flex items-start gap-1.5">
                                                    <Info className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                                    <span>{rec.reason}</span>
                                                </div>
                                            ) : (
                                                <div className="italic text-stone-400 flex items-center gap-1.5">
                                                    <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                                    <span>No specific reason provided (marked general unavailability/leave)</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
                                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <span>
                                        <strong>Admin Notice:</strong> Vendor calendars are declared and updated by vendors themselves. Admin assignments automatically flag conflicts on these dates.
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="pt-2 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setInspectingDate(null)}
                                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* VENDOR SELF-MANAGEMENT MODAL (Vendors ONLY) */}
            {/* ========================================================= */}
            {!isAdmin && editingDate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-md w-full p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                            <div>
                                <h3 className="text-sm font-bold text-stone-900">
                                    Manage Availability for {editingDate}
                                </h3>
                                <p className="text-xs text-stone-500">
                                    Vendor: <strong>{vendorName}</strong>
                                </p>
                            </div>
                            <button
                                onClick={() => setEditingDate(null)}
                                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {saveFeedback ? (
                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center text-xs font-bold text-emerald-800 flex items-center justify-center gap-2">
                                <CheckCircle2 className="w-4 h-4" /> {saveFeedback}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs font-bold text-stone-700">
                                            Reason for Unavailability (Leave / Booking / Holiday)
                                        </label>
                                        <span className="text-[10px] text-stone-400 font-medium">
                                            Optional (can leave blank)
                                        </span>
                                    </div>
                                    <input
                                        type="text"
                                        value={editReason}
                                        onChange={e => setEditReason(e.target.value)}
                                        placeholder="e.g. Surat installation site booked (or leave blank)"
                                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                                            Quick Presets
                                        </span>
                                        {editReason && (
                                            <button
                                                type="button"
                                                onClick={() => setEditReason('')}
                                                className="text-[10px] text-rose-600 hover:text-rose-700 font-bold cursor-pointer"
                                            >
                                                Clear Reason
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {REASON_PRESETS.map(preset => (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() => setEditReason(preset)}
                                                className="px-2 py-1 text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 rounded border border-stone-200 text-left cursor-pointer transition-colors"
                                            >
                                                {preset}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-3 flex gap-2 border-t border-stone-100">
                                    <button
                                        type="button"
                                        onClick={() => handleVendorSaveDate(true)}
                                        className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                                    >
                                        <XCircle className="w-3.5 h-3.5" /> Mark Unavailable
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleVendorSaveDate(false)}
                                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Mark Available
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}

