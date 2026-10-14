# Builder website — contract

The builder is the agency site. Clients fill two setup forms there. The admin reviews each submission and downloads `<slug>-solarflow.zip`.

It is a Vite + React app in `builder/`:
- imports `template/src/config/*`, `template/src/ui/*` and `template/src/lib/*` through relative paths
- uses the same Tailwind look as the template
- reads its backend from the repo-root `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), which points at the **builder** Supabase project (ref `oxzojaxhnvwzqhokbyil`)

## Data model (already written)

| File | Exports |
|---|---|
| `builder/src/catalog/questions.js` | Form A questions: `QUESTION_STEPS`, `answersToFeatures(answers, overrides)`, `visibleQuestions`, `describeAnswer` |
| `builder/src/catalog/submission.js` | payload shape `emptySubmission()`, `submissionToClientConfig(submission, {adminOverrides, slug, ownerEmail, branding, workflow})`, `stageLocks(features)`, `restoreLockedStages`, `restoredStages`, `effectiveWorkflow`, `availableBuiltinStages`, `defaultStageList`, `submissionFeatures`, `normalizePhone` |
| `template/src/config/resolve.js` | `validateClientConfig`, `resolveClientConfig`, `keyFromLabel`, `slugify`, `isAllowedSheetUrl`, `LIMITS` |
| `template/src/config/serialize.js` | `clientConfigSource(config)` |
| `template/backend/seed.js` | `setupSql({schema, config})`, `configSeedSql(config)` |

## Routes (hash router; the site is static)

| Route | Who | What |
|---|---|---|
| `#/` | anyone | Short landing page with a "Have a setup link? Open it" hint. No marketing copy or pricing. |
| `#/s/<inviteId>/<token>` | client | The setup wizard: Welcome → A. Your business (contact) → A. Features (question steps) → A. Review → B. Your workflow → Done. Everything autosaves. |
| `#/admin` | admin | Sign in with email and password via Supabase Auth. Lists invites with status. |
| `#/admin/new` | admin | Create an invite: company, contact name, phone, email. Shows the link and a ready WhatsApp/email message to copy. |
| `#/admin/i/<inviteId>` | admin | One client. Shows: answers, features with reasons, the To discuss list, workflow (stages, lists, fields, sheet link), validation warnings, admin feature overrides, the owner email used for the first admin, the slug and company details for documents (including DISCOM name and the registration charges label). **Set up the workflow (admin)** reuses the stage, list and field editors so the admin can enter the workflow from a shared sheet (or correct the client's). These admin settings autosave to the server with the invite (settings an older builder kept in localStorage are moved there on first open). Buttons: **Download zip**, **Download setup.sql**, **Copy client link**, **Reset link**, **Archive**. |
| `#/admin/offline` | admin | Load a submission JSON file and download a zip with no backend. The file and the admin settings made here stay in this browser's localStorage. Used for testing and as a fallback. |

## Client wizard UX rules

- **Step A: Features.**
  - One question group per screen. Each question shows a plain question, an example and an optional note.
  - Answers are Yes / No / Not sure, or choice cards. Every screen says up front that Not sure is a safe answer.
  - Not sure always goes to To discuss and switches nothing on, except payments (loan and cash stay on) and documents (checklists stay on), each with the reason "Included for now because you answered Not sure — we will confirm with you."
  - A live summary ("You'll get N features · M to discuss") sits in a sticky side panel on desktop and a bottom bar on mobile.
  - No "select all". Removed features never appear.
  - The review screen has three columns: **You'll get** (each with its reason), **Not included** and **To discuss**. An "Adjust individual features" expander holds toggles written to `submission.featureOverrides`.
- **Step B: Workflow.** It opens with: "Open your Excel / Google Sheet next to this page before you decide your stages and fields." Two choices:
  1. **Share a view-only link.** The client pastes a link, validated with `isAllowedSheetUrl`, plus a note. The page shows how to make a view-only link in Google Sheets and in Excel/OneDrive.
  2. **Fill it here.**
     - **Stages:** "Use the standard stages" (`stagesMode: 'default'`) or "Change them" (`'custom'`). In the editor, built-in stages can be renamed, reordered with ↑/↓ buttons (no drag-only controls), and removed when not locked. Locks come from `stageLocks(features)` and say why. Leads, Completed and Lost are pinned. Custom stages are added with a name, a group and an icon from `STAGE_ICON_NAMES`; the id comes from `keyFromLabel(label, {stage:true})`.
     - **Lists:** each `DROPDOWN_CATALOG` list is an editable chip list prefilled with defaults. Metadata lists accept any value. Tag lists use fixed ids with editable labels; extendable lists accept new tags, and locked ids cannot be removed.
     - **Extra fields:** label, type (`CUSTOM_FIELD_TYPES`), stage (never Completed or Lost Project), options for dropdowns, "must be filled before moving on", and "ask when adding a lead" (LEADS only). The key comes from `keyFromLabel`. A live preview renders the fields with `FieldRenderer`.
- **Locked stages:** when a custom stage list (the client's or the admin's) lacks a built-in stage the final features need (`stageLocks`), `submissionToClientConfig` puts it back at its usual place. The Send step tells the client which stages were added back and why.
- **Phone:** the client may type +91, a leading 0 or spaces; `normalizePhone` turns it into 10 digits on blur and on save. The country code is removed before the digits are counted, so `+91 98765 432` stays invalid instead of becoming a wrong number.
- **Conflicts:** after a save conflict (another tab saved first) the page stops saving, warns before leaving, and Send is off until the client reloads. `setup_submit` also checks the version the page last saw, so a page never sends another tab's answers.
- **Done:** a thank-you screen. The client can reopen the link to edit until the admin archives it. Re-submitting stores a new version.
- **Every screen:** mobile-first, large touch targets, an autosave status line, and a `beforeunload` guard only while there are unsaved changes.

## Backend (`builder/backend/builder.sql`, run in the builder Supabase project)

Re-run the whole file after every update of the builder website. It runs in one transaction, is safe to re-run, and drops the older versions of changed RPCs (such as `setup_submit(uuid, text)`).

All objects live in schema `setup_private`, revoked from `public`, `anon` and `authenticated`. Public access goes only through `security invoker` wrappers in `public` that call `security definer` functions (`set search_path = ''`).

**Tables:**

| Table | Columns |
|---|---|
| `admins` | `email text primary key`, `user_id uuid` (admin rights follow the user id) |
| `invites` | `id uuid pk`, `token_hash text`, `company`, `contact jsonb`, `status` (open, submitted, downloaded, archived), `created_by uuid`, `created_at`, `updated_at`, `expires_at` (default now()+90 days), `failed_opens int`, `locked_until`, `admin_settings jsonb` (never returned to the client) |
| `drafts` | `invite_id pk`, `payload jsonb`, `version int`, `updated_at` |
| `submissions` | `id`, `invite_id`, `version`, `payload jsonb`, `submitted_at`. Only the latest 20 per invite are kept. |
| `events` | `id`, `invite_id`, `kind`, `at`, `actor`. `opened` is logged at most once an hour per invite. |

The script binds `admin@crm.com` to that existing login; add more admins with the insert in the script header.

**Client RPCs** (granted to `anon` and `authenticated`; no Anonymous Sign-Ins needed):

| RPC | Returns / behaviour |
|---|---|
| `setup_open(p_invite uuid, p_token text)` | `jsonb {company, contact, payload, version, status, submitted_at}`. Returns null on a bad token, an expired invite or an archived invite. Applies a lockout after repeated failures and keeps a per-invite rate limit. |
| `setup_save(p_invite uuid, p_token text, p_payload jsonb, p_base_version int)` | `int` new version. Raises `'conflict'` when `p_base_version` is stale. Validates size (≤ 256 KB), `schemaVersion = 1`, and that `contact`, `answers`, `workflow` are objects. |
| `setup_submit(p_invite uuid, p_token text, p_version int)` | `timestamptz`. Raises `'conflict'` when the draft is no longer `p_version`, and `'submit_limited'` after 10 sends in an hour. Snapshots the draft into `submissions` (keeping the latest 20), sets status to `submitted`, logs an event. |

**Admin RPCs** (granted to `authenticated`; each checks `setup_private.is_admin()` = the user id is in `admins` and the JWT is not anonymous):

| RPC | Returns |
|---|---|
| `setup_admin_create_invite(p_company text, p_contact jsonb)` | `{id, token}`. The token is 32 random bytes, base64url. It is returned once and stored only as a sha256 hash. |
| `setup_admin_list()` | rows `{id, company, contact, status, created_at, updated_at, submitted_at, version}` |
| `setup_admin_get(p_invite uuid)` | `{invite, draft, submissions:[...]}` |
| `setup_admin_reset_token(p_invite uuid)` | `{token}` |
| `setup_admin_set_status(p_invite uuid, p_status text)` | archive or reopen |
| `setup_admin_mark_downloaded(p_invite uuid)` | — |
| `setup_admin_get_settings(p_invite uuid)` | `{adminOverrides, slug, ownerEmail, branding, workflow}` or null |
| `setup_admin_save_settings(p_invite uuid, p_settings jsonb)` | — . Replaces the settings; only those keys, typed, at most 256 KB. |

`builder/src/api.js` wraps every RPC: `openInvite`, `saveDraft`, `submitSetup(inviteId, token, version)`, `adminCreateInvite`, `adminList`, `adminGet`, `adminResetToken`, `adminSetStatus`, `adminMarkDownloaded`, `adminGetSettings`, `adminSaveSettings`, plus `signIn`, `signOut`, `getSession`. They throw `Error`s with friendly messages, and `saveDraft` and `submitSetup` throw `err.code === 'conflict'` on a stale version.

## Zip (`builder/src/zip/`)

- `scripts/pack-template.mjs` writes `builder/public/client-template.json`: `{version, createdAt, files: {path: {encoding:'utf8'|'base64', data}}}`.
  - It includes everything the client needs to build: `template/**`.
  - It excludes `node_modules`, `dist`, `tests`, `.env*`, logs and `src/config/client.config.js` (generated). `README.client.md` is packed but never zipped as it is: it becomes `README.md`.
  - Text files use `utf8`; images use `base64`.
- `buildClientFiles({templateFiles, config, schemaSql, generatedAt})` returns `{path: string|Uint8Array}` of extra/override files:
  - `src/config/client.config.js` via `clientConfigSource`
  - `backend/setup.sql` via `setupSql`
  - `README.md`: README.client.md with its `{{TOKENS}}` filled in one pass. Values are inserted literally and never scanned again, so `$&` or `{{FOO}}` in a company name stays as typed. An unknown token in README.client.md stops the build.
  - `.env.example`
  - `package.json` with name = slug, and `package-lock.json` with its `name` and `packages[''].name` set to the slug too
  - `backend/README.md`: says to run `setup.sql`. `schema.sql` and `seed.js` still ship, because `npm run setup-sql` rebuilds `setup.sql` from them.
  - `SETUP-SUMMARY.md`: features on/off with reasons (including why the resolver keeps a feature on, such as checklists), the core features the client really gets, stages (and any added back), lists, fields, sheet link and To discuss items, for the agency
- `makeZip({templateFiles, files, rootFolder})` returns a `Uint8Array`. It uses `fflate.zipSync`, and every path is prefixed with `<slug>-solarflow/`.
- Both the browser admin page and `scripts/make-client.mjs <submission.json> [--out dir] [--slug x] [--owner-email y]` (Node) use these same functions, and both turn the admin settings into build options with `buildOptions(settings)`, so the CLI and the website produce identical zips. The CLI reads the settings from the export file; `--slug` and `--owner-email` win over it.
- Every build function takes the admin settings `{adminOverrides, slug, ownerEmail, branding, workflow}`. An admin `workflow` wins over the client's for stages, lists and fields; the client's sheet link and note are still recorded. Exports (`Download answers (JSON)`) wrap the payload with these settings, and `parseSubmissionJson` reads them back.
- Branding: `chargesLabel` defaults to `GEB / GEDA` only when the state is Gujarat; elsewhere it is empty, so quotations print `<DISCOM> registration`. The admin can set `discomName` and `chargesLabel`.
