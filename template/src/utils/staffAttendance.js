// Office attendance, stored in staff_attendance (one row per person per day).
// Head office marks anyone; everyone else can only file their own pending
// requests ('pending_present', 'holiday_request'), which head office reviews.

import { supabase } from '../supabase';
import { toCsv } from '../lib/download.js';

export const ATTENDANCE_STATUSES = {
    present: { id: 'present', label: 'Present', short: 'P', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
    absent: { id: 'absent', label: 'Absent', short: 'A', bg: 'bg-rose-100 text-rose-800 border-rose-300', dot: 'bg-rose-500' },
    half_day: { id: 'half_day', label: 'Half day', short: 'HD', bg: 'bg-yellow-100 text-yellow-900 border-yellow-300', dot: 'bg-yellow-400' },
    leave: { id: 'leave', label: 'Leave', short: 'L', bg: 'bg-blue-100 text-blue-800 border-blue-300', dot: 'bg-blue-500' },
    on_duty: { id: 'on_duty', label: 'On duty', short: 'OD', bg: 'bg-orange-100 text-orange-900 border-orange-300', dot: 'bg-orange-500' },
    holiday: { id: 'holiday', label: 'Holiday', short: 'H', bg: 'bg-sky-100 text-sky-800 border-sky-300', dot: 'bg-sky-500' },
    pending_present: { id: 'pending_present', label: 'Present (waiting)', short: 'P?', bg: 'bg-yellow-50 text-yellow-900 border-yellow-400 border-dashed', dot: 'bg-yellow-400', isPending: true },
    holiday_request: { id: 'holiday_request', label: 'Leave (waiting)', short: 'L?', bg: 'bg-blue-50 text-blue-900 border-blue-400 border-dashed', dot: 'bg-blue-400', isPending: true },
};

/** Statuses head office can set directly. */
export const MARKABLE_STATUSES = ['present', 'absent', 'half_day', 'leave', 'on_duty', 'holiday'];
/** Logins listed on the register. */
export const STAFF_USER_TYPES = ['admin', 'sales'];
export const MAX_REQUEST_DAYS = 31;

export const isPendingStatus = status => Boolean(ATTENDANCE_STATUSES[status]?.isPending);
const counts = { present: 1, on_duty: 1, half_day: 0.5 };
/** How much of a working day a status counts as. */
export const presentWeight = status => counts[status] || 0;

/** Every 'YYYY-MM-DD' from start to end inclusive (calendar days, timezone-free). */
export function datesBetween(start, end = start) {
    const days = [];
    const date = new Date(`${start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    while (date <= last && days.length <= 366) {
        days.push(date.toISOString().slice(0, 10));
        date.setUTCDate(date.getUTCDate() + 1);
    }
    return days;
}

/** Active head-office logins, by name. Only head office can read other people's profiles. */
export async function fetchOfficeStaff() {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, name, role, user_type')
        .eq('status', 'active')
        .in('user_type', STAFF_USER_TYPES)
        .order('name');
    if (error) throw error;
    return (data || []).filter(p => String(p.name || '').trim()).map(p => ({ id: p.id, name: p.name.trim(), role: p.role || '' }));
}

export async function fetchAttendance(start, end) {
    const { data, error } = await supabase
        .from('staff_attendance')
        .select('id, user_id, staff_name, role, date, status, notes, marked_by, updated_at')
        .gte('date', start)
        .lte('date', end);
    if (error) throw error;
    return data || [];
}

export async function fetchPendingRequests() {
    const { data, error } = await supabase
        .from('staff_attendance')
        .select('id, user_id, staff_name, date, status, notes')
        .in('status', ['pending_present', 'holiday_request'])
        .order('date');
    if (error) throw error;
    return data || [];
}

/** Head office sets (or, with no status, clears) one person's day. */
export async function setStaffAttendance({ staff, date, status, notes = '', markedBy }) {
    const query = status
        ? supabase.from('staff_attendance').upsert({
            user_id: staff.id || null, staff_name: staff.name, role: staff.role || null, date, status,
            notes: notes.trim(), marked_by: markedBy || null, updated_at: new Date().toISOString(),
        }, { onConflict: 'staff_name,date' }).select('id')
        : supabase.from('staff_attendance').delete().eq('staff_name', staff.name).eq('date', date).select('id');
    const { error } = await query;
    if (error) throw error;
}

/** Marks everyone in `staffList` present on `date`, leaving days already marked alone. */
export async function markStaffPresent(staffList, date, markedBy) {
    if (!staffList.length) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('staff_attendance').upsert(staffList.map(staff => ({
        user_id: staff.id || null, staff_name: staff.name, role: staff.role || null, date,
        status: 'present', notes: '', marked_by: markedBy || null, updated_at: now,
    })), { onConflict: 'staff_name,date', ignoreDuplicates: true });
    if (error) throw error;
}

/**
 * Files the signed-in user's own request ('pending_present' or
 * 'holiday_request') for each date. Days the office has already marked are
 * skipped, because a request cannot overwrite them.
 */
export async function requestOwnAttendance({ user, dates, status, notes = '' }) {
    if (!user?.id || !user?.name || !dates.length) return { saved: [], skipped: [] };
    const { data: existing, error: readError } = await supabase
        .from('staff_attendance')
        .select('date, status')
        .eq('staff_name', user.name)
        .gte('date', dates[0])
        .lte('date', dates[dates.length - 1]);
    if (readError) throw readError;
    const locked = new Set((existing || []).filter(row => !isPendingStatus(row.status)).map(row => row.date));
    const saved = dates.filter(date => !locked.has(date));
    if (saved.length) {
        const now = new Date().toISOString();
        const { error } = await supabase.from('staff_attendance').upsert(saved.map(date => ({
            user_id: user.id, staff_name: user.name, role: user.role || null, date, status,
            notes: notes.trim(), marked_by: user.name, updated_at: now,
        })), { onConflict: 'staff_name,date' });
        if (error) throw error;
    }
    return { saved, skipped: dates.filter(date => locked.has(date)) };
}

/**
 * Approves or rejects request rows. Approved: present / holiday. Rejected:
 * a self-marked day becomes absent; a leave request is withdrawn.
 */
export async function reviewRequests(rows, approve, reviewer) {
    const now = new Date().toISOString();
    for (const status of ['pending_present', 'holiday_request']) {
        const ids = rows.filter(row => row.status === status).map(row => row.id);
        if (!ids.length) continue;
        let query;
        if (approve) {
            query = supabase.from('staff_attendance')
                .update({ status: status === 'holiday_request' ? 'holiday' : 'present', marked_by: reviewer || null, updated_at: now })
                .in('id', ids);
        } else if (status === 'pending_present') {
            query = supabase.from('staff_attendance')
                .update({ status: 'absent', marked_by: reviewer || null, updated_at: now })
                .in('id', ids);
        } else {
            query = supabase.from('staff_attendance').delete().in('id', ids);
        }
        const { data, error } = await query.select('id');
        if (error) throw error;
        if ((data || []).length !== ids.length) throw new Error('Some requests were not updated. Reload and try again.');
    }
}

/** CSV of the register: one row per person, one column per day, then totals. */
export function attendanceCsv(staffList, days, statusOf) {
    const columns = [
        { key: 'name', label: 'Staff' },
        { key: 'role', label: 'Role' },
        ...days.map(day => ({ key: day, label: day, get: staff => ATTENDANCE_STATUSES[statusOf(staff, day)]?.label || '' })),
        { key: 'present', label: 'Days present', get: staff => days.reduce((sum, day) => sum + presentWeight(statusOf(staff, day)), 0) },
        { key: 'absent', label: 'Days absent', get: staff => days.filter(day => statusOf(staff, day) === 'absent').length },
        { key: 'leave', label: 'Days on leave or holiday', get: staff => days.filter(day => ['leave', 'holiday'].includes(statusOf(staff, day))).length },
    ];
    return toCsv(staffList, columns);
}
