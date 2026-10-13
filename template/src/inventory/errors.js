export function inventoryLoadMessage(error) {
    if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)) {
        return 'Inventory is not set up in the database yet. Your administrator needs to finish its setup by running backend/schema.sql.';
    }
    if (['42501', 'PGRST301', 'PGRST302'].includes(error?.code)) {
        return 'Your session cannot access inventory. Sign in again as Admin or Office, then try again.';
    }
    return 'We couldn’t load inventory. Please try again. If this continues, contact your administrator.';
}
