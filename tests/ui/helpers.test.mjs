import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptions, selectState, describedBy } from '../../template/src/ui/helpers.js';

test('normalizeOptions accepts strings and {value,label} objects', () => {
    assert.deepEqual(normalizeOptions(['Cash', 'Loan']), [{ value: 'Cash', label: 'Cash' }, { value: 'Loan', label: 'Loan' }]);
    assert.deepEqual(normalizeOptions([{ value: 1, label: 'One' }, { value: 'x' }]), [{ value: '1', label: 'One' }, { value: 'x', label: 'x' }]);
    assert.deepEqual(normalizeOptions(undefined), []);
});

test('selectState matches case-insensitively and keeps unknown values visible', () => {
    assert.equal(selectState(['Cash', 'Loan'], 'cash').selected, 'Cash');
    assert.equal(selectState(['Cash', 'Loan'], ' Loan ').selected, 'Loan');
    assert.equal(selectState(['Cash', 'Loan'], '').selected, '');
    assert.equal(selectState(['Cash', 'Loan'], null).options.length, 2);
    const unknown = selectState(['Cash', 'Loan'], 'EMI');
    assert.equal(unknown.selected, 'EMI');
    assert.deepEqual(unknown.options[0], { value: 'EMI', label: 'EMI (not in list)' });
    assert.equal(unknown.options.length, 3);
});

test('describedBy lists only the parts that are shown', () => {
    assert.equal(describedBy('f'), undefined);
    assert.equal(describedBy('f', { hint: 'x' }), 'f-hint');
    assert.equal(describedBy('f', { hint: 'x', error: 'y' }), 'f-hint f-error');
});
