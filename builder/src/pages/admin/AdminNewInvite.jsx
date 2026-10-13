import { useId, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cleanPhone } from '../../../../template/src/lib/format.js';
import { ErrorBanner, Field, Input, SectionCard, Spinner, SuccessBanner } from '../../../../template/src/ui/index.js';
import { adminCreateInvite } from '../../api.js';
import { InviteLink } from '../../components/InviteLink.jsx';
import { isEmail } from '../../components/wizardData.js';

const FIELDS = [
    { key: 'company', label: 'Company', required: true, autoComplete: 'organization' },
    { key: 'name', label: 'Contact name', autoComplete: 'name' },
    { key: 'phone', label: 'Mobile number', type: 'tel', inputMode: 'numeric', autoComplete: 'tel', placeholder: '10-digit mobile number' },
    { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
];

export function AdminNewInvite() {
    const id = useId();
    const [form, setForm] = useState({ company: '', name: '', phone: '', email: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [created, setCreated] = useState(null);

    const problem = !form.company.trim() ? 'Enter the company name.'
        : form.phone && cleanPhone(form.phone).length !== 10 ? 'The mobile number needs 10 digits.'
            : form.email.trim() && !isEmail(form.email) ? 'The email address does not look right.' : '';

    const submit = async event => {
        event.preventDefault();
        if (problem) { setError(problem); return; }
        setBusy(true);
        setError('');
        const contact = { company: form.company.trim(), name: form.name.trim(), phone: cleanPhone(form.phone), email: form.email.trim() };
        try {
            const result = await adminCreateInvite({ company: contact.company, contact });
            setCreated({ ...result, contact });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto max-w-2xl space-y-5">
            <a href="#/admin" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-stone-900">
                <ArrowLeft size={16} aria-hidden="true" /> All clients
            </a>
            <h1 className="text-2xl font-bold text-stone-900">New invite</h1>
            {created ? (
                <SectionCard>
                    <SuccessBanner title={`Invite ready for ${created.contact.company}`}>Send the link below. It works for 90 days.</SuccessBanner>
                    <InviteLink link={created.link} contact={created.contact} />
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <a href={`#/admin/i/${created.id}`} className="sf-btn-primary min-h-11">Open client page</a>
                        <button type="button" onClick={() => { setCreated(null); setForm({ company: '', name: '', phone: '', email: '' }); }} className="sf-btn-secondary min-h-11">
                            Create another invite
                        </button>
                    </div>
                </SectionCard>
            ) : (
                <form onSubmit={submit} noValidate>
                    <SectionCard>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {FIELDS.map(field => (
                                <Field key={field.key} label={field.label} htmlFor={`${id}-${field.key}`} required={field.required}>
                                    <Input id={`${id}-${field.key}`} type={field.type || 'text'} inputMode={field.inputMode} autoComplete={field.autoComplete}
                                        placeholder={field.placeholder} value={form[field.key]} maxLength={120}
                                        onChange={event => { setForm(current => ({ ...current, [field.key]: event.target.value })); setError(''); }} />
                                </Field>
                            ))}
                        </div>
                        <p className="text-xs text-stone-500">These details are filled in on the client’s form; they can correct them there.</p>
                        <ErrorBanner>{error}</ErrorBanner>
                        <button type="submit" disabled={busy} className="sf-btn-primary min-h-11 w-full sm:w-auto">
                            {busy && <Spinner size={14} />} Create invite
                        </button>
                    </SectionCard>
                </form>
            )}
        </div>
    );
}
