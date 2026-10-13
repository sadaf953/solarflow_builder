import test from 'node:test';
import assert from 'node:assert/strict';
import { persistScannedSerial, prepareScannedSerial, readModuleSerials } from '../../src/serials/record.js';

test('a module scan adds one serial and waits for the CRM save', async () => {
    const writes = [];
    const result = await persistScannedSerial('module', 'MOD-001\nMOD-002', ' MOD-003 ', async (field, value) => {
        writes.push([field, value]);
        return true;
    });
    assert.deepEqual(writes, [['panel_serial_no', 'MOD-001\nMOD-002\nMOD-003']]);
    assert.equal(result.status, 'saved');
    assert.equal(result.count, 3);
});

test('duplicate module scans and existing inverter serials cannot overwrite saved data', async () => {
    let writes = 0;
    const save = async () => { writes += 1; return true; };
    assert.equal((await persistScannedSerial('module', 'MOD-001', 'mod-001', save)).status, 'duplicate');
    assert.equal((await persistScannedSerial('inverter', 'INV-001', 'INV-002', save)).status, 'occupied');
    assert.equal(writes, 0);
});

test('failed CRM writes never report a serial as saved', async () => {
    await assert.rejects(
        persistScannedSerial('inverter', '', 'INV-003', async () => false),
        /did not confirm/
    );
    await assert.rejects(
        persistScannedSerial('inverter', '', 'INV-003', async () => undefined),
        /did not confirm/
    );
});

test('saved module formats remain readable and invalid barcode data is rejected', () => {
    assert.deepEqual(readModuleSerials('["A","B"]'), ['A', 'B']);
    assert.deepEqual(readModuleSerials('A, B'), ['A', 'B']);
    assert.throws(() => prepareScannedSerial('module', '', 'A\nB'), /usable serial/);
    assert.throws(() => prepareScannedSerial('module', '', 'https://example.com/product'), /usable serial/);
});
