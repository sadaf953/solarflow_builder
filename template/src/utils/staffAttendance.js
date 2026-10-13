// src/utils/staffAttendance.js
// Office Staff Attendance Management & Persistence
// Dual persistence: Supabase `staff_attendance` table + LocalStorage fallback.

import { supabase } from '../supabase';

const STORAGE_KEY = 'solarflow_staff_attendance_v1';

export const ATTENDANCE_STATUSES = {
    present: {
        id: 'present',
        label: 'Present',
        short: 'P',
        bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        activeBg: 'bg-emerald-600 text-white',
        dot: 'bg-emerald-500',
        color: '#059669'
    },
    absent: {
        id: 'absent',
        label: 'Absent',
        short: 'A',
        bg: 'bg-rose-100 text-rose-800 border-rose-300',
        activeBg: 'bg-rose-600 text-white',
        dot: 'bg-rose-500',
        color: '#e11d48'
    },
    half_day: {
        id: 'half_day',
        label: 'Half Day',
        short: 'HD',
        bg: 'bg-yellow-100 text-yellow-900 border-yellow-300',
        activeBg: 'bg-yellow-400 text-stone-900',
        dot: 'bg-yellow-400',
        color: '#facc15'
    },
    leave: {
        id: 'leave',
        label: 'Leave',
        short: 'L',
        bg: 'bg-blue-100 text-blue-800 border-blue-300',
        activeBg: 'bg-blue-600 text-white',
        dot: 'bg-blue-500',
        color: '#2563eb'
    },
    on_duty: {
        id: 'on_duty',
        label: 'Field / On Duty',
        short: 'OD',
        bg: 'bg-orange-100 text-orange-900 border-orange-300',
        activeBg: 'bg-orange-500 text-stone-900',
        dot: 'bg-orange-500',
        color: '#ff8a00'
    },
    pending_present: {
        id: 'pending_present',
        label: 'Self-Marked (Pending)',
        short: 'SMP',
        bg: 'bg-yellow-100 text-yellow-900 border-yellow-300 ring-1 ring-yellow-400',
        activeBg: 'bg-yellow-400 text-stone-900',
        dot: 'bg-yellow-400 animate-pulse',
        color: '#facc15',
        isPending: true
    },
    holiday_request: {
        id: 'holiday_request',
        label: 'Holiday Request',
        short: 'HR',
        bg: 'bg-blue-100 text-blue-900 border-blue-300 ring-1 ring-blue-400',
        activeBg: 'bg-blue-600 text-white',
        dot: 'bg-blue-500 animate-pulse',
        color: '#2563eb',
        isPending: true
    },
    holiday: {
        id: 'holiday',
        label: 'Holiday / Approved Leave',
        short: 'H',
        bg: 'bg-blue-100 text-blue-800 border-blue-300',
        activeBg: 'bg-blue-600 text-white',
        dot: 'bg-blue-500',
        color: '#2563eb'
    }
};

export const DEFAULT_OFFICE_STAFF = [
    { id: 'staff-admin', name: 'Admin User', role: 'Managing Director / Admin', department: 'Management', email: 'admin@solarflow.example' },
    { id: 'staff-priya', name: 'Priya Sharma', role: 'Operations Lead', department: 'Operations', email: 'priya.s@solarflow.example' },
    { id: 'staff-rahul', name: 'Rahul Verma', role: 'Field Sales Manager', department: 'Sales', email: 'rahul.v@solarflow.example' },
    { id: 'staff-amit', name: 'Amit Trivedi', role: 'Technical Sales Executive', department: 'Sales', email: 'amit.t@solarflow.example' },
    { id: 'staff-ankit', name: 'Ankit Patel', role: 'Discom & Govt Coordinator', department: 'Government Liason', email: 'ankit.p@solarflow.example' },
    { id: 'staff-sneha', name: 'Sneha Joshi', role: 'Customer Relationship Officer', department: 'Customer Support', email: 'sneha.j@solarflow.example' },
    { id: 'staff-pooja', name: 'Pooja Mehta', role: 'Finance & Accounts Officer', department: 'Finance & Accounts', email: 'pooja.m@solarflow.example' },
    { id: 'staff-vikram', name: 'Vikram Solanki', role: 'Store & Inventory Incharge', department: 'Inventory / Logistics', email: 'vikram.s@solarflow.example' },
    { id: 'staff-hardik', name: 'Hardik Pandya', role: 'Site Survey Engineer', department: 'Engineering', email: 'hardik.p@solarflow.example' },
    { id: 'staff-divya', name: 'Divya Shah', role: 'Quality & Safety Inspector', department: 'QA / Safety', email: 'divya.s@solarflow.example' },
    { id: 'staff-rajesh', name: 'Rajesh Bhavsar', role: 'Solar CAD Designer', department: 'Technical Design', email: 'rajesh.b@solarflow.example' },
    { id: 'staff-manoj', name: 'Manoj Rathod', role: 'Field Integration Supervisor', department: 'Field Operations', email: 'manoj.r@solarflow.example' },
    { id: 'staff-kavita', name: 'Kavita Nair', role: 'Billing & Subsidy Officer', department: 'Subsidy & Billing', email: 'kavita.n@solarflow.example' },
    { id: 'staff-hiren', name: 'Hiren Dave', role: 'Procurement Specialist', department: 'Purchasing', email: 'hiren.d@solarflow.example' },
    { id: 'staff-preparer', name: 'Demo Preparer', role: 'Material Assembler', department: 'Warehouse & Assembly', email: 'preparer@solarflow.example' },
    { id: 'staff-loader', name: 'Demo Loader', role: 'Dispatch Coordinator', department: 'Logistics', email: 'loader@solarflow.example' },
];

// Initial mock records for the current week / month
const DEFAULT_ATTENDANCE_RECORDS = {
    // 2026-09-14 (Monday)
    'Admin User_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:00:00Z' },
    'Priya Sharma_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:05:00Z' },
    'Rahul Verma_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:10:00Z' },
    'Amit Trivedi_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:02:00Z' },
    'Ankit Patel_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:15:00Z' },
    'Sneha Joshi_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:00:00Z' },
    'Pooja Mehta_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:00:00Z' },
    'Vikram Solanki_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:00:00Z' },
    'Hardik Pandya_2026-09-14': { status: 'on_duty', notes: 'Site survey Navsari', markedAt: '2026-09-14T09:30:00Z' },
    'Divya Shah_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:10:00Z' },
    'Rajesh Bhavsar_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:12:00Z' },
    'Manoj Rathod_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:00:00Z' },
    'Kavita Nair_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:05:00Z' },
    'Hiren Dave_2026-09-14': { status: 'present', notes: 'On time', markedAt: '2026-09-14T09:00:00Z' },
    'Demo Preparer_2026-09-14': { status: 'present', notes: 'Warehouse morning batch', markedAt: '2026-09-14T08:45:00Z' },
    'Demo Loader_2026-09-14': { status: 'present', notes: 'Dispatch shift', markedAt: '2026-09-14T08:50:00Z' },

    // 2026-09-15 (Tuesday)
    'Admin User_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T09:00:00Z' },
    'Priya Sharma_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T09:02:00Z' },
    'Rahul Verma_2026-09-15': { status: 'on_duty', notes: 'Client site visits Surat', markedAt: '2026-09-15T09:30:00Z' },
    'Amit Trivedi_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T09:05:00Z' },
    'Ankit Patel_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T09:05:00Z' },
    'Sneha Joshi_2026-09-15': { status: 'half_day', notes: 'Medical appointment afternoon', markedAt: '2026-09-15T13:00:00Z' },
    'Pooja Mehta_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T09:00:00Z' },
    'Vikram Solanki_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T08:55:00Z' },
    'Hardik Pandya_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T09:00:00Z' },
    'Divya Shah_2026-09-15': { status: 'on_duty', notes: 'Site safety inspection Baroda', markedAt: '2026-09-15T10:00:00Z' },
    'Rajesh Bhavsar_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T09:08:00Z' },
    'Manoj Rathod_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T09:00:00Z' },
    'Kavita Nair_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T09:00:00Z' },
    'Hiren Dave_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T09:00:00Z' },
    'Demo Preparer_2026-09-15': { status: 'present', notes: 'On time', markedAt: '2026-09-15T09:00:00Z' },
    'Demo Loader_2026-09-15': { status: 'leave', notes: 'Scheduled personal leave', markedAt: '2026-09-15T08:30:00Z' },

    // 2026-09-16 (Wednesday)
    'Admin User_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:00:00Z' },
    'Priya Sharma_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:00:00Z' },
    'Rahul Verma_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:05:00Z' },
    'Amit Trivedi_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:00:00Z' },
    'Ankit Patel_2026-09-16': { status: 'on_duty', notes: 'Discom circle office submission', markedAt: '2026-09-16T10:00:00Z' },
    'Sneha Joshi_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:12:00Z' },
    'Pooja Mehta_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:00:00Z' },
    'Vikram Solanki_2026-09-16': { status: 'absent', notes: 'Unplanned absence', markedAt: '2026-09-16T09:00:00Z' },
    'Hardik Pandya_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:00:00Z' },
    'Divya Shah_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:00:00Z' },
    'Rajesh Bhavsar_2026-09-16': { status: 'leave', notes: 'Family event', markedAt: '2026-09-16T08:00:00Z' },
    'Manoj Rathod_2026-09-16': { status: 'on_duty', notes: 'Site commissioning check', markedAt: '2026-09-16T09:30:00Z' },
    'Kavita Nair_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:00:00Z' },
    'Hiren Dave_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:00:00Z' },
    'Demo Preparer_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:00:00Z' },
    'Demo Loader_2026-09-16': { status: 'present', notes: 'On time', markedAt: '2026-09-16T09:00:00Z' },

    // 2026-09-17 (Thursday - Today)
    'Admin User_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Priya Sharma_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Rahul Verma_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Amit Trivedi_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Ankit Patel_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Sneha Joshi_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Pooja Mehta_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Vikram Solanki_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Hardik Pandya_2026-09-17': { status: 'on_duty', notes: 'Roof inspection Surat', markedAt: '2026-09-17T09:45:00Z' },
    'Divya Shah_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Rajesh Bhavsar_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Manoj Rathod_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Kavita Nair_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Hiren Dave_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Demo Preparer_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' },
    'Demo Loader_2026-09-17': { status: 'present', notes: 'On time', markedAt: '2026-09-17T09:00:00Z' }
};

function getLocalAttendanceStore() {
    if (typeof window === 'undefined') return DEFAULT_ATTENDANCE_RECORDS;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ATTENDANCE_RECORDS));
            return DEFAULT_ATTENDANCE_RECORDS;
        }
        return JSON.parse(stored) || DEFAULT_ATTENDANCE_RECORDS;
    } catch {
        return DEFAULT_ATTENDANCE_RECORDS;
    }
}

function saveLocalAttendanceStore(records) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        window.dispatchEvent(new CustomEvent('solarflow-attendance-changed'));
    } catch (e) {
        console.error('Failed to save attendance locally:', e);
    }
}

/**
 * Fetch all office staff linked to profiles/demo_profiles or fallback
 */
export async function fetchOfficeStaff() {
    const staffMap = new Map();

    // 1. Seed defaults first
    DEFAULT_OFFICE_STAFF.forEach(staff => staffMap.set(staff.name.toLowerCase(), staff));

    // 2. Fetch live users from profiles or demo_profiles
    try {
        const { data: liveProfiles } = await supabase
            .from('profiles')
            .select('id, name, email, role, user_type, channel_partner')
            .order('name');

        if (liveProfiles && liveProfiles.length > 0) {
            liveProfiles.forEach(p => {
                if (!p.name) return;
                const cleanName = p.name.trim();
                const key = cleanName.toLowerCase();
                const roleLabel = p.role || p.user_type || 'Staff';
                const dept = p.channel_partner || (roleLabel.includes('Admin') ? 'Management' : 'Office');

                staffMap.set(key, {
                    id: p.id || `profile-${key}`,
                    name: cleanName,
                    role: roleLabel,
                    department: dept,
                    email: p.email || `${cleanName.toLowerCase().replace(/\s+/g, '.')}@solarflow.example`
                });
            });
        }
    } catch (err) {
        console.warn('Could not fetch profiles for attendance, using defaults:', err);
    }

    // 3. Also check demo_profiles if available
    try {
        const { data: demoProfiles } = await supabase
            .from('demo_profiles')
            .select('id, name, email, role, user_type')
            .order('name');

        if (demoProfiles && demoProfiles.length > 0) {
            demoProfiles.forEach(p => {
                if (!p.name) return;
                const cleanName = p.name.trim();
                const key = cleanName.toLowerCase();
                if (!staffMap.has(key)) {
                    staffMap.set(key, {
                        id: p.id || `demo-${key}`,
                        name: cleanName,
                        role: p.role || p.user_type || 'Staff',
                        department: 'Demo Staff',
                        email: p.email || `${cleanName.toLowerCase().replace(/\s+/g, '.')}@solarflow.example`
                    });
                }
            });
        }
    } catch {
        // demo_profiles optional
    }

    return Array.from(staffMap.values());
}

/**
 * Fetch attendance records for a specific date range [startDateStr, endDateStr]
 */
export async function getAttendanceRecords(startDateStr, endDateStr) {
    const localStore = getLocalAttendanceStore();
    const result = { ...localStore };

    try {
        const { data, error } = await supabase
            .from('staff_attendance')
            .select('*')
            .gte('date', startDateStr)
            .lte('date', endDateStr);

        if (!error && data && data.length > 0) {
            data.forEach(row => {
                const key = `${row.staff_name}_${row.date}`;
                result[key] = {
                    status: row.status,
                    notes: row.notes || '',
                    markedAt: row.updated_at || row.created_at,
                    markedBy: row.marked_by
                };
            });
            // Update local cache
            saveLocalAttendanceStore({ ...localStore, ...result });
        }
    } catch (err) {
        console.warn('Network attendance fetch skipped, using local store:', err);
    }

    return result;
}

/**
 * Save / toggle attendance for a single staff member on a specific date
 */
export async function setStaffAttendance(staffName, dateStr, status, notes = '', markedBy = 'Admin') {
    if (!staffName || !dateStr) return;

    const key = `${staffName}_${dateStr}`;
    const localStore = getLocalAttendanceStore();
    const nowIso = new Date().toISOString();

    if (!status) {
        delete localStore[key];
    } else {
        localStore[key] = {
            status,
            notes: notes || '',
            markedAt: nowIso,
            markedBy
        };
    }

    saveLocalAttendanceStore(localStore);

    // Persist to Supabase if table exists
    try {
        if (status) {
            const { data: existing } = await supabase
                .from('staff_attendance')
                .select('id')
                .eq('staff_name', staffName)
                .eq('date', dateStr)
                .maybeSingle();

            if (existing?.id) {
                await supabase
                    .from('staff_attendance')
                    .update({
                        status: status,
                        notes: notes || '',
                        marked_by: markedBy,
                        updated_at: nowIso
                    })
                    .eq('id', existing.id);
            } else {
                await supabase
                    .from('staff_attendance')
                    .insert({
                        staff_name: staffName,
                        date: dateStr,
                        status: status,
                        notes: notes || '',
                        marked_by: markedBy,
                        updated_at: nowIso
                    });
            }
        } else {
            await supabase
                .from('staff_attendance')
                .delete()
                .eq('staff_name', staffName)
                .eq('date', dateStr);
        }
    } catch (err) {
        console.warn('Could not sync attendance to backend:', err);
    }
}

/**
 * Quick batch mark all given staff as 'present' on dateStr
 */
export async function markAllStaffPresent(staffList, dateStr, markedBy = 'Admin') {
    if (!staffList || !staffList.length || !dateStr) return;

    const localStore = getLocalAttendanceStore();
    const nowIso = new Date().toISOString();
    const upsertRows = [];

    staffList.forEach(staff => {
        const key = `${staff.name}_${dateStr}`;
        localStore[key] = {
            status: 'present',
            notes: 'Batch marked present',
            markedAt: nowIso,
            markedBy
        };
        upsertRows.push({
            staff_name: staff.name,
            role: staff.role || 'Staff',
            date: dateStr,
            status: 'present',
            notes: 'Batch marked present',
            marked_by: markedBy,
            updated_at: nowIso
        });
    });

    saveLocalAttendanceStore(localStore);

    try {
        await supabase
            .from('staff_attendance')
            .delete()
            .eq('date', dateStr);

        await supabase
            .from('staff_attendance')
            .insert(upsertRows);
    } catch (err) {
        console.warn('Backend batch attendance sync skipped:', err);
    }
}

/**
 * Export attendance records to a downloadable CSV
 */
export function exportAttendanceToCSV({ staffList, columns, records, viewMode, title }) {
    if (!staffList || !staffList.length || !columns || !columns.length) return;

    const escapeCsv = (val) => {
        const str = String(val ?? '').replace(/"/g, '""');
        return `"${str}"`;
    };

    const header = [
        'Staff Name',
        'Role / Designation',
        'Department',
        ...columns.map(c => `${c.dateStr} (${c.dayName})`),
        'Total Present Days',
        'Total Absent Days',
        'Total Half Days',
        'Total Leaves',
        'Total On Duty',
        'Attendance %'
    ];

    const rows = [];
    rows.push(['SolarFlow Demo Energy - Staff Attendance Register']);
    rows.push([`Report Period: ${title} (${viewMode.toUpperCase()} VIEW)`]);
    rows.push([`Generated On: ${new Date().toLocaleString('en-IN')}`]);
    rows.push([]); // blank line
    rows.push(header.map(escapeCsv).join(','));

    staffList.forEach(staff => {
        let present = 0;
        let absent = 0;
        let halfDay = 0;
        let leave = 0;
        let onDuty = 0;

        const dateValues = columns.map(col => {
            const key = `${staff.name}_${col.dateStr}`;
            const entry = records[key];
            const status = entry?.status;
            if (status === 'present') {
                present++;
                return 'Present (P)';
            } else if (status === 'absent') {
                absent++;
                return 'Absent (A)';
            } else if (status === 'half_day') {
                halfDay++;
                return 'Half Day (HD)';
            } else if (status === 'leave') {
                leave++;
                return 'Leave (L)';
            } else if (status === 'on_duty') {
                onDuty++;
                return 'On Duty (OD)';
            }
            return 'Not Marked (-)';
        });

        const totalWorkDays = columns.length;
        const effectivePresent = present + onDuty + (halfDay * 0.5);
        const attendancePct = totalWorkDays > 0 ? Math.round((effectivePresent / totalWorkDays) * 100) : 0;

        const row = [
            escapeCsv(staff.name),
            escapeCsv(staff.role || 'Office Staff'),
            escapeCsv(staff.department || 'Office'),
            ...dateValues.map(escapeCsv),
            effectivePresent,
            absent,
            halfDay,
            leave,
            onDuty,
            `${attendancePct}%`
        ];

        rows.push(row.join(','));
    });

    // Daily totals row
    const dailyTotals = columns.map(col => {
        let count = 0;
        staffList.forEach(s => {
            const entry = records[`${s.name}_${col.dateStr}`];
            if (entry?.status === 'present' || entry?.status === 'on_duty') count++;
            else if (entry?.status === 'half_day') count += 0.5;
        });
        return count;
    });

    const summaryRow = [
        escapeCsv('TOTAL PRESENT (DAILY)'),
        escapeCsv('-'),
        escapeCsv('-'),
        ...dailyTotals.map(escapeCsv),
        escapeCsv('-'),
        escapeCsv('-'),
        escapeCsv('-'),
        escapeCsv('-'),
        escapeCsv('-'),
        escapeCsv('-')
    ];
    rows.push(summaryRow.join(','));

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `SolarFlow_Attendance_${viewMode}_${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Submit a holiday / leave request spanning from startDateStr to endDateStr
 */
export async function submitHolidayRequest(staffName, startDateStr, endDateStr, reason = '', requestedBy = 'Staff') {
    if (!staffName || !startDateStr) return false;

    const start = new Date(startDateStr);
    const end = endDateStr ? new Date(endDateStr) : new Date(startDateStr);
    
    // Safety check: max 31 days per request
    const daysDiff = Math.round((end - start) / (1000 * 60 * 60 * 24));
    if (daysDiff < 0 || daysDiff > 31) return false;

    const current = new Date(start);
    while (current <= end) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        const dateKey = `${y}-${m}-${d}`;

        await setStaffAttendance(
            staffName,
            dateKey,
            'holiday_request',
            `Holiday Request: ${reason || 'Leave requested'}`,
            requestedBy
        );

        current.setDate(current.getDate() + 1);
    }
    return true;
}

/**
 * Staff self-marks themselves present for today (pending admin approval)
 */
export async function submitSelfAttendance(staffName, dateStr, notes = '', markedBy = 'Staff') {
    if (!staffName || !dateStr) return false;
    await setStaffAttendance(
        staffName,
        dateStr,
        'pending_present',
        `Self-marked present: ${notes || 'Submitted by staff'}`,
        markedBy
    );
    return true;
}

/**
 * Admin approves a pending request
 */
export async function approveAttendanceRequest(staffName, dateStr, currentStatus, adminName = 'Admin') {
    const targetStatus = currentStatus === 'holiday_request' ? 'holiday' : 'present';
    const noteText = currentStatus === 'holiday_request' ? 'Approved holiday / leave by Admin' : 'Approved attendance by Admin';
    await setStaffAttendance(staffName, dateStr, targetStatus, noteText, adminName);
    return true;
}

/**
 * Admin rejects a pending request
 */
export async function rejectAttendanceRequest(staffName, dateStr, reason = '', adminName = 'Admin') {
    await setStaffAttendance(
        staffName,
        dateStr,
        'absent',
        `Rejected by ${adminName}: ${reason || 'Leave not granted'}`,
        adminName
    );
    return true;
}
