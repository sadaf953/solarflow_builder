export const getChecklistMode = () => {
    try {
        const stored = localStorage.getItem('solarflow_checklist_mode');
        // Default to clean simple checklist mode when opened:
        // "when they open it it should show checklsit simple checlist , you click that its checked thats all"
        return stored === 'files' ? 'files' : 'checklist';
    } catch {
        return 'checklist';
    }
};

export const setChecklistMode = (mode) => {
    try {
        localStorage.setItem('solarflow_checklist_mode', mode);
        window.dispatchEvent(new CustomEvent('solarflow-checklist-mode-changed', { detail: { mode } }));
    } catch { /* The in-memory mode remains available when storage is blocked. */ }
};
