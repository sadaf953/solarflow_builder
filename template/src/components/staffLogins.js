// Staff logins: who a login works under, and what an admin's edit writes to
// its profile. Pure, so the rules can be tested without a database.

import { isOn } from '../config/index.js';

export const CPO = 'channel_partner_office';
export const CPO_CHILD_TYPES = ['office2', 'agent2'];

const clean = value => String(value || '').trim();
const sameText = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

/** The partner name a partner office or channel partner files leads under. */
export const partnerKey = profile => clean(profile?.channel_partner) || clean(profile?.name);

/**
 * Who a manager or dealer can work under: active partner offices, plus
 * channel partners for dealers when channel partners are switched on.
 * Options are { value: profile id, label: partner name }. `keepId` (the
 * login's current parent) stays listed even when switched off.
 */
export function officeOptions(userType, profiles, { keepId = '', excludeId = '' } = {}) {
    const parents = profiles.filter(p => p.id !== excludeId
        && (p.user_type === CPO || (userType === 'agent2' && p.user_type === 'agent' && isOn('channelPartners')))
        && (p.status === 'active' || p.id === keepId)
        && partnerKey(p));
    return parents
        .map(p => {
            const key = partnerKey(p);
            const twin = parents.some(other => other !== p && sameText(partnerKey(other), key));
            const label = `${key}${twin && p.email ? ` · ${p.email}` : ''}${p.status === 'active' ? '' : ' (switched off)'}`;
            return { value: p.id, label };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** The parent a manager or dealer works under today: its linked office, else the partner whose key it carries. */
export function currentParentId(user, options, profiles) {
    if (!CPO_CHILD_TYPES.includes(user.user_type)) return '';
    if (options.some(o => o.value === user.parent_profile_id)) return user.parent_profile_id;
    const matches = options.filter(o => sameText(partnerKey(profiles.find(p => p.id === o.value)), user.channel_partner));
    return matches.length === 1 ? matches[0].value : '';
}

/**
 * Whether an edit must say who a manager or dealer works under: only when
 * the login type changes or the parent picked differs from the one shown at
 * the start. An email or name edit of a login whose parent is not listed
 * (a channel partner after channel partners were switched off, say) keeps it.
 */
export function needsParentChoice(user, { userType, parentId = '', startParentId = '' }) {
    if (!CPO_CHILD_TYPES.includes(userType) || parentId) return false;
    return userType !== user.user_type || parentId !== startParentId;
}

/**
 * The profile update for an admin's edit. A partner office keeps the office
 * name typed in; a manager or dealer takes the key (and, under an office, the
 * link) of its parent, or keeps both when no parent is chosen and its type
 * stays; a channel partner keeps its own key, or gets its name when it
 * becomes one. Other types drop the partner fields only when the login type
 * changes. Nothing unchanged is written.
 */
export function loginChanges(user, { userType, role, officeName = '', parent = null }) {
    const typeChanged = userType !== user.user_type;
    const next = { channel_partner: user.channel_partner ?? null, parent_profile_id: user.parent_profile_id ?? null };
    if (userType === CPO) {
        const name = clean(officeName).toUpperCase();
        next.channel_partner = sameText(name, user.channel_partner) ? user.channel_partner : name;
        next.parent_profile_id = null;
    } else if (CPO_CHILD_TYPES.includes(userType)) {
        // No parent chosen on an edit that keeps the type: keep the one it has.
        if (parent || typeChanged) {
            const key = partnerKey(parent);
            next.channel_partner = sameText(key, user.channel_partner) ? user.channel_partner : key;
            next.parent_profile_id = parent?.user_type === CPO ? parent.id : null;
        }
    } else if (userType === 'agent') {
        const own = user.user_type === 'agent' ? clean(user.channel_partner) : '';
        next.channel_partner = own ? user.channel_partner : clean(user.name).toUpperCase();
        next.parent_profile_id = null;
    } else if (typeChanged) {
        next.channel_partner = null;
        next.parent_profile_id = null;
    }

    const changes = typeChanged ? { user_type: userType, role: role || userType } : {};
    for (const [column, value] of Object.entries(next)) {
        if ((value || null) !== (user[column] || null)) changes[column] = value || null;
    }
    return changes;
}
