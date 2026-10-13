import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSolarEquipment } from '../../src/dashboard/solarStats.js';

test('summarizes panel quantities, inverter choices and completed capacity', () => {
    const result = summarizeSolarEquipment([
        { stage: 'COMPLETED', module_brand: 'BrightPanel', no_of_modules: '8', inverter_make: 'SunVolt', system_capacity_kwp: '4.64' },
        { stage: 'MATERIAL DELIVERY', module_brand: 'BrightPanel', no_of_modules: 6, inverter_make: 'GridMax', system_capacity_kwp: 3.48 },
        { stage: 'INSTALLATION STATUS', module_brand: 'EcoRay', no_of_modules: '10', inverter_make: 'SunVolt', system_capacity_kwp: '5.8' },
        { stage: 'LOST PROJECT', module_brand: 'Ignored', no_of_modules: 100, inverter_make: 'Ignored', system_capacity_kwp: 50 },
    ]);

    assert.equal(result.panelsAcrossProjects, 24);
    assert.equal(result.completedPanels, 8);
    assert.equal(result.installedCapacityKwp, 4.64);
    assert.equal(result.averageSystemKwp, 4.64);
    assert.deepEqual(result.topPanelBrand, { name: 'BrightPanel', count: 14, percentage: 58 });
    assert.deepEqual(result.topInverterBrand, { name: 'SunVolt', count: 2, percentage: 67 });
});

test('handles empty, invalid and missing equipment values without inventing brands', () => {
    const result = summarizeSolarEquipment([
        { stage: 'LEADS', module_brand: '', no_of_modules: 'not a number', inverter_make: null, system_capacity_kwp: '' },
    ]);

    assert.equal(result.panelsAcrossProjects, 0);
    assert.equal(result.averageSystemKwp, 0);
    assert.equal(result.topPanelBrand, null);
    assert.equal(result.topInverterBrand, null);
    assert.deepEqual(result.panelMix, []);
    assert.deepEqual(result.inverterMix, []);
});
