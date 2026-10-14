# SolarFlow Client Builder

This repo turns SolarFlow into a separate app for each client.

- **`builder/`**: the agency website. Clients fill two setup forms there: one about features, one about their workflow. You review their answers and download `<client>-solarflow.zip`.
- **`template/`**: the SolarFlow CRM itself. A client zip is this folder plus that client's settings.
- **Each zip** contains the app and a run-once `backend/setup.sql`. The SQL sets up the client's own Supabase project according to their answers.

Design and contracts are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/BUILDER.md](docs/BUILDER.md). `legacy/` keeps the old demo SQL for reference only.

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
   ```
   Never put the service_role key here.

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
npm run build:builder
```
Builds the static builder site into `builder/dist/`. Host it anywhere.

## Onboarding a new client (no data transfer)

1. In the admin page, choose **New client link** and send the WhatsApp message it gives you.
2. The client answers the feature questions (about 5 minutes). Then they either share a view-only link to their sheet, or set their stages, dropdown lists and extra fields.
3. Open the client in the admin page.
   - Check the features, the reasons and the **To discuss** list.
   - If they shared a sheet, use **Set up the workflow (admin)** to enter their stages and fields.
   - Fill in **Company details for documents** (address, GSTIN, bank details, logo).
4. Click **Download zip**. Inside, `README.md` walks through their Supabase project, `backend/setup.sql`, the `add_user` function, `.env` and hosting. `SETUP-SUMMARY.md` is your record of what they chose.

To change a client's features or stages later, edit `src/config/client.config.js` in their copy and run `npm run setup-sql`. Then re-run the new `backend/setup.sql` and rebuild.

## Rules

- `~/Desktop/solarflow_demo` is the live demo. It is never written to from here.
- No Docker. SQL is tested with PGlite (`tests/backend`, `tests/builder`).
