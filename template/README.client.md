# SolarFlow for {{CLIENT_NAME}}

This folder is your own copy of SolarFlow. It runs on your own Supabase project, so your customer data stays in your account. Setup takes about 20 minutes and is done once.

You need:
- a free Supabase account (https://supabase.com)
- Node.js 20 or newer, to build the app
- somewhere to host a static website, such as Netlify, Vercel, Cloudflare Pages or cPanel

## 1. Create the Supabase project

1. In Supabase, click **New project**.
2. Pick a name and a strong database password, and keep the password safe. You will not need it below.
3. Set **Region** to **South Asia (Mumbai)**.
4. Wait until the project is ready.

## 2. Authentication settings

Go to **Authentication → Sign In / Providers**:

1. **Email**: on. Supabase refuses passwords shorter than 6 characters; use at least 8 for every login.
2. **Confirm email**: off. Turn it on only if you have set up your own email (SMTP) under Authentication → Emails.
3. **Allow new users to sign up**: off. This is required, not optional. Staff logins are created inside SolarFlow. While sign-ups are on, anyone who knows your app address can make an account; until the owner login exists, someone signing up with the owner's email address (or, if no owner email was given, whoever signs up first) would become the admin.
4. **Allow anonymous sign-ins**: off.

Then go to **Authentication → URL Configuration**:

5. **Site URL**: your app's address, for example `https://crm.yourcompany.in`.
6. **Redirect URLs**: add the same address.

Password-reset emails send people back to this address with a one-time `?code=` in the link. The reset only works when the app's address is in both **Site URL** and **Redirect URLs**, and when the link is opened in the same browser where "Forgot password" was clicked.

**Email sending.** Supabase's built-in email is only for testing: it sends a handful of emails per hour, so password-reset emails will soon stop arriving. For real use, add your own email service under **Authentication → Emails → SMTP Settings** (for example Zoho Mail, Google Workspace, Amazon SES or Brevo).

## 3. Create the database

1. Open **SQL Editor → New query**.
2. Open `backend/setup.sql` from this folder, copy all of it, paste it into the editor and click **Run**.
3. You should see "Success". The script is safe to run again: it adds anything that is missing, never deletes your data, and leaves tables you added yourself alone. It is not a migration tool, so do not rely on it to rename or convert columns you changed by hand.

## 4. Deploy the staff-login function

SolarFlow creates and manages staff logins through a small server function called `add_user`.

**Option A: dashboard**
1. Go to **Edge Functions → Deploy a new function → Via Editor**.
2. Name it exactly `add_user`.
3. Replace the sample code with everything in `backend/functions/add_user/index.ts`, then click **Deploy**.

**Option B: command line**

The command line tool looks for functions in a `supabase/functions` folder, so first copy the `backend/functions/add_user` folder to `supabase/functions/add_user` in this folder. Then run:
```
npx supabase login
npx supabase functions deploy add_user --project-ref <your-project-ref>
```
Your project ref is the part before `.supabase.co` in the project URL.

Optional: under **Edge Functions → Secrets**, add `ALLOWED_ORIGIN` with your app's address (for example `https://crm.yourcompany.in`). Only that site can then manage logins.

## 5. Create the owner login

1. Go to **Authentication → Users → Add user → Create new user**.
2. Email: **{{OWNER_EMAIL}}**. Choose a password of at least 8 characters and tick **Auto Confirm User**.
3. This login becomes the SolarFlow admin. Create everyone else from inside SolarFlow, under Staff logins.

Do this before you share the app's address with anyone. People who sign up on their own, and any other account added here, wait for approval in Staff logins: they have no access until the admin chooses what they can do and clicks **Approve**.

## 6. Connect the app to your project

1. In this folder, copy `.env.example` to a new file named `.env`.
2. Go to **Project Settings → API Keys** (or **Project Settings → API**) and fill in:
   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<the anon / publishable key>
   ```
   Use **only** the anon or publishable key. **Never** put the `service_role` or secret key in `.env`: everything in this file is visible in the browser.

## 7. Build and publish

```
npm ci
npm run build
```

`npm ci` installs the exact package versions in `package-lock.json`, the ones this app was built and tested with. Use `npm install` only when you mean to update packages.

Upload the contents of the `dist/` folder to your web host:
- **Netlify / Vercel / Cloudflare Pages**: set the build command to `npm run build` and the output folder to `dist`, or drag the `dist` folder into the dashboard.
- **cPanel or any other host**: upload everything inside `dist/` to the site's folder (for example `public_html`).

**Building from Git.** This folder includes a `.gitignore`, so `node_modules`, `dist` and your `.env` stay out of Git. Because `.env` is not committed, a host that builds from your Git repository (Netlify, Vercel, Cloudflare Pages) does not have it: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, with the same values as in `.env`, under the host's **Environment variables** setting, then build again. Without them the build stops with "Supabase is not set up for this app yet."

SolarFlow's pages use `#` links, so no rewrite rules are needed. If your host asks for a "single-page app" fallback, point it to `index.html`.

Open your site and sign in as {{OWNER_EMAIL}}.

## If something goes wrong

- **The owner sees "This email has no account in this workspace yet"**: run `backend/setup.sql` again (step 3). It adds the missing profile.
- **The owner is told the login is switched off or waiting for approval**: the owner login was made with another email address, or after another admin. Open SQL Editor and run this, with the owner's email between the quotes:
  `update public.profiles set user_type = 'admin', role = 'Admin', status = 'active' where lower(email) = lower('{{OWNER_EMAIL_SQL}}');`
- **"Could not reach the account-creation service"** when adding staff: the `add_user` function is not deployed. Repeat step 4.
- **Password-reset link does nothing or says it has expired**: check that your app's address is in **Site URL** and **Redirect URLs** (step 2), open the newest email only, and open it in the same browser where you asked for the reset. If emails stop arriving, set up your own SMTP (step 2).
- **Changes after an update**: follow "Upgrading an existing install" below.

## Changing features later

Which features are on and which stages the pipeline has are set in `src/config/client.config.js`. The database keeps its own copy of them (it checks stage moves, login types and stock against it), so the app and the database must be changed together:

1. Edit `src/config/client.config.js`: change `true` / `false` under `features`, or the list under `pipeline` → `stages`. Rename a stage by changing its `label`, never its `id`. Before you remove a stage, move every customer out of it.
2. Run `npm run setup-sql`. It checks your changes and writes a new `backend/setup.sql`.
3. Run the new `backend/setup.sql` in the SQL Editor, as in section 3 above.
4. Build and publish the app again (step 7).

Changing the file and rebuilding alone is not enough: the database would still refuse new stages and login types. A new download from the SolarFlow builder replaces `client.config.js`, so tell the SolarFlow team about changes you make here. For dropdown lists, `setup.sql` only adds items that are missing; to rename or remove one, use the **Operations** page in SolarFlow.

## Upgrading an existing install

When you get a new SolarFlow download for a project that is already running:

1. Copy your `.env` file from the old folder into the new one.
2. Run the new `backend/setup.sql` in the SQL Editor, as in step 3. It adds what the update needs (for example the "PM Surya Ghar model agreement" checklist item) and keeps your customers and logins. Your admins stay admins; the owner email only matters while there is no admin.
3. Deploy `add_user` again (step 4), replacing the old code.
4. Build and publish the app again (step 7).
5. Open **Staff logins**. Accounts that were added by hand or signed up on their own, and that nobody has set up yet, now show as **Waiting for approval**. An older account that someone already edited stays a switched-off login: edit or delete it there.

Channel partner logins made by an older version may have no partner name set, so they see only the leads they added themselves, not the ones filed under their name. Run this once in the SQL Editor to use each login's own name, as SolarFlow now does for new channel partner logins:
```sql
update public.profiles set channel_partner = name
where user_type = 'agent' and coalesce(trim(channel_partner), '') = '';
```

## Not included

- **Emails to installers.** SolarFlow does not email vendors or installers when a job is assigned. Installers with a login see their jobs in the app.
