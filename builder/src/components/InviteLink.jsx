import { useId } from 'react';
import { ExternalLink } from 'lucide-react';
import { Field, Textarea } from '../../../template/src/ui/index.js';
import { CopyButton } from './common.jsx';

const whatsappText = (name, link) => `Hi ${String(name || '').trim() || 'there'}, please fill your SolarFlow setup form (about 5 minutes): ${link}`;

const emailText = (name, link) => [
    `Hi ${String(name || '').trim() || 'there'},`,
    '',
    'Please fill in your SolarFlow setup form. It takes about 5 minutes and saves as you go, so you can stop and come back with the same link:',
    '',
    link,
    '',
    'Keep your Excel or Google Sheet open next to it for the last part, where you choose your stages and fields.',
    '',
    'Thank you,',
    'The SolarFlow team',
].join('\n');

const waNumber = phone => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    return digits.length >= 11 ? digits : '';
};

/** A fresh setup link with the WhatsApp and email messages ready to copy. */
export function InviteLink({ link, contact = {} }) {
    const id = useId();
    const whatsapp = whatsappText(contact.name, link);
    const email = emailText(contact.name, link);
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
