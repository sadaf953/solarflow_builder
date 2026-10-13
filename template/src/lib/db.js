// Supabase query helpers. Pure: the caller passes the query, so these work
// with any client (and with fakes in tests).

/**
 * Reads every row of a query, `pageSize` rows at a time. PostgREST caps one
 * response at 1000 rows, so a plain select silently drops the rest.
 *
 * `buildQuery()` must return a fresh, ordered query on each call; `.range()`
 * is added here. With onError 'partial', a failing page stops the loop and
 * the rows read so far are returned; otherwise the error is thrown.
 */
export async function fetchAllPages(buildQuery, { pageSize = 1000, onError = 'throw' } = {}) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1);
        if (error) {
            if (onError !== 'partial') throw error;
            console.error('Stopped reading after a failed page:', error);
            break;
        }
        const page = data || [];
        rows.push(...page);
        if (page.length < pageSize) break;
    }
    return rows;
}

/** Customer rows come from the CPO-scoped view for CPO logins, else from admin. */
export const customerSource = isCpo => (isCpo ? 'cpo_leads' : 'admin');
