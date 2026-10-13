export const MAX_MODULE_SERIALS = 500;

export function readModuleSerials(value) {
    if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
    if (!value) return [];
    const text = String(value);
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return readModuleSerials(parsed);
    } catch { /* Older records use newline or comma-separated text. */ }
    return text.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
}

export function prepareScannedSerial(target, currentValue, scannedValue) {
    const serial = String(scannedValue ?? '').trim();
    if (!serial || serial.length > 120 || /^https?:\/\//i.test(serial)
        || [...serial].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
        throw new Error('This barcode does not contain a usable serial number. Try another label or enter it manually.');
    }

    if (target === 'module') {
        const existing = readModuleSerials(currentValue);
        if (existing.some(value => value.toLowerCase() === serial.toLowerCase())) {
            return { status: 'duplicate', serial, count: existing.length };
        }
        if (existing.length >= MAX_MODULE_SERIALS) {
            throw new Error(`This customer already has ${MAX_MODULE_SERIALS} module serials. Contact an admin before adding more.`);
        }
        return { status: 'ready', serial, field: 'panel_serial_no', value: [...existing, serial].join('\n'), count: existing.length + 1 };
    }

    if (target === 'inverter') {
        const existing = String(currentValue || '').trim();
        if (existing.toLowerCase() === serial.toLowerCase()) return { status: 'duplicate', serial };
        if (existing) return { status: 'occupied', serial, existing };
        return { status: 'ready', serial, field: 'inverter_serial_no', value: serial };
    }

    throw new Error('Choose module or inverter before scanning.');
}

export async function persistScannedSerial(target, currentValue, scannedValue, save) {
    const prepared = prepareScannedSerial(target, currentValue, scannedValue);
    if (prepared.status !== 'ready') return prepared;
    const result = await save(prepared.field, prepared.value);
    if (result !== true) throw new Error('The CRM did not confirm this serial number was saved. Keep the label and try again.');
    return { ...prepared, status: 'saved' };
}
