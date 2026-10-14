import { useId } from 'react';
import { ExternalLink } from 'lucide-react';
import { Field, Textarea } from '../../../template/src/ui/index.js';
import { CopyButton } from './common.jsx';
import { emailInviteText, whatsappInviteText } from './wizardData.js';

const waNumber = phone => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    return digits.length >= 11 ? digits : '';
};

/** A fresh setup link with the WhatsApp and email messages ready to copy. */
export function InviteLink({ link, contact = {} }) {
    const id = useId();
    const whatsapp = whatsappInviteText(contact.name, link);
    const email = emailInviteText(contact.name, link);
    const number = waNumber(contact.phone);
    return (
        <div className="space-y-4">
            <Field label="Setup link" htmlFor={`${id}-link`} hint="Shown only now. If you lose it, make a new link from the client page.">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input id={`${id}-link`} readOnly value={link} aria-describedby={`${id}-link-hint`}
                        onFocus={event => event.target.select()} className="sf-input min-h-11 font-mono text-xs" />
                    <CopyButton text={link} label="Copy link" className="sf-btn-primary min-h-11 shrink-0" />
                </div>
            </Field>
            <Field label="WhatsApp message" htmlFor={`${id}-wa`}>
                <Textarea id={`${id}-wa`} readOnly rows={3} value={whatsapp} />
                <div className="flex flex-wrap gap-2">
                    <CopyButton text={whatsapp} label="Copy WhatsApp message" />
                    {number && (
                        <a href={`https://wa.me/${number}?text=${encodeURIComponent(whatsapp)}`} target="_blank" rel="noopener noreferrer" className="sf-btn-secondary min-h-11">
                            <ExternalLink size={14} aria-hidden="true" /> Open in WhatsApp
                        </a>
                    )}
                </div>
            </Field>
            <Field label="Email" htmlFor={`${id}-email`}>
                <Textarea id={`${id}-email`} readOnly rows={8} value={email} />
                <CopyButton text={email} label="Copy email text" />
            </Field>
        </div>
    );
}
