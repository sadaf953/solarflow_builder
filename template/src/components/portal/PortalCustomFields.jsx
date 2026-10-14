import { FieldRenderer } from '../../ui/index.js';
import { portalCustomFields } from './customFields.js';

/** Inputs for a stage's extra fields; `values` is the draft custom_fields. Renders nothing when the stage has none. */
export function PortalCustomFields({ stage, values, onChange, disabled = false }) {
    const fields = portalCustomFields(stage);
    if (!fields.length) return null;
    return (
        <div className="space-y-3">
            {fields.map(field => (
                <FieldRenderer key={field.key} field={field} value={values?.[field.key]} disabled={disabled}
                    onChange={value => onChange(field.key, value)} />
            ))}
        </div>
    );
}
