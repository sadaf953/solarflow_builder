// The Auth settings of a client project, as one PATCH /v1/projects/{ref}/config/auth
// body. These are README.client.md step 2 plus the client's own Brevo SMTP
// and the branded emails. Pure, so tests can check every field.
import { BREVO_SMTP } from '../../builder/src/catalog/goLive.js';
import { LINK_HOURS, inviteEmail, recoveryEmail } from './emails.js';

// Emails per hour once the client's own SMTP is set. Supabase's default is
// 30; Brevo's free plan allows 300 a day, so 30 an hour leaves room for a
// busy day of password resets without letting a script drain the quota.
export const EMAIL_RATE_PER_HOUR = 30;
export const PASSWORD_MIN_LENGTH = 8;

/** Every address the app is served from, as redirect patterns for Auth. */
export const redirectList = urls => [...new Set(urls.filter(Boolean))].flatMap(url => [url, `${url}/**`]).join(',');

/**
 * `siteUrl`: the address emails link to. `urls`: every address the app is
 * served from. `smtp`: {login, key} from the client's secrets file, or null
 * (then the SMTP settings are left as they are). `smtpOn`: the project has
 * the client's SMTP, now or from an earlier run. `templates`: false leaves
 * the emails as they are (see steps.js).
 */
export function authSettings({ siteUrl, urls, companyName, smtp, smtpOn = Boolean(smtp), senderEmail, senderName, templates = true }) {
    const body = {
        site_url: siteUrl,
        uri_allow_list: redirectList([siteUrl, ...urls]),
        disable_signup: true,
        external_anonymous_users_enabled: false,
        external_email_enabled: true,
        password_min_length: PASSWORD_MIN_LENGTH,
        // README step 2: confirm email stays off unless the client has their own SMTP.
        mailer_autoconfirm: !smtpOn,
        mailer_otp_exp: LINK_HOURS * 3600,
    };
    if (templates) {
        const invite = inviteEmail({ companyName });
        const recovery = recoveryEmail({ companyName });
        Object.assign(body, {
            mailer_subjects_invite: invite.subject,
            mailer_templates_invite_content: invite.html,
            mailer_subjects_recovery: recovery.subject,
            mailer_templates_recovery_content: recovery.html,
        });
    }
    if (smtp) {
        Object.assign(body, {
            smtp_host: BREVO_SMTP.host,
            smtp_port: String(BREVO_SMTP.port),
            smtp_user: smtp.login,
            smtp_pass: smtp.key,
            smtp_admin_email: senderEmail,
            smtp_sender_name: senderName,
            rate_limit_email_sent: EMAIL_RATE_PER_HOUR,
        });
    }
    return body;
}
