import { useId, useMemo } from 'react';
import { ExternalLink, KeyRound, Rocket } from 'lucide-react';
import { ErrorBanner, Field, Input, SectionCard, Select, describedBy } from '../../../template/src/ui/index.js';
import { agency } from '../agency.js';
import { GO_LIVE_LIMITS, isOrgSlug, normalizeGoLive, resolveGoLive } from '../catalog/goLive.js';
import { CopyButton, DetailRows, Expander, MessageList } from './common.jsx';

const MODE_LABELS = { ours: 'Free address on our domain', own: 'Their own address' };
const yesNo = value => (value ? 'Yes' : 'No');
const shown = value => String(value ?? '').trim() || 'empty';
// A yes/no change as a select value; '' keeps the client's answer.
const choiceValue = value => (typeof value === 'boolean' ? (value ? 'yes' : 'no') : '');

/**
 * The client's go-live answers, the admin's changes to them (`overrides`,
 * settings.goLive: only the keys the admin set) and what provisioning will
 * use, from resolveGoLive like scripts/provision.mjs.
 */
export function GoLivePanel({ submission, config, overrides = {}, onChange }) {
    const id = useId();
    const client = normalizeGoLive(submission.goLive);
    const slug = config.client.slug;
    const companyName = config.branding?.companyName || config.client.name;
    const live = useMemo(() => resolveGoLive({ submission, settings: { goLive: overrides }, slug, companyName, agencyDomain: agency.domain }),
        [submission, overrides, slug, companyName]);
    const changed = Object.keys(overrides).length;
    const command = `npm run provision -- client-zips/${slug}-setup.json`;

    const set = (key, value) => {
        const next = { ...overrides };
        if (value === '' || value == null) delete next[key];
        else next[key] = value;
        onChange(next);
    };
    const textField = (key, label, { placeholder, max, ...props } = {}) => {
        const fieldId = `${id}-${key}`;
        const hint = `The client gave: ${shown(client[key])}. Leave empty to use it.`;
        return (
            <Field label={label} htmlFor={fieldId} hint={hint}>
                <Input id={fieldId} value={overrides[key] ?? ''} placeholder={client[key] || placeholder} maxLength={max}
                    aria-describedby={describedBy(fieldId, { hint })} onChange={event => set(key, event.target.value)} {...props} />
            </Field>
        );
    };
    const yesNoField = (key, label) => (
        <Field label={label} htmlFor={`${id}-${key}`}>
            <Select id={`${id}-${key}`} value={choiceValue(overrides[key])} onChange={event => set(key, event.target.value ? event.target.value === 'yes' : null)}
                options={[{ value: '', label: `As the client said (${yesNo(client[key])})` }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        </Field>
    );
    const urlProps = { inputMode: 'url', autoCapitalize: 'none', spellCheck: false };

    const orgLink = isOrgSlug(live.supabaseOrg) ? `https://supabase.com/dashboard/org/${live.supabaseOrg}` : '';
    const rows = [
        ['Web address', live.siteUrl ? `${live.siteUrl} (${live.domainMode === 'own' ? 'their own address' : 'free address'})` : ''],
        ['Supabase organization', live.supabaseOrg && (orgLink
            ? <a href={orgLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-blue-700 underline sm:min-h-0">
                {live.supabaseOrg} <ExternalLink size={12} aria-hidden="true" /></a>
            : live.supabaseOrg)],
        ['Agency invited as Administrator', yesNo(live.supabaseInvited)],
        ['Email sender', live.senderEmail ? `${live.senderName} <${live.senderEmail}>` : ''],
        ['Sender verified in Brevo', yesNo(live.brevoReady)],
    ];

    return (
        <SectionCard title="Go live" icon={Rocket} subtitle="Web address, Supabase organization and email sender, as the provisioning script will use them.">
            <DetailRows rows={rows} />
            {live.problems.length > 0 && <ErrorBanner title="Provisioning cannot start yet"><MessageList items={live.problems} /></ErrorBanner>}
            {live.warnings.length > 0 && (
                <div role="status" className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                    <p className="font-bold">Check these</p>
                    <div className="mt-1"><MessageList items={live.warnings} /></div>
                </div>
            )}
            {live.domainMode === 'own' && live.hostname && (
                <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                    The client adds one CNAME record for {live.hostname} at their domain provider. Send it to them after provisioning; until it works, the app goes live on the free address.
                </p>
            )}
            <p className="flex gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
                <KeyRound size={18} className="mt-0.5 shrink-0 text-orange-600" aria-hidden="true" />
                The client sends their Brevo SMTP key on WhatsApp or a call. It goes only into the client’s secrets file for the provisioning script, never on this page or in the answers file.
            </p>

            <Expander title="Correct the go-live details (admin)" subtitle={changed ? `${changed} changed by you` : 'Only where the client’s answers need correcting'}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Web address" htmlFor={`${id}-domainMode`}>
                        <Select id={`${id}-domainMode`} value={overrides.domainMode ?? ''} onChange={event => set('domainMode', event.target.value)}
                            options={[{ value: '', label: `As the client chose (${MODE_LABELS[client.domainMode]})` }, { value: 'ours', label: MODE_LABELS.ours }, { value: 'own', label: MODE_LABELS.own }]} />
                    </Field>
                    {textField('ownDomain', 'Their own address', { placeholder: 'crm.client.in', max: GO_LIVE_LIMITS.domain, ...urlProps })}
                    {textField('supabaseOrg', 'Supabase organization', { placeholder: 'Organization link or slug', max: 200, ...urlProps })}
                    {yesNoField('supabaseInvited', 'Agency invited as Administrator')}
                    {textField('senderEmail', 'Sender email', { placeholder: 'info@client.in', max: GO_LIVE_LIMITS.email, type: 'email', ...urlProps, inputMode: 'email' })}
                    {textField('senderName', 'Sender name', { placeholder: companyName, max: GO_LIVE_LIMITS.senderName })}
                    {yesNoField('brevoReady', 'Sender verified in Brevo')}
                </div>
            </Expander>

            <div className="space-y-2 rounded-xl bg-stone-50 p-3">
                <p className="text-sm font-bold text-stone-900">Provision the client’s Supabase project and site</p>
                <p className="text-xs text-stone-600">First click <b>Download answers (JSON)</b> below and save it in client-zips/. Then run:</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code className="min-w-0 flex-1 break-all rounded-lg bg-stone-900 px-3 py-2 text-xs text-stone-100">{command}</code>
                    <CopyButton text={command} label="Copy command" />
                </div>
            </div>
        </SectionCard>
    );
}
