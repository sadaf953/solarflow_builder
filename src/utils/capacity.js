// Shared by Leads and Quotation Maker so both workflows always use the same
// system-capacity calculation and rounding behavior.
export function calculateSystemCapacityKwp(moduleWp, noOfModules) {
    const wp = parseFloat(String(moduleWp || '').replace(/,/g, ''));
    const count = parseFloat(String(noOfModules || '').replace(/,/g, ''));
    if (isNaN(wp) || isNaN(count) || wp <= 0 || count <= 0) return null;
    return Math.round((wp * count) / 1000 * 100) / 100;
}
