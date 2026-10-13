import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryLoadMessage} from '../../src/inventory/errors.js';
test('inventory errors distinguish missing setup from permissions and other failures', () => {
 assert.match(inventoryLoadMessage({code:'PGRST202'}), /finish its setup/);
 assert.match(inventoryLoadMessage({code:'42501'}), /session cannot access/);
 assert.match(inventoryLoadMessage({code:'23505',message:'inventory_items duplicate key'}), /Please try again/);
 assert.doesNotMatch(inventoryLoadMessage({message:'inventory_ network failure'}), /setup/);
 assert.match(inventoryLoadMessage(null), /couldn’t load/);
});
