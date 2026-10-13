import { useId } from 'react';

const CARD_COLUMNS = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' };
const TAG_COLUMNS = {
    1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-5', 6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6', 8: 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-8',
};
const TAG_ACTIVE = 'bg-stone-900 text-white border-stone-900 shadow-md';

/**
 * Radio cards (or checkbox cards with `multiple`, where value is an array).
 * Native inputs keep arrow-key and Space selection working.
 */
export function ChoiceCards({ options, value, onChange, columns = 2, multiple = false, name, label, disabled = false }) {
    const autoName = useId();
    const chosen = multiple ? (Array.isArray(value) ? value : []) : value;
    const isOn = optionValue => (multiple ? chosen.includes(optionValue) : chosen === optionValue);
    const pick = optionValue => {
        if (!multiple) onChange?.(optionValue);
        else onChange?.(isOn(optionValue) ? chosen.filter(v => v !== optionValue) : [...chosen, optionValue]);
    };
    return (
        <div role={multiple ? 'group' : 'radiogroup'} aria-label={label} className={`grid gap-2 ${CARD_COLUMNS[columns] ?? CARD_COLUMNS[2]}`}>
            {options.map(option => {
                const Icon = option.icon;
                const on = isOn(option.value);
                const off = disabled || option.disabled;
                return (
                    <label key={String(option.value)} className={`flex min-h-11 gap-3 rounded-xl border p-3 transition-colors ${on ? 'border-orange-400 bg-orange-50' : 'border-stone-200 bg-white'} ${off ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-stone-300'}`}>
                        <input
                            type={multiple ? 'checkbox' : 'radio'} name={name || autoName} value={String(option.value)}
                            checked={on} disabled={off} onChange={() => pick(option.value)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600"
                        />
                        {Icon && <Icon size={18} className="mt-0.5 shrink-0 text-orange-600" aria-hidden="true" />}
                        <span className="min-w-0 text-xs leading-relaxed">
                            <strong className="block text-sm text-stone-900">{option.label}</strong>
                            {option.description && <span className="mt-0.5 block text-stone-600">{option.description}</span>}
                        </span>
                    </label>
                );
            })}
        </div>
    );
}

/**
 * Segmented status buttons: [{ id, label, isFinal?, activeClass?, dotClass? }].
 * A selected option uses the pastel `colors[id]` ({bg,text,border,dot}) when
 * given, otherwise its solid `activeClass`. `locked` (the caller decides, e.g.
 * a final status for non-admins) disables every option and fades all but the
 * final one. With `allowDeselect`, picking the selected option again sends null.
 */
export function TagPicker({ options, value, onChange, allowDeselect = false, locked = false, disabled = false, colors, columns, label }) {
    const cols = TAG_COLUMNS[columns || Math.min(options.length, 4)] || TAG_COLUMNS[4];
    return (
        <div role="group" aria-label={label} className={`grid w-full gap-2 ${cols}`}>
            {options.map(tag => {
                const selected = value === tag.id;
                const pastel = colors?.[tag.id];
                const active = pastel ? `${pastel.bg} ${pastel.text} ${pastel.border} shadow-sm` : tag.activeClass || TAG_ACTIVE;
                const dot = selected ? pastel?.dot || tag.dotClass || 'bg-white' : 'bg-stone-300';
                return (
                    <button
                        key={tag.id} type="button" aria-pressed={selected} disabled={disabled || locked}
                        onClick={() => { if (!selected) onChange?.(tag.id); else if (allowDeselect) onChange?.(null); }}
                        className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all disabled:cursor-not-allowed ${
                            selected ? active : 'border-stone-200 bg-stone-50 text-stone-600 enabled:hover:bg-stone-100'
                        } ${locked && !tag.isFinal ? 'opacity-40' : ''}`}
                    >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                        {tag.label}
                    </button>
                );
            })}
        </div>
    );
}
