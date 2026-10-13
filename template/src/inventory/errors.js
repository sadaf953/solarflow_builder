export function inventoryLoadMessage(error) {
    if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)) {
        return 'Inventory is not available in this demo yet. The demo owner needs to finish its setup.';
    }
    if (['42501', 'PGRST301', 'PGRST302'].includes(error?.code)) {
        return 'Your session cannot access inventory. Reopen the demo as Admin or Office, then try again.';
    }
    return 'We couldn’t load inventory. Please try again. If this continues, contact the demo owner.';
}
