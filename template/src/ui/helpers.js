// Small pure helpers behind the form controls.

export const normalizeOptions = options => (options || []).map(option => (
    option !== null && typeof option === 'object'
        ? { value: String(option.value ?? ''), label: String(option.label ?? option.value ?? '') }
        : { value: String(option ?? ''), label: String(option ?? '') }
));

/**
 * What a select should show for a stored value. A value that matches an
 * option in another case selects that option; a value missing from the list
 * is kept as an extra "(not in list)" option instead of showing blank.
 */
export function selectState(options, value) {
    const list = normalizeOptions(options);
    const stored = value == null ? '' : String(value).trim();
    if (!stored) return { options: list, selected: '' };
    const match = list.find(option => option.value === stored)
        || list.find(option => option.value.toLowerCase() === stored.toLowerCase());
    if (match) return { options: list, selected: match.value };
    return { options: [{ value: stored, label: `${stored} (not in list)` }, ...list], selected: stored };
}

/** ids a control should list in aria-describedby when it sits in a <Field htmlFor={id}>. */
export const describedBy = (id, { hint, error } = {}) => [
    hint && `${id}-hint`, error && `${id}-error`,
].filter(Boolean).join(' ') || undefined;
