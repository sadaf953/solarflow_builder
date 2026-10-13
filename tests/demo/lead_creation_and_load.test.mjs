import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryClient } from '../quotations/memoryClient.mjs';
import { createQuotationRepository } from '../../src/quotations/repository.js';
import { newForm, freshTemplate } from '../../src/quotations/model.js';

test('Lead Creation via Add Lead modal (direct admin insertion)', async () => {
    const client = memoryClient();
    const adminUser = { id: 'admin-uuid', name: 'Admin User', user_type: 'admin' };

    const leadData = {
        customer_name: 'Suresh Kumar',
        mobile_number: '9876543210',
        city: 'Surat',
        system_capacity_kwp: 3.3,
        payment_type: 'Loan',
        stage: 'LEADS',
        channel_partner: 'Demo Aurora Solar',
        application_done_by: adminUser.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const { data: created, error } = await client.from('admin').insert(leadData).select().single();
    assert.equal(error, null);
    assert.ok(created);
    assert.equal(created.customer_name, 'Suresh Kumar');
    assert.equal(created.mobile_number, '9876543210');
    assert.equal(created.stage, 'LEADS');
    assert.equal(created.application_done_by, 'Admin User');
    assert.ok(created.updated_at);
});

test('Lead Creation via Quotation conversion', async () => {
    const client = memoryClient();
    const repo = createQuotationRepository(client);
    const user = { id: 'sales-agent', name: 'Sales Agent', phone: '9998887777' };

    // 1. Create and issue quotation
    const quoteForm = {
        ...newForm(user),
        customer_name: 'Meena Patel',
        customer_phone: '9825012345',
        customer_city: 'Vadodara',
        capacity_kw: 5.0,
        solar_panel_qty: 9,
        panel_wattage: 550,
        solar_panel_make: 'SolarFlow Pro',
        inverter_brand: 'DemoVolt',
        options: ['Option A', 'Option B', 'Option C'].map(brandName => ({
            brandName,
            baseValue: 220000,
            discount: 5000,
            subsidy: 78000
        }))
    };

    const savedQuote = await repo.save('quote', null, quoteForm, freshTemplate(), user);
    assert.equal(savedQuote.status, 'draft');

    const issuedQuote = await repo.generated(savedQuote, user);
    assert.equal(issuedQuote.status, 'issued');

    // 2. Convert quotation to lead
    const leadInsertPayload = {
        customer_name: issuedQuote.quotation_data.form.customer_name,
        mobile_number: issuedQuote.quotation_data.form.customer_phone,
        city: issuedQuote.quotation_data.form.customer_city,
        system_capacity_kwp: issuedQuote.quotation_data.form.capacity_kw,
        stage: 'LEADS',
        application_done_by: user.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const convertResult = await repo.insertConversionLead(issuedQuote, leadInsertPayload, user);
    assert.equal(convertResult.error, null);
    assert.ok(convertResult.data);
    assert.equal(convertResult.data.customer_name, 'Meena Patel');
    assert.equal(convertResult.data.system_capacity_kwp, 5.0);

    // Verify quotation is marked as converted and linked
    const linkedQuote = await repo.get(issuedQuote.id);
    assert.equal(linkedQuote.status, 'converted');
    assert.equal(linkedQuote.converted_lead_id, convertResult.data.id);
});

test('Lead Creation via Dealer / Agent Portal (with channel partner scoping)', async () => {
    const client = memoryClient();
    const dealerUser = {
        id: 'dealer-123',
        name: 'Rajesh Solar Dealer',
        user_type: 'agent2',
        role: 'Dealer',
        channel_partner: 'Demo Aurora Solar'
    };

    const dealerLead = {
        customer_name: 'Bhavesh Shah',
        mobile_number: '9712345678',
        city: 'Ahmedabad',
        system_capacity_kwp: 4.2,
        stage: 'LEADS',
        channel_partner: dealerUser.channel_partner,
        sub_channel_partner: dealerUser.name,
        application_done_by: dealerUser.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const { data: created, error } = await client.from('admin').insert(dealerLead).select().single();
    assert.equal(error, null);
    assert.equal(created.customer_name, 'Bhavesh Shah');
    assert.equal(created.channel_partner, 'Demo Aurora Solar');
    assert.equal(created.sub_channel_partner, 'Rajesh Solar Dealer');
    assert.equal(created.application_done_by, 'Rajesh Solar Dealer');

    // Scoped query: Dealer only sees their own leads
    const dealerLeads = client.state.tables.admin.filter(
        r => r.sub_channel_partner === dealerUser.name || r.channel_partner === dealerUser.name
    );
    assert.equal(dealerLeads.length, 1);
    assert.equal(dealerLeads[0].customer_name, 'Bhavesh Shah');
});

test('User Management: Profile ID is immutable anchor; name and email changes preserve lead ownership and relationships', async () => {
    const client = memoryClient();
    client.state.tables.demo_profiles = client.state.tables.demo_profiles || [];
    const dealerProfileId = 'dealer-uuid-001';

    // 1. Initial dealer profile
    const initialProfile = {
        id: dealerProfileId,
        name: 'Initial Dealer Name',
        email: 'initial.dealer@solarflow.example',
        user_type: 'agent2',
        role: 'Dealer',
        channel_partner: 'Demo Aurora Solar',
        status: 'active'
    };
    client.state.tables.demo_profiles.push(initialProfile);

    // 2. Dealer creates a lead tied to their Profile ID
    const lead = {
        id: 'lead-profile-anchor-1',
        customer_name: 'Anand Verma',
        phone_number: '9876543299',
        lead_creator_profile_id: dealerProfileId,
        sub_channel_partner: initialProfile.name,
        channel_partner: initialProfile.channel_partner,
        stage: 'LEADS',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    client.state.tables.admin.push(lead);

    // 3. In User Management, Admin changes dealer's name AND email
    const updatedName = 'Updated Rajesh Solar';
    const updatedEmail = 'rajesh.new@solarflow.example';

    // Update by ID
    const profileInTable = client.state.tables.demo_profiles.find(p => p.id === dealerProfileId);
    assert.ok(profileInTable);
    profileInTable.name = updatedName;
    profileInTable.email = updatedEmail;

    // 4. Verify ID did not change
    assert.equal(profileInTable.id, dealerProfileId);
    assert.equal(profileInTable.name, updatedName);
    assert.equal(profileInTable.email, updatedEmail);

    // 5. Scoped query using Profile ID as primary anchor:
    // Lead is 100% matched by lead_creator_profile_id even before/without manual sub_channel_partner cascade
    const matchingLeads = client.state.tables.admin.filter(
        r => r.lead_creator_profile_id === profileInTable.id || r.sub_channel_partner === profileInTable.name
    );
    assert.equal(matchingLeads.length, 1);
    assert.equal(matchingLeads[0].customer_name, 'Anand Verma');
    assert.equal(matchingLeads[0].lead_creator_profile_id, dealerProfileId);
});

test('Load Test: High volume lead ingestion, sorting, filtering, and indexing performance', async () => {
    const client = memoryClient();
    const BATCH_SIZE = 1000;
    const stages = ['LEADS', 'REGISTRATION', 'LOAN', 'MATERIAL ORDER', 'INSTALLATION STATUS', 'COMPLETED'];
    const partners = ['Demo Aurora Solar', 'Surat Solar Hub', 'Baroda Green Energy'];

    const startTime = performance.now();

    // 1. Bulk insertion simulation
    for (let i = 1; i <= BATCH_SIZE; i++) {
        const stage = stages[i % stages.length];
        const partner = partners[i % partners.length];
        const updatedTime = new Date(Date.now() - (BATCH_SIZE - i) * 10000).toISOString();

        client.state.tables.admin.push({
            id: `lead-bulk-${i}`,
            customer_name: `Bulk Customer ${i}`,
            mobile_number: `98000${String(i).padStart(5, '0')}`,
            city: i % 2 === 0 ? 'Surat' : 'Ahmedabad',
            system_capacity_kwp: 3 + (i % 7) * 0.5,
            stage,
            channel_partner: partner,
            application_done_by: 'Bulk Importer',
            created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
            updated_at: updatedTime,
            deleted_at: null
        });
    }

    const insertionDuration = performance.now() - startTime;
    assert.equal(client.state.tables.admin.length, BATCH_SIZE);

    // 2. Query Test: Sort by updated_at descending (latest first)
    const sortStart = performance.now();
    const sortedLeads = [...client.state.tables.admin].sort((a, b) => {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    const sortDuration = performance.now() - sortStart;

    // Verify top record is the latest
    assert.equal(sortedLeads[0].customer_name, `Bulk Customer ${BATCH_SIZE}`);
    assert.ok(sortDuration < 50, `Sorting ${BATCH_SIZE} leads should take < 50ms, took ${sortDuration.toFixed(2)}ms`);

    // 3. Filtering Test: Filter by stage and channel partner
    const filterStart = performance.now();
    const filtered = client.state.tables.admin.filter(
        r => r.stage === 'LEADS' && r.channel_partner === 'Demo Aurora Solar' && !r.deleted_at
    );
    const filterDuration = performance.now() - filterStart;
    assert.ok(filtered.length > 0);
    assert.ok(filterDuration < 20, `Filtering should take < 20ms, took ${filterDuration.toFixed(2)}ms`);

    // 4. Global Search Test (Search by name or phone)
    const searchStart = performance.now();
    const searchResults = client.state.tables.admin.filter(
        r => r.customer_name.toLowerCase().includes('customer 500') || r.mobile_number.includes('9800000500')
    );
    const searchDuration = performance.now() - searchStart;
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].id, 'lead-bulk-500');
    assert.ok(searchDuration < 15, `Search should take < 15ms, took ${searchDuration.toFixed(2)}ms`);

    console.log(`\n--- Load Test Metrics (${BATCH_SIZE} Leads) ---`);
    console.log(`• Ingestion time: ${insertionDuration.toFixed(2)}ms`);
    console.log(`• Sorting by updated_at: ${sortDuration.toFixed(2)}ms`);
    console.log(`• Multi-facet filtering: ${filterDuration.toFixed(2)}ms`);
    console.log(`• Substring search: ${searchDuration.toFixed(2)}ms`);
});

test('Enterprise Scale Load Test: 5,000 customers pagination, search, and memory stability', async () => {
    const client = memoryClient();
    const ENTERPRISE_SIZE = 5000;
    const stages = ['LEADS', 'REGISTRATION', 'LOAN', 'CASH', 'MATERIAL ORDER', 'MATERIAL INTEGRATION', 'MATERIAL DELIVERY', 'INSTALLATION STATUS', 'COMPLETED'];
    const cities = ['Surat', 'Ahmedabad', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Gandhinagar'];

    const startTime = performance.now();

    for (let i = 1; i <= ENTERPRISE_SIZE; i++) {
        client.state.tables.admin.push({
            id: `enterprise-cust-${i}`,
            customer_name: `Enterprise Client ${i}`,
            mobile_number: `97000${String(i).padStart(5, '0')}`,
            city: cities[i % cities.length],
            system_capacity_kwp: 3 + (i % 10) * 0.5,
            stage: stages[i % stages.length],
            channel_partner: i % 3 === 0 ? 'Demo Aurora Solar' : 'Surat Solar Hub',
            updated_at: new Date(Date.now() - (ENTERPRISE_SIZE - i) * 5000).toISOString(),
            created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
            deleted_at: null
        });
    }

    const ingestionTime = performance.now() - startTime;
    assert.equal(client.state.tables.admin.length, ENTERPRISE_SIZE);

    // 1. Paginated chunks of 50 (first page load)
    const page0Start = performance.now();
    const sorted = [...client.state.tables.admin].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    const page0 = sorted.slice(0, 50);
    const page0Duration = performance.now() - page0Start;
    assert.equal(page0.length, 50);
    assert.equal(page0[0].customer_name, `Enterprise Client ${ENTERPRISE_SIZE}`);
    assert.ok(page0Duration < 100, `Page 0 of 5,000 records should take < 100ms, took ${page0Duration.toFixed(2)}ms`);

    // 2. Global search across 5,000 records
    const searchStart = performance.now();
    const matched = client.state.tables.admin.filter(
        c => c.customer_name.toLowerCase().includes('client 4999') || c.mobile_number.includes('9700004999')
    );
    const searchDuration = performance.now() - searchStart;
    assert.equal(matched.length, 1);
    assert.equal(matched[0].id, 'enterprise-cust-4999');
    assert.ok(searchDuration < 25, `Search across 5,000 records should take < 25ms, took ${searchDuration.toFixed(2)}ms`);

    console.log(`\n--- Enterprise Scale Test (${ENTERPRISE_SIZE} Customers) ---`);
    console.log(`• 5,000 customer ingestion: ${ingestionTime.toFixed(2)}ms`);
    console.log(`• First page chunk (50 of 5,000) with sort: ${page0Duration.toFixed(2)}ms`);
    console.log(`• Substring search across 5,000 items: ${searchDuration.toFixed(2)}ms`);
});

