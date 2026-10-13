# Run the SolarFlow demo SQL

1. Create a **new, empty Supabase project** for SolarFlow.
2. Open that project's SQL Editor and run the entire `01_solarflow_demo.sql` file once.
3. The last query should return eight role rows.
4. In Supabase Authentication settings, enable **Anonymous Sign-Ins**. This dashboard setting is not enabled by the SQL.

The script refuses to proceed if `public` already contains tables. It is transactional; an error before COMMIT rolls back setup. Do not remove the guard to use the original project.

## Passwordless role chooser contract

The frontend must establish a Supabase Auth anonymous session, then invoke:

```js
const { error: authError } = await supabase.auth.signInAnonymously();
if (authError) throw authError;
const { data: user, error } = await supabase.rpc('start_demo_session', {
  p_role: 'admin',
});
if (error) throw error;
```

Reuse an existing anonymous session when switching roles; do not create a new Auth user on every click. `start_demo_session` returns `id`, `name`, `email`, `user_type`, `userType`, `role`, `channel_partner` and other profile fields.

Choices: `admin`, `sales`, `channel_partner_office`, `office2`, `agent2`, `agent`, `vendor`, `stamp`.

Run the second SQL file to provide 50 fictional records per business table per visitor. No fake passwords or direct inserts into `auth.users` are required. No customer rows appear immediately after running SQL Editor because there is no visitor session at that point.

The personas change the displayed portal. They are intentionally not production authorization levels: every visitor can choose Admin within their own private demo sandbox. RLS prevents one visitor from reading or modifying another visitor's data. Anonymous data is tied to that browser's Auth session; losing/signing out of it means losing access to that sandbox. Sample sessions are not automatically purged by this script.

## Included and remaining work

Includes the role catalog, profiles, CRM customers, quotations, metadata, vendors, drivers, activity logs, document metadata, BOMs/items, delivery batches, metrics RPCs, stage transition RPC, timestamp triggers, indexes and private document storage policies. The full copied CRM column list is represented; numeric and structured fields are derived from the local source.

Delivery batching uses the app's existing table-write fallback; the optional `*_delivery_batch_atomic` RPCs are not included in this bootstrap. Vendor email and Auth-user administration Edge Functions are not created. They need separate demo implementations if wanted. No real email is sent.

This SQL does not edit the UI, remove the isolation banner, configure credentials, loosen the local connection guards, or create a GitHub repository. The frontend now includes the role chooser and header tour, and permits only the new demo backend. Use only the NEW project's URL and publishable key when wiring the frontend; never place a secret/service-role key in browser code.

## Validation

Executed in a temporary local PGlite/Postgres-compatible runtime with mock Supabase Auth and Storage schemas. Checked all eight roles, first-use seed data, repeated role switching without duplication, metrics, stage moves, quotation insertion, private storage policy, cross-session read/write denial, unauthenticated denial, and the non-empty-project guard. The SQL was **not run against any hosted Supabase project**. Hosted Auth, Storage API, realtime delivery and end-to-end CRM workflows still require verification after enabling Anonymous Sign-Ins and running both SQL files.

Reference: https://supabase.com/docs/guides/auth/auth-anonymous

## 50-row sample data update

After the first SQL file, run `02_sample_data_50.sql` once in the same NEW project. It creates 50 synthetic seed records per visitor in each of: admin, metadata, vendors, drivers, activity_log, documents, bom, bom_items, delivery_batches and quotations. Existing user-created data is preserved, so total row counts can exceed 50. Existing original eight sample customers are adopted without overwriting their values. Repeating the seed does not duplicate rows or overwrite edits. Future `start_demo_session(role)` calls use this 50-row seed. Existing demo profiles are seeded by the SQL Editor block immediately. With no demo profiles yet, data is created on first login.

`demo_roles` stays at eight choices. `profiles` tracks actual authenticated visitors; neither profiles nor auth.users are padded to 50. The current .env contains no six login accounts. The user chose passwordless entry with the existing eight role choices; no credential accounts need to be created.

Document records use `mock/` paths which this app displays using its local demo SVG. They are sample placeholders, not uploaded Storage objects. No real identity documents are generated or copied.

Correct frontend environment parameter names:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

The current `.env` values were preserved while correcting `SUPABASE_URL` and `ANON KEY` to these names. Only a public anon/publishable key belongs in a Vite variable; login passwords or service-role keys must never be placed in `VITE_*` variables.

## Header and role examples update

The tour controls now sit inside each portal's existing header. Tour steps appear in a floating panel. Rerun the updated `02_sample_data_50.sql` to fill empty Stamp agreement data: three pending assignments for Demo Stamp and one completed record. Existing agreement edits are preserved. See `DEMO_CONTENT.md` for role examples and copyable text; add your own pictures through the normal upload controls.

## Connected profiles and varied statuses (run this after the 50-row seed)

If you already ran `02_sample_data_50.sql`, run **only `03_connected_demo_scenarios.sql` next**, then refresh the app. The third script upgrades existing visitors and future role entries. Do not rerun 02 afterward: it contains the older role-entry function; if you do, run 03 again last.

For untouched sample data, all 50 customers have subsidy examples (10 in each of Inprocess, Redeemed, Returned, Approved and Received). The 25 Loan customers cover all seven loan tags; Cash customers no longer get an irrelevant loan tag. Non-default tags and existing history are preserved, so a customized sandbox can have different totals.

`demo_profiles` holds the eight stable demo personas and three integration staff: Demo Preparer, Demo Loader and Demo Installer. These are fictional directory records linked to the visitor's private sandbox, not new Auth accounts. `profiles.id` remains the authenticated visitor ID; `profiles.demo_profile_id` records their chosen persona. Stamp assignments point to the persistent Stamp directory ID, so switching to Office does not remove Stamp from the selector. Dealer/partner and vendor selectors use this same directory. Existing integration metadata is adopted; additions and renames remain synchronized with staff and BOM assignments.

User Management shows this connected demo directory. Choose another persona with Switch role; there are no real login passwords to create or reset. Hosted changes take effect only when you run the SQL in the separate demo project.

Locally validated with PGlite: existing and fresh visitor setup, 50 customers, five subsidy and seven loan statuses, eight role personas plus three staff, stable Stamp assignments, integration staff rename propagation, repeated SQL preserving edits, and cross-visitor read/write isolation. UI fixture confirms subsidy counts and filtered records and the populated profile directory.

## Restore quotation artwork

The former banner/emblem files were removed during demo isolation and are not present in this workspace. The repeated SolarFlow / DEMO ONLY text badges have been removed. In Quotation Maker's final review step, use **Banner and emblems** to add your GEDA symbol, energy emblem, banner, combined image or partner logo. PNG/JPG/WebP images up to 1 MB each are saved per quotation and rendered in the preview and PDF. A combined image overrides the separate symbols/banner. The local SolarFlow banner remains the fallback until artwork is supplied.

## Inventory and supplied BOM references

Run **04_inventory_and_reference_boms.sql after 03** in the separate demo project, then refresh. Run updates in numerical order; do not rerun an earlier file after a later one without applying the later file again.

The reference inputs are the user-supplied `metadata_rows.csv` (85 rows), `bom_rows.csv` (105 BOM headers) and `bom_items_rows.csv` (4,685 items). Only material names, quantities and equipment labels are retained as reference. Partner, staff and office names are replaced with fictional demo labels. Source dates, record IDs, customer links and free-text notes were excluded. The normalized reference is in `src/inventory/reference.json`.

- 76 metadata labels remain after case-insensitive deduplication, excluding test/test2 and the DEBOARDED partner marker. WAREE is normalized to WAAREE. Existing demo role-to-customer assignments remain linked.
- 53 inventory materials cover the 45-line roof and 35-line shed templates. The two LA cable spellings and Condute/Conduite Pipe spellings share stock identities. Other potentially different materials remain separate.
- The supplied items CSV has no unit column. Units come from the existing roof/shed BOM templates; metres, feet, pieces, bags and 50 kg bags remain distinct.
- Three source-based reference designs per type supply realistic quantities. Original expressions such as `12*4`, `5+2` and `3+1` remain intact. They are marked for quantity review in inventory; no arbitrary arithmetic converts a kit or dimensional specification into stock demand.
- Existing single-placeholder sample BOMs become complete source-based BOMs. An active shed project gets a shed alternative alongside its roof design. Other saved/custom BOMs and inline snapshots are preserved. New BOMs use the first reference design, with the project's module count when available; measurements still need review.
- Sample opening stock is labelled in the screen and movement history. Stock receipt/issue is explicit, rejects negative balances, and supports safe retry with one request ID. Saving a BOM does not deduct stock.
- Inventory's BOM quantity is informational and includes saved alternatives. It is not a reservation or a procurement order. BOMs with unresolved quantities need review before an issue. Custom saved BOM items with units join the catalog on refresh at zero opening stock.
- Fictional staff labels populate integration selectors and remain connected through the existing metadata synchronization trigger. Supplied brands, wattages and inverter makes replace untouched sample equipment values.

Open **Inventory** from Admin or Office. Use **Receive / issue** with a quantity and note. Every successful movement updates on-hand stock and records its history. Repeated SQL runs preserve changed balances and do not repeat opening stock.

Validated locally: 53 catalog items; 2,250 roof and 875 shed BOM rows across an untouched 50-customer sandbox; receipt/issue, insufficient-stock rejection, duplicate-request handling, SQL reruns, role switching, cross-visitor isolation, separate roof/shed loading, blank/zero preservation, unit matching and compound quantities. The browser fixture verifies a receipt and its history. The hosted database has not been changed by the agent.

## Godown and installation payments

Godown is the existing Inventory page, placed immediately after Activity Log for Admin. It uses only `inventory_items` and `inventory_movements`; no additional tables are created. Office retains access. The daily report uses India time and shows each material's opening, incoming, outgoing and closing balance, including days without movements. History is paginated completely for reports, while the recent-movements table displays the latest 50 entries.

The dashboard now shows Lost Projects from the existing scoped stage counts.

Run **05_installation_payments.sql after 04**, then refresh to add up to 12 eligible sample installation payments per visitor. Vendor assignment alone does not populate Installation Payments: installation status must also be Yes/Installed. The upgrade sets qualifying untouched later-stage sample customers to Yes, assigns sample vendor quotes and delivery/installation dates, and includes Paid and Pending examples. Edited payment records are preserved, and repeat runs do not reseed them. No actual payment is made. This SQL has been validated locally with PGlite; it has not been run on hosted Supabase by the agent.

## Three demo vendors

Run **06_three_demo_vendors.sql after 05**, then switch role or refresh. It consolidates the numbered demo vendors into **Demo Vendor 1, 2, and 3**, reconnects project and truck vendor names, and links the existing Vendor persona to Demo Vendor 1. Payment details and stable profile IDs remain intact. Custom vendor names are preserved. Cleanup runs after older seeds on each role entry so excess sample vendors do not return.

## Tabbed inventory and stock deductions on delivery

Run **07_bom_delivery_stock.sql after 06**, then refresh. No new tables are created. Inventory now has Stock, BOM Quantities, Movements and Daily Report tabs, with 10 rows per page. Add quantity records a receipt, and the BOM Quantities tab lets you enter an actual numeric stock quantity for each project while retaining the original reference expression. The active roof/shed design is used; alternative designs are not deducted. Zero means an unused item. Numeric reference quantities are used automatically unless overridden.

Marking a project's delivery status Delivered deducts the saved BOM quantities and writes project-linked issue movements in the same database transaction. Missing quantities, missing materials/units, or insufficient stock reject the status change. Whole-truck delivery updates are atomic as well: all projects and stock changes succeed together or none do. The customer issue timestamp prevents repeat deductions, including toggling the status back and forth. Creating/saving a BOM alone does not deduct stock. Already-delivered projects are not deducted retrospectively on installing the SQL. Later BOM edits do not modify the recorded issue; use an explicit receipt/issue for actual returns or additional materials. Changing the reference quantity clears its old stock override in the BOM editor.

Validated locally with PGlite: ambiguous quantity rejection; reviewed quantity persistence and stale-edit rejection; customer and batch delivery deductions; insufficient-stock rollback; repeated delivery and SQL reruns; and cross-visitor isolation. Browser fixture verified tab layout, pagination and quantity review. Hosted SQL has not been run by the agent.

## Remove real names from the demo

Run **08_fictional_demo_names.sql after 07**, then refresh or switch role. Existing imported partner, staff and office names are replaced with clearly fictional Demo labels, including linked projects, profiles, BOMs, batch assignments and exact matching JSON values. The partner login becomes **Demo Aurora Solar**. Original names are not retained as plain text in the cleanup mapping. The stored reference seeder is replaced so future visitors receive fictional labels. Source CSV files in Downloads are unchanged.

The app also consolidates legacy demo vendors automatically before opening a restored session or a selected role. This uses the existing consolidation RPC when available and authenticated table operations on older demo setups. Assignments are moved before extra rows are deleted; errors stop cleanup and can be retried. The original 50-customer seeder now creates only three vendors. Refreshing the app applies this vendor cleanup without requiring another SQL step.

Driver cleanup also runs automatically on refresh and role entry. Only Demo Driver 1, 2, and 3 remain from the numbered sample driver list. Project and batch driver names/phones are relinked before removing extra directory rows; existing truck vehicle numbers remain unchanged. The 50-customer seeder now creates three sample drivers.

Placeholder delivery batches are consolidated on app refresh/role entry into up to three planned sample trucks. Only sample projects in Material Order, Material Integration or Material Delivery are grouped. Early-stage sample projects are released from placeholder batches. Custom, edited and dispatched trips are preserved. Existing stock and delivery status are not changed. The original seed no longer creates one batch per customer.

## CPO lead ownership

Run **09_cpo_lead_scope.sql after 08**, then switch into the CPO role again. CPOs see leads created by their office and by dealers whose stable `parent_profile_id` points to that CPO. Managers inherit their parent CPO's view. Counts, stage lists, global search and tag pages use the same scope; unrelated head-office/CPO leads are excluded even if a text label matches. Direct lead reads/updates, documents and BOMs are restricted by database policies as well. New CPO and dealer leads receive ownership IDs automatically.

The sample 50 are split into 10 CPO-created leads, 10 from its dealer, 15 from a different CPO's dealer, and 15 head-office leads. Admin continues to see all 50. Existing non-sample records without creator information are attributed from their saved dealer assignment; direct branch records without a dealer are attributed to that CPO because historical creator IDs were not recorded. Other unmatched records stay with head office. Existing creator IDs are preserved on reruns.

No new tables are added. Role selection still belongs to the visitor's isolated demo sandbox: the same visitor can intentionally switch to Admin. This is a demonstration of role scope, not a separate production user authentication system. Seeding occurs as the visitor's head-office persona inside a transaction before the requested role activates. Client directory/truck cleanup now runs only in Admin/Office so it cannot operate on a CPO's partial lead set.

Locally verified with PGlite: 20 visible CPO leads, 10 under the dealer filter, excluded reads/updates, new office and dealer lead ownership, unrelated same-name branch leads excluded, manager scope, repeated migration, and fresh-visitor setup. Browser fixture verifies counts and the dealer dropdown. Hosted SQL has not been executed by the agent.

## 200 Customers, Historical Clients & Clean BOMs

Run **10_sample_data_200_and_historical_clients.sql after 09**, then refresh or switch role.

- Seeds 200 realistic demo customers per visitor sandbox, evenly split between **Last Year (2025: 100 clients)** and **This Year (2026: 100 clients)** to demonstrate the dashboard's year filtering (All, 2026, 2025).
- Uses authentic Indian customer names (Ramesh Patel, Amit Shah, Priya Mehta, Nikhil Gupta, etc.) across Gujarat districts (Ahmedabad, Surat, Vadodara, Rajkot, etc.).
- BOM remarks and notes are clean (`''`) with no synthetic filler text.
- Technical staff names are updated to standard names (`Ravi`, `Nikhil`, `Staff 1`, `Staff 2`).
- Vendors are cleanly standardized to `Vendor 1`, `Vendor 2`, `Vendor 3`, and drivers to `Driver 1`, `Driver 2`, `Driver 3`.
- Lead ownership is cleanly distributed across CPO, Dealer, and Head Office so role scoping and filtering work out-of-the-box.
- Idempotent upsert (`on conflict do nothing`) preserves any existing visitor customizations and prevents duplication on reruns.


## Enquiry privacy correction (script 16)

Re-run the updated `16_create_enquiries_table.sql` in the approved demo project before publishing. Anonymous sign-ins carry the authenticated database role, so the old read policy exposed contact requests to demo visitors. The corrected script permits submission only; the owner reviews requests through the database dashboard or a trusted server. There is no visitor-facing enquiry review screen. This correction has been prepared locally but not applied to the hosted project by the agent.

## Atomic batch save/delete correction — SQL 07

Re-run the complete updated `07_bom_delivery_stock.sql` in the approved demo database. It now includes `save_delivery_batch_atomic` and `delete_delivery_batch_atomic`, which were missing from the hosted project. They link/unlink customers and save/delete a batch within one transaction, reject stale or conflicting assignments, and preserve delivered batch history. Until applied, the updated frontend shows a setup error for batch save/delete instead of attempting partial writes. Existing status/stock functions are retained.

Locally validated using PGlite with authenticated role and ownership policies: `PGLITE_MODULE=<path to PGlite module> node tests/delivery/batch-sql.mjs`. Hosted application and verification are still pending.

### Two-step enquiries

`supabase/migrations/20260927180502_two_step_enquiries.sql` enables a name-and-phone enquiry followed by optional details on the same record. It leaves existing enquiry-table permissions unchanged, stores edit keys in a private schema, and authorizes an update only with the original authenticated session and a random per-enquiry edit token. Selected plan or tools-only interest is captured in the first save. Skipping the second step retains that contact request.

Until this migration is applied, the quick enquiry can still use the existing insert-only API. Optional saves show an explicit unavailable message and never insert duplicate contacts. Apply the migration only to the approved demo project `qduonewmquwayrnwyzvc`.

The two-step migration was applied to the approved demo project through the CLI on 2026-09-27. `tests/enquiries/two-step.sql` passed against the hosted database with all fictional test data rolled back: same-record optional update, retry without duplication, private-key read denial, and rejection of wrong-token, cross-session and unauthenticated edits.

### Enquiry email notifications

The `send-enquiry-email` Edge Function and `supabase/migrations/20260927183052_enquiry_email_notifications.sql` are deployed and applied to the approved demo project `qduonewmquwayrnwyzvc`. The private worker token is configured. Each new enquiry queues an email to the fixed recipient `enquiry@deeprootsystems.in` containing only name, phone and selected plan/tools interest. Optional-detail updates do not send another email. Historical enquiries are not backfilled.

The browser receives no mail credentials and does not call email functions. The database queues the first submission and starts the worker after commit; a scheduled job retries failed sends with a stable UUID provider idempotency key. Optional details remain on the original enquiry record. Skipping retains the saved contact request.

Hosted `tests/enquiries/email-outbox.sql` passed with all fixtures and HTTP requests rolled back. The browser first-step flow and top skip link were verified with a fictional contact named “SolarFlow Email Test (demo)”. Brevo accepted its email and returned a message ID; inbox delivery has not been independently confirmed. Worker, enquiry and browser-isolation unit tests passed. Run the worker tests with `node --test tests/enquiries/email.test.mjs`.
