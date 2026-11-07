# SolarFlow Client Builder

This repo turns SolarFlow into a separate app for each client.

- **`builder/`**: the agency website. Clients fill two setup forms there: one about features, one about their workflow. You review their answers and download `<client>-solarflow.zip`.
- **`template/`**: the SolarFlow CRM itself. A client zip is this folder plus that client's settings.
- **Each zip** contains the app and a run-once `backend/setup.sql`. The SQL sets up the client's own Supabase project according to their answers.
- **`npm run provision`** does the whole go-live in one command: the client's Supabase project (in their own account), the database, their Brevo email, the app on Netlify at its own address, and the "Set your password" email to their admin.
- **Import customers** (in the app, and `npm run import-customers` for the agency) brings in the client's existing Excel / CSV customers.

Design and contracts are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/BUILDER.md](docs/BUILDER.md). Go-live is in [docs/PROVISIONING.md](docs/PROVISIONING.md), the importer in [docs/IMPORTING.md](docs/IMPORTING.md), and what a launch includes in [docs/CUSTOMIZATION-MENU.md](docs/CUSTOMIZATION-MENU.md). `legacy/` keeps the old demo SQL for reference only.

## One-time setup (builder Supabase project)

1. In Authentication → Sign In / Providers, turn off **Allow new users to sign up** and **Confirm email**.
2. In Authentication → Users → Add user, create your admin login and tick **Auto Confirm**.
3. In the SQL Editor, run `builder/backend/builder.sql`. Re-run it after every builder update.
   - The admin login named in the file (`admin@crm.com`) becomes a builder admin.
   - To add another admin, see the header of `builder.sql`.
4. Create `.env.local` in this folder:
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable or anon key>
   VITE_AGENCY_DOMAIN=<your domain for free client addresses, e.g. example.in>
   VITE_AGENCY_EMAIL=<the agency's Supabase login, which clients invite>
   ```
   Never put the service_role key here. The two `VITE_AGENCY_*` values are shown to clients on the setup form's Go live step.
5. For one-command go-live, copy `.env.provision.example` to `.env.provision` and fill in the Supabase and Netlify tokens ([docs/PROVISIONING.md](docs/PROVISIONING.md)). Git ignores it.

## Everyday commands

```bash
npm run dev:builder
```
Opens the builder at http://127.0.0.1:5187. The admin pages are at `#/admin`; `#/preview` runs the client form without saving anything.

```bash
npm run dev:template
```
Runs the CRM with every feature on, at http://127.0.0.1:5186.

```bash
npm test
```

```bash
npm run make-client -- client-zips/answers.json
```
Builds a client zip from a downloaded answers file. The result is identical to what the admin page downloads.

```bash
npm run provision -- client-zips/<slug>-setup.json --dry-run
npm run provision -- client-zips/<slug>-setup.json
```
Takes a client live: Supabase project, database, keep-alive, Brevo email, the `add_user` function, the app on Netlify, DNS, and the admin's invite. `--dry-run` shows the plan and changes nothing. Safe to run again: finished steps are skipped. See [docs/PROVISIONING.md](docs/PROVISIONING.md).

```bash
npm run import-customers -- client-zips/<slug>-solarflow customers.xlsx
```
Turns a client's Excel or CSV customer list into `client-zips/<slug>-import-customers.sql`, after printing how it matched the columns and stages. The client folder comes from `npm run provision -- … --only files`; load the SQL with `npm run provision -- … --import client-zips/<slug>-import-customers.sql`. See [docs/IMPORTING.md](docs/IMPORTING.md).

```bash
npm run keepalive
```
The weekly health check: pings every provisioned client and reports any project that is paused or whose daily keep-alive job failed.

```bash
npm run test-data -- <client folder>/src/config/client.config.js --count 500
```
Writes `client-zips/<slug>-test-data.sql` (made-up customers across every stage, for trying out a client's app) and `<slug>-remove-test-data.sql` (deletes them again). Paste them into that client's SQL Editor after `backend/setup.sql`. Never use it on a live client.

```bash
npm run build:builder
```
Builds the static builder site into `builder/dist/`. Host it anywhere.

## Onboarding a new client (3–5 working days)

The launch covers everything on the customization menu ([docs/CUSTOMIZATION-MENU.md](docs/CUSTOMIZATION-MENU.md)). Anything else is a paid add-on with its own price and timeline, and never holds up the launch.

**Day 1: setup form.**
1. In the admin page, choose **New client link** and send the WhatsApp message it gives you.
2. The client answers the feature questions (about 5 minutes), sets their stages, lists and extra fields or shares a view-only link to their sheet, and fills in **Go live**:
   - their web address: our free `<slug>.<your domain>`, or their own (e.g. `crm.theircompany.in`);
   - their Supabase organization, with the agency's Supabase email invited as Administrator;
   - their Brevo sender. They send you the Brevo SMTP login and key on WhatsApp, never in the form.
3. On the Send step they list anything they need that is not in the form. These become add-on requests.

**Day 1–2: review.** Open the client in the admin page.
- Check the features, the reasons and the **To discuss** list.
- If they shared a sheet, use **Set up the workflow (admin)** to enter their stages and fields.
- Fill in **Company details for documents** (address, GSTIN, bank details, logo).
- Check **Go live**: problems in red must be fixed before provisioning; warnings in yellow are worth a call.
- Under **Add-ons**, mark each request as in the menu (no charge), a paid add-on (price and timeline), or not doing.

**Day 2–3: their old data.** Ask for their customer sheet (Excel, Google Sheets download or CSV). Either load it during go-live (step 3 below), or import it with them in the app (**Import customers** in the sidebar) on the handover call.

**Day 3: go live.**
1. Put the Brevo SMTP login and key in `client-zips/<slug>.secrets.env` (git ignores `client-zips/`).
2. Click **Download answers (JSON)** and save it in `client-zips/`.
3. Run `npm run provision -- client-zips/<slug>-setup.json --dry-run`, fix anything it lists, then run it without `--dry-run`.
   To load their old customers in the same run, first write the client folder and the import file, check the column matching it prints, then provision with `--import`:
   ```bash
   npm run provision -- client-zips/<slug>-setup.json --only files
   npm run import-customers -- client-zips/<slug>-solarflow <their sheet>.xlsx
   npm run provision -- client-zips/<slug>-setup.json --import client-zips/<slug>-import-customers.sql
   ```
4. The summary gives the app address and the database password (send it to the client privately; it is never saved). The client's admin gets a "Set your password" email.

**Day 3–5: handover call.**
- The admin sets their password from the email, checks their imported customers and adds staff logins under Staff logins.
- If they chose their own address, they add the one DNS record from the summary; then run the same provision command again to switch to it.
- Ask them to change the agency's role in their Supabase organization to **Developer**. Supabase counts free projects across every organization where you are Owner or Administrator, so staying Administrator blocks your next free client.

**Every week:** `npm run keepalive`.

### Without provisioning

A client who hosts the app themselves gets the zip instead: click **Download zip**. Inside, `README.md` walks through their Supabase project, `backend/setup.sql`, the `add_user` function, `.env` and hosting. `SETUP-SUMMARY.md` is your record of what they chose, including go-live details and paid add-ons.

To change a client's features or stages later, edit `src/config/client.config.js` in their copy and run `npm run setup-sql`. Then re-run the new `backend/setup.sql` and rebuild. For a provisioned client, change the answers on the admin page, download them again and re-run `npm run provision`.

## Rules

- `~/Desktop/solarflow_demo` is the live demo. It is never written to from here.
- No Docker. SQL is tested with PGlite (`tests/backend`, `tests/builder`).
# solarflow_builder
