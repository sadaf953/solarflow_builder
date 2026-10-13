// Reads behind the Dashboard shell: stage lists, the dealer filter, today's
// summary and the solar equipment summary. Every customer read is scoped the
// same way, so counts and lists agree.

import { supabase } from '../supabase';
import { customerSource, fetchAllPages } from '../lib/db.js';
import { todayIST } from '../lib/format.js';
import { STAGE_IDS } from '../config/index.js';
import { summarizeSolarEquipment } from './solarStats';
import { exactLike, scopeCustomers } from './filters.js';

export { scopeCustomers, stageDateFilters } from './filters.js';

/** Names of active dealers under a channel partner (head office) or under the signed-in partner office. */
export async function fetchDealerNames({ user, isCpo, channelPartner }) {
    let query = supabase.from('profiles').select('name').eq('user_type', 'agent2').eq('status', 'active').order('name');
    if (isCpo) {
        const officeId = user?.userType === 'channel_partner_office' ? user.id : (user?.cpo_profile_id || user?.parent_profile_id);
        if (!officeId) return [];
        query = query.eq('cpo_profile_id', officeId);
    } else {
        if (!channelPartner?.trim()) return [];
        query = query.ilike('channel_partner', exactLike(channelPartner));
    }
    const { data, error } = await query;
    if (error) throw error;
    return [...new Set((data || []).map(row => row.name?.trim()).filter(Boolean))];
}

const SOLAR_EQUIPMENT_COLUMNS = 'id,module_brand,no_of_modules,inverter_make,system_capacity_kwp,stage';

export async function fetchSolarEquipmentStats(isCpo, scope) {
    const rows = await fetchAllPages(() => scopeCustomers(
        supabase.from(customerSource(isCpo)).select(SOLAR_EQUIPMENT_COLUMNS).is('deleted_at', null).order('id', { ascending: true }),
        scope,
    ));
    return summarizeSolarEquipment(rows);
}

const CLOSED_STAGES = `(${[STAGE_IDS.COMPLETED, STAGE_IDS.LOST_PROJECT].map(id => `"${id}"`).join(',')})`;
const INSTALLED = ['Installed', 'Yes'];

export async function fetchTodaySummary(isCpo, scope, includeDeliveries) {
    const today = todayIST();
    const table = customerSource(isCpo);
    const count = async query => {
        const { count: value, error } = await scopeCustomers(query, scope);
        if (error) throw error;
        return value || 0;
    };
    const head = () => supabase.from(table).select('id', { count: 'exact', head: true }).is('deleted_at', null);

    const [registeredToday, installedToday, installedLive] = await Promise.all([
        count(head().eq('registration_date', today)),
        count(head().eq('installation_date', today).in('installation_status', INSTALLED)),
        count(head().not('stage', 'in', CLOSED_STAGES).in('installation_status', INSTALLED)),
    ]);

    let deliveriesDueToday = 0;
    let deliveryProjectsToday = 0;
    if (includeDeliveries) {
        const { data: batches, error } = await supabase
            .from('delivery_batches')
            .select('id,project_ids')
            .eq('dispatch_date', today)
            .neq('status', 'DELIVERED');
        if (error) throw error;
        const projectIds = [...new Set((batches || []).flatMap(batch => batch.project_ids || []))];
        if (scope?.channelPartner || scope?.dealer) {
            if (projectIds.length) {
                const { data: visible, error: visibleError } = await scopeCustomers(
                    supabase.from(table).select('id').is('deleted_at', null).in('id', projectIds), scope,
                );
                if (visibleError) throw visibleError;
                const visibleIds = new Set((visible || []).map(row => row.id));
                deliveryProjectsToday = visibleIds.size;
                deliveriesDueToday = (batches || []).filter(batch => (batch.project_ids || []).some(id => visibleIds.has(id))).length;
            }
        } else {
            deliveriesDueToday = (batches || []).length;
            deliveryProjectsToday = projectIds.length;
        }
    }

    return { date: today, registeredToday, installedToday, installedLive, deliveriesDueToday, deliveryProjectsToday, canViewDeliveries: includeDeliveries };
}

/** Dropdown lists from the metadata table, grouped by category. */
export async function fetchMetadataLists() {
    const { data, error } = await supabase.from('metadata').select('category, label').eq('is_active', true).order('sort_order');
    if (error) throw error;
    const grouped = {};
    (data || []).forEach(({ category, label }) => { (grouped[category] ||= []).push(label); });
    return grouped;
}
