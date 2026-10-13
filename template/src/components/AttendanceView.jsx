// src/components/AttendanceView.jsx
// Staff Attendance Management for Admin Portal
// Supports Week View (default) and Month View, linked to office users.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Calendar, ChevronLeft, ChevronRight, CheckCircle2, XCircle, 
    Clock, Search, Check, AlertCircle, Users, Briefcase, FileSpreadsheet, 
    Sparkles, Filter, MoreHorizontal, UserCheck, ShieldCheck, Sun, Info, CalendarDays, Download,
    CalendarPlus, CheckCheck, X, ThumbsUp, ThumbsDown, Send
} from 'lucide-react';
import { 
    fetchOfficeStaff, 
    getAttendanceRecords, 
    setStaffAttendance, 
    markAllStaffPresent, 
    exportAttendanceToCSV,
    ATTENDANCE_STATUSES,
    submitHolidayRequest,
    submitSelfAttendance,
    approveAttendanceRequest,
    rejectAttendanceRequest
} from '../utils/staffAttendance';
import { logActivity } from '../utils';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getStartOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    // Monday as first day of work week
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function formatDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export default function AttendanceView({ currentUser }) {
    const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
    const [anchorDate, setAnchorDate] = useState(() => new Date());
    const [staffList, setStaffList] = useState([]);
    const [records, setRecords] = useState({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    
    // Quick Mark Popover / Modal state
    const [activeCell, setActiveCell] = useState(null); // { staffName, dateStr, currentStatus, currentNotes }
    const [cellNotes, setCellNotes] = useState('');
    const [batchSuccessMsg, setBatchSuccessMsg] = useState('');

    const todayStr = useMemo(() => formatDateKey(new Date()), []);

    const currentUserType = currentUser?.user_type || currentUser?.userType;
    const isAdmin = currentUserType === 'admin';
    const currentStaffName = currentUser?.name || 'Staff User';

    // Holiday Request Modal State
    const [showHolidayModal, setShowHolidayModal] = useState(false);
    const [holidayStaff, setHolidayStaff] = useState(() => currentStaffName);
    const [holidayStartDate, setHolidayStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return formatDateKey(d);
    });
    const [holidayEndDate, setHolidayEndDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return formatDateKey(d);
    });
    const [holidayReason, setHolidayReason] = useState('');
    const [holidaySubmitting, setHolidaySubmitting] = useState(false);

    // Self-Mark Present Modal State
    const [showSelfMarkModal, setShowSelfMarkModal] = useState(false);
    const [selfMarkDate, setSelfMarkDate] = useState(() => formatDateKey(new Date()));
    const [selfMarkNotes, setSelfMarkNotes] = useState('');
    const [selfMarkSubmitting, setSelfMarkSubmitting] = useState(false);

    // Pending Approvals Calculation
    const pendingRequests = useMemo(() => {
        const list = [];
        Object.entries(records || {}).forEach(([key, rec]) => {
            if (rec?.status === 'pending_present' || rec?.status === 'holiday_request') {
                const parts = key.split('_');
                const dateStr = parts[parts.length - 1];
                const staffName = parts.slice(0, parts.length - 1).join('_');
                list.push({
                    key,
                    staffName: rec.staff_name || staffName,
                    dateStr,
                    status: rec.status,
                    notes: rec.notes || '',
                    markedBy: rec.markedBy || rec.marked_by
                });
            }
        });
        return list.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
    }, [records]);

    // Load staff members
    const loadStaff = useCallback(async () => {
        const staff = await fetchOfficeStaff();
        setStaffList(staff);
    }, []);

    // Load attendance records
    const loadRecords = useCallback(async () => {
        setLoading(true);
        try {
            // Determine date bounds
            let start, end;
            if (viewMode === 'week') {
                const mon = getStartOfWeek(anchorDate);
                const sun = new Date(mon);
                sun.setDate(sun.getDate() + 6);
                start = formatDateKey(mon);
                end = formatDateKey(sun);
            } else {
                const y = anchorDate.getFullYear();
                const m = anchorDate.getMonth();
                start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
                const daysInMonth = new Date(y, m + 1, 0).getDate();
                end = `${y}-${String(m + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
            }
            const data = await getAttendanceRecords(start, end);
            setRecords(data);
        } finally {
            setLoading(false);
        }
    }, [viewMode, anchorDate]);

    useEffect(() => {
        loadStaff();
    }, [loadStaff]);

    useEffect(() => {
        loadRecords();
    }, [loadRecords]);

    // Re-sync on external change
    useEffect(() => {
        const handleSync = () => loadRecords();
        window.addEventListener('solarflow-attendance-changed', handleSync);
        return () => window.removeEventListener('solarflow-attendance-changed', handleSync);
    }, [loadRecords]);

    // Navigation handlers
    const handlePrev = () => {
        setAnchorDate(prev => {
            const next = new Date(prev);
            if (viewMode === 'week') {
                next.setDate(next.getDate() - 7);
            } else {
                next.setMonth(next.getMonth() - 1, 1);
            }
            return next;
        });
    };

    const handleNext = () => {
        setAnchorDate(prev => {
            const next = new Date(prev);
            if (viewMode === 'week') {
                next.setDate(next.getDate() + 7);
            } else {
                next.setMonth(next.getMonth() + 1, 1);
            }
            return next;
        });
    };

    const handleToday = () => {
        setAnchorDate(new Date());
    };

    // Calculate columns for Week View (Mon - Sun)
    const weekDays = useMemo(() => {
        const mon = getStartOfWeek(anchorDate);
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(mon);
            d.setDate(d.getDate() + i);
            const dateStr = formatDateKey(d);
            days.push({
                dateObj: d,
                dateStr,
                dayName: WEEKDAY_NAMES_SHORT[d.getDay()],
                dayNum: d.getDate(),
                monthShort: MONTH_NAMES[d.getMonth()].slice(0, 3),
                isToday: dateStr === todayStr,
                isSunday: d.getDay() === 0
            });
        }
        return days;
    }, [anchorDate, todayStr]);

    // Calculate columns for Month View
    const monthDays = useMemo(() => {
        const y = anchorDate.getFullYear();
        const m = anchorDate.getMonth();
        const count = new Date(y, m + 1, 0).getDate();
        const days = [];
        for (let i = 1; i <= count; i++) {
            const d = new Date(y, m, i);
            const dateStr = formatDateKey(d);
            days.push({
                dateObj: d,
                dateStr,
                dayNum: i,
                dayName: WEEKDAY_NAMES_SHORT[d.getDay()],
                isToday: dateStr === todayStr,
                isSunday: d.getDay() === 0
            });
        }
        return days;
    }, [anchorDate, todayStr]);

    const activeColumns = viewMode === 'week' ? weekDays : monthDays;

    // Filter staff
    const filteredStaff = useMemo(() => {
        return staffList.filter(s => {
            const matchesSearch = !searchQuery || 
                s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.role && s.role.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (s.department && s.department.toLowerCase().includes(searchQuery.toLowerCase()));
            
            const matchesRole = roleFilter === 'all' || 
                (s.role && s.role.toLowerCase().includes(roleFilter.toLowerCase()));

            return matchesSearch && matchesRole;
        });
    }, [staffList, searchQuery, roleFilter]);

    // Cell status click handler
    const handleCellClick = (staffName, dateStr) => {
        const key = `${staffName}_${dateStr}`;
        const current = records[key];
        setActiveCell({
            staffName,
            dateStr,
            currentStatus: current?.status || null,
            currentNotes: current?.notes || ''
        });
        setCellNotes(current?.notes || '');
    };

    const handleApplyStatus = async (status) => {
        if (!activeCell) return;
        const { staffName, dateStr } = activeCell;
        
        // Optimistic update
        const key = `${staffName}_${dateStr}`;
        const updated = {
            ...records,
            [key]: status ? { status, notes: cellNotes, markedAt: new Date().toISOString() } : undefined
        };
        setRecords(updated);
        setActiveCell(null);

        const statusLabel = ATTENDANCE_STATUSES[status]?.label || (status ? status : 'Cleared');
        await setStaffAttendance(staffName, dateStr, status, cellNotes, currentUser?.name || 'Admin');
        await logActivity(
            currentUser?.id,
            'attendance',
            `Staff Attendance: ${staffName} marked as ${statusLabel} for ${dateStr}`,
            cellNotes ? `Notes: ${cellNotes}` : `Status: ${statusLabel}`
        );
    };

    // One-click batch mark all staff present today
    const handleMarkAllPresentToday = async () => {
        if (!staffList.length) return;
        await markAllStaffPresent(staffList, todayStr, currentUser?.name || 'Admin');
        await logActivity(
            currentUser?.id,
            'attendance',
            `Staff Attendance: Marked all ${staffList.length} staff as Present for today (${todayStr})`,
            `Staff count: ${staffList.length}, Date: ${todayStr}`
        );
        
        // Optimistically update
        const nextRecords = { ...records };
        staffList.forEach(s => {
            nextRecords[`${s.name}_${todayStr}`] = {
                status: 'present',
                notes: 'Marked present',
                markedAt: new Date().toISOString()
            };
        });
        setRecords(nextRecords);
        setBatchSuccessMsg(`All ${staffList.length} staff marked Present for today (${todayStr})`);
        setTimeout(() => setBatchSuccessMsg(''), 3000);
    };

    const handleExportCSV = () => {
        const title = viewMode === 'week'
            ? `${weekDays[0].dayNum} ${weekDays[0].monthShort} - ${weekDays[6].dayNum} ${weekDays[6].monthShort} ${weekDays[0].dateObj.getFullYear()}`
            : `${MONTH_NAMES[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;

        exportAttendanceToCSV({
            staffList: filteredStaff,
            columns: activeColumns,
            records,
            viewMode,
            title
        });
    };

    const handleApproveRequest = async (req) => {
        const adminName = currentUser?.name || 'Admin';
        await approveAttendanceRequest(req.staffName, req.dateStr, req.status, adminName);
        await logActivity(
            currentUser?.id,
            'attendance',
            `Approved attendance/leave for ${req.staffName} on ${req.dateStr}`,
            `Status: ${req.status === 'holiday_request' ? 'Holiday' : 'Present'}`
        );
        setBatchSuccessMsg(`Approved request for ${req.staffName} on ${req.dateStr}`);
        setTimeout(() => setBatchSuccessMsg(''), 4000);
        await loadRecords();
    };

    const handleRejectRequest = async (req) => {
        const adminName = currentUser?.name || 'Admin';
        await rejectAttendanceRequest(req.staffName, req.dateStr, 'Rejected by Admin', adminName);
        await logActivity(
            currentUser?.id,
            'attendance',
            `Rejected attendance/leave for ${req.staffName} on ${req.dateStr}`,
            `Reason: Rejected by ${adminName}`
        );
        setBatchSuccessMsg(`Rejected request for ${req.staffName} on ${req.dateStr}`);
        setTimeout(() => setBatchSuccessMsg(''), 4000);
        await loadRecords();
    };

    const handleHolidaySubmit = async (e) => {
        e.preventDefault();
        if (!holidayStaff || !holidayStartDate) return;
        setHolidaySubmitting(true);
        try {
            await submitHolidayRequest(
                holidayStaff,
                holidayStartDate,
                holidayEndDate || holidayStartDate,
                holidayReason,
                currentUser?.name || 'Staff'
            );
            await logActivity(
                currentUser?.id,
                'attendance',
                `Holiday Request submitted for ${holidayStaff} (${holidayStartDate} to ${holidayEndDate || holidayStartDate})`,
                `Reason: ${holidayReason || 'Not specified'}`
            );
            setShowHolidayModal(false);
            setHolidayReason('');
            setBatchSuccessMsg(`Holiday request submitted for ${holidayStaff}. Awaiting admin approval.`);
            setTimeout(() => setBatchSuccessMsg(''), 4000);
            await loadRecords();
        } finally {
            setHolidaySubmitting(false);
        }
    };

    const handleSelfMarkSubmit = async (e) => {
        e.preventDefault();
        const staffName = currentStaffName || staffList[0]?.name || 'Office Staff';
        setSelfMarkSubmitting(true);
        try {
            if (isAdmin) {
                await setStaffAttendance(staffName, selfMarkDate, 'present', selfMarkNotes || 'Checked in', currentUser?.name || 'Admin');
                setBatchSuccessMsg(`Marked ${staffName} Present for ${selfMarkDate}`);
            } else {
                await submitSelfAttendance(staffName, selfMarkDate, selfMarkNotes, currentUser?.name || 'Staff');
                setBatchSuccessMsg(`Marked present for ${selfMarkDate} (pending Admin approval)`);
            }
            await logActivity(
                currentUser?.id,
                'attendance',
                `${staffName} self-marked attendance for ${selfMarkDate}`,
                `Notes: ${selfMarkNotes || 'Checked in'}`
            );
            setShowSelfMarkModal(false);
            setSelfMarkNotes('');
            setTimeout(() => setBatchSuccessMsg(''), 4000);
            await loadRecords();
        } finally {
            setSelfMarkSubmitting(false);
        }
    };

    // Calculate Summary KPIs
    const kpiSummary = useMemo(() => {
        let presentToday = 0;
        let absentToday = 0;
        let leaveToday = 0;
        let onDutyToday = 0;

        staffList.forEach(s => {
            const entry = records[`${s.name}_${todayStr}`];
            if (entry?.status === 'present') presentToday++;
            else if (entry?.status === 'absent') absentToday++;
            else if (entry?.status === 'leave' || entry?.status === 'half_day') leaveToday++;
            else if (entry?.status === 'on_duty') onDutyToday++;
        });

        const totalStaff = staffList.length || 1;
        const presentRate = Math.round((presentToday / totalStaff) * 100);

        return {
            totalStaff: staffList.length,
            presentToday,
            absentToday,
            leaveToday,
            onDutyToday,
            presentRate
        };
    }, [staffList, records, todayStr]);

    return (
        <div className="space-y-6">
            
            {/* Header Controls */}
            <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                            <UserCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-bold text-stone-900">
                                    Office Staff & Team Attendance
                                </h2>
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" /> Admin Manager
                                </span>
                            </div>
                            <p className="text-xs text-stone-500">
                                Centralized office attendance register linked to system staff. Week & month rosters.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {/* View Switcher: Week vs Month */}
                    <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
                        <button
                            type="button"
                            onClick={() => setViewMode('week')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                                viewMode === 'week' 
                                    ? 'bg-white text-stone-900 shadow-xs border border-stone-200' 
                                    : 'text-stone-500 hover:text-stone-800'
                            }`}
                        >
                            <CalendarDays className="w-3.5 h-3.5" />
                            Week View
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('month')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                                viewMode === 'month' 
                                    ? 'bg-white text-stone-900 shadow-xs border border-stone-200' 
                                    : 'text-stone-500 hover:text-stone-800'
                            }`}
                        >
                            <Calendar className="w-3.5 h-3.5" />
                            Month View
                        </button>
                    </div>

                    {/* Batch Mark All Present Button ("one tab added present") */}
                    {isAdmin && (
                        <button
                            type="button"
                            onClick={handleMarkAllPresentToday}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                            title="One-click mark all active staff present for today"
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Mark All Present (Today)
                        </button>
                    )}

                    {/* Leave / Holiday Request */}
                    <button
                        type="button"
                        onClick={() => {
                            setHolidayStaff(currentStaffName || staffList[0]?.name || 'Staff User');
                            setShowHolidayModal(true);
                        }}
                        className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Submit a holiday or leave request"
                    >
                        <CalendarPlus className="w-3.5 h-3.5 text-blue-600" />
                        Request Leave / Holiday
                    </button>

                    {/* Self-Mark Present Button */}
                    <button
                        type="button"
                        onClick={() => setShowSelfMarkModal(true)}
                        className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        title="Mark attendance for today"
                    >
                        <CheckCheck className="w-3.5 h-3.5 text-amber-600" />
                        Mark Present (Check-in)
                    </button>

                    {/* Export CSV Button */}
                    <button
                        type="button"
                        onClick={handleExportCSV}
                        className="px-3.5 py-1.5 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer border border-stone-200"
                        title="Download formatted attendance CSV"
                    >
                        <Download className="w-3.5 h-3.5 text-stone-500" />
                        Export CSV
                    </button>

                    {/* Today button */}
                    <button
                        type="button"
                        onClick={handleToday}
                        className="px-3 py-1.5 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer"
                    >
                        Today
                    </button>

                    {/* Navigation Prev / Next */}
                    <div className="flex items-center border border-stone-200 rounded-xl overflow-hidden bg-white shadow-xs">
                        <button
                            type="button"
                            onClick={handlePrev}
                            className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-50 border-r border-stone-200 cursor-pointer"
                            title={viewMode === 'week' ? 'Previous Week' : 'Previous Month'}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        
                        <div className="px-3.5 py-1.5 text-xs font-bold text-stone-800 min-w-[145px] text-center">
                            {viewMode === 'week' ? (
                                <span>
                                    {weekDays[0].monthShort} {weekDays[0].dayNum} — {weekDays[6].monthShort} {weekDays[6].dayNum}, {weekDays[0].dateObj.getFullYear()}
                                </span>
                            ) : (
                                <span>
                                    {MONTH_NAMES[anchorDate.getMonth()]} {anchorDate.getFullYear()}
                                </span>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={handleNext}
                            className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-50 cursor-pointer"
                            title={viewMode === 'week' ? 'Next Week' : 'Next Month'}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Batch Feedback Notification */}
            {batchSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center justify-between animate-in fade-in duration-200">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>{batchSuccessMsg}</span>
                    </div>
                    <button onClick={() => setBatchSuccessMsg('')} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">✕</button>
                </div>
            )}

            {/* Pending Requests Banner (Admin Review Required) */}
            {pendingRequests.length > 0 && (
                <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                            <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                                Pending Attendance &amp; Leave Requests ({pendingRequests.length})
                            </h3>
                        </div>
                        <span className="text-[11px] text-amber-800 font-bold bg-amber-100/90 px-2 py-0.5 rounded-md">
                            {isAdmin ? 'Admin Approval Required' : 'Awaiting Admin Review'}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {pendingRequests.map(req => {
                            const isHoliday = req.status === 'holiday_request';
                            return (
                                <div key={req.key} className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-2xs flex flex-col justify-between gap-2.5">
                                    <div>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-black text-stone-900">{req.staffName}</span>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                isHoliday 
                                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                            }`}>
                                                {isHoliday ? 'Holiday / Leave Request' : 'Self-Marked Present'}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-stone-500 mt-1">
                                            <span className="font-semibold text-stone-700">Date:</span> {req.dateStr}
                                        </p>
                                        {req.notes && (
                                            <p className="text-xs text-stone-700 bg-stone-50 p-2 rounded-lg mt-1.5 italic border border-stone-100">
                                                "{req.notes}"
                                            </p>
                                        )}
                                    </div>

                                    {isAdmin && (
                                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                                            <button
                                                type="button"
                                                onClick={() => handleApproveRequest(req)}
                                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                                            >
                                                <Check className="w-3.5 h-3.5" /> Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleRejectRequest(req)}
                                                className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-rose-200"
                                            >
                                                <X className="w-3.5 h-3.5" /> Reject
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-white rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-bold uppercase text-stone-400">Office Team</div>
                        <div className="text-xl font-black text-stone-900 mt-0.5">{kpiSummary.totalStaff} Staff</div>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center font-bold">
                        <Users className="w-4 h-4" />
                    </div>
                </div>

                <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 shadow-xs flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-bold uppercase text-emerald-700">Present Today</div>
                        <div className="text-xl font-black text-emerald-900 mt-0.5">
                            {kpiSummary.presentToday} <span className="text-xs font-semibold text-emerald-700">({kpiSummary.presentRate}%)</span>
                        </div>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                        <CheckCircle2 className="w-4 h-4" />
                    </div>
                </div>

                <div className="p-4 bg-orange-50/70 rounded-xl border border-orange-200 shadow-xs flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-bold uppercase text-orange-700">On Duty / Field</div>
                        <div className="text-xl font-black text-orange-900 mt-0.5">{kpiSummary.onDutyToday} Staff</div>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center font-bold">
                        <Briefcase className="w-4 h-4" />
                    </div>
                </div>

                <div className="p-4 bg-rose-50/70 rounded-xl border border-rose-200 shadow-xs flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-bold uppercase text-rose-700">Absent / Leave</div>
                        <div className="text-xl font-black text-rose-900 mt-0.5">{kpiSummary.absentToday + kpiSummary.leaveToday} Staff</div>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                        <XCircle className="w-4 h-4" />
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white rounded-xl border border-stone-200 p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search staff by name, role, department..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-stone-50/50"
                        />
                    </div>
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="text-xs text-stone-400 hover:text-stone-600"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Status Legend */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                    <span className="text-stone-400 uppercase text-[10px]">Legend:</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                        P = Present
                    </span>
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                        A = Absent
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                        HD = Half Day
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                        L = Leave
                    </span>
                    <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-200">
                        OD = On Duty
                    </span>
                </div>
            </div>

            {/* Main Attendance Table */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        
                        {/* Table Header: Dates On Top */}
                        <thead>
                            <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-600 font-bold">
                                {/* Fixed Staff Info Header */}
                                <th className="p-3.5 min-w-[200px] border-r border-stone-200 sticky left-0 bg-stone-50 z-10 shadow-2xs">
                                    <div className="flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5 text-stone-500" />
                                        <span>Staff Member / Role</span>
                                    </div>
                                </th>

                                {/* Date Column Headers On Top */}
                                {activeColumns.map(col => {
                                    return (
                                        <th 
                                            key={col.dateStr}
                                            className={`p-2.5 text-center border-r border-stone-200 transition-colors ${
                                                viewMode === 'week' ? 'min-w-[90px]' : 'min-w-[42px]'
                                            } ${
                                                col.isToday 
                                                    ? 'bg-amber-100/70 text-amber-900 border-amber-300' 
                                                    : col.isSunday 
                                                        ? 'bg-stone-100/60 text-rose-600' 
                                                        : 'text-stone-700'
                                            }`}
                                        >
                                            <div className="flex flex-col items-center">
                                                <span className="text-[10px] font-semibold uppercase text-stone-500">
                                                    {col.dayName}
                                                </span>
                                                <span className={`text-xs font-black px-1.5 py-0.2 rounded-full ${
                                                    col.isToday ? 'bg-amber-500 text-white' : ''
                                                }`}>
                                                    {col.dayNum}
                                                </span>
                                                {viewMode === 'week' && (
                                                    <span className="text-[9px] font-normal text-stone-400">
                                                        {col.monthShort}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    );
                                })}

                                {/* Total summary column */}
                                <th className="p-3 text-center min-w-[70px] bg-stone-50 font-bold text-stone-700">
                                    Present
                                </th>
                            </tr>
                        </thead>

                        {/* Table Body: Staff Rows */}
                        <tbody className="divide-y divide-stone-100">
                            {filteredStaff.length === 0 ? (
                                <tr>
                                    <td colSpan={activeColumns.length + 2} className="p-8 text-center text-stone-400">
                                        No staff members found matching criteria.
                                    </td>
                                </tr>
                            ) : (
                                filteredStaff.map((staff, rowIdx) => {
                                    // Count presents for this staff member across current columns
                                    let presentCount = 0;
                                    activeColumns.forEach(col => {
                                        const entry = records[`${staff.name}_${col.dateStr}`];
                                        if (entry?.status === 'present' || entry?.status === 'on_duty') presentCount++;
                                        else if (entry?.status === 'half_day') presentCount += 0.5;
                                    });

                                    return (
                                        <tr key={staff.id || staff.name} className="hover:bg-amber-50/20 transition-colors">
                                            
                                            {/* Staff details cell (Sticky left) */}
                                            <td className="p-3 border-r border-stone-200 sticky left-0 bg-white z-10 shadow-2xs">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-lg bg-stone-100 text-stone-700 font-black text-xs flex items-center justify-center shrink-0 border border-stone-200">
                                                        {staff.name.slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <div className="font-bold text-stone-900 truncate">
                                                            {staff.name}
                                                        </div>
                                                        <div className="text-[10px] text-stone-400 truncate flex items-center gap-1">
                                                            <span>{staff.role || 'Office Staff'}</span>
                                                            {staff.department && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span className="text-stone-500">{staff.department}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Date Cells */}
                                            {activeColumns.map(col => {
                                                const recordKey = `${staff.name}_${col.dateStr}`;
                                                const entry = records[recordKey];
                                                const statusKey = entry?.status;
                                                const statusCfg = statusKey ? ATTENDANCE_STATUSES[statusKey] : null;

                                                return (
                                                    <td 
                                                        key={col.dateStr}
                                                        onClick={() => handleCellClick(staff.name, col.dateStr)}
                                                        className={`p-1.5 text-center border-r border-stone-100 cursor-pointer transition-all hover:ring-2 hover:ring-emerald-400 hover:ring-inset ${
                                                            col.isToday ? 'bg-amber-50/30' : col.isSunday ? 'bg-stone-50/40' : ''
                                                        }`}
                                                        title={`${staff.name} on ${col.dateStr}: ${statusCfg ? statusCfg.label : 'Not marked'}${entry?.notes ? ` (${entry.notes})` : ''} - Click to change`}
                                                    >
                                                        {statusCfg ? (
                                                            <div className={`inline-flex items-center justify-center font-black rounded-lg shadow-2xs transition-all ${
                                                                viewMode === 'week' 
                                                                    ? 'px-2 py-1 text-[11px] gap-1 min-w-[55px]' 
                                                                    : 'w-7 h-7 text-[10px]'
                                                            } ${statusCfg.bg}`}>
                                                                <span>{viewMode === 'week' ? statusCfg.label : statusCfg.short}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-stone-300 hover:bg-stone-100 hover:text-stone-500 transition-colors">
                                                                <span className="text-xs">―</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}

                                            {/* Summary count */}
                                            <td className="p-2 text-center font-bold text-emerald-700 bg-emerald-50/30">
                                                {presentCount}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>

                        {/* Summary Footer Row */}
                        <tfoot>
                            <tr className="bg-stone-50 border-t border-stone-200 text-stone-700 font-bold">
                                <td className="p-3 border-r border-stone-200 sticky left-0 bg-stone-50 font-black text-xs">
                                    Daily Present Total
                                </td>
                                {activeColumns.map(col => {
                                    let colPresentCount = 0;
                                    staffList.forEach(s => {
                                        const entry = records[`${s.name}_${col.dateStr}`];
                                        if (entry?.status === 'present' || entry?.status === 'on_duty') colPresentCount++;
                                        else if (entry?.status === 'half_day') colPresentCount += 0.5;
                                    });

                                    return (
                                        <td 
                                            key={col.dateStr} 
                                            className={`p-2 text-center border-r border-stone-200 ${
                                                col.isToday ? 'bg-amber-100/50 font-black text-amber-900' : ''
                                            }`}
                                        >
                                            <span className="text-xs font-bold text-stone-800">
                                                {colPresentCount}
                                            </span>
                                        </td>
                                    );
                                })}
                                <td className="p-2 text-center bg-stone-100 font-black text-stone-900">
                                    ―
                                </td>
                            </tr>
                        </tfoot>

                    </table>
                </div>
            </div>

            {/* Cell Quick-Mark / Status Selection Modal */}
            {activeCell && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-sm w-full p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                            <div>
                                <h3 className="text-sm font-bold text-stone-900">
                                    Mark Attendance
                                </h3>
                                <p className="text-xs text-stone-500">
                                    <strong>{activeCell.staffName}</strong> • {activeCell.dateStr}
                                </p>
                            </div>
                            <button
                                onClick={() => setActiveCell(null)}
                                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Status Selection Buttons */}
                        <div className="space-y-2">
                            <label className="block text-[11px] font-bold uppercase text-stone-400 tracking-wider">
                                Select Status
                            </label>
                            <div className="grid grid-cols-1 gap-1.5">
                                {Object.values(ATTENDANCE_STATUSES).map(status => {
                                    const isSelected = activeCell.currentStatus === status.id;
                                    return (
                                        <button
                                            key={status.id}
                                            type="button"
                                            onClick={() => handleApplyStatus(status.id)}
                                            className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                                                isSelected 
                                                    ? `${status.activeBg} border-transparent shadow-xs` 
                                                    : `${status.bg} hover:brightness-95`
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : status.dot}`} />
                                                <span>{status.label}</span>
                                            </div>
                                            <span className="text-[11px] opacity-80">({status.short})</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Admin Approval Quick Action for Pending Requests */}
                        {isAdmin && (activeCell.currentStatus === 'holiday_request' || activeCell.currentStatus === 'pending_present') && (
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                                <div className="text-[11px] font-bold text-amber-900">
                                    Pending Approval: {activeCell.currentStatus === 'holiday_request' ? 'Holiday Request' : 'Self-Marked Present'}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            handleApproveRequest({
                                                staffName: activeCell.staffName,
                                                dateStr: activeCell.dateStr,
                                                status: activeCell.currentStatus
                                            });
                                            setActiveCell(null);
                                        }}
                                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                                    >
                                        <Check className="w-3.5 h-3.5" /> Approve
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            handleRejectRequest({
                                                staffName: activeCell.staffName,
                                                dateStr: activeCell.dateStr
                                            });
                                            setActiveCell(null);
                                        }}
                                        className="flex-1 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer border border-rose-200"
                                    >
                                        <X className="w-3.5 h-3.5" /> Reject
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Optional Notes Input */}
                        <div>
                            <label className="block text-xs font-bold text-stone-700 mb-1">
                                Optional Notes / Remarks
                            </label>
                            <input
                                type="text"
                                value={cellNotes}
                                onChange={e => setCellNotes(e.target.value)}
                                placeholder="e.g. Doctor visit, Surat site visit, half day"
                                className="w-full px-3 py-2 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                        </div>

                        {/* Clear Status Button */}
                        <div className="pt-2 flex gap-2 border-t border-stone-100">
                            {activeCell.currentStatus && (
                                <button
                                    type="button"
                                    onClick={() => handleApplyStatus(null)}
                                    className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                >
                                    Clear Status
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setActiveCell(null)}
                                className="flex-1 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Holiday / Leave Request Modal */}
            {showHolidayModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-md w-full p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                                    <CalendarPlus className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-stone-900">Request Leave / Holiday</h3>
                                    <p className="text-[11px] text-stone-500">Submit planned time-off for Admin review</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowHolidayModal(false)}
                                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleHolidaySubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-stone-700 mb-1">Staff Member</label>
                                {isAdmin ? (
                                    <select
                                        value={holidayStaff}
                                        onChange={e => setHolidayStaff(e.target.value)}
                                        className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl bg-stone-50 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {staffList.map(s => (
                                            <option key={s.id || s.name} value={s.name}>{s.name} ({s.role || 'Staff'})</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        readOnly
                                        value={holidayStaff}
                                        className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl bg-stone-100 font-semibold text-stone-700"
                                    />
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-stone-700 mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        required
                                        value={holidayStartDate}
                                        onChange={e => {
                                            setHolidayStartDate(e.target.value);
                                            if (!holidayEndDate || holidayEndDate < e.target.value) {
                                                setHolidayEndDate(e.target.value);
                                            }
                                        }}
                                        className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-stone-700 mb-1">End Date</label>
                                    <input
                                        type="date"
                                        required
                                        min={holidayStartDate}
                                        value={holidayEndDate}
                                        onChange={e => setHolidayEndDate(e.target.value)}
                                        className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-stone-700 mb-1">Reason / Notes</label>
                                <textarea
                                    rows={3}
                                    required
                                    value={holidayReason}
                                    onChange={e => setHolidayReason(e.target.value)}
                                    placeholder="e.g. Family function, personal leave, festival..."
                                    className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100">
                                <button
                                    type="button"
                                    onClick={() => setShowHolidayModal(false)}
                                    className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={holidaySubmitting}
                                    className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    {holidaySubmitting ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Self-Mark Present Modal */}
            {showSelfMarkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150">
                    <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-sm w-full p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                                    <CheckCheck className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-stone-900">Mark Attendance Check-in</h3>
                                    <p className="text-[11px] text-stone-500">{isAdmin ? 'Direct mark present' : 'Submits to Admin for approval'}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowSelfMarkModal(false)}
                                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSelfMarkSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-stone-700 mb-1">Staff Member</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={currentStaffName}
                                    className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl bg-stone-100 font-semibold text-stone-700"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-stone-700 mb-1">Date</label>
                                <input
                                    type="date"
                                    required
                                    value={selfMarkDate}
                                    onChange={e => setSelfMarkDate(e.target.value)}
                                    className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-stone-700 mb-1">Check-in Notes / Time</label>
                                <input
                                    type="text"
                                    value={selfMarkNotes}
                                    onChange={e => setSelfMarkNotes(e.target.value)}
                                    placeholder="e.g. Checked in at 9:30 AM · Office HQ"
                                    className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>

                            <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100">
                                <button
                                    type="button"
                                    onClick={() => setShowSelfMarkModal(false)}
                                    className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={selfMarkSubmitting}
                                    className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Check className="w-3.5 h-3.5" />
                                    {selfMarkSubmitting ? 'Recording...' : isAdmin ? 'Mark Present' : 'Submit for Approval'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
