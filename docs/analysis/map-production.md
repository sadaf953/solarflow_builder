# production

## summary
I read the client_builder copy only. Today the app has no real login. LoginScreen.jsx calls supabase.auth.signInAnonymously() and then the start_demo_session RPC, which upserts a profiles row for the anonymous user with whatever role the visitor picks (8 personas, switchable at any time through DemoHeader/RolePicker). App.jsx then sets user.isDemo=true, and the rest of the code branches on that flag to read and write demo_profiles instead of real accounts. src/supabase.js only works with demo project qduonewmquwayrnwyzvc: it throws for any other URL or key, blocks every /functions/ call, and uses detectSessionInUrl:false, so password-recovery links cannot work. index.html, public/404.html, scripts/check-isolation.mjs, scripts/demo-env.mjs and tests/isolation repeat the same pin. The SQL history in supabase-setup/ cannot be replayed on a fresh project. 01 creates every table with demo_session_id plus per-visitor sandbox RLS. Files 02-11 and 17 are seeders and demo users. 19 drops demo_session_id, seeds Vendor 1-3/Driver 1-3/chat rows, and replaces RLS with using(true) for every authenticated user. 22 (identical to migration 20260928104005) repairs the inventory functions. Two trigger functions are never repaired and still reference the dropped demo_session_id column: assign_demo_lead_creator (09) and sync_demo_integration_staff (03). demo_profiles is not only demo data: it is the people directory behind the dealer hierarchy, CPO lead scoping (current_demo_cpo/can_view_demo_lead), stamp-maker lists and the dealer filters, so it has to be merged into profiles rather than simply dropped. Real-login code already exists: a credentials path in LoginScreen, PasswordRecoveryModal, the non-isDemo branch of UserManagementView, and the add_user Edge Function. However, add_user checks no caller identity or role, and no code path ever calls supabase.auth.signOut(). Database authorization is currently "any authenticated user can do anything", apart from a restrictive CPO policy. With real vendor and dealer logins this lets any staff member make themselves admin through profiles, and lets vendors and dealers read every customer. A client build therefore needs four things: a generic env-driven client, a consolidated fresh-install SQL with role-aware RLS and profiles-based hierarchy functions, a hardened add_user plus a first-admin bootstrap, and removal or flag-off of the demo runtime and marketing (enquiry/pricing) code.

## risks
- CRITICAL (real logins): 19 STEP 9 gives every authenticated user full select/insert/update/delete on profiles. Any staff, vendor or dealer can run supabase.from('profiles').update({user_type:'admin'}).eq('id', me) and become admin. Today role enforcement is UI-only.
- CRITICAL: supabase/functions/add_user/index.ts performs service-role create/update_password/update_email/delete without verifying the caller. The anon key ships in the bundle and passes default verify_jwt, so anyone who can reach the function could take over or delete accounts. It must be hardened before any client deploys it.
- CRITICAL: send-lead-to-vendor reads any customer row with the service role and emails it to a caller-chosen address (open relay plus PII exfiltration), with unescaped HTML.
- HIGH: Apart from the CPO restrictive policy, vendors, dealers (agent2), channel partners (agent) and stamp users have DB-level read/write on ALL admin (customer) rows, documents, BOMs, quotations, inventory and batches. Their portal filters are client-side only (AgentPortal.jsx:194-215, VendorPortal.jsx:288-326).
- HIGH: staff_attendance is readable and writable by the anon role (12_staff_attendance.sql:35-40), and 19 never revokes it.
- HIGH: Replaying the existing SQL files on a fresh project is not viable. 01 aborts when public already has tables, and the chain 02-11 seeds demo data. 19 assumes demo data exists (dedupe steps). 14 deletes hard-coded auth users. 17 creates known-password accounts. A purpose-built consolidated file is required.
- HIGH: Two trigger functions still reference the dropped demo_session_id column. assign_demo_lead_creator (09) runs on admin insert for CPO/manager/dealer users; sync_demo_integration_staff (03) runs on metadata integration_by changes. Copying them into a client DB would break lead creation for those roles. The live demo DB may already be affected unless it was patched in the dashboard; this is plausible but I could not verify hosted state.
- MEDIUM: quotations.owner_id is NOT NULL (01:239), but 19 re-creates its FK as ON DELETE SET NULL. Deleting a user who owns quotations (add_user delete, then the auth.users cascade to profiles) will fail with a not-null violation.
- MEDIUM: Ensure* helpers (src/demo/vendors.js, drivers.js, deliveryBatches.js) upsert 'Vendor 1-3'/'Driver 1-3' and delete or rename non-canonical rows. If left in a client build, they would mutate real vendor/driver directories on every admin/sales login.
- MEDIUM: TeamChatDrawer reseeds fictional messages into an empty DB, and its Reset button deletes all messages company-wide. staffAttendance.js injects 14 fictional staff into every client's attendance list.
- MEDIUM: The demo client uses detectSessionInUrl:false and LoginScreen/UserManagementView send resets to window.location.origin, so password-recovery links cannot complete. New Supabase projects also send auth emails only via a heavily rate-limited default SMTP (team-member addresses only) unless the client configures custom SMTP.
- MEDIUM: No code path calls supabase.auth.signOut(). With real sessions persisted in localStorage, 'Logout' leaves the user signed in on shared office PCs.
- MEDIUM: demo_profiles is load-bearing: dealer hierarchy (parent_profile_id), CPO scope functions, stamp-maker lists, dealer filters, sub-agent lists and attendance staff all read it. Dropping the table without rewriting the readers silently empties those dropdowns and breaks CPO RLS (current_demo_cpo joins demo_profiles).
- MEDIUM: move_stage (01:354) and get_dashboard_metrics_scoped (01:329-344) hard-code stage names (COMPLETED, LOST PROJECT, INSTALLATION STATUS and a 16-stage whitelist). Client-configurable pipelines will be rejected by the server unless these become data-driven.
- LOW: profiles.user_type has an FK to public.demo_roles (01:51). Renaming or omitting the role catalog without updating the FK breaks add_user upserts.
- LOW: user_type is written to auth user_metadata by add_user. user_metadata is user-editable via auth.updateUser, so no trigger or policy may trust it; use app_metadata or the profiles row.
- LOW: The cpo_leads view is 'select * from admin', frozen at creation. It must be created after every admin column, and re-created whenever per-client extra fields add admin columns.
- LOW: The existing SQL tests (tests/delivery/batch-sql.mjs) slice 01 and 07 by text markers and will break once those files stop being the source of truth.

## recommendations
- Write one new supabase-client/00_fresh_install.sql (idempotent where cheap, wrapped in a transaction, refusing to run if public.admin exists). Base it on the object plan in details §H, not on replaying 01-23. Generate a second small per-client file (01_client_config.sql) from the setup form that seeds only metadata dropdowns, pipeline stages and enabled roles. It contains no customers and no people.
- Merge demo_profiles into profiles: add parent_profile_id (CPO for office2/agent2), created_by, cpo_profile_id (maintained by trigger: CPO = id, manager = parent's id). Point admin.lead_creator_profile_id at profiles(id) ON DELETE SET NULL. Rewrite current_cpo(), can_view_lead() and assign_lead_creator() against profiles. Change the 9 src call sites that read demo_profiles to read profiles.
- Replace using(true) RLS with role-aware policies based on SECURITY DEFINER helpers in solarflow_private (my_role(), is_active(), is_admin(), is_head_office() = admin|sales, current_cpo()). Lock profiles: users may update only their own non-privileged columns (enforced by a BEFORE UPDATE trigger guarding user_type/status/channel_partner/parent_profile_id), and admins update anyone. Scope vendor/dealer/agent reads on admin with restrictive policies that mirror the UI filters.
- First-admin bootstrap: add an AFTER INSERT trigger on auth.users (solarflow_private.handle_new_user) that creates the profiles row. If no active admin exists, the user becomes admin/active; otherwise the user is created only when app_metadata.created_via='add_user' (else status inactive). The client then creates their owner account in Dashboard > Authentication > Add user (auto-confirm) and logs in. Ship a fallback one-line SQL snippet in the README to promote an existing user.
- Supabase dashboard settings per client: disable Anonymous Sign-Ins, disable 'Allow new users to sign up', keep the Email provider on, set Site URL and Redirect URLs to the client domain, and optionally set custom SMTP (needed only for 'forgot password' emails; admin-set passwords through add_user work without email).
- Harden and ship add_user as the only account-management path: JWT verification, caller role checks, an enabled-role whitelist from the client config, a CORS origin env var, and role in app_metadata. It needs no manual secrets (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically in hosted Edge Functions). Ship send-lead-to-vendor only when the vendor-email feature is on, hardened, with BREVO_API_KEY/BREVO_SENDER_EMAIL/BREVO_SENDER_NAME set as function secrets by the client. Never ship send-enquiry-email or the enquiry migrations.
- Introduce a single build-time flag (e.g. VITE_APP_MODE=client, or src/config/client.config.js mode:'client') and make the demo code physically absent in client builds. Delete or exclude src/demo/*, RolePicker, DemoHeader, tour, seed200, ensureThreeDemo*, DemoPeople, src/dev/*, *-preview.html, PricingView, CustomizationEnquiryForm, src/enquiries/*, BrevoModal, DevRoleSwitcher, UpdateChecker, SetPassword and scripts/enrich-demo-records.mjs. Do not rely on tree-shaking of commented-out imports (DashboardView.jsx:13).
- Replace src/supabase.js with a generic env-driven client (PKCE, detectSessionInUrl:true, per-project storageKey). Template the CSP in index.html and public/404.html from VITE_SUPABASE_URL. Replace check-isolation.mjs and demo-env.mjs with a client env/secret scanner. Rewrite tests/isolation accordingly.
- Make move_stage and the dashboard metrics read stage names from a pipeline_stages table (or a config-generated function) so client-configured pipelines work server-side. Move src/demo/stageRequirements.js into client config.
- Add activity_log (and keep admin, delivery_batches, team_chat_messages) in the supabase_realtime publication. profiles can be dropped from it, since no subscriber exists.
- Make quotations.owner_id nullable with ON DELETE SET NULL, and restrict inventory_movements.item_id to ON DELETE RESTRICT, so user deletion works and stock ledger history cannot be cascaded away.
- Add a 'role disabled' guard: if a profile's user_type is turned off in config (stamp in this phase), App shows a message instead of routing to StampPortal, and add_user refuses to create that role.
- Answer to the user's question ('what else do you need'): ask for (1) the new project's URL and anon/publishable key, which are safe to share; (2) confirmation that they will toggle the dashboard auth settings listed above, or permission to do it with them; (3) how they want SQL run: either they paste the generated SQL into the SQL Editor (preferred, no secrets in chat), or they run `supabase login` on this machine so the CLI can link — never paste the DB password, service_role key or access token into chat; (4) the first admin's email and name; (5) the client name, branding and enabled features, which feed the setup form; (6) whether vendor emails are wanted (then they set the Brevo secrets themselves); (7) whether custom SMTP is available for password resets.

## open_questions
- Technician login is listed as in scope, but there is no 'technician' user_type, portal or RLS anywhere in src or SQL. Should it be a new role (with which portal: VendorPortal-like installation view?), or is it the existing 'vendor' login renamed?
- Should demo_profiles be fully merged into profiles, with every directory person being a real login? Or does the client still need non-login directory entries (integration staff such as preparers/loaders, stamp makers without accounts)? If so, a separate non-auth 'staff_directory' table is needed instead of profiles.
- Exact per-role data visibility for client builds: should Office (sales) see everything like admin? Should Vendor see only projects where admin.vendor matches their vendor record? Should Dealer (agent2) and Channel Partner (agent) be limited to their own leads at the DB level? The proposed RLS mirrors the current UI filters but needs sign-off.
- Bootstrap preference: first-user-becomes-admin trigger on auth.users, or an explicit SQL promotion snippet the client runs after creating the owner in the dashboard? (The trigger is smoother, but it is a database-level rule clients must understand.)
- Will each client deploy Edge Functions themselves (CLI or dashboard), or will we deploy for them using a CLI login on this machine? Without add_user deployed, the app cannot create staff accounts.
- Should password reset by email be supported, which requires each client to configure custom SMTP plus Site/Redirect URLs? Or should only admin-set passwords via add_user be offered?
- Configurable pipeline: should move_stage/metrics validate against a pipeline_stages table generated from the setup form? Must LOST PROJECT and COMPLETED remain fixed terminal stages that the code relies on (Dashboard metrics, Trash, Subsidy/Loan views)?
- Do per-client 'extra fields' become real admin columns (then the cpo_leads view and ADMIN_COLUMNS must be regenerated), or a single jsonb column (e.g. admin.custom_fields)?
- Hosting target for client builds: GitHub Pages (needs public/404.html and the CSP copy), or Netlify/Vercel/Cloudflare Pages (needs the SPA rewrite config instead)? This decides which CSP and fallback files to template.
- Vendor-email notifications (send-lead-to-vendor): ship to clients at all in this phase, and if so, under which feature flag?

## touchpoints
- src/supabase.js:11 — createDemoClient throws unless url===DEMO_URL and key is a demo anon key; custom fetch blocks any other origin and every /functions/ path; auth storageKey 'solarflow-demo-cloud-auth-v1', detectSessionInUrl:false. Lines 23-28: with no env it builds an offline stub client (DEMO_ISOLATED). => Replace with a plain createClient(import.meta.env.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'pkce', storageKey:`sf-${ref}-auth`}}). Keep one guard: refuse sb_secret_/service_role keys and fail loudly when env is missing. Remove the fetch interceptor and the functions block.
- src/demo/config.js:2 — Hard-codes DEMO_PROJECT_REF/DEMO_URL and isDemoPublicKey (ref must equal qduonewmquwayrnwyzvc). Also holds the DATA_EXPORTS_ENABLED=false feature flag, which Dashboard.jsx:2 and InventoryView.jsx:2 import. => Delete the project pin. Move DATA_EXPORTS_ENABLED into the per-client feature config file.
- scripts/check-isolation.mjs:24 — Pre-dev/build/preview guard: .env may hold only the demo URL (via demo-env.mjs), CNAME must be solarflow.deeprootsystems.in (line 15), linked supabase ref must be the demo ref, any other *.supabase.co string in src/public/dist fails (line 46), no workflows, git remote must be sadaf953/Solarflow. => Replace with check-client-env.mjs. It should check that VITE_SUPABASE_URL/ANON_KEY are present, that the key is anon/publishable (role!=service_role, no sb_secret_), and that no secrets or postgres:// URLs appear in src/dist. Drop the CNAME, demo-ref and git-remote checks. Update package.json scripts (lines 7-14) and rename the package from solarflow-demo.
- scripts/demo-env.mjs:17 — validateDemoEnv rejects any URL other than the demo URL and any key whose ref is not the demo ref. => Generalize: accept any https URL and validate the key claims against the ref parsed from the URL (or allow sb_publishable_). Keep rejecting secret keys.
- index.html:5 — CSP connect-src/img-src pinned to https/wss://qduonewmquwayrnwyzvc.supabase.co plus dev ws 127.0.0.1:5186; <title>SolarFlow Demo</title> (line 15). => Template the CSP from env at build time (Vite %VITE_SUPABASE_URL% HTML replacement or a transformIndexHtml plugin that also derives the wss:// origin). Emit dev ws entries only in dev. Take title/description from client config.
- public/404.html:4 — Second copy of the demo-pinned CSP (GitHub Pages SPA fallback). => Template it like index.html, or drop it if client hosting is not GitHub Pages.
- tests/isolation/backend.test.mjs:4 — Asserts the offline stub client and demo-only createDemoClient behaviour (functions blocked). => Replace with tests for the generic client: reads env, rejects service keys, never falls back to the demo project.
- src/App.jsx:35 — scheduleBackgroundDemoCleanup runs ensureThreeDemoVendors/Drivers/GroupedDemoBatches for admin/sales on restore and on entry (also lines 97, 116, 136). => Remove in client builds. These functions upsert 'Vendor 1-3'/'Driver 1-3'/'DEMO-TRUCK-00n' rows and delete or rename other rows in a real client DB.
- src/App.jsx:78 — restore(): skips restore on quote/brief links, and returns early unless the sessionStorage flag solarflow_entered_demo is set, so a persisted login is ignored in a new tab. Loads the profile, applies demoVendorTarget to rename vendors (line 94) and sets isDemo:true (line 95). => Always restore the session. Load the profile; if it is missing or inactive, signOut and show an error. Set isDemo:false. Remove demoVendorTarget (it renames a real vendor called 'Vendor 5' to 'Vendor 2'). Handle SIGNED_IN, SIGNED_OUT and PASSWORD_RECOVERY in onAuthStateChange.
- src/App.jsx:121 — chooseAgain (passed to portals as onLogout) only clears local state; it never calls supabase.auth.signOut(). switchTourRole (line 127) calls start_demo_session to change the persona. => onLogout must await supabase.auth.signOut() and then clear the session keys. Delete switchTourRole.
- src/App.jsx:152 — Public routes: #/plans and #/quote show PricingView; prepared-brief and enquiry links (readPreparedBriefId/readSubmittedEnquiryId, lines 5-6, 58-68) open marketing flows; DemoHeader wraps every portal (line 170); StampPortal is routed for user_type 'stamp' (line 140). => Client build: render LoginScreen or the portal only. Remove the PricingView/enquiry imports and routes. Replace DemoHeader with a passthrough. Route by enabled roles, and show a 'role disabled' screen for stamp or any disabled user_type.
- src/components/LoginScreen.jsx:126 — choose(): signInAnonymously (line 132) then rpc start_demo_session(p_role,p_name) (line 133), then ensureThreeDemo* seeding. Includes the persona questionnaire, role grid, basic-version link with admin@crm.com/admin credentials (line 585), pricing and enquiry form (589). => Replace with an email/password-only screen (reuse handleCredentialsSubmit) plus forgot password, branded from client config. Remove the persona UI, the questionnaire, CustomizationEnquiryForm and the demo.css import.
- src/components/LoginScreen.jsx:85 — On signInWithPassword failure it falls back to a demo_profiles row matching the email and logs the person in WITHOUT a password (onLogin with isDemo:true). Lines 291-324 quick-fill 8 demo emails with password SolarFlow@2026. Real logins are also tagged isDemo:true (line 118). => Delete the demo fallback and the quick-fill. Real logins must set isDemo:false. On a missing profile, signOut.
- src/components/UserManagementView.jsx:882 — isDemo picks demo_profiles vs profiles. fetchProfiles (line 936) merges profiles+demo_profiles+DEFAULT_SYSTEM_USERS (line 753: hard-coded demo accounts with password SolarFlow@2026). Credentials banner (line 1424) and copy-password (line 1627). Demo branches in reset password (lines 33, 82), create (line 300), delete (line 1291). otherTable dual writes (lines 1019-1273). Filters on p.created_by, which is not a column. => Client build: profiles only. Delete DEFAULT_SYSTEM_USERS, the password column/banner and all demo_profiles writes. Create, reset, email change and delete always go through the hardened add_user. Set created_by/parent_profile_id when a CPO creates users. Offer only roles enabled in config.
- supabase/functions/add_user/index.ts:33 — Service-role function: create, update_password, update_email and delete for ANY user_id. No verification of the caller's JWT or role, CORS '*', and user_type taken from the request body (stored in user_metadata, which users can edit). => Verify the bearer JWT with auth.getUser and load the caller's profile; require active admin, or CPO limited to own office2/agent2 children with forced channel_partner/parent_profile_id. Reject disabled roles (stamp) and 'admin' unless the caller is admin. Put the role in app_metadata. Restrict CORS to the client origin.
- supabase/functions/send-lead-to-vendor/index.ts:36 — Service-role read of any admin row by customer_id, emailed to the vendor_email supplied by the caller. No caller auth check. Customer fields are interpolated into HTML without escaping. With no BREVO_API_KEY it returns success:true (ready_mode) and the UI says 'Email sent'. => Verify JWT and role (admin/sales). Resolve the vendor email server-side from vendors by name and ignore client-supplied addresses. Escape HTML. Return success:false or not_configured when Brevo secrets are missing. Gate behind a vendor-email feature flag.
- src/demo/DemoHeader.jsx:9 — Guided tour, tour menu and 'Switch role' RolePicker wrapping every portal. Passes demoControls/startTour to portals. => Do not mount in client builds. Portals render the {demoControls} slot (Dashboard 1628, AgentPortal 1026/1276, VendorPortal 1013, StampPortal 784, QuotationModule) and the 'START HERE' tour card (Dashboard 1639); pass null and remove the card.
- src/components/Dashboard.jsx:376 — Dealer filter reads demo_profiles by parent_profile_id = user.cpo_profile_id||user.demo_profile_id, or by channel_partner. => Read profiles (user_type='agent2', parent_profile_id = CPO profile id; for a CPO that is user.id, for a manager it is user.parent_profile_id).
- src/components/ChannelPartnerManagementView.jsx:103 — Operations directory loads demo_profiles. Stamp report reads demo_profiles user_type 'stamp' (279). Vendor email edit syncs demo_profiles (497-505). Channel-partner rename cascades into demo_profiles (623). => Switch to profiles. Hide the stamp report when stamp is off. Change login emails only through add_user update_email, not table writes.
- src/components/modal-tabs/DiscomSubmissionTab.jsx:75 — Loads stamp makers from demo_profiles. => Hide the 'send to stamp maker' UI when the stamp feature is off. If it is re-enabled later, read profiles.
- src/utils.jsx:1203 — fetchAgent2SubAgents reads dealers from demo_profiles. => Read profiles where user_type in ('agent2','agent') and channel_partner ilike the branch.
- src/utils/staffAttendance.js:86 — DEFAULT_OFFICE_STAFF (14 fictional people) and DEFAULT_ATTENDANCE_RECORDS are merged into the staff list and written to localStorage. Also reads demo_profiles (line 244). => Remove the hard-coded staff and records. Build the staff list from profiles only (and key attendance by user_id). Keep localStorage only as a cache, not a seed.
- src/components/TeamChatDrawer.jsx:163 — Empty table auto-inserts fictional starter messages (getInitialMessages, line 20). 'Reset to Sample Updates' (handleResetChat, line 236) DELETES ALL messages for everyone and reseeds them. => Remove the seeding and the reset button in client builds. Restrict delete to own messages or admin through RLS.
- src/components/VendorPortal.jsx:311 — Hard-coded alias expansion for 'Vendor 1/2/3' and 'Demo Vendor n' names. => Remove. Match the vendor by vendors.email = login email, or better a vendors.profile_id link.
- src/components/CustomerDetailModal.jsx:1836 — 'Demo essentials' banner and stage gating from src/demo/stageRequirements.js (also AgentPortal.jsx:1). => Move stage requirements into client pipeline config. Drop the 'Demo essentials' wording.
- src/enquiries/submit.js:37 — Enquiry, prepared-brief and reopen flows call signInAnonymously (also brief.js:72, reopen.js:20) and the enquiry RPCs. Pulled in by LoginScreen, App and DashboardView:13 (unused import). => Exclude from client bundles: remove the imports from App/LoginScreen/DashboardView. Anonymous sign-ins stay disabled on client projects.
- supabase-setup/01_solarflow_demo.sql:61 — Base schema: every table has demo_session_id default auth.uid() plus composite FKs and sandbox RLS (lines 266-280). profiles.channel_partner default 'Demo Aurora Solar' and phone default '0000000000'. start_demo_session (290). move_stage hard-codes 16 stages (354). Storage bucket and policies (368-383). Realtime for admin/profiles/delivery_batches (393-401). => Use as the column source only. In the consolidated SQL, create the tables without demo_session_id or demo defaults. Exclude start_demo_session. Make the move_stage stage list config-driven.
- supabase-setup/19_convert_to_shared_multiuser_database.sql:298 — Shared RLS: select/insert/update/delete using(true) for all authenticated users on every table, including profiles. CPO restrictive policy via demo_profiles-based current_demo_cpo (340-374). Demo vendor/driver seeds (40-117), start_demo_session (383-462), batch atomic RPCs (469-635), team chat table plus seeded messages (640-696). => Keep the batch RPCs, the team chat DDL and the storage policies. Replace using(true) with role-aware policies. Rewrite the CPO functions against profiles. Drop the seeds, the dedupe steps and start_demo_session.
- supabase-setup/09_cpo_lead_scope.sql:30 — assign_demo_lead_creator trigger body still references demo_profiles.demo_session_id. Lines 113-123: restrictive cpo policies on admin/documents/bom/bom_items. get_cpo_dashboard_metrics (124). => Rewrite as assign_lead_creator using profiles (CPO = own id, manager = parent_profile_id, dealer = own id with channel_partner from profile). Keep the restrictive policies and the metrics wrapper.
- supabase-setup/03_connected_demo_scenarios.sql:133 — sync_demo_integration_staff trigger on metadata references old/new.demo_session_id and demo_profiles. It stays attached after 19, so integration_by inserts/updates/deletes would error. => Exclude. Optionally re-implement the integration_by rename cascade into bom.paper_prepared_by/material_loaded_by/bom_items.integration_by and the delete guard, without demo_profiles.
- supabase-setup/12_staff_attendance.sql:35 — staff_attendance policy 'for all to authenticated, anon using(true)' plus 'grant all ... to anon' (19 never removes these), so anyone holding the public anon key can read and modify attendance. Unique index on coalesce(demo_session_id,...) (24). Fictional seed rows (43-121). => Fresh schema: no demo_session_id; unique(staff_name,date) or (user_id,date); no anon grant or policy; no seed rows.
- supabase-setup/14_cascade_profile_deletions_and_cleanup.sql:55 — Deletes three hard-coded auth.users UUIDs and 'Demo Admin' profiles. => Never include. Keep only the FK intent (activity_log/documents uploaded_by set null).
- supabase-setup/17_create_all_8_demo_users.sql:71 — Inserts 8 auth.users with the shared known password SolarFlow@2026 directly into auth.users. => Never include in client builds. Real users are created through the Admin API (add_user) or the dashboard.
- supabase-setup/22_fix_shared_inventory_functions.sql:8 — Current, correct shared inventory functions: sync_inventory_catalog, statement trigger on bom_items, unique request_id, record_inventory_movement, bom_stock_document, get_inventory_bom_lines, set_bom_stock_quantity, issue_delivered_bom_stock trigger. Identical to migrations/20260928104005. => Copy these bodies verbatim into the consolidated SQL, after the inventory/bom/admin tables and inventory_item_key().
- src/components/ActivityLogView.jsx:156 — Subscribes to postgres_changes INSERT on activity_log, but no SQL adds activity_log to the supabase_realtime publication. => Add activity_log to the publication in the consolidated SQL.
- src/components/SetPassword.jsx:1 — Dead component (not imported anywhere). Password reset is handled by PasswordRecoveryModal via App recoveryMode/PASSWORD_RECOVERY. => Delete, or keep unused. Ensure resetPasswordForEmail redirectTo uses origin+pathname, and the client's Site URL/Redirect URLs include their domain.
- src/components/DevRoleSwitcher.jsx:1 — Dead (never imported). Portals keep an import.meta.env.DEV && onOpenDevSwitcher button (Dashboard 1446, AgentPortal 1254, VendorPortal 994, StampPortal 764). => Delete the file and the onOpenDevSwitcher props.
- src/components/UpdateChecker.jsx:14 — Dead (never imported). Polls public/version.json; vite.config defines __BUILD_ID__='dev'. => Delete, or wire it deliberately. public/version.json is a stale demo artifact.

## details
## A. How demo persona entry works today (exclude from client builds)

**Entry flow**
1. `src/components/LoginScreen.jsx:126-158` `choose(role)`:
   - `supabase.auth.getSession()`, then `supabase.auth.signInAnonymously()` (line 132).
   - `supabase.rpc('start_demo_session',{p_role,p_name})` (line 133).
   - `onLogin({...data, isDemo:true})`.
   - For admin/sales it also runs `ensureThreeDemoVendors/Drivers/GroupedDemoBatches` in the background.
   - The UI around it: name entry, a 4-question "company structure" questionnaire (it also toggles the checklist/file mode in localStorage via `utils/checklistMode.js`), the role grid, a basic-version link with `admin@crm.com/admin`, plans/pricing, and the enquiry form.
2. **`start_demo_session` (latest version: `supabase-setup/19…sql:383-462`)**
   - SECURITY INVOKER. Requires `auth.uid()` (the anonymous user).
   - Upserts `profiles` (id = auth.uid(), name entered or "Admin N", email `anon.<8>@solarflow.demo`, user_type = the requested role, channel_partner 'Demo Aurora Solar').
   - Earlier versions (02, 03, 04, 05, 06, 08, 09, 10) also seeded 50/200 customers, BOMs, inventory etc. per visitor.
3. **Restoring a session: `src/App.jsx:74-101`**
   - Restores only if `sessionStorage.solarflow_entered_demo` is set, so a new tab always shows the landing page.
   - Reads `profiles`, applies `demoVendorTarget`, sets `isDemo:true`.
4. **Persona switching**
   - `App.jsx:127` `switchTourRole` re-calls `start_demo_session`.
   - Triggered from `src/demo/DemoHeader.jsx` (the tour also auto-switches roles per step), `src/demo/RolePicker.jsx`, `tour.js` and `tourSteps.js`.
5. **`isDemo:true` downstream** switches UserManagementView to `demo_profiles` (no auth users, password resets "simulated").
6. **`demo_profiles` (created in 03:11-20; `parent_profile_id` added in 09:3)** is a fictional people directory:
   - 8 personas, integration staff, a second CPO/dealer.
   - `profiles.demo_profile_id` and `profiles.cpo_profile_id` link the visitor to a persona.
   - CPO RLS (`current_demo_cpo`, `can_view_demo_lead`) is computed through it.
7. **Credential path is also demo-flavoured**
   - Quick-fill of `*@solarflow.demo` accounts with `SolarFlow@2026` (these come from SQL 17).
   - If the password fails but the email exists in `demo_profiles`, the user is let in **without a password** (LoginScreen.jsx:85-102).

## B. Real-login code that already exists
- **`LoginScreen.handleCredentialsSubmit` (35-124)**: `signInWithPassword`, loads `profiles` by auth id, rejects inactive users, and supports `resetPasswordForEmail`. Usable once the demo fallback and quick-fill are removed and `isDemo:false` is set.
- **`PasswordRecoveryModal.jsx`**: `supabase.auth.updateUser({password})`, mounted by App when the hash has `type=recovery` or on the PASSWORD_RECOVERY event. It only works once the client uses `detectSessionInUrl:true` (preferably PKCE).
- **`SetPassword.jsx`**: dead (never imported).
- **`UserManagementView.jsx` (non-isDemo branches)**:
  - Create: `functions.invoke('add_user',{action:'create', email, password, name, role, user_type, channel_partner, phone})` (line 393). It first checks that the signed-in identity matches currentUser (380-387) and syncs `metadata.channel_partner` and `vendors` directories.
  - Reset: `add_user update_password` (line 45), or a `resetPasswordForEmail` link (line 106).
  - Email change: `add_user update_email` (line 1141).
  - Delete: `add_user delete` (line 1304).
  - Role/partner/name/status changes are direct `profiles` updates (1014-1273), which RLS must allow for admins.
- **`supabase/functions/add_user/index.ts`**:
  - Service role; `auth.admin.createUser` with `email_confirm:true` and user_metadata {name, role, user_type, channel_partner}.
  - Upserts profiles; also updates password, updates email and deletes users.
  - **No caller verification** and CORS `*`.
  - The UI error text expects 401/403 for non-admin callers, so the original production version probably had checks that were lost in the copy.
- **`profiles` table**: id → auth.users ON DELETE CASCADE; status check active|inactive; user_type FK → demo_roles.
- **8 user_types (constants.js:81-90 APP_ROLES)**: admin, sales (Office), channel_partner_office (CPO), office2 (Manager), agent2 (Dealer), agent (Channel Partner), vendor, stamp.
- **Portal routing (App.jsx:140)**:
  - agent/agent2 → AgentPortal
  - vendor → VendorPortal
  - stamp → StampPortal
  - all others → Dashboard
- **Technician login (in-scope feature)**: no `technician` user_type, portal or code exists today. It appears only in marketing text and the enquiry form. This is a gap; see open questions.

## C. Real-auth design for client builds (minimal and correct)

**1. Supabase project settings (per client)**
- Anonymous Sign-Ins OFF.
- "Allow new users to sign up" OFF; the Admin API still works.
- Email provider ON.
- Site URL and Redirect URLs set to the client domain.
- Optional custom SMTP: only needed for "forgot password" emails, since default SMTP is restricted and rate-limited.

**2. Frontend client (`src/supabase.js`)**
- `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'pkce', storageKey:'sf-<ref>-auth'}})`.
- PKCE returns `?code=`, which avoids clashing with the app's `#/` hash routes.

**3. App boot**
- `getSession()`, then load the `profiles` row.
- If the row is missing or `status!=='active'`, call `signOut()` and show an error.
- Otherwise `setUser({...profile, userType:profile.user_type, isDemo:false})`.
- `onAuthStateChange`:
  - SIGNED_IN → load profile
  - SIGNED_OUT → clear
  - PASSWORD_RECOVERY → modal
- `onLogout` = `await supabase.auth.signOut()`, then clear the `solarflow_*` session keys.
- Remove the `solarflow_entered_demo` gate.

**4. Bootstrap the first admin (empty DB)**
- The SQL installs `solarflow_private.handle_new_user()` AFTER INSERT ON auth.users (SECURITY DEFINER, search_path ''):
  - Insert into profiles(id, email, name = coalesce(app_meta.name, user_meta.name, split_part(email,'@',1)), user_type, role, status).
  - If no active admin exists: user_type='admin', role='Admin', status='active'.
  - Else, if `raw_app_meta_data->>'created_via'='add_user'`: take user_type, role, channel_partner and parent_profile_id from **app_metadata**, status active.
  - Else: status 'inactive' (defence if sign-ups are re-enabled by mistake).
- The owner creates their account in Dashboard → Authentication → Users → Add user (Auto Confirm) and signs in.
- README fallback (SQL editor): `update public.profiles set user_type='admin', role='Admin', status='active' where email='owner@client.com';`

**5. Invite/create staff**
- Only through the hardened `add_user`.
- The admin creates any enabled role.
- A CPO (`channel_partner_office`) may create only `office2`/`agent2`; the function forces `channel_partner = caller.channel_partner`, `parent_profile_id = caller.id` and `created_by = caller.id`.
- Passwords are set by the creator: `email_confirm:true`, no email dependency.
- Users change their own password in-app via `auth.updateUser`. Add a "Change password" item; currently only the recovery modal does this.

**6. Roles and authorization in the DB (replaces 19's using(true))**
- SECURITY DEFINER STABLE helpers in `solarflow_private`, granted to authenticated: `my_profile()`, `my_role()`, `is_active()`, `is_admin()`, `is_head_office()` (admin|sales), `current_cpo()` (CPO → own id, office2 → parent_profile_id), `can_view_lead(creator uuid)`.
- **profiles**
  - select: `is_active()`
  - update: `is_admin()`, or a CPO on its children, or self. A BEFORE UPDATE guard trigger blocks non-admins changing user_type, status, channel_partner or parent_profile_id.
  - insert/delete: none for clients (service role and trigger only).
- **admin (customers)**
  - PERMISSIVE select/insert/update: head office; CPO/manager through `can_view_lead`; agent2/agent where `lead_creator_profile_id = auth.uid()` OR (branch + sub_channel_partner = own name), mirroring AgentPortal; vendor where `vendor` ∈ names of vendors rows whose email = my email.
  - delete: admin only (Trash permanent delete).
  - Keep the RESTRICTIVE `cpo_lead_scope`.
- **documents, bom, bom_items**: keep the restrictive "parent visible" policies (09:118-123), so they inherit admin visibility.
- **metadata, vendors, drivers**: select for active users; write for head office.
- **delivery_batches, inventory_items, inventory_movements, staff_attendance**: head office, plus vendor read of own batches if the vendor portal needs it.
- **quotations**: owner, head office, or CPO scope.
- **activity_log**: insert with `user_id=auth.uid()`; select for head office (plus own rows).
- **team_chat_messages**: select/insert for active users (`sender_id = auth.uid()`); delete own or admin.
- **storage `customer-documents`**: keep the 19 policies; `exists(select 1 from admin …)` already inherits admin RLS.

## D. Isolation guard: replace with a normal client
- **`src/supabase.js`**: see touchpoint. Remove `DEMO_ISOLATED`, the offline stub, `blockedBackendFetch`, the `/functions/` block and the demo storageKey.
- **`src/demo/config.js`**: delete the ref, URL and key checks; move `DATA_EXPORTS_ENABLED` to the feature config.
- **`scripts/check-isolation.mjs` and `scripts/demo-env.mjs`**: replace with a client env check. Required vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. Reject service_role/sb_secret_. Scan src/dist for secrets and postgres:// strings. Drop the CNAME, git-remote, demo-ref and workflow bans. The builder repo has no git remote, which is good: keep it that way so it can never push to the demo repo.
- **`index.html:5` and `public/404.html:4`**: CSP via `%VITE_SUPABASE_URL%` or a transformIndexHtml plugin.
  - connect-src: https URL plus the derived wss origin.
  - img-src: the Supabase URL (signed storage URLs) plus data: and blob:.
  - Dev ws only in dev.
  - Title and description from config.
- **`vite.config.js`**: nothing demo-pinned. Fixed ports 5186/4186 and `base:'./'` are fine. `__BUILD_ID__` only feeds the dead UpdateChecker.
- **`package.json`**: rename; dev/build/preview call the new check; drop or replace `deploy: gh-pages`.
- **`tests/isolation/backend.test.mjs`**: rewrite.

## E. Demo-only runtime code to remove or flag off

**Delete or exclude from client bundles**
- **`src/demo/`**:
  - DemoHeader.jsx, RolePicker.jsx, tour.js, tourSteps.js, DemoPeople.jsx (unused)
  - seed200.js (used only by src/dev/tourPreview.jsx)
  - vendors.js, drivers.js, deliveryBatches.js (ensureThreeDemo*, demoVendorTarget, demoDriverTarget)
  - stageRequirements.js (moves to config)
  - demo.css (check for styles still used by `.demo-portal-controls`/`.demo-app` before deleting)
  - config.js
- **`src/dev/*`** and `bom-preview.html`, `quotation-preview.html`, `tour-preview.html` (dev only).
- **`scripts/enrich-demo-records.mjs`**.
- **Marketing**: `src/components/PricingView.jsx`, `CustomizationEnquiryForm.jsx`, `src/enquiries/{submit,brief,reopen,draft}.js`. Also App.jsx public routes (#/plans, #/quote, brief/enquiry links: lines 5-6, 17, 58-68, 78-79, 119-120, 152-166) and the DashboardView.jsx:13 import.
- **Dead files**: `BrevoModal.jsx`, `DevRoleSwitcher.jsx` and the `onOpenDevSwitcher` props/buttons (Dashboard 1446, AgentPortal 1254, VendorPortal 994, StampPortal 764), `UpdateChecker.jsx` + `public/version.json`, `SetPassword.jsx`.

**App.jsx removals**
- Imports at lines 1-2, 7, 10.
- `scheduleBackgroundDemoCleanup` (35-53).
- `ENTERED_KEY` gate (30-33, 85, 103, 112, 122).
- `demoVendorTarget` (94, 132).
- `isDemo:true` (95, 134).
- `switchTourRole` (127-138).
- `chooseAgain` → real `signOut`.
- DemoHeader wrapper (170-172).

**LoginScreen.jsx**: rewrite as a real login (see touchpoints).

**Portal hooks**
- `useDemoTourNavigation` imports in Dashboard 1/210, AgentPortal 2/75, VendorPortal 1/38, StampPortal 1/462, SubsidyView 1/12, LoanView 1/12, InventoryView 1/18. They are harmless no-ops without a tour, but remove them for cleanliness.
- `demoControls` slots: Dashboard 1628, AgentPortal 1026/1276/1404→QuotationModule, VendorPortal 1013, StampPortal 784.
- "START HERE" tour card: Dashboard 1639.
- "Demo essentials" banner: CustomerDetailModal 1836.

**demo_profiles readers → profiles**
- Dashboard.jsx:376
- ChannelPartnerManagementView.jsx:103, 279, 497-505, 623
- DiscomSubmissionTab.jsx:75 (stamp, feature-off)
- utils.jsx:1207
- staffAttendance.js:244
- UserManagementView.jsx:314, 883, 936, 1019-1273, 1291-1334
- StampPortal.jsx:502/687 (`demo_profile_id`; StampPortal is removed)
- AgentPortal.jsx:197, AddLeadModal.jsx:478, Dashboard.jsx:1162 (`user.demo_profile_id || user.id`; works with real ids, simplify)

**Hard-coded demo data**
- `UserManagementView.DEFAULT_SYSTEM_USERS` (753-873) and the password banner/copy (1424, 1627-1632); the `@solarflow.example` check (97).
- `staffAttendance.DEFAULT_OFFICE_STAFF`/`DEFAULT_ATTENDANCE_RECORDS` (86+).
- `TeamChatDrawer.getInitialMessages` seeding (20, 163-176) and Reset (236-254, button ~371).
- VendorPortal vendor alias expansion (311-326).
- `utils.jsx` mock documents for `demo-` ids (696-707, 797-806) and `/demo-document.svg` fallbacks (832, 866): harmless, optional cleanup.
- Company placeholders `DEMO-GST`/`DEMO-ACCOUNT`/`Demo Aurora Solar` in `src/quotations/template/data/initialData.js`, `DocumentFooter.tsx` and `feasibilityReport.js`: move to client branding config.

**Anything referencing `demo_session_id` in src**: none. It exists only in the SQL files listed in §F.

## F. SQL file classification (supabase-setup/ and supabase/migrations/)

| File | Class | Notes |
|---|---|---|
| 01_solarflow_demo | SCHEMA source plus DEMO machinery | Take columns, metrics, move_stage, bucket and touch trigger. Drop demo_session_id (every table), sandbox RLS, start_demo_session, demo defaults. Rename demo_roles → app_roles (FK target of profiles.user_type). |
| 02_sample_data_50 | DEMO SEED | Adds `demo_seed_key` and indexes to every table, seed_demo_data_50, start_demo_session. Exclude. |
| 03_connected_demo_scenarios | DEMO | demo_profiles, seed_demo_scenarios, broken integration trigger, admin.demo_scenario_version, profiles.demo_profile_id. Exclude; replace the people directory with profiles columns. |
| 04_inventory_and_reference_boms | SCHEMA + DEMO | Keep inventory_items/inventory_movements DDL (minus demo_session_id), admin.bom_data, inventory_item_key(). Function bodies are superseded by 22. Exclude seed_demo_inventory and profiles.inventory_reference_version. |
| 05_installation_payments | DEMO SEED | Exclude. |
| 06_three_demo_vendors | DEMO | Exclude. |
| 07_bom_delivery_stock | SCHEMA (partly superseded) | Keep columns bom_items.stock_quantity, admin.bom_stock_issued_at, inventory_movements.customer_id. Functions are superseded by 19 (batch RPCs) and 22 (inventory). |
| 08_fictional_demo_names | DEMO | Exclude, including the 'Demo Aurora Solar' defaults. |
| 09_cpo_lead_scope | SCHEMA + DEMO | Keep admin.lead_creator_profile_id, restrictive policies, cpo_leads, get_cpo_dashboard_metrics. Rewrite scope functions and lead-creator trigger on profiles. Exclude seed_demo_cpo_hierarchy and start_demo_session. |
| 10_sample_data_200… | DEMO SEED | Exclude. |
| 11_fix_lead_ordering… | DEMO data fix | Exclude. |
| 12_staff_attendance | SCHEMA + DEMO SEED + insecure | Keep the table without demo_session_id; unique(staff_name,date) or (user_id,date). No anon. No seed. |
| 13_add_drive_and_location_links | SCHEMA | admin.google_drive_link, location_link. |
| 14_cascade_profile_deletions… | FK intent only | Never include the auth.users/profile deletes. |
| 15_auto_fill_admin_timestamps | SCHEMA | Add `set search_path=''`; INVOKER is fine. |
| 16_create_enquiries_table | ENQUIRY | Exclude. |
| 17_create_all_8_demo_users | DEMO AUTH | Exclude (known passwords). |
| 18_refresh_cpo_leads_view | SCHEMA | Fold into the final view creation. |
| 19_convert_to_shared… | MIXED | Keep: batch RPCs (469-635), team_chat DDL/policies/publication (640-670, 682-696), storage policies (309-335), FK intents (236-271, but make quotations.owner_id nullable). Rewrite: CPO funcs (340-374). Exclude: drop-column step, dedupe/seed steps 2-7, chat seed (672-680), start_demo_session (380-464). Replace using(true) RLS (276-304). |
| 20_add_team_chat_realtime | SCHEMA dup of 19 | Exclude the seed rows. |
| 21_permanent_cleanup… | ONE-OFF demo purge | Exclude. |
| 22_fix_shared_inventory_functions | SCHEMA (current) | Copy verbatim. Same as migration 20260928104005. |
| 23_inventory_catalog_management | SCHEMA | inventory_items.category, archived_at, partial index. |
| migrations/20260927180502 … 20260929161104 (except 20260928104005) | ENQUIRY/marketing | Exclude. They use enquiry_private.*, pg_net, pg_cron, fixed recipient enquiry@deeprootsystems.in and PIN '0905'. |

## G. Backend objects the app actually uses (from grepping src)

**Tables (`.from`)**
- `admin` (47 refs plus dynamic), `metadata` 22, `vendors` 16, `profiles` 11, `delivery_batches` 11, `drivers` 8, `staff_attendance` 7, `bom` 7, `bom_items` 7, `team_chat_messages` 5, `documents` 5, `activity_log` 5, `quotations` 4, `inventory_items` 3, `inventory_movements` 1.
- Demo/marketing only: `demo_profiles` 17 → replace with profiles; `enquiries` 1 → marketing.

**View**
- `cpo_leads`, used via `isChannelPartnerOffice ? 'cpo_leads' : 'admin'` in Dashboard, SubsidyView, LoanView, InstallationView, DataExportView.

**RPCs used by the app**
- `get_dashboard_metrics_scoped`, `get_dashboard_metrics` (fallback), `get_cpo_dashboard_metrics` (Dashboard 444-457)
- `move_stage` (Dashboard 1058)
- `record_inventory_movement` (InventoryView 160)
- `update_delivery_batch_status_atomic`, `save_delivery_batch_atomic`, `delete_delivery_batch_atomic` (src/delivery/status.js)

**Internal-only functions (still required)**
- `bom_stock_document`, `inventory_item_key`, `sync_inventory_catalog`, trigger functions.
- `get_inventory_bom_lines` and `set_bom_stock_quantity` are not called by the current UI; optional.

**Demo/marketing RPCs to exclude**
- `start_demo_session`, `verify_preparation_pin`, `create_prepared_brief`, `unlock_prepared_brief`, `find_owned_prepared_briefs`, `save_enquiry_details`, `read_client_form_draft`, `save_client_form_draft`, `open_submitted_enquiry`, `find_submitted_enquiries`, `finalize_client_enquiry`, `admin_enquiry_catalog`.

**Triggers needed**
- `touch_updated_at` (all tables with updated_at; quotations optimistic locking depends on it via `.eq('updated_at', row.updated_at)`).
- `ensure_admin_timestamps` (admin).
- `issue_delivered_bom_stock` (admin, BEFORE UPDATE OF delivery_status).
- `sync_inventory_catalog_after_bom_change` (bom_items, statement-level).
- `assign_lead_creator` (rewritten).
- New: `handle_new_user` (auth.users), `profiles` guard trigger, `cpo_profile_id` maintenance.

**Storage**
- Private bucket `customer-documents` (20 MB limit). Paths are `<customer uuid>/<uuid>_<name>`. Calls: upload upsert, download, createSignedUrl(s), remove (src/utils.jsx 733, 836-883, 1061, 1179). 4 policies on storage.objects.

**Realtime (postgres_changes)**

| Table | Subscribers |
|---|---|
| admin | Dashboard 608, AgentPortal 251, VendorPortal 383, StampPortal 546, CustomerDetailModal 196 (UPDATE filter id=eq) |
| delivery_batches | DeliveryBatchesView 342 |
| activity_log (INSERT) | ActivityLogView 156 — **currently not published** |
| team_chat_messages (INSERT/DELETE) | TeamChatDrawer 186 |

Publish admin, delivery_batches, activity_log and team_chat_messages.

**Edge functions invoked**
- `add_user` (UserManagementView 45, 393, 1141, 1304)
- `send-lead-to-vendor` (utils/vendorNotification.js:48, called from MaterialDeliveryTab and InstallationStatusTab)

## H. Consolidated fresh-install SQL: ordered object plan
0. **Preamble**: `begin;` guard (raise if `to_regclass('public.admin')` is not null); `create schema if not exists solarflow_private; revoke all on schema solarflow_private from public, anon, authenticated; grant usage on schema solarflow_private to authenticated` (for helper functions); `grant usage on schema public to anon, authenticated`.
1. **`public.app_roles`** (user_type pk, label, role, display_order, enabled bool). Seed the 8 role rows, with `enabled` from client config (stamp=false). RLS select for authenticated.
2. **`public.profiles`**:
   - Columns: id uuid pk → auth.users ON DELETE CASCADE; name not null; email; phone; phone_number; user_type → app_roles; role; channel_partner (no default); status check; parent_profile_id → profiles ON DELETE SET NULL; cpo_profile_id uuid; created_by → profiles ON DELETE SET NULL; created_at; updated_at.
   - No demo_session_id, demo_profile_id or *_seed_version columns.
3. **`public.admin`**:
   - All 01 columns minus demo_session_id.
   - Plus: google_drive_link, location_link, bom_data jsonb, bom_stock_issued_at timestamptz, lead_creator_profile_id → profiles ON DELETE SET NULL.
   - Plus any per-client extra fields from the setup form.
   - Not included: demo_seed_key, demo_scenario_version (also remove `demo_scenario_version` from src/constants.js ADMIN_COLUMNS).
4. **Directory and child tables**:
   - `metadata` unique(category,label)
   - `vendors` unique(name); optionally `profile_id` → profiles for the vendor login link
   - `drivers` unique(name)
   - `activity_log` (user_id → profiles SET NULL, customer_id → admin SET NULL)
   - `documents` (customer_id → admin CASCADE, uploaded_by → profiles SET NULL)
   - `bom` (admin_id → admin CASCADE, unique(admin_id,bom_type))
   - `bom_items` (bom_id → bom CASCADE, stock_quantity numeric(14,3) check ≥0)
   - `delivery_batches` (unique batch_no, project_ids uuid[])
   - `quotations` (identity quotation_no start 1001; **owner_id nullable** → profiles SET NULL; source/converted lead → admin SET NULL; status check)
   - `inventory_items` (unique item_key, unique sku, category default 'General', archived_at, checks)
   - `inventory_movements` (item_id → inventory_items **RESTRICT**, unique request_id, customer_id uuid, kind check)
   - `staff_attendance` (user_id → profiles SET NULL, unique(staff_name,date))
   - `team_chat_messages` (sender_id → auth.users SET NULL)
5. **Indexes**: admin(stage, created_at desc) where deleted_at is null; admin(lead_creator_profile_id); quotations(status, created_at desc); documents(customer_id); bom_items(bom_id); activity_log(customer_id, created_at desc) and (user_id); inventory_movements(customer_id); staff_attendance(date) and (staff_name); team_chat(created_at desc); inventory_items active-category partial index; profiles(parent_profile_id) and (user_type).
6. **Generic triggers**: `solarflow_private.touch_updated_at()` plus a trigger per table with updated_at; `ensure_admin_timestamps` (search_path ''). Add a `profiles` trigger that sets cpo_profile_id (CPO = id; office2 = parent_profile_id).
7. **Auth/role helpers** (SECURITY DEFINER, STABLE, search_path ''): my_role, is_active, is_admin, is_head_office, current_cpo, can_view_lead.
   - Create them after profiles exists: `language sql` bodies are validated at create time.
8. **`assign_lead_creator()`** BEFORE INSERT OR UPDATE OF lead_creator_profile_id ON admin (rewritten from 09:30-53 using profiles). Also `profiles_guard()` BEFORE UPDATE ON profiles (blocks privilege-column changes by non-admins).
9. **Inventory functions**: copy 22 verbatim, in order:
   1. `inventory_item_key` (from 04:31-35)
   2. `sync_inventory_catalog`
   3. `sync_inventory_catalog_after_bom_change` + trigger
   4. unique index on request_id
   5. `record_inventory_movement`
   6. `bom_stock_document`
   7. `get_inventory_bom_lines` (sql; needs bom_stock_document first)
   8. `set_bom_stock_quantity`
   9. `issue_delivered_bom_stock` + trigger
10. **Delivery batch RPCs**: copy 19:469-635 (save/delete/update_*_atomic).
11. **Metrics and stage functions**:
    - `get_dashboard_metrics_scoped` → `get_dashboard_metrics` → `get_cpo_dashboard_metrics` (it raises when current_cpo() is null).
    - `move_stage`: validate against `pipeline_stages` or config-generated stage names instead of the hard-coded array at 01:354; it inserts activity_log with user_id = auth.uid().
    - Optional `pipeline_stages` table (key, label, sort_order, is_terminal), seeded by the per-client config file.
12. **Optional integration-staff trigger** on metadata (integration_by rename cascade into bom/bom_items, plus delete guard), without demo_profiles.
13. **RLS**: `enable row level security` on every public table, then the policies from §C.6, then the RESTRICTIVE `cpo_lead_scope` (admin) and the parent-visibility restrictive policies on documents/bom/bom_items (09:118-123).
14. **View**: `create view public.cpo_leads with (security_invoker=true) as select * from public.admin where solarflow_private.current_cpo() is not null and solarflow_private.can_view_lead(lead_creator_profile_id)`. Create it **after** step 3 and any extra-field columns; grant select to authenticated.
15. **Grants**:
    - `revoke all on all tables in schema public from anon`.
    - Explicit `grant select, insert, update, delete` per table to authenticated (inventory: no delete).
    - `grant usage, select on sequence public.quotations_quotation_no_seq to authenticated`.
    - `revoke execute on all functions in schema public from public, anon`.
    - `grant execute` on the RPCs in §G and the helpers to authenticated.
    - Trigger functions are not granted.
16. **Storage**: `insert into storage.buckets(id,name,public,file_size_limit) values ('customer-documents','customer-documents',false,20971520) on conflict do nothing`, plus the 4 policies from 19:316-332.
17. **Realtime**: add admin, delivery_batches, activity_log and team_chat_messages to supabase_realtime, guarded by `pg_publication_tables` existence checks.
18. **Auth bootstrap**: `solarflow_private.handle_new_user()` + `create trigger on_auth_user_created after insert on auth.users`. Also backfill profiles for any pre-existing auth.users (first one → admin).
19. `commit; notify pgrst, 'reload schema';`

**Separate per-client file (generated by the setup form)**
- Upsert app_roles.enabled.
- pipeline_stages.
- metadata dropdown seeds for categories channel_partner, module_brand, registration_by, integration_by, inverter_make, plus any others the form defines.
- No people and no customers.

**Ordering hazards to respect**
- app_roles → profiles → admin → children.
- `language sql` functions validate referenced objects at creation; plpgsql bodies do not, so a typo surfaces only at runtime. Test with PGlite as the existing tests do.
- cpo_leads must come last among admin-dependent objects.
- Restrictive policies need the helper functions to exist.
- The auth.users trigger needs profiles and app_roles.
- Storage policies need admin.

## I. Edge functions

| Function | What it does | Client build? | Secrets |
|---|---|---|---|
| `add_user` | Service-role create/update_password/update_email/delete auth users and upsert profiles | **Yes**, required for real staff onboarding, but must be hardened (JWT verify, caller role checks, enabled-role whitelist, app_metadata role, CORS origin, parent/created_by for CPO-created users) | None manual: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected in hosted functions. Optional ALLOWED_ORIGIN. |
| `send-lead-to-vendor` | Emails a vendor customer details via the Brevo API when material delivery/installation is assigned | Optional; only if the vendor-email feature is on. Harden first (auth, server-side recipient lookup, HTML escaping, honest not-configured response). | BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME (set by the client with `supabase secrets set`; never in chat or in VITE_*) |
| `send-enquiry-email` | Marketing enquiry worker (postgres to the outbox, Brevo, fixed recipient enquiry@deeprootsystems.in; verify_jwt=false in config.toml) | **No** | ENQUIRY_WORKER_TOKEN, BREVO_*, SUPABASE_DB_URL |

- Deployment: `supabase functions deploy add_user --project-ref <client-ref>` (needs the CLI logged in on the operator machine) or the dashboard function editor.
- `supabase/config.toml` only configures send-enquiry-email; drop that block for client zips.

## J. What to request from the person creating the new Supabase project
- Project URL and anon/publishable key. These are public and safe to share.
- Do NOT send the service_role key, the DB password/connection string or a personal access token in chat. SQL can be run by pasting the generated file into the SQL Editor; function deploys and secrets can be done by them, or by a CLI session they log into locally.
- Dashboard toggles listed in §C.1. Note the current demo README instructs the opposite (enable anonymous sign-ins).
- Owner/admin email and name for the bootstrap.
- Brevo/SMTP details only if they want vendor emails or password-reset emails; they enter those as secrets or settings themselves.