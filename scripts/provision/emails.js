// The invite and password-reset emails of a client project (Supabase Auth
// templates, which are Go templates).
//
// Contract with the app (template/src/lib/emailLink.js): the links are
//   {{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite
//   {{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery
// The app verifies the token itself, so the links work in any browser,
// unlike the default PKCE links that only work where "Forgot password" was
// clicked.

// How long a link works. Auth's mailer_otp_exp is set to match, so the
// owner's day-1 invite does not expire overnight (the default is 1 hour).
export const LINK_HOURS = 24;

export const emailLink = type => `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=${type}`;

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// A company name inside a template: HTML-escaped, and braces written as
// entities so a name like "{{ .Token }}" cannot become a template action.
const htmlName = name => escapeHtml(name).replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
// Subjects are plain text but still templates: no braces, one line.
const subjectName = name => String(name ?? '').replace(/[{}]/g, '').replace(/[\p{Cc}\s]+/gu, ' ').trim();

function layout({ companyName, heading, intro, button, link, after }) {
    const company = htmlName(companyName);
    return [
        '<!doctype html>',
        '<html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917;">',
        '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">',
        `<p style="margin:0 0 4px;font-size:13px;color:#78716c;">${company} · SolarFlow</p>`,
        `<h1 style="margin:0 0 16px;font-size:20px;">${heading}</h1>`,
        ...intro.map(line => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;">${line}</p>`),
        `<p style="margin:20px 0;"><a href="${link}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;">${button}</a></p>`,
        `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#57534e;">If the button does not work, copy this address into your browser:<br>${link}</p>`,
        ...after.map(line => `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#57534e;">${line}</p>`),
        '</div></body></html>',
        '',
    ].join('\n');
}

export function inviteEmail({ companyName }) {
    const name = subjectName(companyName);
    return {
        subject: `Set your password for ${name || 'SolarFlow'}`,
        html: layout({
            companyName,
            heading: 'Your SolarFlow login is ready',
            intro: [
                `${htmlName(companyName)} has a new SolarFlow app, and you are its admin.`,
                'Click the button to choose your password. You will then be signed in.',
            ],
            button: 'Set my password',
            link: emailLink('invite'),
            after: [
                `The link works once, for ${LINK_HOURS} hours. Next time, sign in at {{ .SiteURL }} with {{ .Email }} and your password.`,
                'Not expecting this email? You can ignore it.',
            ],
        }),
    };
}

export function recoveryEmail({ companyName }) {
    const name = subjectName(companyName);
    return {
        subject: `Reset your ${name ? `${name} ` : ''}SolarFlow password`,
        html: layout({
            companyName,
            heading: 'Choose a new password',
            intro: [
                'Someone asked to reset the SolarFlow password for {{ .Email }}.',
                'Click the button to choose a new password.',
            ],
            button: 'Choose a new password',
            link: emailLink('recovery'),
            after: [
                `The link works once, for ${LINK_HOURS} hours. Only the newest reset email works.`,
                'Did not ask for this? Ignore this email: your password stays as it is.',
            ],
        }),
    };
}
