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

1. **Email**: on.
2. **Confirm email**: off. Turn it on only if you have set up your own email (SMTP) under Authentication → Emails.
3. **Allow new users to sign up**: off. Staff logins are created inside SolarFlow.
4. **Allow anonymous sign-ins**: off.

Then go to **Authentication → URL Configuration**:

5. **Site URL**: your app's address, for example `https://crm.yourcompany.in`.
6. **Redirect URLs**: add the same address.

## 3. Create the database

1. Open **SQL Editor → New query**.
2. Open `backend/setup.sql` from this folder, copy all of it, paste it into the editor and click **Run**.
3. You should see "Success". The script is safe to run again if anything was interrupted. It never deletes your data.

## 4. Deploy the staff-login function

SolarFlow creates and manages staff logins through a small server function called `add_user`.

**Option A: dashboard**
1. Go to **Edge Functions → Deploy a new function → Via Editor**.
2. Name it exactly `add_user`.
3. Replace the sample code with everything in `backend/functions/add_user/index.ts`, then click **Deploy**.

**Option B: command line**
```
npx supabase login
npx supabase functions deploy add_user --project-ref <your-project-ref>
```
Your project ref is the part before `.supabase.co` in the project URL.

Optional: under **Edge Functions → Secrets**, add `ALLOWED_ORIGIN` with your app's address (for example `https://crm.yourcompany.in`). Only that site can then manage logins.

## 5. Create the owner login

1. Go to **Authentication → Users → Add user → Create new user**.
2. Email: **{{OWNER_EMAIL}}**. Choose a password and tick **Auto Confirm User**.
3. This login becomes the SolarFlow admin. Create everyone else from inside SolarFlow, under Staff logins.

Any other account added here starts as inactive until the admin activates it.

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
npm install
npm run build
```

Upload the contents of the `dist/` folder to your web host:
- **Netlify / Vercel / Cloudflare Pages**: set the build command to `npm run build` and the output folder to `dist`, or drag the `dist` folder into the dashboard.
- **cPanel or any other host**: upload everything inside `dist/` to the site's folder (for example `public_html`).

SolarFlow's pages use `#` links, so no rewrite rules are needed. If your host asks for a "single-page app" fallback, point it to `index.html`.

Open your site and sign in as {{OWNER_EMAIL}}.

## If something goes wrong

- **"Your account is inactive"** for the owner: open SQL Editor and run this, with the owner's email between the quotes:
  `update public.profiles set user_type = 'admin', role = 'Admin', status = 'active' where lower(email) = lower('{{OWNER_EMAIL}}');`
- **"Could not reach the account-creation service"** when adding staff: the `add_user` function is not deployed. Repeat step 4.
- **Changes after an update**: run the new `backend/setup.sql` again in the SQL Editor. It updates the database in place.
