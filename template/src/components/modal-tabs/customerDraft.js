// The customer card keeps two copies of the record: the draft being edited
// and the baseline it was loaded from. Save sends only the fields where they
// differ, and compares the baseline with the server to spot a colleague's change.

export const IGNORED_KEYS = new Set(['id', 'created_at', 'updated_at', 'crn']);

export const isBlank = value => value === undefined || value === null || value === ''
    || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

// Postgres stores jsonb with its own key order, so objects compare key-sorted.
export const stableStringify = value => JSON.stringify(value ?? null, (key, val) => (
    val && typeof val === 'object' && !Array.isArray(val)
        ? Object.fromEntries(Object.keys(val).sort().map(k => [k, val[k]]))
        : val
));

export const getChangedFields = (draft = {}, saved = {}) => {
    const changed = new Set();
    const keys = new Set([...Object.keys(saved || {}), ...Object.keys(draft || {})]);
    keys.forEach(key => {
        if (IGNORED_KEYS.has(key)) return;
        const draftValue = draft?.[key];
        const savedValue = saved?.[key];
        if (typeof draftValue === 'boolean' || typeof savedValue === 'boolean') {
            if (Boolean(draftValue) !== Boolean(savedValue)) changed.add(key);
            return;
        }
        if (isBlank(draftValue) && isBlank(savedValue)) return;
        if (typeof draftValue === 'object' || typeof savedValue === 'object') {
            if (stableStringify(draftValue) !== stableStringify(savedValue)) changed.add(key);
            return;
        }
        if (String(draftValue ?? '').trim() !== String(savedValue ?? '').trim()) changed.add(key);
    });
    return changed;
};

export const sameValue = (a, b) => getChangedFields({ value: a }, { value: b }).size === 0;

// Takes a copy of the record read from the server (full, or a list row with
// some columns) into the draft and baseline. A field the user has not changed
// takes the server value in both. A field the user changed keeps the typed
// value and its old baseline, so Save still sees a colleague's change to it
// as a conflict. `edited` lists the fields the user changed.
export function mergeServerCopy(draft = {}, baseline = {}, server = {}) {
    const next = { draft: { ...draft }, baseline: { ...baseline }, edited: [] };
    Object.entries(server || {}).forEach(([key, value]) => {
        const edited = !IGNORED_KEYS.has(key) && !sameValue(draft[key], baseline[key]);
        // A column the baseline has not seen yet starts from the server's value.
        if (!edited || !(key in baseline)) next.baseline[key] = value;
        if (edited) next.edited.push(key);
        else next.draft[key] = value;
    });
    return next;
}

// The card's state is { draft, baseline, loadedAt }; loadedAt is the
// updated_at the Save conflict check compares with. Returns the next state,
// or null for a copy older than the row last read. Only a full row read
// while nothing is edited moves loadedAt, so a colleague's save still shows
// the conflict dialog.
export function applyServerCopy({ draft, baseline, loadedAt }, server = {}, { full = false } = {}) {
    const stamp = server?.updated_at;
    if (loadedAt && stamp && new Date(stamp).getTime() < new Date(loadedAt).getTime()) return null;
    const next = mergeServerCopy(draft, baseline, server);
    const moveLoaded = full && stamp && (!next.edited.length || !loadedAt);
    return { draft: next.draft, baseline: next.baseline, loadedAt: moveLoaded ? stamp : loadedAt, edited: next.edited };
}

// Fields that differ from `reference`, where reference holds the saved value
// for the fields this save sent and the latest baseline for the others.
function keptAfterSave(current = {}, sent = {}, sentBaseline = {}, latestBaseline = {}) {
    const reference = { ...latestBaseline };
    getChangedFields(sent, sentBaseline).forEach(key => { reference[key] = sent[key]; });
    return getChangedFields(current, reference);
}

// The draft once a save has finished: the stored row, plus anything typed
// while the save was in flight. `sent` is the draft that was saved and
// `sentBaseline` the baseline it was compared with; `latestBaseline` is the
// baseline just before the stored row replaced it. Extra fields are compared
// one by one.
export function draftAfterSave({ current = {}, sent = {}, sentBaseline = {}, latestBaseline = {}, stored = {} }) {
    const draft = { ...stored };
    keptAfterSave(current, sent, sentBaseline, latestBaseline).forEach(key => {
        if (key !== 'custom_fields') draft[key] = current[key];
    });
    const extra = { ...(stored.custom_fields || {}) };
    keptAfterSave(current.custom_fields, sent.custom_fields, sentBaseline.custom_fields, latestBaseline.custom_fields).forEach(key => {
        const value = current.custom_fields?.[key];
        if (isBlank(value)) delete extra[key];
        else extra[key] = value;
    });
    draft.custom_fields = extra;
    return draft;
}
