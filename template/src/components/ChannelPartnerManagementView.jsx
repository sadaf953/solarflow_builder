import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Users, Plus, Award, Trash2, Tag, ShieldCheck, BarChart2, X, Check, Edit3, UserCheck, Zap, Building2, ChevronRight, ChevronDown, UserPlus, Phone, Mail, Truck, Stamp, IndianRupee, Search } from 'lucide-react';
import { logActivity, runWrite } from '../utils';
import { useGlobalPopup } from './GlobalPopup';

const normalizeDirectoryLabel = (value) => String(value || '').trim().toLocaleLowerCase();

// Metadata predates case-insensitive duplicate protection, so the same partner
// can exist as (for example) "Demo Coral Solar" and "Demo Coral Solar". Keep the rows in
// Supabase untouched, but expose only one directory item. When available, use
// the already-uppercase row as the canonical UI entry because new entries are
// stored uppercase.
const dedupeChannelPartnerDirectory = (items) => {
    const byName = new Map();
    for (const item of items) {
        const key = normalizeDirectoryLabel(item?.label);
        if (!key) continue;
        const current = byName.get(key);
        const itemLabel = String(item.label).trim();
        const currentLabel = String(current?.label || '').trim();
        const itemIsUppercase = itemLabel === itemLabel.toLocaleUpperCase();
        const currentIsUppercase = currentLabel === currentLabel.toLocaleUpperCase();
        if (!current || (itemIsUppercase && !currentIsUppercase)) byName.set(key, item);
    }
    return [...byName.values()];
};

export default function ChannelPartnerManagementView({ customers = [], currentUser }) {
    const { showAlert } = useGlobalPopup();
    const [partners, setPartners] = useState([]);
    const [brands, setBrands] = useState([]);
    const [registrations, setRegistrations] = useState([]);
    const [integrations, setIntegrations] = useState([]);
    const [inverters, setInverters] = useState([]);
    const [cpos, setCpos] = useState([]);
    const [subAgents, setSubAgents] = useState([]);
    const [selectedCpo, setSelectedCpo] = useState(null);
    const [cpoLeadsCount, setCpoLeadsCount] = useState({});
    const [newPartner, setNewPartner] = useState('');
    const [partnerSearch, setPartnerSearch] = useState('');
    const [newBrand, setNewBrand] = useState('');
    const [newRegistration, setNewRegistration] = useState('');
    const [newIntegration, setNewIntegration] = useState('');
    const [newInverter, setNewInverter] = useState('');
    const [activeManageCategory, setActiveManageCategory] = useState(null);
    const [showPerformers, setShowPerformers] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editingLabel, setEditingLabel] = useState('');
    const [loading, setLoading] = useState(true);

    const [vendors, setVendors] = useState([]);
    const [userProfilesList, setUserProfilesList] = useState([]);
    const [editingVendorName, setEditingVendorName] = useState('');
    const [editingVendorEmail, setEditingVendorEmail] = useState('');
    const [performanceStats, setPerformanceStats] = useState([]);

    // Drivers directory - name, phone and vehicle are entered together and
    // feed the Delivery Batch driver picker.
    const [drivers, setDrivers] = useState([]);
    const [newDriverName, setNewDriverName] = useState('');
    const [newDriverPhone, setNewDriverPhone] = useState('');
    const [newDriverVehicle, setNewDriverVehicle] = useState('');
    const [editingDriverName, setEditingDriverName] = useState('');
    const [editingDriverPhone, setEditingDriverPhone] = useState('');
    const [editingDriverVehicle, setEditingDriverVehicle] = useState('');

    // Stamp makers report - read only. Counts and cost come from data already
    // written by the stamp flow (discom_submission), nothing new is stored.
    const [stampProfiles, setStampProfiles] = useState([]);
    const [stampRecords, setStampRecords] = useState([]);
    const [loadingStampReport, setLoadingStampReport] = useState(false);
    const [stampMonthKey, setStampMonthKey] = useState('all');

    const fetchAllAdminChannelPartners = async () => {
        let all = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('admin')
                .select('channel_partner')
                .is('deleted_at', null)
                .range(from, from + pageSize - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            all = all.concat(data);
            if (data.length < pageSize) break;
            from += pageSize;
        }
        return all;
    };

    // Fetch partners, brands, registrations, integrations, inverters, and CPOs
    const fetchMetadata = async () => {
        try {
            const [metaRes, profilesRes, adminRows] = await Promise.all([
                supabase
                    .from('metadata')
                    .select('id, category, label')
                    .in('category', ['channel_partner', 'module_brand', 'registration_by', 'integration_by', 'inverter_make']),
                supabase
                    .from('demo_profiles')
                    .select('*')
                    .order('created_at', { ascending: false }),
                fetchAllAdminChannelPartners()
            ]);

            if (metaRes.error) throw metaRes.error;
            const data = metaRes.data || [];

            const partnerList = dedupeChannelPartnerDirectory(
                data.filter(d => d.category === 'channel_partner')
            );
            const brandList = data.filter(d => d.category === 'module_brand');
            const registrationList = data.filter(d => d.category === 'registration_by');
            const integrationList = data.filter(d => d.category === 'integration_by');
            const inverterList = data.filter(d => d.category === 'inverter_make');

            setPartners(partnerList);
            setBrands(brandList);
            setRegistrations(registrationList);
            setIntegrations(integrationList);
            setInverters(inverterList);

            if (profilesRes.data) {
                const allProfiles = profilesRes.data;
                setUserProfilesList(allProfiles);
                const cpoList = allProfiles.filter(p => p.user_type === 'channel_partner_office' || p.role === 'Channel Partner Office');
                // Keep both the legacy `agent` accounts and the current
                // `agent2` Channel Partner accounts visible under their CPO.
                const agentList = allProfiles.filter(p =>
                    p.user_type === 'agent' ||
                    p.user_type === 'agent2' ||
                    p.role === 'Channel Partners' ||
                    p.role === 'Channel Partner'
                );
                setCpos(cpoList);
                setSubAgents(agentList);
            }

            if (adminRows) {
                const counts = {};
                adminRows.forEach(c => {
                    const partner = (c.channel_partner || '').trim().toLowerCase();
                    if (partner) {
                        counts[partner] = (counts[partner] || 0) + 1;
                    }
                });
                setCpoLeadsCount(counts);

                const perfCounts = {};
                adminRows.forEach(c => {
                    const name = c.channel_partner?.trim() || 'No Channel Partner';
                    perfCounts[name] = (perfCounts[name] || 0) + 1;
                });
                const sorted = Object.entries(perfCounts)
                    .map(([name, count]) => ({ name, count }))
                    .sort((a, b) => b.count - a.count);
                setPerformanceStats(sorted);
            }
        } catch (e) {
            console.error('Error fetching metadata & CPOs:', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchVendors = async () => {
        try {
            const { data, error } = await supabase.from('vendors').select('*').order('name');
            if (error) throw error;
            // An empty directory shows as empty. It used to be seeded with a
            // fabricated vendor, which then leaked into the vendor dropdowns
            // and could be saved onto a real customer.
            setVendors(data || []);
        } catch (e) {
            console.error('Error fetching vendors:', e);
            setVendors([]);
        }
    };

    const fetchDrivers = async () => {
        try {
            const { data, error } = await supabase.from('drivers').select('*').order('name');
            if (error) throw error;
            setDrivers(data || []);
        } catch (e) {
            console.error('Error fetching drivers:', e);
            setDrivers([]);
        }
    };

    // ─── Drivers: add / edit / delete ─────────────────────────────────────────
    const handleAddDriver = async () => {
        const name = newDriverName.trim();
        const phone = newDriverPhone.trim();
        const vehicle = newDriverVehicle.trim();

        if (!name || !phone || !vehicle) {
            showAlert('Please enter Driver Name, Phone Number and Vehicle Number - all three are required.');
            return;
        }
        if ((drivers || []).some(d => String(d?.name || '').toLowerCase() === name.toLowerCase())) {
            showAlert('A Driver with this name already exists.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('drivers')
                .insert({ name, phone, vehicle_number: vehicle })
                .select();
            if (error) throw error;

            setDrivers(prev => [...prev, ...(data || [])].sort((a, b) => String(a.name).localeCompare(String(b.name))));
            setNewDriverName('');
            setNewDriverPhone('');
            setNewDriverVehicle('');
            await logActivity(currentUser?.id, 'operations', `Added new Driver: "${name}" (${phone}, ${vehicle})`, `Phone: ${phone} | Vehicle: ${vehicle}`);
        } catch (e) {
            console.error('Error adding driver:', e);
            showAlert('Failed to add driver: ' + e.message, { type: 'error' });
        }
    };

    const handleEditDriver = async (id) => {
        const name = editingDriverName.trim();
        const phone = editingDriverPhone.trim();
        const vehicle = editingDriverVehicle.trim();

        if (!name || !phone || !vehicle) {
            showAlert('Driver Name, Phone Number and Vehicle Number are all required.');
            return;
        }
        if ((drivers || []).some(d => d.id !== id && String(d?.name || '').toLowerCase() === name.toLowerCase())) {
            showAlert('Another Driver with this name already exists.');
            return;
        }

        try {
            const res = await runWrite(
                supabase.from('drivers')
                    .update({ name, phone, vehicle_number: vehicle, updated_at: new Date().toISOString() })
                    .eq('id', id).select('id'),
                { action: 'driver update' }
            );
            if (!res.ok) throw res.error;

            setDrivers(prev => prev.map(d => d.id === id ? { ...d, name, phone, vehicle_number: vehicle } : d));
            setEditingId(null);
            await logActivity(currentUser?.id, 'operations', `Updated Driver: "${name}" (${phone}, ${vehicle})`, `Phone: ${phone} | Vehicle: ${vehicle}`);
        } catch (e) {
            console.error('Error updating driver:', e);
            showAlert('Failed to update driver: ' + e.message, { type: 'error' });
        }
    };

    const handleDeleteDriver = async (id, name) => {
        if (!window.confirm(`Delete driver "${name}"?\n\nDelivery batches already saved with this driver keep their details - only future batches lose the option.`)) return;
        try {
            const res = await runWrite(
                supabase.from('drivers').delete().eq('id', id).select('id'),
                { action: 'driver deletion' }
            );
            if (!res.ok) throw res.error;
            setDrivers(prev => prev.filter(d => d.id !== id));
            await logActivity(currentUser?.id, 'operations', `Deleted Driver: "${name}"`);
        } catch (e) {
            console.error('Error deleting driver:', e);
            showAlert('Failed to delete driver: ' + e.message, { type: 'error' });
        }
    };

    const fetchStampReport = async () => {
        setLoadingStampReport(true);
        try {
            const [profRes, recRes] = await Promise.all([
                supabase.from('demo_profiles').select('id, name, email, status').eq('user_type', 'stamp').order('name'),
                supabase.from('admin')
                    .select('id, customer_name, discom_submission')
                    .eq('discom_submission->>stamp_sent', 'true')
                    .is('deleted_at', null),
            ]);
            if (profRes.error) throw profRes.error;
            if (recRes.error) throw recRes.error;

            setStampProfiles(profRes.data || []);
            setStampRecords((recRes.data || []).map(r => {
                const sub = r.discom_submission || {};
                const at = sub.stamp_completed_at ? new Date(sub.stamp_completed_at) : null;
                const valid = at && !isNaN(at.getTime());
                return {
                    id: r.id,
                    by: String(sub.stamp_completed_by || '').trim(),
                    value: Number(sub.stamp_value) || 0,
                    approved: !!sub.stamp_approved,
                    monthKey: valid ? `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}` : 'unknown',
                };
            }));
        } catch (e) {
            console.error('Error loading stamp report:', e);
            showAlert('Could not load the stamp makers report: ' + e.message, { type: 'error' });
        } finally {
            setLoadingStampReport(false);
        }
    };

    useEffect(() => {
        fetchMetadata();
        fetchVendors();
        fetchDrivers();
        fetchStampReport();
    }, []);

    // Add new Channel Partner
    const handleAddPartner = async () => {
        // Stored uppercase so the list cannot drift into "Demo Zephyr Solar" / "Demo Zephyr Solar"
        // pairs again. Leads are unaffected: admin.channel_partner is free text
        // and every comparison against it is case-insensitive.
        const val = newPartner.trim().toUpperCase();
        if (!val) return;

        // Check for duplicates
        if ((partners || []).some(p => normalizeDirectoryLabel(p?.label) === normalizeDirectoryLabel(val))) {
            showAlert('This Channel Partner already exists.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('metadata')
                .insert({ category: 'channel_partner', label: val })
                .select();

            if (error) throw error;

            setPartners(prev => [...prev, ...data]);
            setNewPartner('');
            await logActivity(currentUser?.id, 'operations', `Added new Channel Partner: "${val}"`);
        } catch (e) {
            console.error('Error adding partner:', e);
            showAlert('Error adding partner: ' + e.message, { type: 'error' });
        }
    };

    // Add new Module Brand
    const handleAddBrand = async () => {
        const val = newBrand.trim();
        if (!val) return;

        // Check for duplicates
        if ((brands || []).some(b => String(b?.label || '').toLowerCase() === val.toLowerCase())) {
            showAlert('This Module Brand already exists.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('metadata')
                .insert({ category: 'module_brand', label: val })
                .select();

            if (error) throw error;

            setBrands(prev => [...prev, ...data]);
            setNewBrand('');
            await logActivity(currentUser?.id, 'operations', `Added new Module Brand: "${val}"`);
        } catch (e) {
            console.error('Error adding brand:', e);
            showAlert('Error adding brand: ' + e.message, { type: 'error' });
        }
    };

    // Add new Registration Staff
    const handleAddRegistration = async () => {
        const val = newRegistration.trim();
        if (!val) return;

        // Check for duplicates
        if ((registrations || []).some(r => String(r?.label || '').toLowerCase() === val.toLowerCase())) {
            showAlert('This Registration Staff already exists.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('metadata')
                .insert({ category: 'registration_by', label: val })
                .select();

            if (error) throw error;

            setRegistrations(prev => [...prev, ...data]);
            setNewRegistration('');
            await logActivity(currentUser?.id, 'operations', `Added new Registration Staff: "${val}"`);
        } catch (e) {
            console.error('Error adding registration staff:', e);
            showAlert('Error adding registration staff: ' + e.message, { type: 'error' });
        }
    };

    // Add new Integration Staff
    const handleAddIntegration = async () => {
        const val = newIntegration.trim();
        if (!val) return;

        // Check for duplicates
        if ((integrations || []).some(i => String(i?.label || '').toLowerCase() === val.toLowerCase())) {
            showAlert('This Integration Staff member already exists.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('metadata')
                .insert({ category: 'integration_by', label: val })
                .select();

            if (error) throw error;

            setIntegrations(prev => [...prev, ...data]);
            setNewIntegration('');
            await logActivity(currentUser?.id, 'operations', `Added new Integration Staff: "${val}"`);
        } catch (e) {
            console.error('Error adding integration staff:', e);
            showAlert('Error adding integration staff: ' + e.message, { type: 'error' });
        }
    };

    // Add new Inverter Make
    const handleAddInverter = async () => {
        const val = newInverter.trim();
        if (!val) return;

        // Check for duplicates
        if ((inverters || []).some(i => String(i?.label || '').toLowerCase() === val.toLowerCase())) {
            showAlert('This Inverter Make already exists.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('metadata')
                .insert({ category: 'inverter_make', label: val })
                .select();

            if (error) throw error;

            setInverters(prev => [...prev, ...data]);
            setNewInverter('');
            await logActivity(currentUser?.id, 'operations', `Added new Inverter Make: "${val}"`);
        } catch (e) {
            console.error('Error adding inverter make:', e);
            showAlert('Error adding inverter make: ' + e.message, { type: 'error' });
        }
    };

    // Add new Vendor with User Management verification
    // handleAddVendor removed: vendors are created in User Management, which
    // already inserts the directory row for a new vendor login. This version
    // inserted a vendors row with no account behind it - it even offered to
    // "add to directory anyway" when the email matched no profile, which is how
    // entries flagged "No Login in User Mgmt" were created in the first place.

    // Edit/Rename Vendor
    const handleEditVendor = async (id, oldName, oldEmail) => {
        // The name is displayed read-only above, so oldName is the only name
        // this function can ever write. Kept explicit rather than reading the
        // editing state, so a future UI change cannot quietly re-enable renames.
        const name = oldName;
        const email = editingVendorEmail.trim();
        if (!email) {
            showAlert('Vendor Email cannot be empty.');
            return;
        }

        if (email === oldEmail) {
            setEditingId(null);
            return;
        }

        try {
            const res = await runWrite(
                supabase.from('vendors').update({ email }).eq('id', id).select('id'),
                { action: 'vendor email change' }
            );
            if (!res.ok) throw res.error;

            // No rename branch here any more: the name field is read-only, so
            // admin.vendor can never fall out of step with the login name.

            // Keep the permanent demo profile aligned with the vendor directory.
            let loginNote = '';
            if (email.toLowerCase() !== String(oldEmail || '').trim().toLowerCase() && oldEmail) {
                const { data: linked } = await supabase
                    .from('demo_profiles')
                    .select('id')
                    .ilike('email', String(oldEmail).trim())
                    .limit(1);

                if (linked && linked.length > 0) {
                    const profileId = linked[0].id;
                    const pRes = await runWrite(
                        supabase.from('demo_profiles').update({ email: email.toLowerCase() }).eq('id', profileId).select('id'),
                        { action: 'profile email change' }
                    );
                    if (!pRes.ok) throw pRes.error;
                    loginNote = ' Their demo profile was updated to match.';
                }
            }

            setVendors(prev => prev.map(v => v.id === id ? { ...v, name, email } : v));
            setUserProfilesList(prev => prev.map(p =>
                String(p.email || '').toLowerCase() === String(oldEmail || '').toLowerCase()
                    ? { ...p, email: email.toLowerCase() }
                    : p
            ));
            setEditingId(null);
            if (loginNote) showAlert('Vendor updated.' + loginNote, { type: 'success' });
            await logActivity(currentUser?.id, 'operations', `Updated Vendor: "${oldName}" → "${name}" (${email})`);
        } catch (e) {
            console.error('Error updating vendor:', e);
            showAlert('Error updating vendor: ' + e.message, { type: 'error' });
        }
    };

    // Delete Vendor
    const handleDeleteVendor = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete vendor "${name}"?`)) return;

        try {
            const res = await runWrite(
                supabase.from('vendors').delete().eq('id', id).select('id'),
                { action: 'vendor deletion' }
            );
            if (!res.ok) throw res.error;

            setVendors(prev => prev.filter(v => v.id !== id));
            await logActivity(currentUser?.id, 'operations', `Deleted Vendor: "${name}"`);
        } catch (e) {
            console.error('Error deleting vendor:', e);
            showAlert('Error deleting vendor: ' + e.message, { type: 'error' });
        }
    };

    // Edit/Rename metadata entry and cascade updates to admin table
    const handleEditMetadata = async (id, oldLabel, newLabel, category) => {
        const trimmed = newLabel.trim();
        if (!trimmed || trimmed === oldLabel) {
            setEditingId(null);
            return;
        }

        // Check for duplicates
        let listToCheck = [];
        if (category === 'channel_partner') listToCheck = partners;
        else if (category === 'module_brand') listToCheck = brands;
        else if (category === 'registration_by') listToCheck = registrations;
        else if (category === 'integration_by') listToCheck = integrations;
        else if (category === 'inverter_make') listToCheck = inverters;

        if (listToCheck.some(x => x.id !== id && normalizeDirectoryLabel(x.label) === normalizeDirectoryLabel(trimmed))) {
            showAlert('This entry already exists.');
            return;
        }

        try {
            // Every write below used to check `error` only. An RLS-refused
            // UPDATE matches zero rows and returns error: null, so a rename
            // could land in `metadata` and silently miss `admin` - leaving
            // thousands of records pointing at a label that no longer exists in
            // any dropdown.
            //
            // Zero rows is also LEGITIMATE here (a label nothing uses yet), so
            // count the matching rows first and require the update to touch
            // exactly that many.
            // Records every cascade that actually COMMITTED, so the failure path
            // reports what really happened rather than assuming none of it ran.
            const committed = [];

            const cascade = async (table, column) => {
                const { count, error: countErr } = await supabase
                    .from(table)
                    .select('id', { count: 'exact', head: true })
                    .eq(column, oldLabel);
                if (countErr) throw countErr;
                if (!count) return 0;

                const res = await runWrite(
                    supabase.from(table).update({ [column]: trimmed }).eq(column, oldLabel).select('id'),
                    { action: 'rename' }
                );
                if (!res.ok) throw res.error;

                if (res.rows.length > 0) committed.push({ table, column, rows: res.rows.length });

                if (res.rows.length !== count) {
                    throw new Error(`Only ${res.rows.length} of ${count} ${table} records could be renamed.`);
                }
                return res.rows.length;
            };

            // The dropdown entry itself.
            const metaRes = await runWrite(
                supabase.from('metadata').update({ label: trimmed }).eq('id', id).select('id'),
                { action: 'rename' }
            );
            if (!metaRes.ok) throw metaRes.error;

            // Map category to column in admin table
            let dbField = '';
            if (category === 'channel_partner') dbField = 'channel_partner';
            else if (category === 'module_brand') dbField = 'module_brand';
            else if (category === 'registration_by') dbField = 'registration_by';
            else if (category === 'inverter_make') dbField = 'inverter_make';

            try {
                if (dbField) await cascade('admin', dbField);

                // Keep real logins in step so a channel partner's own portal
                // session reflects the rename immediately.
                if (category === 'channel_partner') await cascade('demo_profiles', 'channel_partner');

                if (category === 'integration_by') await cascade('bom_items', 'integration_by');
            } catch (cascadeErr) {
                // Put back every cascade that DID commit, newest first, then the
                // dropdown entry. Reporting "nothing was changed" while
                // admin.channel_partner already held the new label was the worst
                // outcome: thousands of records pointing at a label that is not
                // in any dropdown, and a message saying not to go looking.
                const stuck = [];
                for (const c of committed.slice().reverse()) {
                    const back = await runWrite(
                        supabase.from(c.table).update({ [c.column]: oldLabel }).eq(c.column, trimmed).select('id'),
                        { action: 'revert' }
                    );
                    if (!back.ok) stuck.push(`${c.rows} ${c.table} record(s)`);
                }

                const revert = await runWrite(
                    supabase.from('metadata').update({ label: oldLabel }).eq('id', id).select('id'),
                    { action: 'revert' }
                );
                if (!revert.ok) stuck.push('the dropdown entry');

                throw new Error(
                    stuck.length === 0
                        ? `${cascadeErr.message} The rename was cancelled and everything was put back.`
                        : `${cascadeErr.message} The rename was cancelled, but ${stuck.join(' and ')} `
                          + `could NOT be put back and still read "${trimmed}". Restore them to "${oldLabel}" manually.`
                );
            }

            // Update state
            if (category === 'channel_partner') {
                setPartners(prev => prev.map(x => x.id === id ? { ...x, label: trimmed } : x));
            } else if (category === 'module_brand') {
                setBrands(prev => prev.map(x => x.id === id ? { ...x, label: trimmed } : x));
            } else if (category === 'registration_by') {
                setRegistrations(prev => prev.map(x => x.id === id ? { ...x, label: trimmed } : x));
            } else if (category === 'integration_by') {
                setIntegrations(prev => prev.map(x => x.id === id ? { ...x, label: trimmed } : x));
            } else if (category === 'inverter_make') {
                setInverters(prev => prev.map(x => x.id === id ? { ...x, label: trimmed } : x));
            }

            await logActivity(currentUser?.id, 'operations', `Renamed ${category} from "${oldLabel}" to "${trimmed}"`);
        } catch (e) {
            console.error('Error renaming metadata:', e);
            showAlert('Error renaming metadata: ' + e.message, { type: 'error' });
        } finally {
            setEditingId(null);
        }
    };

    // Delete metadata entry.
    //
    // This used to CASCADE A NULL over every matching customer -
    // `admin.update({ channel_partner: null }).eq('channel_partner', label)` -
    // so removing a dropdown option silently erased that field on real records.
    // For channel_partner that is unrecoverable AND breaks partner-scoped RLS,
    // because a record with a null channel_partner is invisible to the branch
    // that owns it.
    //
    // Deleting an option now removes the OPTION only. Existing records keep
    // their value; every dropdown already renders an unrecognised stored value
    // rather than blanking, so nothing is lost or hidden.
    const handleDeleteMetadata = async (id, category, label) => {
        const TARGET = {
            channel_partner: { table: 'admin', column: 'channel_partner', noun: 'customer records' },
            module_brand:    { table: 'admin', column: 'module_brand',    noun: 'customer records' },
            registration_by: { table: 'admin', column: 'registration_by', noun: 'customer records' },
            inverter_make:   { table: 'admin', column: 'inverter_make',   noun: 'customer records' },
            integration_by:  { table: 'bom_items', column: 'integration_by', noun: 'BOM lines' },
        }[category];

        try {
            let inUse = 0;
            if (TARGET) {
                const { count, error: countErr } = await supabase
                    .from(TARGET.table)
                    .select('id', { count: 'exact', head: true })
                    .eq(TARGET.column, label);
                if (countErr) throw countErr;
                inUse = count || 0;
            }

            const warning = inUse > 0
                ? `"${label}" is still used by ${inUse} ${TARGET.noun}.\n\n`
                  + `Those records will KEEP the value "${label}" - nothing is erased. `
                  + `It just stops being offered in the dropdown for new entries.\n\nRemove it from the list?`
                : `Remove "${label}" from the list?`;

            if (!window.confirm(warning)) return;

            const res = await runWrite(
                supabase.from('metadata').delete().eq('id', id).select('id'),
                { action: 'deletion' }
            );
            if (!res.ok) throw res.error;

            if (category === 'channel_partner')      setPartners(prev => prev.filter(p => p.id !== id));
            else if (category === 'module_brand')    setBrands(prev => prev.filter(b => b.id !== id));
            else if (category === 'registration_by') setRegistrations(prev => prev.filter(r => r.id !== id));
            else if (category === 'integration_by')  setIntegrations(prev => prev.filter(i => i.id !== id));
            else if (category === 'inverter_make')   setInverters(prev => prev.filter(i => i.id !== id));

            await logActivity(currentUser?.id, 'operations',
                `Removed ${category} option: "${label}"${inUse > 0 ? ` (${inUse} ${TARGET.noun} keep the value)` : ''}`);
        } catch (e) {
            console.error('Error deleting metadata:', e);
            showAlert('Error deleting metadata: ' + e.message, { type: 'error' });
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 max-w-7xl mx-auto">
            {/* Header info */}
            <div className="flex items-center gap-3 bg-stone-900 text-white p-6 rounded-[32px] shadow-sm">
                <ShieldCheck className="w-8 h-8 text-amber-400" />
                <div>
                    <h2 className="text-lg font-black tracking-tight">Operations</h2>
                    <p className="text-xs text-stone-400">Admin Control Panel • Configure active directory listings and view top sales performance</p>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-48">
                    <div className="w-8 h-8 border-4 border-stone-900 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div className="space-y-8 animate-in fade-in duration-700">

                    <div className="space-y-6">

                        {/* Directories Grid - full width. Top 5 Performers used to
                            take the right third of this row; it is a glance metric,
                            not something the team works from, so the directories
                            they actually click now get the whole width and fit
                            4-across instead of 3. */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
                                <Users className="w-4 h-4 text-stone-700" />
                                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">Directories & Allotments</h3>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {/* Channel Partner Offices (CPO) Card */}
                                <button
                                    onClick={() => {
                                        setSelectedCpo(null);
                                        setActiveManageCategory('cpo_office');
                                    }}
                                    className="bg-white rounded-[24px] p-5 border border-stone-150 shadow-xs flex flex-col justify-between h-44 hover:shadow-md hover:border-amber-400 hover:bg-amber-50/20 active:scale-[0.98] transition-all text-left focus:outline-none w-full group relative overflow-hidden"
                                >
                                    <div className="space-y-3.5 w-full">
                                        <div className="p-2.5 bg-amber-50 group-hover:bg-amber-100 rounded-xl w-fit transition-colors duration-305 text-amber-700">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-stone-800 text-xs group-hover:text-amber-700 transition-colors duration-305">CPO Offices & Dealers</h3>
                                            <p className="text-[11px] text-stone-400 font-medium mt-0.5">{cpos.length} registered office branches</p>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1 transition-colors duration-305">
                                        Manage Offices & Teams <span className="transition-transform group-hover:translate-x-1.5 duration-305">→</span>
                                    </span>
                                </button>

                                {/* Channel Partners Card */}
                                <button
                                    onClick={() => setActiveManageCategory('channel_partner')}
                                    className="bg-white rounded-[24px] p-5 border border-stone-150 shadow-xs flex flex-col justify-between h-44 hover:shadow-md hover:border-stone-300 hover:bg-stone-50/50 active:scale-[0.98] transition-all text-left focus:outline-none w-full group"
                                >
                                    <div className="space-y-3.5 w-full">
                                        <div className="p-2.5 bg-stone-50 group-hover:bg-amber-100/70 rounded-xl w-fit transition-colors duration-305">
                                            <Users className="w-5 h-5 text-stone-600 group-hover:text-amber-600 transition-colors duration-305" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-stone-800 text-xs group-hover:text-amber-600 transition-colors duration-305">Channel Partner Directory</h3>
                                            <p className="text-[11px] text-stone-400 font-medium mt-0.5">{partners.length} active partners</p>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-stone-600 group-hover:text-amber-650 flex items-center gap-1 transition-colors duration-305">
                                        Open Manager <span className="transition-transform group-hover:translate-x-1.5 duration-305">→</span>
                                    </span>
                                </button>

                                {/* Module Brands Card */}
                                <button
                                    onClick={() => setActiveManageCategory('module_brand')}
                                    className="bg-white rounded-[24px] p-5 border border-stone-150 shadow-xs flex flex-col justify-between h-44 hover:shadow-md hover:border-stone-300 hover:bg-stone-50/50 active:scale-[0.98] transition-all text-left focus:outline-none w-full group"
                                >
                                    <div className="space-y-3.5 w-full">
                                        <div className="p-2.5 bg-stone-50 group-hover:bg-amber-100/70 rounded-xl w-fit transition-colors duration-305">
                                            <Tag className="w-5 h-5 text-stone-600 group-hover:text-amber-600 transition-colors duration-305" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-stone-800 text-xs group-hover:text-amber-600 transition-colors duration-305">Module Brands Directory</h3>
                                            <p className="text-[11px] text-stone-400 font-medium mt-0.5">{brands.length} active brands</p>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-stone-600 group-hover:text-amber-650 flex items-center gap-1 transition-colors duration-305">
                                        Open Manager <span className="transition-transform group-hover:translate-x-1.5 duration-305">→</span>
                                    </span>
                                </button>

                                {/* Registration Staff Card */}
                                <button
                                    onClick={() => setActiveManageCategory('registration_by')}
                                    className="bg-white rounded-[24px] p-5 border border-stone-150 shadow-xs flex flex-col justify-between h-44 hover:shadow-md hover:border-stone-300 hover:bg-stone-50/50 active:scale-[0.98] transition-all text-left focus:outline-none w-full group"
                                >
                                    <div className="space-y-3.5 w-full">
                                        <div className="p-2.5 bg-stone-50 group-hover:bg-amber-100/70 rounded-xl w-fit transition-colors duration-305">
                                            <Award className="w-5 h-5 text-stone-600 group-hover:text-amber-600 transition-colors duration-305" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-stone-800 text-xs group-hover:text-amber-600 transition-colors duration-305">Registration Staff</h3>
                                            <p className="text-[11px] text-stone-400 font-medium mt-0.5">{registrations.length} active processors</p>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-stone-600 group-hover:text-amber-650 flex items-center gap-1 transition-colors duration-305">
                                        Open Manager <span className="transition-transform group-hover:translate-x-1.5 duration-305">→</span>
                                    </span>
                                </button>

                                {/* Inverter Make Card */}
                                <button
                                    onClick={() => setActiveManageCategory('inverter_make')}
                                    className="bg-white rounded-[24px] p-5 border border-stone-150 shadow-xs flex flex-col justify-between h-44 hover:shadow-md hover:border-stone-300 hover:bg-stone-50/50 active:scale-[0.98] transition-all text-left focus:outline-none w-full group"
                                >
                                    <div className="space-y-3.5 w-full">
                                        <div className="p-2.5 bg-stone-50 group-hover:bg-amber-100/70 rounded-xl w-fit transition-colors duration-305">
                                            <Zap className="w-5 h-5 text-stone-600 group-hover:text-amber-600 transition-colors duration-305" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-stone-800 text-xs group-hover:text-amber-600 transition-colors duration-305">Inverter Make Directory</h3>
                                            <p className="text-[11px] text-stone-400 font-medium mt-0.5">{inverters.length} active inverter brands</p>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-stone-600 group-hover:text-amber-650 flex items-center gap-1 transition-colors duration-305">
                                        Open Manager <span className="transition-transform group-hover:translate-x-1.5 duration-305">→</span>
                                    </span>
                                </button>

                                {/* Integration Staff Card */}
                                <button
                                    onClick={() => setActiveManageCategory('integration_by')}
                                    className="bg-white rounded-[24px] p-5 border border-stone-150 shadow-xs flex flex-col justify-between h-44 hover:shadow-md hover:border-stone-300 hover:bg-stone-50/50 active:scale-[0.98] transition-all text-left focus:outline-none w-full group"
                                >
                                    <div className="space-y-3.5 w-full">
                                        <div className="p-2.5 bg-stone-50 group-hover:bg-amber-100/70 rounded-xl w-fit transition-colors duration-305">
                                            <UserCheck className="w-5 h-5 text-stone-600 group-hover:text-amber-600 transition-colors duration-305" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-stone-800 text-xs group-hover:text-amber-600 transition-colors duration-305">Integration Staff</h3>
                                            <p className="text-[11px] text-stone-400 font-medium mt-0.5">{integrations.length} active members</p>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-stone-600 group-hover:text-amber-650 flex items-center gap-1 transition-colors duration-305">
                                        Open Manager <span className="transition-transform group-hover:translate-x-1.5 duration-305">→</span>
                                    </span>
                                </button>

                                {/* Vendors Card */}
                                <button
                                    onClick={() => setActiveManageCategory('vendor')}
                                    className="bg-white rounded-[24px] p-5 border border-stone-150 shadow-xs flex flex-col justify-between h-44 hover:shadow-md hover:border-stone-300 hover:bg-stone-50/50 active:scale-[0.98] transition-all text-left focus:outline-none w-full group"
                                >
                                    <div className="space-y-3.5 w-full">
                                        <div className="p-2.5 bg-stone-50 group-hover:bg-amber-100/70 rounded-xl w-fit transition-colors duration-305">
                                            <Users className="w-5 h-5 text-stone-600 group-hover:text-amber-600 transition-colors duration-305" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-stone-800 text-xs group-hover:text-amber-600 transition-colors duration-305">Vendors Allotment</h3>
                                            <p className="text-[11px] text-stone-400 font-medium mt-0.5">{vendors.length} active vendors</p>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-stone-600 group-hover:text-amber-650 flex items-center gap-1 transition-colors duration-305">
                                        Open Manager <span className="transition-transform group-hover:translate-x-1.5 duration-305">→</span>
                                    </span>
                                </button>

                                {/* Stamp Makers Card */}
                                <button
                                    onClick={() => setActiveManageCategory('stamp_report')}
                                    className="bg-white rounded-[24px] p-5 border border-stone-150 shadow-xs flex flex-col justify-between h-44 hover:shadow-md hover:border-stone-300 hover:bg-stone-50/50 active:scale-[0.98] transition-all text-left focus:outline-none w-full group"
                                >
                                    <div className="space-y-3.5 w-full">
                                        <div className="p-2.5 bg-stone-50 group-hover:bg-amber-100/70 rounded-xl w-fit transition-colors duration-305">
                                            <Stamp className="w-5 h-5 text-stone-600 group-hover:text-amber-600 transition-colors duration-305" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-stone-800 text-xs group-hover:text-amber-600 transition-colors duration-305">Stamp Makers</h3>
                                            <p className="text-[11px] text-stone-400 font-medium mt-0.5">{stampProfiles.length} people · {stampRecords.length} stamps done</p>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-stone-600 group-hover:text-amber-650 flex items-center gap-1 transition-colors duration-305">
                                        View Report <span className="transition-transform group-hover:translate-x-1.5 duration-305">→</span>
                                    </span>
                                </button>

                                {/* Drivers Card */}
                                <button
                                    onClick={() => setActiveManageCategory('driver')}
                                    className="bg-white rounded-[24px] p-5 border border-stone-150 shadow-xs flex flex-col justify-between h-44 hover:shadow-md hover:border-stone-300 hover:bg-stone-50/50 active:scale-[0.98] transition-all text-left focus:outline-none w-full group"
                                >
                                    <div className="space-y-3.5 w-full">
                                        <div className="p-2.5 bg-stone-50 group-hover:bg-amber-100/70 rounded-xl w-fit transition-colors duration-305">
                                            <Truck className="w-5 h-5 text-stone-600 group-hover:text-amber-600 transition-colors duration-305" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-stone-800 text-xs group-hover:text-amber-600 transition-colors duration-305">Drivers</h3>
                                            <p className="text-[11px] text-stone-400 font-medium mt-0.5">{drivers.length} registered drivers</p>
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-stone-600 group-hover:text-amber-650 flex items-center gap-1 transition-colors duration-305">
                                        Open Manager <span className="transition-transform group-hover:translate-x-1.5 duration-305">→</span>
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Demoted from the right-hand column to a collapsed strip:
                            it is reference, not a working surface. Collapsed by
                            default so it costs nothing until someone wants it. */}
                        <div className="bg-white rounded-[24px] border border-stone-150 shadow-xs overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setShowPerformers(v => !v)}
                                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-stone-50/70 transition-colors cursor-pointer text-left"
                            >
                                <span className="flex items-center gap-2 min-w-0">
                                    <Award className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                    <span className="text-xs font-bold text-stone-850 uppercase tracking-wider">Top 5 Performers</span>
                                    {!showPerformers && performanceStats.length > 0 && (
                                        <span className="text-[11px] text-stone-400 font-medium truncate">
                                            · {performanceStats[0].name} leads with {performanceStats[0].count}
                                        </span>
                                    )}
                                </span>
                                <ChevronDown
                                    className={`w-4 h-4 text-stone-400 flex-shrink-0 transition-transform ${showPerformers ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {showPerformers && (
                                <div className="px-5 pb-5 pt-1 space-y-3 border-t border-stone-100">
                                    {performanceStats.length > 0 ? (
                                        performanceStats.slice(0, 5).map((item, idx) => {
                                            const totalProjects = performanceStats.reduce((sum, x) => sum + x.count, 0);
                                            const perc = totalProjects > 0 ? (item.count / totalProjects) * 100 : 0;
                                            const isFirst = idx === 0 && item.name !== 'No Channel Partner';
                                            return (
                                                <div key={item.name} className="flex flex-col">
                                                    <div className="flex justify-between text-[11px] font-bold text-stone-600 mb-1 tracking-tight">
                                                        <span className="flex items-center gap-1.5 truncate">
                                                            {isFirst && <span className="text-amber-500">🏆</span>}
                                                            <span className="truncate">{item.name}</span>
                                                        </span>
                                                        <span className="text-stone-400 flex-shrink-0">{item.count} leads ({perc.toFixed(0)}%)</span>
                                                    </div>
                                                    <div className="h-2 bg-stone-50 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-amber-400 transition-all duration-1000 rounded-full"
                                                            style={{ width: `${perc}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <p className="text-xs text-stone-400 italic text-center py-4">No performance metrics available.</p>
                                    )}
                                </div>
                            )}
                        </div>

                    </div>

                </div>
            )}

            {/* Manage Directory Full Modal */}
            {activeManageCategory && (() => {
                if (activeManageCategory === 'cpo_office') {
                    return (
                        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden border border-stone-100 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
                                {/* Modal Header */}
                                <div className="bg-stone-900 px-6 py-5 flex justify-between items-center text-white">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                                            <Building2 size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold tracking-tight">Channel Partner Offices & Dealers</h3>
                                            <p className="text-[10px] text-stone-400 mt-0.5 uppercase font-bold tracking-wider">{cpos.length} Registered CPO Branches</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setActiveManageCategory(null);
                                            setSelectedCpo(null);
                                        }}
                                        className="text-stone-400 hover:text-white p-2 hover:bg-stone-800 rounded-xl transition"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Modal Body */}
                                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                                    {selectedCpo ? (
                                        // Drilldown: Field Agents under Selected CPO
                                        <div className="space-y-4">
                                            <button
                                                onClick={() => setSelectedCpo(null)}
                                                className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-xl transition"
                                            >
                                                ← Back to all CPO Offices
                                            </button>

                                            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80 flex justify-between items-center">
                                                <div>
                                                    <h4 className="text-sm font-extrabold text-stone-850">{selectedCpo.name}</h4>
                                                    <p className="text-xs text-stone-500 font-medium">Branch Partner: <strong className="text-stone-700">{selectedCpo.channel_partner || selectedCpo.name}</strong> • {selectedCpo.email}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg bg-stone-900 text-white">
                                                        {cpoLeadsCount[(selectedCpo.channel_partner || selectedCpo.name || '').trim().toLowerCase()] || 0} Total Leads
                                                    </span>
                                                </div>
                                            </div>

                                            <div>
                                                <h5 className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">
                                                    Dealers Registered Under this CPO
                                                </h5>
                                                {(() => {
                                                    const partnerKey = (selectedCpo.channel_partner || selectedCpo.name || '').trim().toLowerCase();
                                                    const team = subAgents.filter(a => 
                                                        a.created_by === selectedCpo.id ||
                                                        (a.channel_partner && a.channel_partner.trim().toLowerCase() === partnerKey)
                                                    );

                                                    if (team.length === 0) {
                                                        return (
                                                            <div className="text-center py-8 bg-stone-50/50 rounded-2xl border border-stone-100">
                                                                <Users className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                                                                <p className="text-xs text-stone-500 font-medium">No dealers added by this CPO yet.</p>
                                                                <p className="text-[10px] text-stone-400 mt-0.5">When this CPO logs in and adds dealers, they will appear here.</p>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div className="space-y-2">
                                                            {team.map(agent => (
                                                                <div key={agent.id} className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-stone-200/70 hover:border-amber-300 transition-all shadow-xs">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold">
                                                                            {agent.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'A'}
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-xs font-bold text-stone-800">{agent.name}</p>
                                                                            <p className="text-[10px] text-stone-400">{agent.email}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${agent.status === 'inactive' ? 'bg-stone-100 text-stone-400' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                                                                            {agent.status || 'active'}
                                                                        </span>
                                                                        <span className="text-[10px] text-stone-400 font-medium">
                                                                            {agent.created_at ? new Date(agent.created_at).toLocaleDateString() : ''}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    ) : (
                                        // Main CPO List
                                        <div className="space-y-3">
                                            {cpos.length === 0 ? (
                                                <div className="text-center py-10 bg-stone-50 rounded-2xl border border-stone-100">
                                                    <Building2 className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                                                    <p className="text-xs text-stone-600 font-bold">No Channel Partner Offices registered yet.</p>
                                                    <p className="text-[10px] text-stone-400 mt-1">Create a Channel Partner Office account in User Management. It will appear here automatically.</p>
                                                </div>
                                            ) : (
                                                cpos.map(cpo => {
                                                    const partnerKey = (cpo.channel_partner || cpo.name || '').trim().toLowerCase();
                                                    const teamCount = subAgents.filter(a => 
                                                        a.created_by === cpo.id ||
                                                        (a.channel_partner && a.channel_partner.trim().toLowerCase() === partnerKey)
                                                    ).length;
                                                    const leadsCount = cpoLeadsCount[partnerKey] || 0;

                                                    return (
                                                        <div
                                                            key={cpo.id}
                                                            onClick={() => setSelectedCpo(cpo)}
                                                            className="p-4 bg-stone-50 hover:bg-amber-50/40 rounded-2xl border border-stone-200/70 hover:border-amber-300 transition-all cursor-pointer flex flex-col sm:flex-row justify-between sm:items-center gap-3 group"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center font-bold text-xs shadow-xs group-hover:bg-amber-600 transition-colors">
                                                                    {cpo.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'CP'}
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <h4 className="text-xs font-bold text-stone-900 group-hover:text-amber-800 transition-colors">{cpo.name}</h4>
                                                                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${cpo.status === 'inactive' ? 'bg-stone-200 text-stone-500' : 'bg-emerald-100 text-emerald-800'}`}>
                                                                            {cpo.status || 'active'}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-[10px] text-stone-400 font-medium mt-0.5">Partner Branch: <strong className="text-stone-600">{cpo.channel_partner || cpo.name}</strong> • {cpo.email}</p>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-3 self-end sm:self-center">
                                                                <div className="text-right">
                                                                    <span className="text-xs font-extrabold text-stone-900 block">{teamCount} Dealers</span>
                                                                    <span className="text-[10px] font-semibold text-amber-700">{leadsCount} Leads</span>
                                                                </div>
                                                                <div className="p-1.5 rounded-lg bg-stone-200/70 group-hover:bg-amber-200 text-stone-600 group-hover:text-amber-900 transition-colors">
                                                                    <ChevronRight size={14} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                }

                let title = '';
                let list = [];
                let inputVal = '';
                let setInputVal = null;
                let addHandler = null;
                let placeholder = '';

                if (activeManageCategory === 'channel_partner') {
                    title = 'Manage Channel Partners';
                    list = partners;
                    inputVal = newPartner;
                    setInputVal = setNewPartner;
                    addHandler = handleAddPartner;
                    placeholder = 'Enter channel partner name...';
                } else if (activeManageCategory === 'module_brand') {
                    title = 'Manage Module Brands';
                    list = brands;
                    inputVal = newBrand;
                    setInputVal = setNewBrand;
                    addHandler = handleAddBrand;
                    placeholder = 'Enter module brand name...';
                } else if (activeManageCategory === 'inverter_make') {
                    title = 'Manage Inverter Makes';
                    list = inverters;
                    inputVal = newInverter;
                    setInputVal = setNewInverter;
                    addHandler = handleAddInverter;
                    placeholder = 'Enter inverter make (e.g. DemoGrid, Deye, Solis)...';
                } else if (activeManageCategory === 'registration_by') {
                    title = 'Manage Registration Staff';
                    list = registrations;
                    inputVal = newRegistration;
                    setInputVal = setNewRegistration;
                    addHandler = handleAddRegistration;
                    placeholder = 'Enter processor name...';
                } else if (activeManageCategory === 'integration_by') {
                    title = 'Manage Integration Staff';
                    list = integrations;
                    inputVal = newIntegration;
                    setInputVal = setNewIntegration;
                    addHandler = handleAddIntegration;
                    placeholder = 'Enter integration staff name...';
                } else if (activeManageCategory === 'vendor') {
                    title = 'Manage Vendors Allotment';
                    list = vendors;
                    placeholder = 'Enter vendor name...';
                } else if (activeManageCategory === 'driver') {
                    title = 'Manage Drivers';
                    list = drivers;
                    placeholder = 'Enter driver name...';
                }

                const isChannelPartnerCat = activeManageCategory === 'channel_partner';
                const isVendorCat = activeManageCategory === 'vendor';
                const isDriverCat = activeManageCategory === 'driver';

                const displayedList = isChannelPartnerCat && partnerSearch.trim()
                    ? list.filter(item => (item.label || '').toLowerCase().includes(partnerSearch.trim().toLowerCase()))
                    : list;

                return (
                    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-xl overflow-hidden border border-stone-100 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">

                            {/* Modal Header */}
                            <div className="bg-stone-900 px-6 py-5 flex justify-between items-center text-white">
                                <div>
                                    <h3 className="text-sm font-bold tracking-tight">{title}</h3>
                                    <p className="text-[10px] text-stone-400 mt-1 uppercase font-bold tracking-wider">{list.length} directory listings</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setActiveManageCategory(null);
                                        setEditingId(null);
                                        setPartnerSearch('');
                                    }}
                                    className="text-stone-400 hover:text-white p-2 hover:bg-stone-800 rounded-xl transition"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Add / Search Section */}
                            {isChannelPartnerCat ? (
                                <div className="p-4 border-b border-stone-100 bg-stone-50/50 space-y-2">
                                    <div className="relative flex items-center">
                                        <Search className="w-4 h-4 text-stone-400 absolute left-3.5 pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Search channel partner directory..."
                                            value={partnerSearch}
                                            onChange={e => setPartnerSearch(e.target.value)}
                                            className="w-full bg-white border border-stone-200 rounded-xl pl-10 pr-9 py-2 text-sm focus:border-amber-400 outline-none transition"
                                            autoFocus
                                        />
                                        {partnerSearch && (
                                            <button
                                                type="button"
                                                onClick={() => setPartnerSearch('')}
                                                className="absolute right-3 text-stone-400 hover:text-stone-600 p-1 cursor-pointer"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-stone-500 font-medium">
                                        Channel Partners are managed in <b className="text-stone-700">User Management</b>. Adding from Operations is locked to keep directories aligned.
                                    </p>
                                </div>
                            ) : isDriverCat ? (
                                <div className="p-4 border-b border-stone-100 bg-stone-50/50 space-y-2">
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="text"
                                            placeholder="Driver Name..."
                                            value={newDriverName}
                                            onChange={e => setNewDriverName(e.target.value)}
                                            className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm focus:border-amber-400 outline-none transition"
                                        />
                                        <input
                                            type="tel"
                                            inputMode="numeric"
                                            placeholder="Phone Number..."
                                            value={newDriverPhone}
                                            onChange={e => setNewDriverPhone(e.target.value.replace(/[^0-9+\-\s]/g, ''))}
                                            className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm focus:border-amber-400 outline-none transition"
                                        />
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="text"
                                            placeholder="Vehicle Number..."
                                            value={newDriverVehicle}
                                            onChange={e => setNewDriverVehicle(e.target.value.toUpperCase())}
                                            onKeyDown={e => e.key === 'Enter' && handleAddDriver()}
                                            className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm focus:border-amber-400 outline-none transition uppercase"
                                        />
                                        <button
                                            onClick={handleAddDriver}
                                            className="flex items-center justify-center gap-1.5 bg-stone-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors shadow-md sm:w-32"
                                        >
                                            <Plus className="w-4 h-4" /> Add
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-stone-400 font-medium">All three fields are required. The name appears in the Delivery Batch driver list, and picking it fills in the phone and vehicle automatically.</p>
                                </div>
                            ) : isVendorCat ? (
                                <div className="p-4 border-b border-stone-100 bg-stone-50/50">
                                    {/* Vendors are created in User Management, not here. Adding one
                                        in this list made a directory entry with no login behind it -
                                        which is exactly what the "No Login in User Mgmt" badge flags. */}
                                    <p className="text-[11px] text-stone-500 font-medium">
                                        Vendors are added in <b className="text-stone-700">User Management</b>, so the login and the
                                        directory entry are created together. This list is for reviewing them and correcting an email.
                                    </p>
                                </div>
                            ) : (
                                <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex gap-2">
                                    <input
                                        type="text"
                                        placeholder={placeholder}
                                        value={inputVal}
                                        onChange={e => setInputVal(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && addHandler()}
                                        className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm focus:border-amber-400 outline-none transition"
                                    />
                                    <button
                                        onClick={addHandler}
                                        className="flex items-center gap-1.5 bg-stone-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors shadow-md"
                                    >
                                        <Plus className="w-4 h-4" /> Add
                                    </button>
                                </div>
                            )}

                            {/* List Section */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {displayedList.length > 0 ? (
                                    displayedList.map(item => {
                                        const isEditing = editingId === item.id;
                                        return (
                                            <div key={item.id} className="flex justify-between items-center bg-stone-50 px-4 py-2.5 rounded-xl border border-stone-100 hover:bg-stone-100/50 transition-colors">
                                                {isEditing ? (
                                                    isDriverCat ? (
                                                        <div className="flex-1 flex flex-col sm:flex-row gap-2 max-w-lg">
                                                            <input
                                                                type="text"
                                                                value={editingDriverName}
                                                                onChange={e => setEditingDriverName(e.target.value)}
                                                                className="flex-1 bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 font-bold text-stone-800"
                                                                placeholder="Name"
                                                                autoFocus
                                                            />
                                                            <input
                                                                type="tel"
                                                                inputMode="numeric"
                                                                value={editingDriverPhone}
                                                                onChange={e => setEditingDriverPhone(e.target.value.replace(/[^0-9+\-\s]/g, ''))}
                                                                className="flex-1 bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium text-stone-700"
                                                                placeholder="Phone"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={editingDriverVehicle}
                                                                onChange={e => setEditingDriverVehicle(e.target.value.toUpperCase())}
                                                                onKeyDown={e => e.key === 'Enter' && handleEditDriver(item.id)}
                                                                className="flex-1 bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium text-stone-700 uppercase"
                                                                placeholder="Vehicle"
                                                            />
                                                        </div>
                                                    ) : isVendorCat ? (
                                                        <div className="flex-1 flex gap-2 max-w-md">
                                                            {/* Read-only on purpose. The vendor's NAME is the join key:
                                                                admin.vendor stores it, and vendor RLS matches it against the
                                                                profile name. Renaming here moved every job to the new name
                                                                while the login kept the old one - the vendor stopped seeing
                                                                their own work. Stays locked until identities move to UUIDs. */}
                                                            <span
                                                                className="flex-1 bg-stone-100 border border-stone-200 rounded-lg px-2.5 py-1 text-xs font-bold text-stone-500 truncate flex items-center"
                                                                title="Vendor names cannot be changed - they link the vendor to their jobs"
                                                            >
                                                                {editingVendorName}
                                                            </span>
                                                            <input
                                                                type="email"
                                                                value={editingVendorEmail}
                                                                onChange={e => setEditingVendorEmail(e.target.value)}
                                                                className="flex-1 bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium text-stone-700"
                                                                placeholder="Email"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            value={editingLabel}
                                                            onChange={e => setEditingLabel(e.target.value)}
                                                            onKeyDown={e => e.key === 'Enter' && handleEditMetadata(item.id, item.label, editingLabel, activeManageCategory)}
                                                            className="flex-1 bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 font-bold text-stone-800 max-w-md"
                                                            autoFocus
                                                        />
                                                    )
                                                ) : (
                                                    isDriverCat ? (
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-xs font-bold text-stone-850 tracking-tight">{item.name}</span>
                                                            <span className="text-[10px] text-stone-400 font-medium flex items-center gap-2.5">
                                                                <span className="flex items-center gap-1"><Phone size={9} /> {item.phone || '–'}</span>
                                                                <span className="flex items-center gap-1"><Truck size={9} /> {item.vehicle_number || '–'}</span>
                                                            </span>
                                                        </div>
                                                    ) : isVendorCat ? (
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-stone-850 tracking-tight">{item.name}</span>
                                                                {userProfilesList.some(p => String(p.email || '').toLowerCase() === String(item.email || '').toLowerCase()) ? (
                                                                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                                                                        ✓ User Account Active
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                                                                        ⚠ No Login in User Mgmt
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] text-stone-400 font-medium">{item.email}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs font-bold text-stone-700 tracking-tight">{item.label}</span>
                                                    )
                                                )}

                                                <div className="flex items-center gap-2">
                                                    {isEditing ? (
                                                        <button
                                                            onClick={() => isDriverCat ? handleEditDriver(item.id) : isVendorCat ? handleEditVendor(item.id, item.name, item.email) : handleEditMetadata(item.id, item.label, editingLabel, activeManageCategory)}
                                                            className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-lg transition"
                                                            title="Save changes"
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                setEditingId(item.id);
                                                                if (isDriverCat) {
                                                                    setEditingDriverName(item.name || '');
                                                                    setEditingDriverPhone(item.phone || '');
                                                                    setEditingDriverVehicle(item.vehicle_number || '');
                                                                } else if (isVendorCat) {
                                                                    setEditingVendorName(item.name);
                                                                    setEditingVendorEmail(item.email);
                                                                } else {
                                                                    setEditingLabel(item.label);
                                                                }
                                                            }}
                                                            className="text-stone-400 hover:text-stone-700 hover:bg-stone-200 p-1.5 rounded-lg transition"
                                                            title="Edit name"
                                                        >
                                                            <Edit3 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}

                                                    <button
                                                        onClick={() => isDriverCat ? handleDeleteDriver(item.id, item.name) : isVendorCat ? handleDeleteVendor(item.id, item.name) : handleDeleteMetadata(item.id, activeManageCategory, item.label)}
                                                        className="text-stone-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                                                        title="Delete entry"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className="text-xs text-stone-400 italic text-center py-8">No entries found in this directory.</p>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Stamp Makers report - read only */}
            {activeManageCategory === 'stamp_report' && (() => {
                const monthKeys = Array.from(new Set(stampRecords.map(r => r.monthKey)))
                    .filter(k => k !== 'unknown').sort().reverse();
                const scoped = stampMonthKey === 'all'
                    ? stampRecords
                    : stampRecords.filter(r => r.monthKey === stampMonthKey);

                // Group by who completed it. Names not matching a Stamp Guy
                // account still show, so nothing is silently left out of a payout.
                const byPerson = new Map();
                stampProfiles.forEach(p => byPerson.set(p.name.trim().toLowerCase(), { name: p.name, status: p.status, count: 0, value: 0, approved: 0 }));
                scoped.forEach(r => {
                    const key = r.by.toLowerCase();
                    if (!key) return;
                    if (!byPerson.has(key)) byPerson.set(key, { name: r.by, status: 'no account', count: 0, value: 0, approved: 0 });
                    const row = byPerson.get(key);
                    row.count += 1;
                    row.value += r.value;
                    if (r.approved) row.approved += 1;
                });
                const rows = Array.from(byPerson.values()).sort((a, b) => b.count - a.count);
                const totalCount = rows.reduce((s, r) => s + r.count, 0);
                const totalValue = rows.reduce((s, r) => s + r.value, 0);

                return (
                    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden border border-stone-100 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
                            <div className="bg-stone-900 px-6 py-5 flex justify-between items-center text-white">
                                <div>
                                    <h3 className="text-sm font-bold tracking-tight">Stamp Makers</h3>
                                    <p className="text-[10px] text-stone-400 mt-1 uppercase font-bold tracking-wider">
                                        {rows.length} people · {totalCount} stamps · ₹{totalValue.toLocaleString('en-IN')}
                                    </p>
                                </div>
                                <button onClick={() => setActiveManageCategory(null)} className="text-stone-400 hover:text-white p-2 hover:bg-stone-800 rounded-xl transition">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex items-center gap-2">
                                <select
                                    value={stampMonthKey}
                                    onChange={e => setStampMonthKey(e.target.value)}
                                    className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm font-bold text-stone-800 outline-none focus:border-amber-400 cursor-pointer"
                                >
                                    <option value="all">All months</option>
                                    {monthKeys.map(k => {
                                        const [y, m] = k.split('-');
                                        return <option key={k} value={k}>{new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</option>;
                                    })}
                                </select>
                                <button onClick={fetchStampReport} disabled={loadingStampReport}
                                    className="px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-600 hover:text-amber-600 disabled:opacity-50 cursor-pointer">
                                    {loadingStampReport ? 'Loading…' : 'Refresh'}
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {rows.length === 0 ? (
                                    <p className="text-xs text-stone-400 italic text-center py-8">No stamp makers or completed stamps yet.</p>
                                ) : rows.map(r => (
                                    <div key={r.name} className="flex justify-between items-center bg-stone-50 px-4 py-3 rounded-xl border border-stone-100">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-stone-850 truncate">{r.name}</span>
                                                {r.status === 'no account' && (
                                                    <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">⚠ No Stamp account</span>
                                                )}
                                                {r.status === 'inactive' && (
                                                    <span className="text-[9px] font-bold text-stone-500 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-md">Deactivated</span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-stone-400 font-medium">
                                                {r.approved} of {r.count} approved
                                            </span>
                                        </div>
                                        <div className="text-right flex-shrink-0 pl-3">
                                            <p className="text-sm font-black text-stone-900">{r.count}</p>
                                            <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-0.5 justify-end">
                                                <IndianRupee size={9} />{r.value.toLocaleString('en-IN')}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="px-6 py-3 border-t border-stone-100 bg-stone-50/60 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                                    {stampMonthKey === 'all' ? 'All months' : 'Selected month'} total
                                </span>
                                <span className="text-sm font-black text-stone-900">
                                    {totalCount} stamps · ₹{totalValue.toLocaleString('en-IN')}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
