// What the agency reads at the end of a run: where the app is, what was sent
// to whom, and what is still to do by hand.
import { describeRecord } from './dns.js';
import { liveUrl } from './steps.js';

const ADMIN_ROLE = /^(owner|admin)/i;

export function summaryLines(ctx) {
    const { state, goLive, report, memo } = ctx;
    const live = liveUrl(ctx);
    const lines = ['━━━ Summary ━━━', `App:            ${live}`];
    if (live !== goLive.siteUrl) lines.push(`                (${goLive.siteUrl} once ${state.dns?.ok ? 'its HTTPS certificate is ready' : 'its DNS record is in'})`);
    if (memo.agencyDomainNote) lines.push(`                ${memo.agencyDomainNote}`);
    lines.push(`Supabase:       ${state.supabase?.ref ? `https://supabase.com/dashboard/project/${state.supabase.ref}` : '—'}`);
    if (state.netlify?.adminUrl) lines.push(`Netlify:        ${state.netlify.adminUrl}`);

    const owner = ctx.ownerEmail;
    const invite = {
        sent: `${owner}: their “Set your password” email is on its way.`,
        resent: `${owner}: a new “Choose a password” email is on its way.`,
        'signed-in': `${owner} has signed in already.`,
        pending: `${owner} was invited on ${state.invite?.sentAt || 'an earlier run'} and has not signed in yet (--resend-invite sends a new email).`,
    }[report.invite || (state.invite?.signedInAt ? 'signed-in' : state.invite?.sentAt ? 'pending' : '')];
    lines.push(`Owner:          ${invite || `${owner}: not invited yet (run the invite step).`}`);
    if (report.inviteUrl && report.inviteUrl !== goLive.siteUrl) {
        lines.push(`                The owner's link uses ${report.inviteUrl}; run the same command again later to switch the Site URL to ${goLive.siteUrl}. Both keep working.`);
    }

    if (memo.dbPassword) {
        lines.push('', 'Database password (not saved anywhere; this is the only copy):', `  ${memo.dbPassword}`,
            'Give this to the client. It can be reset in Supabase → Project Settings → Database.');
    }

    if (state.dns && !state.dns.ok) {
        lines.push('', goLive.domainMode === 'own' ? 'The client adds this record at their domain\'s DNS host:' : 'Add this DNS record for the agency domain:');
        for (const line of describeRecord({ ...state.dns.record, apex: state.dns.record.type === 'A', alias: 'apex-loadbalancer.netlify.com' })) lines.push(`  ${line}`);
        lines.push('Then run the same command again: it checks the record, asks Netlify for HTTPS and moves the app and its emails to this address.');
    } else if (state.dns && !state.dns.https) {
        lines.push('', `HTTPS on ${goLive.hostname} is not ready yet. Netlify issues the certificate by itself, usually within minutes. Run the same command again later: it moves the app and its emails to ${goLive.siteUrl}.`);
    }

    // This run's result, else what the last run that changed Auth set.
    const smtpState = report.smtp || (state.auth ? (state.auth.smtp ? 'kept' : 'off') : '');
    const smtp = { set: `on (Brevo, from ${goLive.senderEmail})`, kept: 'on (set on an earlier run)', off: 'OFF: emails only reach members of the client\'s Supabase organization' }[smtpState] || '—';
    lines.push('', `Email (SMTP):   ${smtp}`);
    lines.push(`Keep-alive:     ${state.keepalive?.ref ? `daily job ${state.keepalive.job}${state.keepalive.rpcOk ? '' : ' (keepalive() did not answer)'}; weekly check: npm run keepalive` : 'not set up'}`);

    const todo = [];
    if (memo.dbPassword) todo.push('Send the client the database password above, privately.');
    if (state.dns && !state.dns.ok) todo.push(goLive.domainMode === 'own' ? 'Send the client the DNS record above, and run the same command again once it is in.' : 'Add the DNS record above.');
    if (smtpState === 'off') todo.push('Get the client\'s Brevo SMTP key into the secrets file and run again.');
    if (ADMIN_ROLE.test(memo.role || '')) {
        todo.push(`When the client has signed in and all is well: ask them to change the agency's role in ${goLive.supabaseOrg} to Developer (Supabase → Organization settings → Team). Supabase counts free projects against every Owner/Administrator, so staying Administrator blocks the next client's project. Developer can still run SQL, read keys and update the function.`);
    }
    lines.push('', 'Still to do:', ...todo.map(item => `  - ${item}`));
    if (report.warnings.length) lines.push('', `${report.warnings.length} warning(s) above.`);
    return lines;
}
