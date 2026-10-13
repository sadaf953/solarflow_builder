# forms

## summary
The enquiry/quotation system is one 618-line component, src/components/CustomizationEnquiryForm.jsx. It runs in three modes: a public 2-step enquiry, a "prepare a form for a client" admin mode, and a client resume link. PricingView (#/plans, #/quote) mounts it, and App.jsx routes to it through a hash regex. All data goes through Supabase RPCs after an anonymous sign-in (signInAnonymously in brief.js, reopen.js and submit.js). Each RPC is a thin public SECURITY INVOKER wrapper around a SECURITY DEFINER function in a locked-down `enquiry_private` schema with `search_path=''`. That pattern is solid and worth keeping. Submitted answers are not stored as data. They are flattened into a free-text `notes` column ("Label: value" lines) in `public.enquiries` and parsed back with a regex-like parser. Prepared briefs and autosave drafts are stored as jsonb in private tables, and the allowed keys are listed separately in about 6 places. Access control is weak and must not be copied. The admin PIN '0905' is hardcoded in 5 SQL functions and in the JS, and the UI prints it to visitors (form line 404). Anyone can therefore list every enquiry with phone numbers and notes. Client access codes are the last 4 digits of the client's phone. `find_submitted_enquiries` lets any anonymous session list all enquiries for any 4-digit suffix, with no rate limit. The good UX parts are worth reusing: debounced autosave with a flush when the tab is hidden, prepared share links plus a copyable invite message, a mobile one-section-at-a-time stepper, and LoginScreen's question-led Yes/No boxes that show the consequence live. The weak parts are a long checkbox list of features that includes removed ones, and unexplained "Channel partner offices?" vs "Channel partners?" questions placed side by side. fflate 0.8.3 is installed only as a transitive dependency of jspdf. Its browser ESM build exports zipSync, zip (async with workers), Zip and strToU8, and the existing CSP allows blob workers. It works for zipping in the browser, but it should be added as a direct dependency.

## risks
- The admin PIN 0905 is effectively public. The UI prints it (CustomizationEnquiryForm.jsx:404), and it unlocks admin_enquiry_catalog, which returns every enquiry's name, phone and notes. Copying this gate into the setup admin would expose every client's business setup.
- find_submitted_enquiries (client_form_autosave.sql:187-209) lets any anonymous session enumerate all enquiries by trying 0000-9999. It has no rate limit and returns full notes and access codes. Treat the demo project's enquiries as already exposed. Consider dropping or locking the RPC in the demo separately (out of this read-only scope).
- Phone-suffix access codes are low entropy and known to anyone who has the client's number. Prepared briefs lock for 15 min after 5 failures, but submitted-enquiry access (client_form_draft_access 'enquiry' branch, open_submitted_enquiry) has no lockout.
- update_submitted_enquiry (095007:43-78) is still granted to authenticated. Anyone with the enquiry UUID and the last 4 phone digits can overwrite notes.
- Any session can insert into public.enquiries directly (16_create_enquiries_table.sql:27-37, check(true)), and every insert queues an email. This is a spam/email-cost vector, and save_enquiry has no rate limit either.
- Anonymous sign-in makes 'authenticated' mean nothing. Per-owner caps like 50 prepared forms per day are bypassed by opening a new anonymous session. Setup RPCs must not treat auth.uid() as identity unless the JWT is not anonymous.
- The isolation guards (src/supabase.js:12, scripts/demo-env.mjs:16-21, scripts/check-isolation.mjs scan, index.html CSP) hard-pin the demo ref. Putting the new Supabase URL into the client_builder copy will break dev/build until the guards are deliberately updated, and loosening them carelessly could let the copy talk to the live demo or leak keys.
- fflate is not a direct dependency. Importing it today works by hoisting only, and a jspdf upgrade or npm dedupe could remove or change it silently.
- The allowed answer keys are listed in about 6 places (form DRAFT_TEXT_FIELDS, brief.js SINGLE_FIELDS/CHOICES, create_prepared_brief key list, save_client_form_draft key list, submit.js detailLines, reopen.js NOTE_FIELDS). Copying that approach means every new question needs a migration and front-end edits that can drift.
- The notes-as-text storage makes submissions unparseable once labels change. Old enquiries would not map cleanly onto new feature keys if the team tries to migrate demo enquiries into setup submissions.
- kick_email_worker hardcodes the demo project edge-function URL (183052:38). Copying the email migration into a new project would post to the wrong project.
- Showing other clients' names when codes collide (form line 426) is a privacy issue. Any lookup-by-short-code design reproduces it.
- If the zip carries a pre-filled anon key, it becomes a credential artifact. The zip should carry placeholders, or only the client's public anon key entered at download time, and never a service_role key. Validate the JWT role claim before writing it.

## recommendations
- Build the setup flow as new modules (src/setup/catalog.js, src/setup/api.js, src/setup/FeaturesForm.jsx, src/setup/WorkflowForm.jsx, src/setup/BuilderAdmin.jsx, src/setup/zip.js) and do not extend the CustomizationEnquiryForm monolith. Port only the autosave hook, the share-link/invite copy, the admin list layout and the modal focus trap.
- Make one FEATURE_CATALOG the single source of truth. Fields: key, label, plain one-line explanation, Hinglish helper, example, group, requires[], suggests[], status 'active'|'removed'|'core', and which question(s) set it. The same catalog drives the client form, the admin view, DB validation (seeded into setup_private.feature_catalog by migration) and the generated client config.
- Use a new backend schema setup_private with no table grants. Data lives in setup_invites, setup_drafts and setup_submissions (immutable snapshots), plus an admins allowlist, an attempt log and an optional email outbox. Expose access only through public SECURITY INVOKER wrappers around SECURITY DEFINER functions with set search_path = '' (the existing pattern).
- Client RPCs (setup_open, setup_save_draft, setup_submit) take the invite UUID and a server-generated random 8-character code from an unambiguous alphabet, stored as a pgcrypto crypt() hash. Lock after 5 failures with growing pauses and cap opens/saves per invite per day. Grant them to the anon role directly so neither the builder nor client devices need Anonymous Sign-Ins. Never offer a 'find by code' lookup.
- Admin RPCs (setup_admin_create_invite, list, get, reset_code, archive, mark_downloaded) require setup_private.is_admin(): auth.uid() in setup_private.admins and auth.jwt()->>'is_anonymous' not 'true'. Admins sign in with real Supabase email auth and public sign-ups disabled. No PIN.
- Store structured jsonb: {schema_version, features:{key:'yes'|'no'|'discuss'}, answers:{questionId:value}, workflow:{stages[], dropdowns{}, extraFields[]}, sheetLink, contact{}}. Keep it under about 64KB and validate keys against the catalog and the stage/field caps in SQL.
- Keep drafts separate from submissions (as client_form_drafts does) so autosave never triggers emails. On submit, write a snapshot row and queue one outbox email. Re-submitting adds a new snapshot version rather than a new client row.
- Create the zip in the browser with fflate zipSync (add fflate 0.8.3 as a direct dependency). Contents: a prebuilt client runtime (static dist built once in client mode), a generated solarflow.config.json (features, stages, dropdowns, branding, supabaseUrl/anonKey placeholders), a client-specific CSP in index.html, supabase/setup.sql (schema with no demo seeds), .env.example and a README. Prefer runtime config over zipping raw source so the admin page does not have to bundle the whole repo.
- For the workflow form, pre-fill stages from PRIMARY_STAGES and dropdowns from META_CATEGORIES/SUBSIDY_TAGS/LOAN_TAGS/INSTALLATION_TAGS/HOLD_STATUS_TAGS. Allow rename, reorder, hide and add with caps, plus extra fields (label, type text/number/date/dropdown/yes-no, stage, required). Offer 'Just share your sheet instead': validate that it is a docs.google.com/spreadsheets or OneDrive/SharePoint view link, store the URL only, and never fetch it client-side.
- Reuse the style system: sf-page/sf-card/sf-input/sf-btn-primary/sf-btn-secondary/sf-kicker (src/index.css:138-166), the stone-900 hero header with an amber-300 kicker (form 399-406), orange-400 border plus orange-50 selected cards (form 559-562), the demo-question-box toggle look (src/demo/demo.css:47-57), BrandMark, and lucide-react icons (Check, CheckCircle2, ArrowRight, AlertCircle, LoaderCircle, Copy, HelpCircle).
- Ask the user (relayed request) for the following. (1) Is the new Supabase project for the builder (setup submissions and admin) or a test 'client' target? Ideally provide both, the second as a throwaway. (2) Project URL and publishable/anon key only, never service_role or secret keys or the DB password in chat. (3) Who runs the SQL: the user in the SQL editor, or `supabase link` on their machine. (4) Admin email(s) to allowlist, with Email auth on and public sign-ups off. (5) Builder hosting URL for the Auth Site URL/redirects and CSP. (6) Whether submission emails are wanted; if so, Brevo key and sender set as Edge Function secrets by the user. (7) Whether Hinglish helper text is wanted and who reviews it. (8) Per-client branding (logo, name, colours), since BrandMark hardcodes the SolarFlow logo. (9) How clients will host the zip (Netlify, Vercel, cPanel, GitHub Pages).

## open_questions
- Is the new Supabase project the user is creating meant for the builder (setup invites, submissions, admin login) or as a test 'client' target for a generated zip? Two projects are recommended: builder plus a throwaway test client.
- Will the user run the setup SQL themselves in the Supabase SQL editor, or link the CLI locally? Secrets (DB password, service_role, personal access token) should not be shared in chat; only the project URL and publishable/anon key are needed in the browser.
- Which email address(es) should be admins of the builder (allowlist)? Should public sign-ups be disabled, with admins invited from the dashboard?
- Where will the builder be hosted (domain)? This is needed for the Auth Site URL/redirects, the CSP connect-src and the links in invites.
- Should setup submissions send an email notification (re-using the Brevo outbox pattern)? If so, who receives it, and will the user set BREVO_API_KEY/sender as Edge Function secrets themselves?
- Should the client form allow anonymous-role RPC access (recommended, no Anonymous Sign-Ins needed), or should it keep the anonymous sign-in pattern the demo uses?
- Should the zip contain prebuilt static files plus a runtime solarflow.config.json (recommended), or editable source code? How will clients host it (Netlify, Vercel, GitHub Pages, cPanel)?
- Should the admin enter the client's Supabase URL/anon key at download time (baked into config), or leave placeholders the client fills in?
- Is Hinglish helper copy wanted? If so, who reviews the wording? No Hinglish exists in the codebase today.
- Per-client branding (logo, company name, colours): BrandMark hardcodes the SolarFlow logo. Is branding part of the setup form?
- Exact feature dependencies, e.g. whether Delivery batches and Inventory require the BOM maker and whether Dealer-based filtering requires Dealers or CPOs. These need confirming from the feature code by the feature-mapping analysis.
- Should the existing demo enquiry RPC leaks (PIN 0905 catalog, find_submitted_enquiries, update_submitted_enquiry) be patched in the live demo project separately? This analysis was read-only and did not touch the demo.

## touchpoints
- src/components/CustomizationEnquiryForm.jsx:12 — OTHER_INTEREST_OPTIONS hardcodes the 'Other features' checkbox list, including the removed 'Warranty tracking', 'Channel partner commission view' and 'MIS upload auto updater' => Do not reuse it. The new features form should read from a central FEATURE_CATALOG that has a status (active/removed) and requires/implies fields, and removed features must be filtered out everywhere.
- src/components/CustomizationEnquiryForm.jsx:28 — DRAFT_TEXT_FIELDS and normalizeDraftAnswers form the client-side allowlist for autosave payloads => Replace with a single answers object keyed by catalog/question id plus a schema_version, so adding a question does not mean editing 6 allowlists.
- src/components/CustomizationEnquiryForm.jsx:132 — persistDraft: a promise-queue autosave that compares snapshots via lastSavedDraftRef, has a 550ms debounce (145-150), flushes on visibilitychange (151-156) and warns on beforeunload (125-130) => Move into a reusable useAutosave(saveFn, snapshot) hook for both setup forms. Keep the save-status copy from line 466.
- src/components/CustomizationEnquiryForm.jsx:174 — modelType is derived from magic interest strings ('Option 1: Small team setup' etc.) => Not applicable to setup forms. Do not carry the basic/advance/both version_type over.
- src/components/CustomizationEnquiryForm.jsx:188 — On final submit, a prepared brief creates a brand-new enquiries row (saveEnquiryStep with a fresh identity). Brief and enquiry are never linked, so re-opening the link later creates duplicates. => Setup submissions should be one row per invite, updated in place, with immutable submit snapshots.
- src/components/CustomizationEnquiryForm.jsx:271 — The admin gate is a client-side check `preparePin === '0905'`. Line 404 prints 'Enter 0905 to see all prepared and submitted forms' to every visitor, and lines 424-425 repeat the literal. => Replace with real Supabase Auth (email/password or magic link) plus a server-side admin allowlist. No PIN may ever appear in the bundle.
- src/components/CustomizationEnquiryForm.jsx:306 — makeShareLink and copyInviteMessage: create the brief, build the #/quote?brief=<uuid> link, copy it to the clipboard and produce a WhatsApp-style invite text => Reuse the flow for setup invites (link plus a separately shown random code). Change the copy and generate the code server-side.
- src/components/CustomizationEnquiryForm.jsx:426 — When several clients share a 4-digit code, a chooser lists their names and companies to whoever typed the code => Privacy leak. The new model must never list other clients from a code.
- src/components/CustomizationEnquiryForm.jsx:427 — Admin list UI: filter chips, search, list of cards with status pills, detail card with notes and a copy-link button => Reuse the layout for the setup admin screen. Add a structured detail view, status (Open/Submitted/Downloaded) and a 'Download <client>.zip' button.
- src/components/CustomizationEnquiryForm.jsx:505 — Mobile guided mode: mobileSectionClass hides all sections except one on small screens, with 'Section N of 6' and Back/Next (593-596) => Turn this into a proper stepper component used at all widths. Each step is one question group, with a progress indicator and a sticky summary.
- src/components/CustomizationEnquiryForm.jsx:547 — 'Do you have branches?', 'Channel partner offices?' and 'Channel partners?' sit side by side as bare Yes/No/Not sure selects with no explanation, which is the source of CPO confusion => Replace with scenario questions, each with an example and plain/Hinglish help text that map to features.
- src/components/CustomizationEnquiryForm.jsx:585 — Section 6 'Other features' renders compactChoices(OTHER_INTEREST_OPTIONS), a flat checkbox grid where clients tick everything => Replace with question-led selection. The raw toggle list should only be an 'Advanced' expander on the review step, and every toggle should show a reason.
- src/components/PricingView.jsx:44 — isAdminView(hash) makes '#/plans?admin=1' the admin entry, linked publicly at lines 60 and 82 => The setup admin needs its own route (e.g. #/builder) behind real auth. Do not show an 'Admin access' button to clients.
- src/components/PricingView.jsx:57 — Branches on preparedBriefId/submittedEnquiryId to render the client resume form at #/quote?brief= or ?enquiry= => Add parallel routes such as #/setup?invite=<uuid>&step=features|workflow, with a matching reader like readPreparedBriefId.
- src/components/PricingView.jsx:107 — 'Tools only' section that advertises the MIS upload auto updater => Out of focus. Leave it in the demo and never include it in setup forms or client builds.
- src/App.jsx:58 — publicView regex /^#\/(plans|quote)(\?|$)/ decides whether to render PricingView without a session. restore() (78-79) skips session restore for brief/enquiry/admin links. => Extend the regex and the restore bypass for the new setup and builder routes. In a client build, these public routes should be removed entirely by config.
- src/App.jsx:140 — Portal selection by userType, including StampPortal for 'stamp' => A client build must gate StampPortal (removed) and the persona/DemoHeader flow behind config. Real login replaces start_demo_session.
- src/enquiries/brief.js:13 — INTEREST_OPTIONS is the full feature vocabulary (includes Vendor login, Dealers, CPOs, Branches, Finance, Checklists, etc. and the removed items), but the form never renders most of them as checkboxes => Promote it to a FEATURE_CATALOG module (key, label, plain explanation, Hinglish hint, group, requires, status) shared by the setup form, the admin and the client runtime config.
- src/enquiries/brief.js:68 — ensureSession() signs in anonymously if there is no session (duplicated in reopen.js:16 and submit.js:33) => For setup RPCs, either grant execute to the anon role (no anonymous sign-in needed) or keep anonymous auth. Decide once and centralise it in one helper.
- src/enquiries/submit.js:1 — enquiryPayload flattens answers into a 'Label: value' notes string => Do not reuse it. Setup data must be structured jsonb validated against the catalog.
- src/enquiries/reopen.js:63 — parseSubmittedEnquiryNotes parses the notes text back into fields => Not needed for setup submissions. It exists only because notes are unstructured.
- src/enquiries/draft.js:9 — read/save_client_form_draft RPC wrappers with kind/uuid/code validation => Copy this pattern into src/setup/api.js (open/save/submit/admin*) with random alphanumeric codes instead of /^\d{4}$/.
- supabase/migrations/20260927180502_two_step_enquiries.sql:16 — enquiry_private.save_enquiry: SECURITY DEFINER, search_path '', auth.uid() required, edit_keys(owner_id, edit_token) prove ownership, public invoker wrapper at line 61 => Reuse the private-schema, definer and invoker-wrapper pattern for setup_private. Add rate limiting, which this function lacks.
- supabase/migrations/20260927183052_enquiry_email_notifications.sql:30 — kick_email_worker uses pg_net to POST to a hardcoded demo project edge function URL with a private worker token, plus a pg_cron retry every minute (line 73) => The outbox pattern is reusable for 'setup submitted' emails. The URL must come from settings, not a literal, and the worker should be optional.
- supabase/migrations/20260928162346_prepared_brief_phone_code.sql:9 — unlock_prepared_brief: sha256(id||code) hash compare, failed_attempts, and locked_until set to +15 min after 5 failures => Reuse the lockout logic, but with a random 8-character code and pgcrypto crypt/bcrypt or a per-row salt, plus a per-invite daily cap.
- supabase/migrations/20260929095007_reopen_submitted_enquiries_by_phone_suffix.sql:43 — update_submitted_enquiry still exists and is granted to authenticated. Anyone with an id and the last 4 phone digits can overwrite notes. It was superseded by finalize_client_enquiry but never dropped. => Drop it in the demo/builder project. Do not port it.
- supabase/migrations/20260929161104_client_form_autosave.sql:5 — client_form_drafts is kept separate from enquiries so typing never triggers emails. save_client_form_draft has a strict key allowlist and length/size caps (78-103). => Reuse the 'drafts separate from submissions' design and the jsonb validation style. Validate feature keys against a catalog table instead of literal lists.
- supabase/migrations/20260929161104_client_form_autosave.sql:187 — find_submitted_enquiries returns name, mobile, company, notes and access_code for every enquiry whose code/phone ends in the given 4 digits, to any authenticated (incl. anonymous) session, unthrottled => Critical leak (10,000 calls dump the table). Never port it. The setup design must have no lookup by code alone.
- supabase/migrations/20260929161104_client_form_autosave.sql:211 — admin_enquiry_catalog gated only by p_pin = '0905' (also in 102511:9, 110009:8, 092103:12, 162117:10/22) => Replace with setup_private.is_admin() (auth.uid() in an admins table and not an anonymous JWT).
- supabase-setup/16_create_enquiries_table.sql:27 — An RLS insert policy with check(true) plus grant insert to anon lets anyone insert enquiries directly, and each insert queues an email => For setup tables: no direct table grants at all, RPC-only access.
- src/components/LoginScreen.jsx:438 — demo-question-box pattern: numbered question, live consequence line (<small>) that changes with the answer, No/Yes toggle group, presets (small/branches/enterprise). Styled in src/demo/demo.css:47-57. => Best UX precedent for the features form. Reuse the visual pattern. Note its Q1 merges 'branches or channel partners', which repeats the CPO confusion.
- src/constants.js:81 — APP_ROLES: agent2 is labelled 'Dealer' but has role 'Channel Partner', agent is 'Channel Partners', office2 is 'Manager' with role 'Channel Partner Manager', and channel_partner_office is the CPO => The feature catalog and the plain copy must map questions onto these role ids explicitly. The naming mismatch is a root cause of CPO confusion.
- src/constants.js:11 — PRIMARY_STAGES (16 pipeline stages), SUBSIDY_TAGS (36), LOAN_TAGS (54), META_CATEGORIES dropdowns (79), INSTALLATION_TAGS (195), HOLD_STATUS_TAGS (215) => These become the defaults the workflow setup form pre-fills and lets clients rename, reorder, hide or add.
- src/demo/config.js:5 — DATA_EXPORTS_ENABLED is the only existing feature flag (used in Dashboard.jsx:1413,1609,1672 and InventoryView.jsx:231,236) => It is the precedent for the single client config file. Generalise it to features.dataExports etc.
- src/supabase.js:11 — createDemoClient throws unless the URL is the demo ref and the key is a demo anon key, and blocks /functions/ fetches => The builder needs its own Supabase URL allowed. A client build needs a mode that accepts any https://<ref>.supabase.co URL plus a publishable/anon key for that ref (rejecting service_role).
- scripts/demo-env.mjs:11 — validateDemoEnv rejects any VITE_SUPABASE_URL other than the demo URL. check-isolation.mjs fails on any other *.supabase.co string in src/public/dist. => Adding the new builder Supabase to solarflow_client_builder will fail `npm run dev/build` until these guards allow the builder ref (or a client-mode path).
- index.html:5 — The CSP restricts connect-src and img-src to the demo Supabase origin. worker-src allows 'self' blob: (so fflate async workers are OK). => Add the builder project origin. Generate the client build's CSP from config at zip time (their own <ref>.supabase.co).
- node_modules/fflate/package.json:1 — fflate 0.8.3 is present only as a jspdf dependency (package-lock.json:3539, jspdf requires ^0.8.1). The browser ESM entry esm/browser.js exports zipSync, zip, Zip and strToU8 (esm/browser.d.ts:1111,1287,1325,1340). => Add "fflate": "0.8.3" to package.json dependencies before importing it. A transitive-only import can break on a lockfile refresh.

## details
## 1. How data flows today (form to Supabase)

**Routing.** `src/App.jsx:58,63` set `publicView='plans'` when the hash matches `/^#\/(plans|quote)(\?|$)/`. `restore()` (App.jsx:78-79) skips session restore for `?brief=`, `?enquiry=` and `#/plans?admin=1`. `PricingView` (src/components/PricingView.jsx) has three branches:
- **client resume** (57-67): `#/quote?brief=<uuid>` or `?enquiry=<uuid>`
- **admin** (68-78): `#/plans?admin=1` → `startInPrepareMode`
- **pricing page** (79-120): 3 option cards, a 'Tools only' block, an inline form with `allowPrepare`, and a modal form per card

LoginScreen.jsx:589 also embeds the form ("Request a setup").

**A. Public 2-step enquiry**
1. `handleSubmit` (form 166-194) → `enquiryPayload` (submit.js:1-21) flattens everything into `notes` text lines ("Website: Yes", "Interested in: a, b").
2. `saveEnquiryStep` (submit.js:33-55) → `signInAnonymously` if there is no session → `rpc('save_enquiry_details')` with client-generated `id` and `editToken` UUIDs (form 183).
3. Public invoker wrapper → `enquiry_private.save_enquiry` (two_step_enquiries.sql:16-57) inserts into `public.enquiries` plus `enquiry_private.edit_keys(owner_id=auth.uid(), edit_token)`.
4. Step 2 updates only if the owner and token match. If the RPC is missing, it falls back to a direct `insert` (submit.js:46-50).

**B. Email notifications.** Trigger `enquiry_email_after_save` (152516:44-47) → `queue_enquiry_email` → `enquiry_private.email_outbox` → `kick_email_worker` POSTs with pg_net to the demo edge function `send-enquiry-email` (hardcoded URL, 183052:38) using a worker token. pg_cron retries every minute. Brevo sends to `enquiry@deeprootsystems.in` (worker.mjs:1). The browser can't reach /functions/ (supabase.js:16).

**C. Prepared brief (admin prepares; client finishes)**
1. Admin types 0905 → `listAdminEnquiries` → `verify_preparation_pin` + `admin_enquiry_catalog`.
2. "Prepare a new client form" → `createSavedBrief` (brief.js:94-103) → `create_prepared_brief(p_answers, '0905')`. The latest definition is 093410:5-59.
3. That function validates a jsonb key allowlist and lengths, caps briefs at 50 per owner per day, sets `access_code = right(mobile,4)`, and stores `code_hash = sha256(id||code)` in `enquiry_private.prepared_briefs` (30-day expiry).
4. The link is `#/quote?brief=<uuid>` (brief.js:58-61). The invite text is built at form 325-329.

**D. Client opens the link**
1. `needsUnlock` → 4-digit code → `unlock_prepared_brief` (162346:9-33; 5 wrong attempts → 15-min lock) + `read_client_form_draft`.
2. `applyBrief` sets `draftAccess` → autosave (`save_client_form_draft`, autosave.sql:72-114) into `enquiry_private.client_form_drafts` (kind, form_id). Drafts never touch `enquiries`, so no email storms.
3. Contact step "Continue to questions" is a `type=button` (form 603), so nothing is saved there.
4. Final submit calls `saveEnquiryStep` with a new identity, which creates a separate `enquiries` row. The brief is never linked to it.

**E. Reopen a submitted enquiry.** `#/quote?enquiry=<uuid>` plus the last 4 phone digits → `open_submitted_enquiry` → `parseSubmittedEnquiryNotes` (reopen.js:63-83) turns the text back into fields → `finalize_client_enquiry` (autosave.sql:135-158) overwrites the row.

## 2. Security model: what is good and what is not

**Good (reuse):**
- Private schema `enquiry_private` with `revoke all` (two_step:5-7,13-14).
- Every function is `security definer set search_path = ''`, wrapped by a public `security invoker` SQL function. Execute is revoked from public/anon and granted to authenticated only.
- Strict jsonb allowlists and size caps (autosave.sql:78-103).
- Codes stored hashed. Failures `return null` rather than leaking which part was wrong.
- Lockout with failed_attempts/locked_until.
- Drafts kept separate from submissions.
- Email outbox with idempotency fingerprint and a worker token. The caller can't choose the recipient.
- The SQL test harness (tests/enquiries/*.sql uses `set_config('request.jwt.claim.sub')` + `set local role authenticated`) is reusable for the new RPCs.

**Bad (do not port):**
- PIN `0905` is hardcoded in SQL (162117:10,22; 092103:12; 102511:9,86; 110009:8; autosave:215) and in JS (form 271, 424-425). The UI prints it (form 404). `verify_preparation_pin` is a plain compare with no throttle. The catalog therefore returns all enquiries (name, phone, notes) and briefs to anyone.
- `find_submitted_enquiries` (autosave:187-209): unscoped, unthrottled lookup by 4-digit suffix that returns notes and access codes. The admin-mode UI calls it for any non-0905 code (form 240-246).
- Phone-suffix codes: about 10^4 entropy and known to anyone who has the number. Enquiry-kind access has no lockout.
- `update_submitted_enquiry` is left granted (095007:43-78).
- Anon direct insert on `enquiries` (16_create_enquiries_table.sql:27-37), with no rate limit on `save_enquiry`.
- Reliance on anonymous sign-in: `auth.uid() is not null` is the only gate, so per-owner caps reset with every new anonymous session. The demo also needs Anonymous Sign-Ins enabled (DEMO_ISOLATION.md notes it was reported disabled on hosted).
- Code collisions list other clients' names (form 426).

## 3. UX patterns worth reusing
- **Autosave** (form 132-156): snapshot string compare, 550ms debounce, serialized promise queue (no out-of-order saves), flush on `visibilitychange`, `beforeunload` guard only while dirty and unsaved (125-130), and three-state status text (466). Extract it as `useAutosave`.
- **Prepared links**: admin pre-fills what they know → link plus a separate code → 'Copy link' and 'Copy invitation message' (form 306-333, 453, 602). The client sees "Your form is ready. Review or change any details" (470). Keep it, with server-generated random codes.
- **Mobile stepper**: one fieldset visible at a time below `sm`, "Section N of 6", Back/Next, scroll to the top of the section on step change (form 104-109, 505, 593-596). Generalise it into a stepper at all widths.
- **Choice cards**: radio cards with an orange-400 border and orange-50 fill when selected, plus a one-line consequence ("Included at no extra cost", form 559-562). Documents show title plus description (DOCUMENT_COPY, form 17-22, 372-380).
- **LoginScreen question boxes** (LoginScreen.jsx:438-530, demo.css:47-57): numbered question, No/Yes segmented toggle, and a live consequence line that rewrites itself ("Installation Vendor portal enabled…" vs "Internal installations only: Vendor portal hidden"). Also presets (small / branch network / full). This is the closest precedent for the new features form.
- **'Not sure' option**: YES_NO_OPTIONS already includes 'Not sure' (brief.js:11). Keep it and route it to a "We'll discuss on call" bucket.
- **Hinglish**: none exists anywhere in src. It is new work. Copy is currently plain English, short and second person.

## 4. Style system
- **Tokens**: `:root --sf-*` in src/index.css:6-29 (canvas #FAFAF9, ink #1C1917, orange #FF8A00, focus yellow #FACC15, radius 14px).
- **Component classes** (index.css:138-166): `.sf-page`, `.sf-card`, `.sf-btn-primary` (orange-500, stone-900 text), `.sf-btn-secondary`, `.sf-btn-success`, `.sf-kicker` (10px uppercase orange-600), `.sf-input`.
- **Focus**: global focus-visible outline in yellow (index.css:558-561).
- **Tailwind** (tailwind.config.js): gray/slate alias to stone; amber/orange/accent alias to the brand orange scale; teal/green alias to emerald; sky/cyan/indigo/violet/purple alias to blue; rose aliases to red. Fonts are `heading` Google Sans Flex and `sans` Nunito Sans. There is no dark mode.
- **Form idioms**: `min-h-11`/`min-h-12` touch targets; `rounded-xl`/`rounded-2xl`; stone-900 primary buttons inside forms; rose-50 alert boxes with `role="alert"`; emerald-50 success boxes with `role="status"`.
- **BrandMark** (src/components/BrandMark.jsx): blue/white SVG logo, sizes sm/md/lg, optional label. It is hardcoded to SolarFlow, so client builds need it to be configurable.
- **Icons**: lucide-react ^0.454.0.

## 5. What is clumsy
- The flat feature checkbox lists (form 381-388, 585-589) invite ticking everything. They include features that are now removed (Warranty tracking, Channel partner commission view, MIS upload auto updater, form 12-16).
- Many catalog items (Vendor login, Dealers, CPOs, Branches, Staff management, Operations page, Finance, Checklists, Document uploads, Dealer-based filtering) exist in INTEREST_OPTIONS (brief.js:13-21) but are never shown. They are asked only indirectly through unexplained Yes/No selects.
- **CPO confusion**: "Channel partner offices?" and "Channel partners?" sit side by side with no explanation (form 548-549). LoginScreen Q1 merges "branches or channel partners". Role naming is inconsistent: agent2 = 'Dealer' with role 'Channel Partner', agent = 'Channel Partners', office2 = 'Manager' with role 'Channel Partner Manager', channel_partner_office = CPO, which owns dealers (constants.js:81-90; 09_cpo_lead_scope.sql).
- 30+ `useState`s and long nested-ternary header copy (form 402-404) make the component hard to change.
- Submissions are free text. A brief and its resulting enquiry are unlinked, which creates duplicates.
- "Skip — contact me" plus two parallel modes (enquiring / preparing) on the same screen (form 401, 408-411) confuse the audience.

## 6. fflate check
- `node_modules/fflate/package.json`: version **0.8.3**, MIT. It is pulled in only by `jspdf@4.2.1` (`fflate: ^0.8.1`, package-lock.json:4669-4677; entry at 3539-3544). It is **not** in package.json dependencies, and nothing in src imports it today.
- Export map: `"."` → browser `import` resolves to `./esm/browser.js` (Vite uses this), node resolves to `./esm/index.mjs`, plus `./browser` and `./node` subpaths.
- API: `zipSync(data, opts)` (browser.d.ts:1340), async `zip()` (1325/1332, uses workers), streaming `Zip` class (1287), `strToU8` (1111), `unzipSync` (1539).
- CSP (index.html:5) allows `worker-src 'self' blob:`, so the async zip works. Downloading via `URL.createObjectURL(new Blob([u8],{type:'application/zip'}))` is not restricted by the CSP.
- Verdict: usable. Add `"fflate": "0.8.3"` as a direct dependency.

## 7. Reuse vs rebuild

| Reuse as is or lightly adapted | Rebuild |
|---|---|
| Private-schema + definer/invoker RPC pattern | 618-line form state model → reducer keyed by catalog/question ids |
| jsonb validation style | Notes-as-text payload and parser → structured jsonb |
| Hashed code + lockout | PIN 0905 → real auth + admins allowlist |
| Drafts-vs-submissions split | Phone-suffix codes → random 8-character codes |
| Outbox email (URL from settings) | Lookup-by-code RPCs → none |
| useAutosave logic | Six duplicated allowlists → catalog table |
| Share link + invite copy | Flat checkbox lists → question-led flow |
| Admin list layout | Brief → enquiry duplication → one row per invite with snapshots |
| Modal focus trap (form 389-396) | |
| sf-* styles and the question-box look | |
| SQL/node test harness | |

## 8. Proposed storage and RPC model (builder Supabase; no service keys in the browser)

```
schema setup_private  (revoke all from public, anon, authenticated)
  admins(user_id uuid pk, email text, added_at)
  feature_catalog(key text pk, status text check in ('active','removed','core'), requires text[])   -- seeded by migration from catalog.js
  setup_invites(id uuid pk default gen_random_uuid(), client_slug text unique, company text, contact jsonb,
                code_hash text, created_by uuid, created_at, expires_at default now()+60 days,
                failed_attempts int default 0, locked_until timestamptz, opens_today int, opens_day date,
                status text check in ('open','submitted','downloaded','archived'))
  setup_drafts(invite_id uuid pk fk, version int, payload jsonb, updated_at)      -- autosave target
  setup_submissions(id uuid pk, invite_id fk, version int, payload jsonb, submitted_at)  -- immutable snapshots
  setup_events(id, invite_id, kind ('opened','saved','submitted','downloaded','code_reset'), actor uuid null, at)
  email_outbox(...) -- optional, same pattern as enquiry_private, edge-function URL read from a settings row
```

**Client RPCs** (public invoker wrapper → private definer, `set search_path=''`, `grant execute to anon, authenticated`):
- `setup_open(p_invite uuid, p_code text) → jsonb {company, contact, payload, version, status}`. Compares with pgcrypto `crypt(p_code, code_hash) = code_hash`. Failures: increment and lock (5 → 15 min, then 1 h, then 24 h). Opens are capped per invite per day.
- `setup_save_draft(p_invite, p_code, p_payload jsonb, p_base_version int) → int new_version`. Re-checks the code and the lock. Validates schema_version, keys present in `feature_catalog` with status <> 'removed', values in ('yes','no','discuss'), stages ≤ 30, extra fields ≤ 60, text lengths, `octet_length ≤ 65536`, and that the sheet link host is on the allowlist. Uses optimistic concurrency, returning a conflict so the UI can reload.
- `setup_submit(p_invite, p_code) → timestamptz`. Copies the draft into `setup_submissions`, sets status 'submitted', and queues one email.

**Admin RPCs** (require `setup_private.is_admin()` = `exists(admins where user_id=auth.uid()) and coalesce(auth.jwt()->>'is_anonymous','false') <> 'true'`):
- `setup_admin_create_invite(p_company, p_contact jsonb, p_prefill jsonb) → {id, code}`. The code comes from `gen_random_bytes` mapped to an unambiguous alphabet, is returned once and stored only hashed.
- `setup_admin_list()`, `setup_admin_get(p_id)` (latest draft plus submission history), `setup_admin_reset_code(p_id)`, `setup_admin_archive(p_id)`, `setup_admin_mark_downloaded(p_id)`.

**Auth settings**: Email provider on, public sign-ups off (admins are invited from the dashboard), Anonymous Sign-Ins not required. The browser only ever holds the publishable/anon key.

**Zip** (admin browser): fetch the static client-runtime manifest from the builder site, then fetch the files. Generate `solarflow.config.json` from the submission (features map with removed keys forced off, stages, dropdowns, extra fields, branding, `supabaseUrl`/`supabaseAnonKey` placeholders or values entered at download time and checked for role=anon), the client CSP, `supabase/setup.sql` (client schema, no demo seeds, no anon persona RPCs), `.env.example` and `README.md`. Then `zipSync`, download `<client_slug>.zip`, and call `setup_admin_mark_downloaded`.

## 9. UX outline: features form that prevents blind ticking

**Shell.** A stepper (stone-900 hero header, amber kicker "Step 2 of 5 · Your team"). One question group per screen on mobile; desktop shows two columns with a **live summary** sticky on the right. On mobile the summary is a bottom bar ("11 features · 2 to discuss ▸") that opens a sheet. The autosave status line sits under the header.

**Each question card** has:
- a numbered plain question
- an Indian example
- an optional "Hindi mein samjhaiye" toggle that reveals Hinglish help
- three big choices: **Yes / No / Not sure** ("Not sure" means we'll discuss on the call)
- a live consequence line (LoginScreen pattern), e.g. "You'll get: Vendor login, Vendor commission page"

There is no "select all".

**Step 1: How your business sells**
- Q1 "Do you have more than one office run by your own staff?" (e.g. head office in Pune plus a branch in Nashik) → **Branches** (+ Staff management).
- Q2 "Does another company or office sell solar under your brand and manage its own dealers?" Hinglish: "Kya koi doosra office aapke brand se solar bechta hai aur unke neeche apne dealers hain?" Shown with "This is NOT your own branch". → **Channel partner offices (CPOs)**, auto-requires **Dealers** and **Dealer-based filtering**.
- Q3 "Do individual agents or dealers bring you customers?" → **Dealers** login (+ Dealer-based filtering if Q2 or many dealers).

**Step 2: Installation**
- Q4 "Does an outside team or contractor install for you?" → **Vendor login** + **Installation view**, and offers **Vendor commission page** ("Do you pay them per installation?").
- Q5 "Do your own technicians visit sites and need a phone login?" → **Technician login** + Installation view.
- Q6 "Do you pay commission per installation (to staff or teams)?" → **Installation commission view**.

**Step 3: Money and government paperwork**
- Loans? → **Loan tracking**
- PM Surya Ghar subsidy? → **Subsidy tracking**
- Track payments received and pending? → **Finance**

**Step 4: Documents and material**
- Make quotations? → **Quotation maker**
- Material list per project? → **BOM maker**
- Send material by truck with a challan? → **Delivery batches/challan**, which suggests BOM
- Keep stock in a godown? → **Inventory**, which suggests BOM and Delivery. The dependency map must be confirmed against the code: DEMO_ISOLATION.md says delivery deducts stock via BOM.
- Upload customer documents and photos? → **Document uploads** (asks for a storage choice) vs **Checklists** only.

**Step 5: Team and records**
- One person tracking every project's status? → **Operations page**
- Mark attendance? → **Attendance**
- Schedule site visits? → **Calendar**
- Chat inside the app? → **Team chat**
- Excel downloads? → **Data exports**

**Always included (shown, not asked):** Customer tracking/pipeline, Activity log, Trash.

**Dependencies.** `requires` is applied automatically, with an inline note: "Added Dealers because Channel partner offices need it." Turning off a required feature prompts: "This will also turn off X". "Not sure" answers go to a **To discuss** bucket and never turn features on silently.

**Removed features** (MIS auto updater, Warranty tracking, Channel partner commission view, Stamp staff login) never render: the catalog status is 'removed' and the DB also rejects them.

**Review step** has three columns: **You'll get** (each with a 'because you said…' reason), **Not included**, **We'll discuss**. An "Advanced: adjust individual features" expander shows toggles with explanations. Then "Send to SolarFlow team", and the submitted state offers "Edit my answers".

**Workflow form (second link or second tab of the same invite)**
- Choice A: "Share your current sheet". Paste a view-only Google Sheets or Excel Online link plus a note.
- Choice B: "Set up stages". Pre-filled from PRIMARY_STAGES; rename, drag to reorder (with up/down buttons for accessibility), hide, or add. Then "Dropdown lists": payment type, module brand, payment modes, subsidy/loan/installation/hold tags, each an editable chip list. Then "Extra fields per stage" (label, type, required).
- Same autosave and the same code.