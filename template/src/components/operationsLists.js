// Operations dropdown lists: where a label is still used, and renaming it
// everywhere it is stored. A label matches its records whatever their case,
// the same way row access compares partner names (whole name, ignoring case).
// Takes the Supabase client and runWrite, so it runs against fakes in tests.

import { fetchAllPages } from '../lib/db.js';
import { exactLike } from '../dashboard/filters.js';

const NOUNS = { admin: 'customer records', profiles: 'logins', bom_items: 'BOM lines' };
const ID_BATCH = 200;

export function listStore(db, write) {
    // Supabase filters go after select() / update().
    const matching = (query, column, value) => query.ilike(column, exactLike(value));

    async function countRows(table, column, value) {
        const { count, error } = await matching(db.from(table).select('id', { count: 'exact', head: true }), column, value);
        if (error) throw error;
        return count || 0;
    }

    // How many records still hold `label`; null when that cannot be counted.
    async function usageOf(list, label) {
        if (list.alwaysInUse) return null;
        let total = 0;
        for (const [table, column] of list.inUse || list.renames || []) total += await countRows(table, column, label);
        for (const [table, column, key] of list.jsonRenames || []) total += await countRows(table, `${column}->>${key}`, label);
        return total;
    }

    // Puts each row's own earlier value back, so names in another case stay as they were.
    async function restore(table, column, rows) {
        const idsByValue = new Map();
        for (const row of rows) idsByValue.set(row[column], [...(idsByValue.get(row[column]) || []), row.id]);
        for (const [value, ids] of idsByValue) {
            for (let i = 0; i < ids.length; i += ID_BATCH) {
                const res = await write(db.from(table).update({ [column]: value }).in('id', ids.slice(i, i + ID_BATCH)).select('id'), { action: 'undo' });
                if (!res.ok) return res;
            }
        }
        return { ok: true };
    }

    // Renames the label wherever it is stored. Writes that already landed are put
    // back if a later one fails; the error then says what could not be restored.
    async function renameEverywhere(list, from, to) {
        const done = [];
        try {
            for (const [table, column] of list.renames || []) {
                const rows = await fetchAllPages(() => matching(db.from(table).select(`id, ${column}`), column, from).order('id'));
                if (!rows.length) continue;
                const res = await write(matching(db.from(table).update({ [column]: to }), column, from).select('id'), { action: 'rename' });
                if (!res.ok) throw res.error;
                done.push({ what: `${res.rows.length} ${NOUNS[table]}`, undo: () => restore(table, column, rows) });
                if (res.rows.length !== rows.length) throw new Error(`Only ${res.rows.length} of ${rows.length} ${NOUNS[table]} could be renamed.`);
            }
            for (const [table, column, key] of list.jsonRenames || []) {
                const rows = await fetchAllPages(() => matching(db.from(table).select(`id, ${column}`), `${column}->>${key}`, from).order('id'));
                for (const row of rows) {
                    const res = await write(db.from(table).update({ [column]: { ...row[column], [key]: to } }).eq('id', row.id).select('id'), { action: 'rename' });
                    if (!res.ok) throw res.error;
                    done.push({
                        what: `1 ${NOUNS[table].replace(/s$/, '')}`,
                        undo: () => write(db.from(table).update({ [column]: row[column] }).eq('id', row.id).select('id'), { action: 'undo' }),
                    });
                }
            }
        } catch (error) {
            const stuck = [];
            for (const step of done.reverse()) {
                const res = await step.undo();
                if (!res.ok) stuck.push(step.what);
            }
            error.stuck = stuck;
            throw error;
        }
    }

    return { countRows, usageOf, renameEverywhere };
}
