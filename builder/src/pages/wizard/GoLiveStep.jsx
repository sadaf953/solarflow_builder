import { useId, useState } from 'react';
import { Database, ExternalLink, Globe, KeyRound, Link2, Mail, PhoneCall } from 'lucide-react';
import { slugify } from '../../../../template/src/config/resolve.js';
import { ChoiceCards, Field, Input, SectionCard, describedBy } from '../../../../template/src/ui/index.js';
import { agency, inviteEmailText } from '../../agency.js';
import { GO_LIVE_LIMITS, isOrgSlug, normalizeGoLive, normalizeHostname, normalizeOrgSlug } from '../../catalog/goLive.js';
import { StepNav } from '../../components/common.jsx';
import { goLiveErrors } from './checks.js';

const SUPABASE_SIGN_UP = 'https://supabase.com/dashboard/sign-up';
const BREVO_SIGN_UP = 'https://www.brevo.com';

/** Numbered instructions; the visible numbers are decoration for the <ol>. */
function Steps({ items }) {
    return (
        <ol className="space-y-2.5 text-sm leading-relaxed text-stone-700">
            {items.map((item, index) => (
                <li key={index} className="flex gap-3">
                    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-800">{index + 1}</span>
                    <span className="min-w-0 pt-0.5">{item}</span>
                </li>
            ))}
        </ol>
    );
}

function OutLink({ href, children }) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="sf-btn-secondary min-h-11 w-full sm:w-auto">
            {children} <ExternalLink size={14} aria-hidden="true" />
        </a>
    );
}

function CheckRow({ id, checked, onChange, children }) {
    return (
        <label htmlFor={id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-semibold text-stone-800 ${checked ? 'border-orange-400 bg-orange-50' : 'border-stone-200 bg-white hover:border-stone-300'}`}>
            <input id={id} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 shrink-0 accent-orange-600" />
            <span className="min-w-0">{children}</span>
        </label>
    );
}

const Why = ({ children }) => <p className="text-sm text-stone-600">{children}</p>;

/**
 * Go live: the app's web address, the client's Supabase organization and
 * their Brevo email sender. All optional; only malformed values hold up
 * sending. The SMTP key is never asked for here.
 */
export function GoLiveStep({ submission, onChange, onBack, onNext }) {
    const id = useId();
    const [touched, setTouched] = useState({});
    const [tried, setTried] = useState(false);
    const goLive = normalizeGoLive(submission.goLive);
    const contact = submission.contact || {};
    const company = String(contact.company || '').trim();
    const ownerEmail = String(contact.email || '').trim();
    const slug = company ? slugify(company) : 'your-company';
    const freeAddress = agency.domain ? `${slug}.${agency.domain}` : '';
    const inviteEmail = inviteEmailText();

    const allErrors = goLiveErrors(goLive);
    const errors = Object.fromEntries(Object.entries(allErrors).filter(([key]) => tried || touched[key]));
    const touch = key => setTouched(current => ({ ...current, [key]: true }));
    const next = () => {
        const found = Object.keys(allErrors);
        if (!found.length) { onNext(); return; }
        setTried(true);
        document.getElementById(`${id}-${found[0]}`)?.focus();
    };
    const control = key => ({
        id: `${id}-${key}`,
        value: goLive[key],
        'aria-invalid': errors[key] ? true : undefined,
        onChange: event => onChange({ [key]: event.target.value }),
    });

    const addressOptions = [
        {
            value: 'ours', label: 'Free address from us', icon: Globe,
            description: freeAddress ? `Your app opens at ${freeAddress}. Nothing to set up.` : `An address with ${slug} in it, on our domain. Nothing to set up.`,
        },
        { value: 'own', label: 'My own address', icon: Link2, description: 'For example crm.yourcompany.in, on a domain you already have.' },
    ];
    const ownHint = 'Without https://. We will send you one setting to add where you bought your domain, such as GoDaddy or Hostinger. Until it works, your app opens on the free address.';
    const orgHint = 'Paste the address of the Team page from your browser, or the short name after /org/ in it.';
    const nameHint = `The name your team sees in their inbox. Leave it empty to use ${company || 'your company name'}.`;

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex gap-2 font-semibold">
                    <PhoneCall size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                    Not ready yet? Skip this step — we'll do it with you on a short call.
                </p>
                <button type="button" onClick={onNext} className="sf-btn-secondary min-h-11 shrink-0">Skip for now</button>
            </div>
            <p className="text-sm text-stone-600">Three short things put your app online. Each takes a few minutes, and both accounts are free.</p>

            <SectionCard title="Your app's web address" icon={Globe} subtitle="Where your team opens SolarFlow.">
                <ChoiceCards label="Your app's web address" value={goLive.domainMode} onChange={domainMode => onChange({ domainMode })} options={addressOptions} />
                {goLive.domainMode === 'own' && (
                    <Field label="Your address" htmlFor={`${id}-ownDomain`} hint={ownHint} error={errors.ownDomain}>
                        <Input {...control('ownDomain')} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                            placeholder="crm.yourcompany.in" maxLength={GO_LIVE_LIMITS.domain}
                            aria-describedby={describedBy(`${id}-ownDomain`, { hint: ownHint, error: errors.ownDomain })}
                            onBlur={event => { onChange({ ownDomain: normalizeHostname(event.target.value) }); touch('ownDomain'); }} />
                    </Field>
                )}
            </SectionCard>

            <SectionCard title="Your Supabase account" icon={Database} subtitle="Where your customer data is kept.">
                <Why>Your customer data is kept in your own Supabase account, so it always stays yours.</Why>
                <Steps items={[
                    <>Sign up for free at supabase.com{ownerEmail ? <>, ideally with <b className="break-all">{ownerEmail}</b></> : ''}.</>,
                    <>Create an organization. Name it <b>{company || 'after your company'}</b> and choose the <b>Free</b> plan.</>,
                    <>Open <b>Organization settings → Team → Invite</b>. Type <b className="break-all">{inviteEmail}</b>, choose the role <b>Administrator</b> and send the invite.</>,
                    <>Copy the address of that page from your browser and paste it below.</>,
                ]} />
                <OutLink href={SUPABASE_SIGN_UP}>Open Supabase sign-up</OutLink>
                <p className="text-xs text-stone-500">Once your app is live, we will ask you to change our role to Developer.</p>
                <Field label="Organization link or name" htmlFor={`${id}-supabaseOrg`} hint={orgHint} error={errors.supabaseOrg}>
                    <Input {...control('supabaseOrg')} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                        placeholder="https://supabase.com/dashboard/org/…" maxLength={200}
                        aria-describedby={describedBy(`${id}-supabaseOrg`, { hint: orgHint, error: errors.supabaseOrg })}
                        onBlur={event => {
                            const orgSlug = normalizeOrgSlug(event.target.value);
                            if (isOrgSlug(orgSlug)) onChange({ supabaseOrg: orgSlug });
                            touch('supabaseOrg');
                        }} />
                </Field>
                <CheckRow id={`${id}-supabaseInvited`} checked={goLive.supabaseInvited} onChange={supabaseInvited => onChange({ supabaseInvited })}>
                    I have invited <span className="break-all">{agency.email || 'the SolarFlow team'}</span>
                </CheckRow>
            </SectionCard>

            <SectionCard title="Emails from your app (Brevo)" icon={Mail} subtitle="Set-your-password and forgot-password emails.">
                <Why>These emails come from your own email address, so your team knows they are really from you.</Why>
                <Steps items={[
                    <>Sign up for free at brevo.com.</>,
                    <>Open <b>Senders</b> and add a sender with your business email. Brevo emails you a link: click it to verify the sender.</>,
                    <>Open <b>SMTP & API → SMTP</b> and click <b>Generate a new SMTP key</b>. Copy the key.</>,
                    <><b>Send the key to us on WhatsApp — never type it here.</b></>,
                ]} />
                <OutLink href={BREVO_SIGN_UP}>Open Brevo</OutLink>
                <p className="flex gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                    <KeyRound size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                    The SMTP key works like a password. Only send it to us on WhatsApp or tell us on a call. This form never asks for it.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Sender email" htmlFor={`${id}-senderEmail`} error={errors.senderEmail}>
                        <Input {...control('senderEmail')} type="email" inputMode="email" autoCapitalize="none" spellCheck={false}
                            placeholder="info@yourcompany.in" maxLength={GO_LIVE_LIMITS.email}
                            aria-describedby={describedBy(`${id}-senderEmail`, { error: errors.senderEmail })}
                            onBlur={() => touch('senderEmail')} />
                    </Field>
                    <Field label="Sender name" htmlFor={`${id}-senderName`} hint={nameHint} error={errors.senderName}>
                        <Input {...control('senderName')} placeholder={company || 'Your company name'} maxLength={GO_LIVE_LIMITS.senderName}
                            aria-describedby={describedBy(`${id}-senderName`, { hint: nameHint, error: errors.senderName })}
                            onBlur={() => touch('senderName')} />
                    </Field>
                </div>
                <CheckRow id={`${id}-brevoReady`} checked={goLive.brevoReady} onChange={brevoReady => onChange({ brevoReady })}>
                    This sender is verified in Brevo
                </CheckRow>
            </SectionCard>

            <StepNav onBack={onBack} onNext={next} />
        </div>
    );
}
