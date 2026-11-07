# Provisioning a client in one command

`npm run provision` sets up a client's SolarFlow from their answers file: everything `template/README.client.md` asks a client to do by hand, done by the agency on day 1.

```bash
npm run provision -- client-zips/<slug>-setup.json
```

It creates the client's Supabase project **in the client's own Supabase organization** (billing stays with them), sets up the database, Auth and emails, deploys the staff-login function, builds the app, publishes it on the agency's Netlify, sets up DNS, and emails the client's admin a "Set your password" link.

## One-time agency setup

1. **Tokens.** Copy `.env.provision.example` to `.env.provision` (git ignores it) and fill it in:
   - `SUPABASE_ACCESS_TOKEN`: a personal access token of the agency's Supabase account (supabase.com → Account → Access Tokens).
   - `NETLIFY_AUTH_TOKEN`: a Netlify personal access token (User settings → Applications). `NETLIFY_ACCOUNT_SLUG` picks the team for client sites; leave it empty for your default team.
   - `AGENCY_DOMAIN`: the domain for free addresses, e.g. `example.in` gives `acme.example.in`. If it is empty, `VITE_AGENCY_DOMAIN` from `.env.local` is used.
2. **The agency domain's DNS**, one of:
   - **Netlify DNS** (simplest): add the domain under Netlify → Domains in the same team as the client sites. Netlify then adds each client's record by itself.
   - **Cloudflare**: set `CLOUDFLARE_API_TOKEN` (permission Zone → DNS → Edit, for that zone only) and `CLOUDFLARE_ZONE_ID`. Provisioning adds a CNAME per client (not proxied, so Netlify can issue the HTTPS certificate).
   - Anywhere else: provisioning prints the record to add by hand.

These tokens control every client's project and site. Keep them only in `.env.provision` (or your CI's secret store), never in a client folder. `npm run check:secrets` flags them if one ever lands in `template/`, `builder/` or `scripts/`.

## Per client

Before the run:

1. **Supabase.** The client signs up at supabase.com (free), creates an organization, and invites the agency's Supabase email as **Administrator** (Organization settings → Team → Invite). Accept the invite. The organization's slug (or its dashboard link) goes in the setup form's go-live step.
2. **Email.** The client creates a free Brevo account, verifies the sender address they want (e.g. `crm@acme.in`) under Senders, and creates an SMTP key (SMTP & API → SMTP → Generate a new SMTP key). They send you the **Login** shown on that page and the key. Put both in `client-zips/<slug>.secrets.env`:
   ```
   BREVO_SMTP_LOGIN=8a1b2c001@smtp-brevo.com
   BREVO_SMTP_KEY=xsmtpsib-...
   ```
   Use the SMTP key, not a Brevo API key (`xkeysib-…`, which stops the run). New SMTP keys start with `xsmtpsib-`; an older one without that prefix only gives a warning. The builder never stores this key; `client-zips/` is git-ignored.
3. **Answers.** On the client's admin page, check the go-live settings (address, organization, sender), then **Download answers (JSON)** into `client-zips/`.

Then:

```bash
npm run provision -- client-zips/<slug>-setup.json --dry-run   # checks and the plan; no network, no changes
npm run provision -- client-zips/<slug>-setup.json
```

At the end it prints the app address, that the owner's email is on its way, the **database password** (shown once, never saved: send it to the client privately; it can be reset in Project Settings → Database), any DNS record still to add, and what is left to do.

### Options

| Option | |
|---|---|
| `--dry-run` | Checks that need no network, then the plan. Changes nothing. |
| `--only <steps>` | Run only these steps (comma-separated), even if they look up to date. |
| `--skip <steps>` | Leave steps out. |
| `--resend-invite` | The owner never signed in: send a new "Choose a password" email. |
| `--skip-build` | Publish the existing `dist/` without building. |
| `--import <file.sql>` | Run a customer import (from `npm run import-customers`) once, after `setup.sql`. |
| `--secrets <file>` | Another Brevo secrets file. |
| `--verbose` | Print every API request (tokens redacted). |

## What each step does

| Step | What happens |
|---|---|
| checks | Tokens present and valid, the agency is a member of the client's organization (and its role), the free-project count (below), the Netlify team, the go-live settings, the client config, the secrets file. Any problem stops the run before anything changes. |
| files | Writes `client-zips/<slug>-solarflow.zip` exactly as `npm run make-client` does, and unzips it to `client-zips/<slug>-solarflow/`. |
| project | Finds the project `<slug>-solarflow` in the client's organization, or creates it in Mumbai with a random database password. |
| wait | Waits until the database, Auth and REST are healthy (up to 15 minutes). |
| database | Runs `backend/setup.sql` (again only when it changed), then `--import` if given. |
| keepalive | Enables `pg_cron` and `pg_net` and schedules one daily call to `keepalive()` (see below). |
| site | Finds or creates the Netlify site `<slug>-solarflow` (with a suffix if the name is taken) and sets its custom domain. |
| dns | Adds or checks the DNS record, asks Netlify for the HTTPS certificate once DNS points at Netlify, and checks that `https://<address>/` really answers. |
| auth | Sign-ups off, anonymous sign-ins off, email on, passwords of 8+, Site URL (the custom address once HTTPS works there, else the netlify.app one) and Redirect URLs (both), the client's Brevo SMTP (sender from the go-live settings, 30 emails an hour), and branded invite and password-reset emails whose links work for 24 hours. |
| function | Deploys `add_user` (JWT check on, as a dashboard deploy) and sets `ALLOWED_ORIGIN` to the app's addresses. |
| build | Writes the client folder's `.env` (project URL and the **publishable** key only), runs `npm ci` and `npm run build`. |
| deploy | Checks `dist/` for secrets, uploads it to Netlify and waits until it is live (again only when the build changed). |
| invite | If the owner email has no login yet, sends the Supabase invite. If DNS is right but the certificate is still being issued, it first waits up to 3 minutes so the link can use the custom address. The database makes that login the active admin. |

## Running it again

Run the same command whenever something failed or changed. Progress lives in `client-zips/<slug>/provision-state.json`: refs, ids, addresses, hashes and times, and **never** a key, token, SMTP key or password (the script refuses to write one). A re-run finds the project, site, function and owner instead of creating them again, skips `setup.sql`, the build and the upload when nothing changed, and never sends a second invite unless you pass `--resend-invite`.

After changing a client's answers (features, stages), download the answers again and re-run: the new `setup.sql`, build and deploy follow by themselves.

## The client's own domain

If the client chose their own address (e.g. `crm.acme.in`), the run prints the record they add at their DNS host:

```
CNAME  crm.acme.in  →  acme-solarflow.netlify.app
```

(For a bare domain such as `acme.in`: an A record to `75.2.60.5`, or ALIAS to `apex-loadbalancer.netlify.com`.)

Until that record is in **and HTTPS works there**, the app and its emails use `https://acme-solarflow.netlify.app`, so the owner's day-1 invite never opens on a certificate error. Once the client has added it, run the same command again: it checks the record, requests HTTPS, and as soon as `https://crm.acme.in` answers it moves the Site URL there. Both addresses keep working, including links already sent.

The same applies to the agency domain: Netlify usually issues the certificate within minutes, and the invite waits up to 3 minutes for it. If it is not ready by then, the owner's link uses the netlify.app address and the summary says so; a later run switches the Site URL.

## Last step: make the agency a Developer

Supabase allows **two active free projects per person**, counted across every organization where that person is Owner or Administrator, and a free organization cannot start a project while any of its Owners/Administrators is at that limit. If the agency stayed Administrator in every client's organization, the third client could not get a project.

So once the client has signed in and all is well, ask them to change the agency's role to **Developer** (Supabase → Organization settings → Team). The summary reminds you. As Developer the agency can still run SQL, read keys, update `add_user` and run the health check; the Auth settings and function secrets then keep their values (a re-run says so and carries on). For a bigger change to those, the client makes the agency Administrator again for that run.

The checks list every organization where the agency is still Owner/Administrator with active free projects, and warn when a new project would hit the limit. If project creation fails on the limit, the message says which organizations count and what to do.

## Keep-alive and the weekly health check

Free projects pause after 7 days without activity. Two layers keep them awake:

1. **In each project**, a daily `pg_cron` job (`solarflow-keepalive`, 03:00 UTC) calls `https://<ref>.supabase.co/rest/v1/rpc/keepalive` with the public key. `public.keepalive()` only returns the time; it is the one function anon may call.
2. **The agency's weekly check**, which also calls `keepalive()`:
   ```bash
   npm run keepalive
   ```
   For every client in `client-zips/*/provision-state.json` it calls `keepalive()` and, with `SUPABASE_ACCESS_TOKEN`, reports the project status and the daily job's last run. It exits with 1 when a client is paused, unhealthy or its job is failing. A paused project must be restored by the client (Developer cannot).

Run it weekly from the agency's machine, e.g. with cron (`crontab -e`):

```
0 9 * * 1 cd ~/Desktop/solarflow_client_builder && npm run keepalive >> ~/solarflow-keepalive.log 2>&1
```

(on macOS, a launchd agent with `StartCalendarInterval` Weekday 1, Hour 9 running the same command works too).

Or from GitHub Actions. There are no state files in Git, so use `--from-api`: it checks every project named `<slug>-solarflow` that the token can see. Store the token as a repository secret; the workflow itself holds no client data:

```yaml
name: keepalive
on:
  schedule: [{ cron: '0 9 * * 1' }]
  workflow_dispatch:
jobs:
  keepalive:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: node scripts/keepalive.mjs --from-api
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

The check needs no `npm ci` (it uses only Node's own modules). When a scheduled run fails, GitHub notifies whoever last changed the schedule in the workflow file: that is the alert.

## Troubleshooting

- **"not in the client's organization"**: the client has not invited the agency's Supabase email yet, or the invite was not accepted. The message shows the email to invite.
- **"Creating the project needs Owner or Administrator"**: the client invited the agency as Developer. They change the role to Administrator for the first run.
- **Free-project limit**: see "Last step" above; the message lists the organizations that count.
- **"No SMTP"**: no `client-zips/<slug>.secrets.env`. Emails then come from Supabase's test mailer, which only delivers to members of the client's Supabase organization, a few an hour. Add the file and run again.
- **The owner's email did not arrive**: check the sender is verified in the client's Brevo account (Brevo refuses mail from unverified senders) and look in spam. Then `--resend-invite`. Links work for 24 hours; only the newest one works.
- **"The project … is paused"**: the client restores it in Supabase (the project → Restore project), then run again.
- **Netlify "name taken"**: handled automatically with a suffix. **"Another Netlify site may already use this address"**: remove the custom domain from the other site.
- **DNS not visible yet, or "HTTPS … is not ready yet"**: new records can take minutes (sometimes hours at some DNS hosts), and the certificate follows. Run again later; nothing is repeated, and the Site URL moves to the custom address once it works.
- **A step failed half-way**: fix what the message says and run the same command again. `--verbose` shows each API request (without tokens).
- **Starting a client over**: delete their Supabase project and Netlify site first, then remove `client-zips/<slug>/provision-state.json`. Otherwise never edit the state file by hand.
