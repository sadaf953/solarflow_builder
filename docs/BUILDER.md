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
| `builder/src/catalog/submission.js` | payload shape `emptySubmission()`, `submissionToClientConfig(submission, {adminOverrides, slug, ownerEmail})`, `stageLocks(features)`, `availableBuiltinStages`, `defaultStageList`, `submissionFeatures` |
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
| `#/admin/i/<inviteId>` | admin | One client. Shows: answers, features with reasons, the To discuss list, workflow (stages, lists, fields, sheet link), validation warnings, admin feature overrides, the owner email used for the first admin, and the slug. Buttons: **Download zip**, **Download setup.sql**, **Copy client link**, **Reset link**, **Archive**. |
| `#/admin/offline` | admin | Load a submission JSON file and download a zip with no backend. Used for testing and as a fallback. |

## Client wizard UX rules

- **Step A: Features.**
  - One question group per screen. Each question shows a plain question, an example and an optional note.
  - Answers are Yes / No / Not sure, or choice cards.
  - A live summary ("You'll get N features · M to discuss") sits in a sticky side panel on desktop and a bottom bar on mobile.
  - No "select all". Removed features never appear.
  - The review screen has three columns: **You'll get** (each with its reason), **Not included** and **To discuss**. An "Adjust individual features" expander holds toggles written to `submission.featureOverrides`.
- **Step B: Workflow.** It opens with: "Open your Excel / Google Sheet next to this page before you decide your stages and fields." Two choices:
  1. **Share a view-only link.** The client pastes a link, validated with `isAllowedSheetUrl`, plus a note. The page shows how to make a view-only link in Google Sheets and in Excel/OneDrive.
  2. **Fill it here.**
     - **Stages:** "Use the standard stages" (`stagesMode: 'default'`) or "Change them" (`'custom'`). In the editor, built-in stages can be renamed, reordered with ↑/↓ buttons (no drag-only controls), and removed when not locked. Locks come from `stageLocks(features)` and say why. Leads, Completed and Lost are pinned. Custom stages are added with a name, a group and an icon from `STAGE_ICON_NAMES`; the id comes from `keyFromLabel(label, {stage:true})`.
     - **Lists:** each `DROPDOWN_CATALOG` list is an editable chip list prefilled with defaults. Metadata lists accept any value. Tag lists use fixed ids with editable labels; extendable lists accept new tags, and locked ids cannot be removed.
     - **Extra fields:** label, type (`CUSTOM_FIELD_TYPES`), stage, options for dropdowns, "must be filled before moving on", and "ask when adding a lead" (LEADS only). The key comes from `keyFromLabel`. A live preview renders the fields with `FieldRenderer`.
- **Done:** a thank-you screen. The client can reopen the link to edit until the admin archives it. Re-submitting stores a new version.
- **Every screen:** mobile-first, large touch targets, an autosave status line, and a `beforeunload` guard only while there are unsaved changes.

## Backend (`builder/backend/builder.sql`, run once in the builder Supabase project)

All objects live in schema `setup_private`, revoked from `public`, `anon` and `authenticated`. Public access goes only through `security invoker` wrappers in `public` that call `security definer` functions (`set search_path = ''`).

**Tables:**

| Table | Columns |
|---|---|
| `admins` | `email text primary key` |
| `invites` | `id uuid pk`, `token_hash text`, `company`, `contact jsonb`, `status` (open, submitted, downloaded, archived), `created_by uuid`, `created_at`, `updated_at`, `expires_at` (default now()+90 days), `failed_opens int`, `locked_until` |
| `drafts` | `invite_id pk`, `payload jsonb`, `version int`, `updated_at` |
| `submissions` | `id`, `invite_id`, `version`, `payload jsonb`, `submitted_at` |
| `events` | `id`, `invite_id`, `kind`, `at`, `actor` |

The script seeds `admins` with `admin@crm.com`; add more admins with one insert.

**Client RPCs** (granted to `anon` and `authenticated`; no Anonymous Sign-Ins needed):

| RPC | Returns / behaviour |
|---|---|
| `setup_open(p_invite uuid, p_token text)` | `jsonb {company, contact, payload, version, status, submitted_at}`. Returns null on a bad token, an expired invite or an archived invite. Applies a lockout after repeated failures and keeps a per-invite rate limit. |
| `setup_save(p_invite uuid, p_token text, p_payload jsonb, p_base_version int)` | `int` new version. Raises `'conflict'` when `p_base_version` is stale. Validates size (≤ 256 KB), `schemaVersion = 1`, and that `contact`, `answers`, `workflow` are objects. |
| `setup_submit(p_invite uuid, p_token text)` | `timestamptz`. Snapshots the draft into `submissions`, sets status to `submitted`, logs an event. |

**Admin RPCs** (granted to `authenticated`; each checks `setup_private.is_admin()` = the JWT email is in `admins` and the JWT is not anonymous):

| RPC | Returns |
|---|---|
| `setup_admin_create_invite(p_company text, p_contact jsonb)` | `{id, token}`. The token is 32 random bytes, base64url. It is returned once and stored only as a sha256 hash. |
| `setup_admin_list()` | rows `{id, company, contact, status, created_at, updated_at, submitted_at, version}` |
| `setup_admin_get(p_invite uuid)` | `{invite, draft, submissions:[...]}` |
| `setup_admin_reset_token(p_invite uuid)` | `{token}` |
| `setup_admin_set_status(p_invite uuid, p_status text)` | archive or reopen |
| `setup_admin_mark_downloaded(p_invite uuid)` | — |

`builder/src/api.js` wraps every RPC: `openInvite`, `saveDraft`, `submitSetup`, `adminCreateInvite`, `adminList`, `adminGet`, `adminResetToken`, `adminSetStatus`, `adminMarkDownloaded`, plus `signIn`, `signOut`, `getSession`. They throw `Error`s with friendly messages, and `saveDraft` throws `err.code === 'conflict'` on a stale version.

## Zip (`builder/src/zip/`)

- `scripts/pack-template.mjs` writes `builder/public/client-template.json`: `{version, createdAt, files: {path: {encoding:'utf8'|'base64', data}}}`.
  - It includes everything the client needs to build: `template/**`.
  - It excludes `node_modules`, `dist`, `.env*`, `README.client.md` (that becomes `README.md`) and `src/config/client.config.js` (generated).
  - Text files use `utf8`; images use `base64`.
- `buildClientFiles({templateFiles, config, schemaSql, generatedAt})` returns `{path: string|Uint8Array}` of extra/override files:
  - `src/config/client.config.js` via `clientConfigSource`
  - `backend/setup.sql` via `setupSql`
  - `README.md`: README.client.md with its placeholders filled
  - `.env.example`
  - `package.json` with name = slug
  - `SETUP-SUMMARY.md`: features on/off with reasons, stages, lists, fields, sheet link and To discuss items, for the agency
- `makeZip({templateFiles, files, rootFolder})` returns a `Uint8Array`. It uses `fflate.zipSync`, and every path is prefixed with `<slug>-solarflow/`.
- Both the browser admin page and `scripts/make-client.mjs <submission.json> [--out dir]` (Node) use these same functions, so the CLI and the website produce identical zips.
