import test from 'node:test';
import assert from 'node:assert/strict';
import { currentParentId, loginChanges, needsParentChoice, officeOptions } from '../../template/src/components/staffLogins.js';
import { configWith, importTemplate } from '../dashboard/fixtures/templateModules.mjs';

const office = { id: 'o1', name: 'GREEN OFFICE', user_type: 'channel_partner_office', channel_partner: 'GREEN', status: 'active', email: 'g1@x.test' };
const twin = { id: 'o2', name: 'GREEN TWO', user_type: 'channel_partner_office', channel_partner: 'GREEN', status: 'active', email: 'g2@x.test' };
const closed = { id: 'o3', name: 'OLD OFFICE', user_type: 'channel_partner_office', channel_partner: 'OLD', status: 'inactive' };
// Renamed in Operations: the key no longer equals the name.
const agent = { id: 'a1', name: 'RAHUL', user_type: 'agent', channel_partner: 'RAHUL SOLAR', status: 'active' };
const profiles = [office, twin, closed, agent];

test('officeOptions offers offices by id, and channel partners by their key for dealers', () => {
    assert.deepEqual(officeOptions('office2', profiles), [
        { value: 'o1', label: 'GREEN · g1@x.test' },
        { value: 'o2', label: 'GREEN · g2@x.test' },
    ]);
    assert.deepEqual(officeOptions('agent2', profiles).map(o => o.label), ['GREEN · g1@x.test', 'GREEN · g2@x.test', 'RAHUL SOLAR']);
    assert.deepEqual(officeOptions('agent2', profiles, { keepId: 'o3', excludeId: 'a1' }).map(o => o.value), ['o1', 'o2', 'o3']);
    assert.equal(officeOptions('agent2', profiles, { keepId: 'o3' }).find(o => o.value === 'o3').label, 'OLD (switched off)');
});

test('officeOptions leaves channel partners out when they are switched off', async () => {
    const { officeOptions: offWhenOff } = await importTemplate('components/staffLogins.js', { config: configWith({ features: { channelPartners: false } }) });
    assert.deepEqual(offWhenOff('agent2', profiles).map(o => o.value), ['o1', 'o2']);
});

test('currentParentId finds the linked office, or the partner whose key a dealer carries', () => {
    const options = officeOptions('agent2', profiles);
    assert.equal(currentParentId({ user_type: 'office2', parent_profile_id: 'o2', channel_partner: 'GREEN' }, options, profiles), 'o2');
    assert.equal(currentParentId({ user_type: 'agent2', parent_profile_id: null, channel_partner: 'rahul solar' }, options, profiles), 'a1');
    assert.equal(currentParentId({ user_type: 'agent2', parent_profile_id: null, channel_partner: 'GREEN' }, options, profiles), '', 'ambiguous');
    assert.equal(currentParentId({ user_type: 'agent', channel_partner: 'RAHUL SOLAR' }, options, profiles), '');
});

test("loginChanges never wipes a channel partner's key on an unrelated edit", () => {
    assert.deepEqual(loginChanges(agent, { userType: 'agent', role: 'Partner / agent' }), {});
    // An agent saved before keys existed gets its name.
    assert.deepEqual(loginChanges({ ...agent, channel_partner: null }, { userType: 'agent' }), { channel_partner: 'RAHUL' });
});

test('loginChanges gives a sign-up approved as a channel partner its name as its key', () => {
    const pending = { id: 'u1', name: 'Rahul Solar', user_type: 'pending', channel_partner: null, parent_profile_id: null };
    assert.deepEqual(loginChanges(pending, { userType: 'agent', role: 'Partner / agent' }),
        { user_type: 'agent', role: 'Partner / agent', channel_partner: 'RAHUL SOLAR' });
    // A dealer turned into a partner does not keep its old partner's key.
    const dealer = { id: 'd1', name: 'DEV', user_type: 'agent2', channel_partner: 'RAHUL SOLAR', parent_profile_id: null };
    assert.deepEqual(loginChanges(dealer, { userType: 'agent', role: 'Partner / agent' }),
        { user_type: 'agent', role: 'Partner / agent', channel_partner: 'DEV' });
});

test('loginChanges links managers and dealers to their parent and its key', () => {
    const manager = { id: 'm1', name: 'M', user_type: 'office2', channel_partner: 'GREEN', parent_profile_id: 'o1' };
    assert.deepEqual(loginChanges(manager, { userType: 'office2', parent: office }), {});
    assert.deepEqual(loginChanges(manager, { userType: 'office2', parent: twin }), { parent_profile_id: 'o2' });
    assert.deepEqual(loginChanges({ ...manager, channel_partner: 'green' }, { userType: 'office2', parent: office }), {}, 'case alone is not a change');
    assert.deepEqual(loginChanges(manager, { userType: 'agent2', role: 'Dealer', parent: agent }),
        { user_type: 'agent2', role: 'Dealer', channel_partner: 'RAHUL SOLAR', parent_profile_id: null });
});

test('loginChanges keeps an office name in another case, and clears partner fields only when the type changes', () => {
    const cpo = { id: 'o9', name: 'SUN', user_type: 'channel_partner_office', channel_partner: 'Sunrise', parent_profile_id: null };
    assert.deepEqual(loginChanges(cpo, { userType: 'channel_partner_office', officeName: 'SUNRISE' }), {});
    assert.deepEqual(loginChanges(cpo, { userType: 'channel_partner_office', officeName: 'sunrise energy' }), { channel_partner: 'SUNRISE ENERGY' });
    assert.deepEqual(loginChanges({ ...agent }, { userType: 'sales', role: 'Office staff' }), { user_type: 'sales', role: 'Office staff', channel_partner: null });
    const sales = { id: 's1', name: 'S', user_type: 'sales', channel_partner: 'LEGACY', parent_profile_id: null };
    assert.deepEqual(loginChanges(sales, { userType: 'sales' }), {});
});

test('needsParentChoice asks for a parent only when the type or the parent changes', () => {
    // A dealer under a channel partner, after channel partners were switched off: nothing is listed for it.
    const dealer = { id: 'd1', name: 'DEV', user_type: 'agent2', channel_partner: 'RAHUL SOLAR', parent_profile_id: null };
    assert.equal(needsParentChoice(dealer, { userType: 'agent2', parentId: '', startParentId: '' }), false);
    assert.equal(needsParentChoice(dealer, { userType: 'agent2', parentId: 'o1', startParentId: '' }), false);
    assert.equal(needsParentChoice(dealer, { userType: 'office2', parentId: '', startParentId: '' }), true, 'type changed');
    assert.equal(needsParentChoice(dealer, { userType: 'agent2', parentId: '', startParentId: 'a1' }), true, 'parent cleared');
    const sales = { id: 's1', user_type: 'sales' };
    assert.equal(needsParentChoice(sales, { userType: 'agent2' }), true);
    assert.equal(needsParentChoice(sales, { userType: 'sales' }), false);
});

test('loginChanges keeps a dealer\'s partner when no parent is chosen and the type stays', () => {
    const dealer = { id: 'd1', name: 'DEV', user_type: 'agent2', channel_partner: 'RAHUL SOLAR', parent_profile_id: null };
    assert.deepEqual(loginChanges(dealer, { userType: 'agent2', role: 'Dealer', parent: null }), {});
    const linked = { id: 'm1', name: 'M', user_type: 'office2', channel_partner: 'GREEN', parent_profile_id: 'o1' };
    assert.deepEqual(loginChanges(linked, { userType: 'office2', parent: null }), {});
    assert.deepEqual(loginChanges(dealer, { userType: 'agent2', parent: office }), { channel_partner: 'GREEN', parent_profile_id: 'o1' });
});

test('a dealer under a channel partner can be edited after channel partners are switched off', async () => {
    const off = await importTemplate('components/staffLogins.js', { config: configWith({ features: { channelPartners: false } }) });
    const dealer = { id: 'd1', name: 'DEV', user_type: 'agent2', channel_partner: 'RAHUL SOLAR', parent_profile_id: null };
    const startParentId = off.currentParentId(dealer, off.officeOptions('agent2', profiles, { excludeId: 'd1' }), profiles);
    assert.equal(startParentId, '');
    assert.equal(off.needsParentChoice(dealer, { userType: 'agent2', parentId: startParentId, startParentId }), false);
    assert.deepEqual(off.loginChanges(dealer, { userType: 'agent2', role: 'Dealer', parent: null }), {});
});
