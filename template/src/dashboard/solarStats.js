const cleanLabel = value => String(value ?? '').trim();

const numberValue = value => {
    const parsed = Number(String(value ?? '').replaceAll(',', '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const add = (map, label, amount) => {
    const key = cleanLabel(label);
    if (!key || amount <= 0) return;
    map.set(key, (map.get(key) || 0) + amount);
};

const ranked = (map, total) => [...map.entries()]
    .map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

export function summarizeSolarEquipment(rows = []) {
    const panelBrands = new Map();
    const inverterBrands = new Map();
    let panelsAcrossProjects = 0;
    let completedPanels = 0;
    let installedCapacityKwp = 0;
    let activeCapacityKwp = 0;
    let activeCapacityProjects = 0;

    rows.forEach(row => {
        const stage = cleanLabel(row.stage).toUpperCase();
        if (stage === 'LOST PROJECT') return;

        const panels = numberValue(row.no_of_modules);
        const capacity = numberValue(row.system_capacity_kwp);
        panelsAcrossProjects += panels;
        add(panelBrands, row.module_brand, panels);
        add(inverterBrands, row.inverter_make, 1);

        if (capacity > 0) {
            activeCapacityKwp += capacity;
            activeCapacityProjects += 1;
        }
        if (stage === 'COMPLETED') {
            completedPanels += panels;
            installedCapacityKwp += capacity;
        }
    });

    const panelMix = ranked(panelBrands, [...panelBrands.values()].reduce((sum, value) => sum + value, 0));
    const inverterMix = ranked(inverterBrands, [...inverterBrands.values()].reduce((sum, value) => sum + value, 0));

    return {
        panelsAcrossProjects,
        completedPanels,
        installedCapacityKwp: Math.round(installedCapacityKwp * 100) / 100,
        averageSystemKwp: activeCapacityProjects > 0
            ? Math.round((activeCapacityKwp / activeCapacityProjects) * 100) / 100
            : 0,
        topPanelBrand: panelMix[0] || null,
        topInverterBrand: inverterMix[0] || null,
        panelMix: panelMix.slice(0, 4),
        inverterMix: inverterMix.slice(0, 4),
    };
}

