import { useCallback } from 'react';

// One save path for a section inside a stage tab: write the patch, stop if
// the write failed (so the activity log never records a change that did not
// reach the database), then log and refresh the history.
//
//   const save = useStageSave(props);
//   if (!await save({ subsidy_tag: tag }, `Subsidy tag saved to ${label}`)) return;
//
// `message` is prefixed with the customer name. Pass { log: false } to skip
// logging, { action } to log something other than 'update', and
// { throwOnError: true } where the caller shows its own error.
export default function useStageSave({ customer, user, onUpdate, logActivity, fetchLogs, setSaving }) {
    return useCallback(async (patch, message, { action = 'update', log = true, throwOnError = false } = {}) => {
        setSaving?.(true);
        try {
            if (await onUpdate(customer.id, patch) === false) {
                if (throwOnError) throw new Error('The change could not be saved. Please try again.');
                return false;
            }
            if (log && message && logActivity && user?.id) {
                await logActivity(user.id, action, `${customer.customer_name}: ${message}`, '', customer.id);
            }
            fetchLogs?.();
            return true;
        } finally {
            setSaving?.(false);
        }
    }, [customer, user, onUpdate, logActivity, fetchLogs, setSaving]);
}
