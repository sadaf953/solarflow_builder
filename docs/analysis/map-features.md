# features

## summary
Today the demo has no feature flags at all. The only switch is `DATA_EXPORTS_ENABLED` in src/demo/config.js:5. Everything else is gated by hard-coded `user.userType` checks spread across about 15 components. The main router is src/App.jsx:140, which maps agent/agent2 to AgentPortal, vendor to VendorPortal, stamp to StampPortal, and admin/sales/channel_partner_office/office2 to Dashboard. Dashboard.jsx is the admin/office shell: a hand-written sidebar (lines 1365-1432) and a `currentView === ...` router (lines 1638-1723). Customer work happens in CustomerDetailModal, whose tabs are PRIMARY_STAGES plus Documents and History (lines 1705-1713), routed through CustomerModalTabsRouter into src/components/modal-tabs/*. Most in-scope features map to concrete views:
- Installation view = InstallationView ('installation_tags')
- Installation commission view = InstallationPaymentsView ('installation_payments')
- Vendor commission page = the PAYOUTS tab in VendorPortal
- Calendar = VendorCalendarView ('vendor_availability', the VendorPortal AVAILABILITY tab, and a modal in MaterialDeliveryTab)
- Operations page = ChannelPartnerManagementView ('channel_partner_mgmt')
- Checklists vs Document uploads = the checklistMode ('checklist' | 'files') localStorage toggle
Several catalogue features have no app code at all: MIS upload auto updater, Channel partner commission view and Technician login. They exist only in marketing copy and enquiry-form lists (PricingView, CustomizationEnquiryForm, enquiries/brief.js). Warranty tracking is only a Final Review checkbox and text field plus a Toolbox certificate generator. Stamp staff login (StampPortal) is a real portal, and it is wired into DiscomSubmissionTab, Operations, User Management, Team Chat and AgentStageDetails. Some features also depend on each other inside the database, not just in the UI. The main case: the `issue_delivered_bom_stock` trigger links Delivery batches to the BOM maker and Inventory. Separately, several surfaces (the Calendar, Attendance fallbacks, payout ledgers, Team Chat seeding and the background "ensureThreeDemo*" jobs) rely on demo-only data or behaviour that must be removed or replaced before a client build.

## risks
- RLS is wide open (supabase-setup/19_convert_to_shared_multiuser_database.sql:298-301): every authenticated user can read and write every table. Turning on real vendor, dealer or channel-partner logins in a client build exposes all leads through the API. Feature flags in the UI are not a security boundary.
- Demo background jobs (App.jsx:35-53, 97, 116, 136; LoginScreen.jsx:95-97, 144-150; src/demo/vendors.js, drivers.js, deliveryBatches.js) rename and delete vendors, drivers and delivery batches. Run against a client's real data, they destroy records.
- isDemo:true is set on every login (App.jsx:95, 134; LoginScreen.jsx:100, 118, 143). UserManagementView then writes to demo_profiles instead of profiles (UserManagementView.jsx:882-883) and takes demo branches that skip the add_user edge function. Staff management will not create real logins until this is fixed.
- demo_profiles is the real role directory used for dealers, CPO hierarchy (parent_profile_id, cpo_profile_id), stamp makers and the attendance staff list (Dashboard.jsx:376, DiscomSubmissionTab.jsx:75, ChannelPartnerManagementView.jsx:103, utils.jsx:1207, staffAttendance.js:244). The client schema must keep it, renamed or merged into profiles, or Dealers, CPOs and dealer filtering break.
- The DB trigger issue_delivered_bom_stock (22_fix_shared_inventory_functions.sql:241-339) couples Delivery batches, BOM maker and Inventory. With Inventory OFF and Delivery ON, every 'Delivered' change fails with 'Insufficient stock' or 'Create and save a BOM'.
- The Calendar is localStorage-only with hard-coded Vendor 1/2/3 demo dates (utils/vendorAvailability.js:5-30). A vendor's unavailability never reaches the admin's browser, so the feature does not work for a real client.
- Payout views fabricate data: InstallationPaymentsView.jsx:92-135 and VendorPortal.jsx:881-922 invent dates, ₹2,200/kWp commission and 'Paid' status when columns are empty. Real clients would see fake money figures.
- TeamChatDrawer seeds demo announcements into an empty team_chat_messages table (146-177) and offers a reset that deletes all messages (236-255).
- The staff_attendance CHECK constraint (12_staff_attendance.sql:16) rejects pending_present, holiday_request and holiday, which AttendanceView writes. Leave and self-attendance requests silently fall back to per-browser localStorage.
- When stampLogin is off, the PM Surya Ghar Stamp checkbox disappears because it is only rendered in the sent-to-stamp branch (DiscomSubmissionTab.jsx:510). A naive gate removes the office's ability to record the stamp document.
- Removed features leak through secondary surfaces: stamp rows in AgentStageDetails (59-61), Team Chat badges and seeds (66-75, 96), the Operations stamp report (907-924, 1489-1560), CSV export columns (utils.jsx:391-404, 519-520), and warranty in the Toolbox (ToolboxView.jsx:31, 98, 1190-1350) and the AgentPortal subtitle (1067).
- The persisted sessionStorage view (Dashboard.jsx:235-242) can restore a view whose feature is off, which renders a blank page.
- move_stage hard-codes stage IDs (01_solarflow_demo.sql:354). PRIMARY_STAGES and STAGE_IDS are referenced directly in tabs, LoanView (stage LOAN at 39-49), the AgentPortal workdesk and VendorPortal TAB_STAGE_MAP. Feature gating and the configurable pipeline interact: turning off a stage (LOAN, SUBSIDY STATUS, MATERIAL INTEGRATION, MATERIAL DELIVERY, DISCOM SUBMISSION) silently breaks the feature that queries it.
- Edge functions are blocked by src/supabase.js (the fetch interceptor rejects /functions/). add_user (needed for staff management) and send-lead-to-vendor (vendor notifications) must be deployed to each client project and unblocked. The CSP in index.html:5 and the check-isolation script in the npm dev and build scripts reject any non-demo project.
- Dealers are linked two inconsistent ways: by channel_partner name (Dashboard.jsx:379 for admin, fetchAgent2SubAgents) and by parent_profile_id (CPO path, SQL current_demo_cpo). Turning on Dealers without CPOs relies on the name-based path.

## recommendations
- Add a generated src/config/client.config.js with client identity, Supabase env names, features, documentMode, pipeline and dropdowns. Add src/config/features.js holding the registry and resolver. Resolve flags once at startup, cascading dependencies to a fixpoint, and freeze the result. Features with status 'removed' or 'not_built' are forced off whatever the config says.
- Also expose the resolved flags at build time (Vite `define: { __FEATURES__: JSON.stringify(resolved) }`) and wrap lazy imports (`__FEATURES__.stampLogin ? lazy(() => import('./StampPortal')) : null`). Removed features are then absent from the client zip, not just hidden.
- Use one ROLE_FEATURE map: vendor→vendorLogin, stamp→stampLogin, agent2→dealers, agent→channelPartners, channel_partner_office→cpos, office2→branches. Derive enabledRoles() and isRoleEnabled() from it and use them in App.jsx:140, UserManagementView role selects and the Operations cards.
- Use one VIEW_FEATURE map for Dashboard view IDs. Drive NAV_ITEMS, the route switch, headerTitle, isSystemView and the session-restore sanitiser from it, instead of about 20 scattered checks.
- Treat 'Checklists' and 'Document uploads' as one derived setting, documentMode = both | checklist | files, with the constraint that at least one is on. Make getChecklistMode() return the forced mode.
- Split the SQL into core.sql (profiles, admin, metadata, documents and storage, activity_log, quotations, move_stage, metrics) plus per-feature modules: inventory.sql (tables, RPCs, catalog sync and the delivery stock trigger), delivery.sql (delivery_batches, drivers, batch RPCs), cpo.sql (cpo_leads view, scope functions, restrictive policy), attendance.sql (with the corrected constraint), team_chat.sql, vendor_calendar.sql (new table). The zip includes only the modules for enabled features and never includes seed files 02/03/05/06/08/10/11/17/21.
- Before enabling them for any client: move the Calendar to a DB table, remove the synthetic payout fallbacks, stop Team Chat seeding and reset, drop isDemo from real logins, and write per-role RLS.
- Give the registry an enquiryLabel per feature that matches INTEREST_OPTIONS in src/enquiries/brief.js, so the existing setup and enquiry form can prefill a client's feature config. Mark MIS upload, Channel partner commission and Technician login as not_built, so the admin setup form can show them as unavailable.
- Add a unit test that loads the registry, checks there are no dependency cycles, checks every dependsOn id exists, checks removed features always resolve to false, and checks that every Dashboard view ID and APP_ROLES user_type is covered by VIEW_FEATURE or ROLE_FEATURE.
- Keep logActivity writes always on, because HistoryTab and move_stage depend on activity_log. The activityLog flag should hide only the admin ActivityLogView and its realtime subscription.

## open_questions
- 'Finance' has no distinct view in the code. Should it mean customer payment collection (the CASH stage and CashTab cash_details ledger, invoice_value, the Dashboard 'How customers are paying' card, and the Toolbox receipts), or a new Finance page? This analysis assumes the former.
- Technician login does not exist. Should it be a new user_type that reuses VendorPortal in an internal-team mode (Installation and Geo Tag tabs, no Payouts), or stay not_built for now?
- The Channel Partner role ('agent', AgentPortal) is not in the feature list. Should channelPartners be a toggle (small clients without partners would lose the CP filter and fields), or always on?
- Installation view: the InstallationView tag tracker (sidebar 'Installation tracking') is assumed here, not the INSTALLATION STATUS pipeline stage. Is that correct?
- When Trash is off, should delete be removed entirely, or become an admin-only hard delete? Today soft-deleted rows are visible only in TrashView.
- When the Operations page is off, where do admins maintain the dropdown directories (module_brand, inverter_make, registration_by, integration_by, channel_partner)? Should those move to the client setup form or config only?
- Should 'Delivery challan' (DeliveryBatchesView MaterialDeliverySheet 126-180 and MaterialDeliveryTab 'Print Delivery Note' 131-137) be its own flag, separate from delivery batches?
- Without vendor login, should the 'Pick a Vendor *' required field in MaterialDeliveryTab stay, for internal installation teams kept as plain names in the vendors table?
- Should Solar Toolbox (in-app, 8 tools, visible to all Dashboard roles and Agent roles) ship in client builds by default, given the standalone tools offering is out of focus?
- Should the feasibility report maker (LoanTab via feasibilityReport.js) and the DISCOM agreement maker (DiscomSubmissionTab Page1, AgentPortal AgreementPreview) become registry features? They are listed under DOCUMENT_OPTIONS in brief.js but are not in the in-scope list.

## touchpoints
- src/demo/config.js:5 — DATA_EXPORTS_ENABLED=false is the only feature flag today. The same file pins DEMO_PROJECT_REF and DEMO_URL. => Replace it with features.dataExports from the client config. Move the project pinning out of the client build.
- src/App.jsx:140 — Picks the portal by userType: agent/agent2 to AgentPortal, vendor to VendorPortal, stamp to StampPortal, everything else to Dashboard. => Check isRoleEnabled(userType) first. Disabled roles (stamp always, plus vendor, agent2, agent, channel_partner_office and office2 according to flags) get an 'account not enabled' screen. Do not import StampPortal at all when stampLogin is off.
- src/App.jsx:35 — scheduleBackgroundDemoCleanup runs ensureThreeDemoVendors, ensureThreeDemoDrivers and ensureGroupedDemoBatches. It is triggered at lines 97, 116 and 136. These jobs rename and delete vendors, drivers and batches. => Remove from client builds; they would destroy real data. Remove the matching calls in LoginScreen.jsx:95-97 and 144-150.
- src/App.jsx:152 — Public #/plans and #/quote routes (PricingView/CustomizationEnquiryForm). App.jsx:170-173 also wraps every portal in DemoHeader (tour and role switch) and always mounts TeamChatDrawer. => Remove the plans/quote routes and DemoHeader from client builds. Mount TeamChatDrawer only when features.teamChat is on.
- src/constants.js:81 — APP_ROLES lists all 8 roles, including stamp. It feeds UserManagementView (role selects at lines 626, 1451, 1674), RolePicker and LoginScreen. => Export enabledRoles(), filtered through a ROLE_FEATURE map. Every consumer uses it instead of the raw APP_ROLES.
- src/components/Dashboard.jsx:1365 — Hand-written sidebar NavBtns (lines 1365-1432): quotations 1366, toolbox 1367, delivery 1382, inventory 1385, subsidy 1388, loan 1389, installation 1390, attendance 1406/1422, operations 1407, vendor_availability 1408, installation_payments 1409, activity 1411, users 1412/1430, exports 1413, trash 1414. => Replace with a data-driven NAV_ITEMS array where each entry has {view, feature, roles}. Hide empty SidebarGroups such as 'Tracking & logistics' and 'Team & administration'.
- src/components/Dashboard.jsx:1638 — View router (`currentView === ...`) at lines 1638-1723. Session restore at 235-242 can reopen any saved view. => Check every route through isViewOn(view). The session restore and the tour whitelist (line 211) must fall back to 'dashboard' when the saved view is disabled.
- src/components/Dashboard.jsx:1551 — Header filters: channel partner filter (1551-1593), dealer select (1596-1607), Export button (1609-1618). => Gate on channelPartners/cpos, dealerFiltering and dataExports.
- src/components/Dashboard.jsx:367 — loadDealers reads demo_profiles agent2 (367-389). Trash count query (430-434). Delivery batch count (436-442). Today-summary deliveries flag (411). Realtime admin channel (607-678). => Skip dealer loading when dealerFiltering is off, trash count when trash is off, and delivery queries when deliveryBatches is off (includeDeliveries=false).
- src/components/CustomerDetailModal.jsx:1705 — Customer modal tab strip: PRIMARY_STAGES (minus LOAN/CASH depending on payment_type), plus DOCUMENTS and history. => Build tabs from the configured pipeline. Drop DOCUMENTS when documentUploads is off. Hide the checklist/documents mode toggle (1646-1680) unless both modes are enabled. Hide the trash/delete button (1689) when trash is off.
- src/utils/checklistMode.js:1 — getChecklistMode/setChecklistMode keep 'checklist' or 'files' in localStorage. CheckboxRemarkItem (modal-tabs/shared.jsx:610-640) and ChecklistModeToggle (575-608) read it. => When the client config forces a single mode, getChecklistMode() returns that mode and setChecklistMode becomes a no-op.
- src/components/modal-tabs/MaterialDeliveryTab.jsx:318 — Admin-only Commission / Vendor Quote block (vendor_quote, vendor_payment_status), lines 315-370. Also in this tab: Print Delivery Note (131-137, modal 414+), Check Vendor Schedules (147-153, modal 683-722), Pick a Vendor plus vendor email notification (142-215, 605-680). => Commission block: show when installationCommission or vendorCommission is on. Calendar button and modal: calendar. Delivery note: deliveryChallan. Vendor notification: vendorLogin (it needs the send-lead-to-vendor edge function).
- src/components/modal-tabs/InstallationStatusTab.jsx:220 — Vendor give-up approval and vendor re-assignment with email notification (220-370, vendor confirm modal 449-500). => Gate the give-up workflow and notifications on vendorLogin. Keep a plain vendor or team select for internal teams.
- src/components/modal-tabs/DiscomSubmissionTab.jsx:418 — Send to Stamp Maker footer, assign, recall, approve and resend (418-705). Modals at 706-830. Stamp makers loaded from demo_profiles (72-87). The PM Surya Ghar Stamp checkbox (510) is only rendered inside the 'sent' branch. => When stampLogin is off, hide the whole stamp flow and render the pm_surya_ghar_stamp CheckboxRemarkItem directly, so office staff can still record the stamp.
- src/components/modal-tabs/FinalReviewTab.jsx:33 — Warranty Card checkbox (33) and warranty_card_text field (69-71). => Gate on warrantyTracking. It is removed, so it is always hidden.
- src/components/AgentStageDetails.jsx:59 — Read-only stage detail rows shown in the Dealer/CP portal: stamp rows (59-61), warranty row (72), vendor give-up rows (47-49). => Filter rows by stampLogin, warrantyTracking and vendorLogin.
- src/components/AgentPortal.jsx:1066 — Menu buttons: Quotation Maker (1066) and Solar Toolbox (1067, subtitle mentions warranty cards). Routes at 1404-1420. Customer Documents tab (1505, rendered at 1613). BOM print via the tour (99-105). => Gate on quotationMaker, toolbox and documentUploads. Remove the warranty wording from the subtitle.
- src/components/VendorPortal.jsx:1056 — Vendor stat-card tabs: PAYOUTS (1056-1062) rendered at 1113-1186 with synthetic payouts (881-922); AVAILABILITY/Schedule (1063-1071) rendered at 1111-1112. => Gate PAYOUTS on vendorCommission and AVAILABILITY on calendar. Remove the synthetic ₹2,200/kWp and fake 'Paid' fallback.
- src/components/StampPortal.jsx:1 — Entire stamp maker portal: queue, upload of pm_surya_ghar_stamp, Record ledger, realtime channel at 546. => Never imported when stampLogin is off, using a build-time constant so the lazy chunk is dropped.
- src/components/ChannelPartnerManagementView.jsx:765 — Operations page directory cards: CPO Offices & Dealers (771-790), Channel Partner Directory (793-810), Module Brands (812), Registration Staff (831), Inverter Make (850), Integration Staff (869), Vendors Allotment (888-905), Stamp Makers (907-924), Drivers (926-934). Also Top 5 performers (936-1000), CPO panel (1007-1170) and stamp report (1489-1560). => Gate the cards on cpos, channelPartners, vendorLogin (vendors), stampLogin and deliveryBatches (drivers). The dropdown directories stay core.
- src/components/UserManagementView.jsx:882 — targetTable = isDemo ? 'demo_profiles' : 'profiles', and isDemo is always true. CPO creates Manager or Dealer (583-600). BRANCH_SCOPED roles (289). Vendors sync (346-360, 479-495). Calls the add_user edge function (45, 393, 1141, 1304). => Client builds use real profiles and the add_user edge function. Role options come from enabledRoles().
- src/components/LoginScreen.jsx:188 — Demo persona questionnaire: branches, vendors and stamp toggles; activeRoleTypes (188-202). Store-files toggle (512-537). One-click persona entry via start_demo_session (126-158). A credentials form already exists (35-124). => Client build: credentials-only login (reuse 35-124 without the demo_profiles fallback at 87-102). Remove the persona grid and questionnaire.
- src/components/TeamChatDrawer.jsx:146 — Loads team_chat_messages and seeds demo announcements (including Stamp Maker) when the table is empty (146-177). Reset deletes all messages (236-255). Stamp badge at 96. => Gate on teamChat. In client builds, never seed and never mass-delete. Drop the stamp role badge.
- src/components/AddLeadModal.jsx:783 — Channel Partner field (783-803) and Dealer dropdown (806-845) using fetchAgent2SubAgents. Demo defaults 'Demo Aurora Solar' and 'Demo Dealer' (437-438). => Hide the CP field when there are no channel partners or CPOs, and the Dealer field when dealers is off. Remove the demo defaults.
- src/components/modal-tabs/LeadsTab.jsx:105 — Channel Partner Name and Dealer Name fields in the customer Leads tab. => Same gating as AddLeadModal.
- src/inventory/InventoryView.jsx:231 — Daily report export is gated by DATA_EXPORTS_ENABLED (231). Export Stock CSV (237) is not gated. => Gate both on dataExports.
- src/components/AttendanceView.jsx:527 — Attendance Export CSV button. Staff list and records come from utils/staffAttendance.js, which has a localStorage fallback and demo staff defaults (86, 183-197). => Gate the export on dataExports. Remove the demo staff and record fallbacks in client builds.
- src/components/InstallationPaymentsView.jsx:92 — Installation commission ledger. It fabricates delivery and install dates, a ₹2,200/kWp quote and a 'Paid' status for historical rows (92-135). Admin writes the payment status at 198-230. => Remove the synthetic fallbacks. The view is gated by installationCommission.
- src/utils/vendorAvailability.js:5 — Calendar data is localStorage-only ('solarflow_vendor_unavailability_v2') with hard-coded DEFAULT_UNAVAILABILITY for Vendor 1/2/3 (10-30). => Needs a DB table (e.g. vendor_unavailability) before calendar can be enabled for a client.
- src/components/DashboardView.jsx:179 — 'Deliveries due today' card (179-185) and the 'How customers are paying' loan/cash mix (99-112, 241-250). => Hide the delivery card when deliveryBatches is off and the loan share when loanTracking is off.
- src/components/CustomerCard.jsx:100 — Card badges: Vendor (100-104), delivery Batch (106-110), subsidy tag (42-43). => Gate on vendorLogin or vendor assignment, deliveryBatches and subsidyTracking.
- src/supabase.js:11 — createDemoClient throws unless the URL is the demo project. A fetch interceptor blocks /functions/, which add_user and send-lead-to-vendor need. => The client build accepts its own VITE_SUPABASE_URL and anon key and allows edge functions. index.html:5 CSP and scripts/check-isolation.mjs (run by the dev and build scripts) must also be templated per client.
- supabase-setup/22_fix_shared_inventory_functions.sql:241 — Trigger issue_delivered_bom_stock on admin.delivery_status. Changing it to DELIVERED requires a saved BOM and enough inventory_items stock, otherwise it raises an exception. => Ship this trigger only in the inventory SQL module, or make it a no-op when an app_settings.inventory_enabled row is false.
- supabase-setup/19_convert_to_shared_multiuser_database.sql:298 — Shared, wide-open RLS: every authenticated user can select, insert, update and delete every table. The only restriction is cpo_lead_scope (357). => Real client logins (vendor, dealer, CP) need per-role RLS. Today role gating is UI-only.
- supabase-setup/01_solarflow_demo.sql:354 — move_stage RPC hard-codes the 16 stage IDs. get_dashboard_metrics_scoped is at 329. => The configurable pipeline needs move_stage to validate against a stages config table or skip the hard-coded list.
- supabase-setup/12_staff_attendance.sql:16 — The staff_attendance CHECK constraint allows only present, absent, half_day, leave and on_duty. The code also writes pending_present, holiday_request and holiday. => Fix the constraint in the client schema, otherwise self-service and leave requests silently fall back to localStorage.
- src/enquiries/brief.js:14 — INTEREST_OPTIONS is the canonical list of feature labels in the setup form (it includes MIS upload, Warranty tracking, CP commission, Stamp staff login and Technician login). => Map each label to a registry id (enquiryLabel) so a prepared brief can prefill the client feature config. Mark removed and unbuilt items.

## details
## 1. What the ambiguous feature names map to in code

| Catalogue name | Concrete code | View id or tab |
|---|---|---|
| Installation view | `src/components/InstallationView.jsx` (installation_status tag tracker, "Installation tracking") | Dashboard `installation_tags` (nav Dashboard.jsx:1390, route :1651) |
| Installation commission view | `src/components/InstallationPaymentsView.jsx` (vendor payouts ledger, admin-only) | Dashboard `installation_payments` (nav :1409, route :1667) |
| Vendor commission page | VendorPortal **PAYOUTS** tab (VendorPortal.jsx:1056-1062 card, :1113-1186 table, data :881-922) | VendorPortal `activeTab==='PAYOUTS'` |
| Calendar | `src/components/VendorCalendarView.jsx` + `src/utils/vendorAvailability.js` (localStorage only) | Dashboard `vendor_availability` (:1408/:1666); VendorPortal `AVAILABILITY` (:1063-1071, :1111); MaterialDeliveryTab "Check Vendor Schedules" modal (:147-153, :683-722); warning via `isVendorUnavailableOn` (:72) |
| Operations page | `src/components/ChannelPartnerManagementView.jsx` | Dashboard `channel_partner_mgmt` (:1407/:1665), admin only |
| Finance | No dedicated view. Closest: CASH stage + `modal-tabs/CashTab.jsx` (cash_details payments), payment_type routing (CustomerDetailModal.jsx:1707-1708, AgentPortal.jsx:1500-1501), DashboardView payment mix (:99-112, :241-250) | stage `CASH` |
| Checklists vs Document uploads | `utils/checklistMode.js` ('checklist' or 'files'); `modal-tabs/shared.jsx` ChecklistModeToggle :575-608 and CheckboxRemarkItem :610-640; header toggle CustomerDetailModal.jsx:1646-1680; Documents tab CustomerDetailModal.jsx:1712/:1842-1859 and AgentPortal.jsx:1505/:1613; LoginScreen Q4 :512-537 | `DOCUMENTS` tab |
| Staff management | `UserManagementView.jsx` + edge fn `supabase/functions/add_user` | `users` (admin :1412, CPO "Partner Office" :1427-1432) |
| Delivery batches/challan | `DeliveryBatchesView.jsx` (MaterialDeliverySheet "Gate pass · Loading list · Delivery order" :126-180), `src/delivery/*.js`; per-customer "Print Delivery Note" MaterialDeliveryTab.jsx:131-137/:414+ | `delivery_batches` (:1382/:1641) |
| BOM maker | `modal-tabs/MaterialIntegrationTab.jsx` (bom/bom_items, admin.bom_data, SerialScanner :10/:1154, BomPrintModal :5/:1164), `BomPrintModal.jsx`, `BomPrintView.jsx`, `utils/bom.js`, `inventory/reference.json`; AgentPortal BOM print :99-105/:125/:2211 | stage `MATERIAL INTEGRATION` |
| Branches | `office2` role ("Manager" / Channel Partner Manager), scoped through its parent CPO (SQL `current_demo_cpo`, 19:342-343); channel_partner is the branch key (UserManagementView.jsx:285-292) | Dashboard (scoped, `isChannelPartnerOffice` includes office2, :359) |

**Not implemented (marketing copy only):** MIS upload auto updater (PricingView.jsx:28, :111; CustomizationEnquiryForm.jsx:15, :587; enquiries/brief.js:20). Channel partner commission view (PricingView.jsx:26; CustomizationEnquiryForm.jsx:15; brief.js:19). Technician login (PricingView.jsx:24; CustomizationEnquiryForm.jsx:552; brief.js:16; enquiries/submit.js:13).

## 2. Roles and demo personas

| user_type | APP_ROLES label (constants.js:81-90) | Portal (App.jsx:140) | Demo persona | Feature that owns the role |
|---|---|---|---|---|
| admin | Admin | Dashboard | admin@solarflow.demo | core |
| sales | Office | Dashboard | office@solarflow.demo | core |
| channel_partner_office | Channel Partner Office | Dashboard (scoped via `cpo_leads`) | cpo@solarflow.demo | cpos |
| office2 | Manager (Channel Partner Manager) | Dashboard (scoped) | manager@solarflow.demo | branches |
| agent2 | Dealer | AgentPortal (`isAgent2`, :178) | dealer@ / "Dealer 1" | dealers |
| agent | Channel Partners | AgentPortal | partner@ / "Surya Shakti Solar" | channelPartners (implicit) |
| vendor | Vendors | VendorPortal | vendor@ / "Vendor 1" | vendorLogin |
| stamp | Stamp Maker ("Document coordinator") | StampPortal | stamp@ / "Stamp Guy" | stampLogin (REMOVED) |

Demo credentials are hard-coded at LoginScreen.jsx:298-307 and UserManagementView.jsx:~760-870. Personas are created with the `start_demo_session` RPC (LoginScreen.jsx:133, App.jsx:128).

## 3. Feature table

Cells use `;` to separate items. Lines are approximate within ±2.

| Feature (id) | Code surfaces (file:line) | Roles affected | depends_on | DB objects | Gating points |
|---|---|---|---|---|---|
| **Inventory** (`inventory`) | inventory/InventoryView.jsx (tabs :9, items :130-140, movement RPC :160, exports :231/:237); Dashboard.jsx lazy :31, nav :1385-1387, route :1638 | admin, sales | bomMaker | inventory_items, inventory_movements (04); RPCs record_inventory_movement, sync_inventory_catalog, inventory_item_key, get_inventory_bom_lines, set_bom_stock_quantity, bom_stock_document; triggers sync_inventory_catalog_after_bom_change (22:43), **issue_delivered_bom_stock** (22:241-339); admin.bom_stock_issued_at | nav; route; SQL module (trigger only with inventory) |
| **BOM maker** (`bomMaker`) | MaterialIntegrationTab.jsx (:291-458 writes, :1154-1170 scanner/print); BomPrintModal.jsx; BomPrintView.jsx; AgentPortal.jsx :99-105, :125, :2211; VendorPortal 'MATERIAL' tab (hidden, :1439); DeliveryBatchesView.jsx :700-717 (reads BOM for loading sheet); constants ROOF/SHED_BOM_TEMPLATE :97-190 | admin, sales, agent/agent2 (view or print), CPO view-only (CustomerDetailModal.jsx:294) | stage MATERIAL INTEGRATION | bom, bom_items, admin.bom_data, panel_serial_no, inverter_serial_no | MaterialIntegrationTab body (or drop the stage); AgentPortal BOM print |
| **Delivery batches / challan** (`deliveryBatches`, sub `deliveryChallan`) | DeliveryBatchesView.jsx (sheet :126-180, drivers :239, vendors :299, realtime :342, print :605); delivery/status.js, load.js, projectPicker.js; Dashboard.jsx canSee :362, nav :1382, route :1641, count :436-442, today summary :91-115/:411; DashboardView.jsx :179-185; CustomerCard.jsx :106-110; MaterialDeliveryTab.jsx status select :259-317 (read-only except admin, :53), Print Delivery Note :131-137/:414+; Operations Drivers card :926-934 | admin, sales | bomMaker (loading sheet); inventory is a soft dependency through the DB trigger | delivery_batches, drivers; admin.delivery_batch_id, delivery_status, driver_name, driver_phone_number, vehicle_number, material_delivery_date; RPCs save_/delete_/update_delivery_batch_status_atomic; realtime publication | nav; route; count and summary queries; Drivers card; dashboard card; card badge; delivery note button (challan) |
| **Installation view** (`installationView`) | InstallationView.jsx; Dashboard.jsx lazy :23, nav :1390, route :1651, defaultTab :1740, count `installationTagCount` | admin, sales, CPO, office2 (scoped) | stage INSTALLATION STATUS | admin.installation_status, installation_date, installation_note; INSTALLATION_TAGS (constants :195-210); metric installationTagCount (get_dashboard_metrics_scoped) | nav; route |
| **Installation commission view** (`installationCommission`) | InstallationPaymentsView.jsx (fetch :49-90, synthetic :92-135, writes :198-230/:270-300); Dashboard.jsx nav :1409, route :1667; commission entry MaterialDeliveryTab.jsx :315-370 | admin | vendor assignment (vendors directory); soft dependency on installationView (shared installation_status) | admin.vendor, vendor_quote, vendor_payment_status, vendor_paid_date, vendor_paid_by | nav; route; MaterialDeliveryTab commission block (on if this or vendorCommission) |
| **Vendor commission page** (`vendorCommission`) | VendorPortal.jsx :881-924, :1056-1062, :1113-1186 | vendor | vendorLogin (hard); data entered via the commission block (admin) | same columns as above | VendorPortal tab card and render branch |
| **Vendor login** (`vendorLogin`) | App.jsx:140; VendorPortal.jsx (realtime :383, refresh interval :420, geo upload :519); UserManagementView.jsx vendors sync :346-360/:479-495; Operations Vendors Allotment :888-905; MaterialDeliveryTab vendor pick and notify :142-215/:605-680; InstallationStatusTab give-up and reassign :220-370/:449-500; utils/vendorNotification.js (edge fn send-lead-to-vendor); AgentStageDetails :47-49; CustomerCard :100-104 | vendor (+ admin/sales who assign) | stages MATERIAL DELIVERY, INSTALLATION STATUS, GEO TAG PHOTO | vendors table, profiles.user_type='vendor', admin.vendor, vendor_note, vendor_give_up_approved, geo_tag_status; edge fn send-lead-to-vendor | role map; Operations card; notification and give-up blocks |
| **Calendar** (`calendar`) | VendorCalendarView.jsx; utils/vendorAvailability.js (localStorage); Dashboard nav :1408, route :1666; VendorPortal :1063-1071/:1111; MaterialDeliveryTab :147-153/:683-722, :72 | admin (read), vendor (edit) | vendorLogin (only vendors can mark dates, VendorCalendarView.jsx:~52) | none today (localStorage). Needs a new table | nav; route; vendor tab; delivery-tab button and modal; unavailable warning |
| **Attendance** (`attendance`) | AttendanceView.jsx (isAdmin :66-67, export :309-320/:527-535); utils/staffAttendance.js (:7 storage, :86 demo staff, :207-270 staff list, :274-415 writes); Dashboard nav admin :1406, self-service :1419-1424, route :1664 | admin (approve), sales, CPO, office2 (self-service) | staffManagement (soft: staff list from profiles and demo_profiles) | staff_attendance (12; constraint :16 too narrow) | nav (both); route |
| **Vendor login, Technician login** | Technician login: **not built** | n/a | — | — | registry status not_built |
| **Channel partners** (`channelPartners`, implicit) | AgentPortal.jsx (whole); Dashboard CP filter :1551-1593; AddLeadModal :783-803; LeadsTab :105-115; Operations CP Directory :793-810 | agent | — | metadata category channel_partner; admin.channel_partner | role map; header filter; lead fields |
| **Dealers** (`dealers`) | AgentPortal isAgent2 branches (:82, :90, :178, :203-205); AddLeadModal dealer dropdown :244-252/:806-845; LeadsTab :117-124; CustomerDetailModal :161-167; utils.fetchAgent2SubAgents :1202; UserManagementView CPO creates Dealer :583-600 | agent2 (+ CPO and admin who create them) | channelPartners OR cpos | demo_profiles (user_type agent2, parent_profile_id, channel_partner); admin.sub_channel_partner, lead_creator_profile_id | role map; dealer fields; user-mgmt option |
| **Dealer-based filtering** (`dealerFiltering`) | Dashboard.jsx loadDealers :367-389, select :1596-1607, query :512-514, RPC p_dealer :444-447, realtime :632-633; props into SubsidyView :1649, LoanView :1650, InstallationView :1651 (:60/:78/:125), DataExportView :1674 (:62) | admin, sales, CPO, office2 | dealers | get_dashboard_metrics_scoped(p_dealer), get_cpo_dashboard_metrics(p_dealer) | header select + loadDealers effect (filter then stays '') |
| **CPOs** (`cpos`) | Dashboard isChannelPartnerOffice :359 (+ cpo_leads table switch :400/:430/:493), Partner Office nav :1427-1432; CustomerDetailModal :272-294, :1756-1764; MaterialOrderTab :28; GeoTag/Meter/DiscomInspection tabs CPO edit; DiscomSubmissionTab :67-69; Operations CPO card and panel :771-790/:1007-1170; UserManagementView isCP :254 | channel_partner_office | channelPartners (branch name) | view cpo_leads (18), functions current_demo_cpo, can_view_demo_lead, assign_demo_lead_creator (trigger, 09:53), restrictive policy cpo_lead_scope (19:357), get_cpo_dashboard_metrics, seed_demo_cpo_hierarchy (demo) | role map; Operations card; SQL module |
| **Branches** (`branches`) | office2 handling: Dashboard :359; CustomerDetailModal :161 (managerBranch), :273; LeadsTab :50; UserManagementView :583-600 (CPO creates Manager) | office2 | cpos (SQL resolves office2 via parent CPO) | demo_profiles.parent_profile_id | role map; user-mgmt Manager option |
| **Staff management** (`staffManagement`) | UserManagementView.jsx (whole); Dashboard nav :1412, :1430; route :1669-1671 | admin, CPO | — (cpos for Partner Office entry) | profiles, demo_profiles, metadata (channel_partner sync), vendors; edge fn add_user | nav; route. Practically core for client builds |
| **Operations page** (`operationsPage`) | ChannelPartnerManagementView.jsx; Dashboard nav :1407, route :1665 | admin | none (cards gated individually) | metadata (channel_partner, module_brand, registration_by, integration_by, inverter_make), vendors, drivers, demo_profiles | nav; route; per-card flags |
| **Finance** (`finance`) | CashTab.jsx (cash_details); CASH stage; DashboardView :99-112/:241-250; Toolbox receipts (:28-30) | admin, sales, agent | stage CASH | admin.cash_details, payment_type, invoice_value | stage visibility; dashboard card |
| **Subsidy tracking** (`subsidyTracking`) | SubsidyView.jsx; SubsidyStatusTab.jsx; Dashboard nav :1388, route :1649, defaultTab :1740; CustomerCard :42-43; AgentStageDetails SUBSIDY rows | admin, sales, CPO, office2; agents see the tab | stage SUBSIDY STATUS | admin.subsidy_tag, subsidy_history; SUBSIDY_TAGS; metric subsidyTagCount | nav; route; card badge |
| **Loan tracking** (`loanTracking`) | LoanView.jsx (stage LOAN :39-49); LoanTab.jsx (+ feasibility PDF :6, :200); Dashboard nav :1389, route :1650, defaultTab :1740; DashboardView loan share | admin, sales, CPO, office2; agents (LOAN tab :1956) | stage LOAN | admin.loan_tag, loan_history, loan_by, jansamarth_application_no, bank_name, bank_branch, loan_registration_date; LOAN_TAGS | nav; route; dashboard card |
| **Checklists** (`checklists`) / **Document uploads** (`documentUploads`) | see section 1; plus uploadDocument (utils.jsx:695), getCustomerDocuments :795, downloadDocumentsAsPdf :1024 (CustomerDetailModal :616-622, AgentPortal :640-644); VendorPortal geo upload :519; StampPortal upload :187 | all | at least one of the two | documents table, storage bucket customer-documents (01:367-380), admin boolean flag columns (DOC_TYPE_FLAG_COLUMN constants :289-331) | getChecklistMode(); header toggle; DOCUMENTS tabs; Fill Demo Docs button (shared.jsx:592-605, demo only) |
| **Quotation maker** (`quotationMaker`) | quotations/* (QuotationModule, repository.js :14-115); Dashboard nav :1366, route :1652-1656, hash :237/:304; AgentPortal :1066/:1404; conversion Dashboard :1197, AgentPortal :476 | admin, sales, agent, agent2 | — | quotations table; admin insert on conversion | nav; route; agent button |
| **Team chat** (`teamChat`) | TeamChatDrawer.jsx (mounted App.jsx:173 for every role) | all | — | team_chat_messages + realtime (19:640-693, 20) | App mount |
| **Activity log** (`activityLog`) | ActivityLogView.jsx (:87, realtime :156); Dashboard nav :1411, route :1668. Writes via utils.logActivity :9 are used everywhere; HistoryTab reads them | admin (view) | — | activity_log (move_stage also inserts, 01:362) | nav; route only (keep writes) |
| **Trash** (`trash`) | TrashView.jsx; Dashboard handleSoftDelete :927, handleRecover :948, handleHardDelete :969, trash count :430-434, nav :1414, route :1682-1689; CustomerDetailModal delete :1689, confirm :2000-2012 | admin | — | admin.deleted_at | nav; route; count; delete button |
| **Data exports** (`dataExports`) | DataExportView.jsx; demo/config.js:5; Dashboard :1413, :1609-1618, :1672-1679; InventoryView :231 (gated), :237 (ungated); AttendanceView :527-535; utils.exportAllToCSV :252 (unused) | admin (+ sales, CPO via attendance/inventory exports) | — | reads admin | replace constant; gate the 3 ungated buttons |
| **Toolbox** (`toolbox`, out of focus) | ToolboxView.jsx; Dashboard :1367-1378/:1658-1662; AgentPortal :1067/:1405-1420 | all Dashboard and Agent roles | — | none | nav; route; agent button |
| **MIS upload** (`misUpload`, REMOVED) | none in app; copy only (PricingView :28/:111, CustomizationEnquiryForm :15/:587, brief.js :20) | — | — | — | registry not_built |
| **Warranty tracking** (`warrantyTracking`, REMOVED) | FinalReviewTab :33, :69-71; CustomerDetailModal :721-724 (checklist diff); AgentStageDetails :72; ToolboxView :31, :98, :1190-1350; AgentPortal :1067 (subtitle); utils export cols :377/:493; constants :272, :308, :475, :502 | admin, sales, agents | — | admin.warranty_card, warranty_card_text | FinalReviewTab rows; AgentStageDetails row; Toolbox tool; subtitle text |
| **CP commission view** (`cpCommission`, REMOVED) | none in app; copy only | — | — | — | registry not_built |
| **Stamp staff login** (`stampLogin`, REMOVED) | StampPortal.jsx (all); App.jsx:16/:140; APP_ROLES :89; DiscomSubmissionTab :37-230, :418-705, :706-830; Operations :68-72/:279/:907-924/:1489-1560; UserManagementView :826-830; TeamChatDrawer :66-75/:96; AgentStageDetails :59-61; LoginScreen :24/:198-200/:485-510; RolePicker, DemoHeader, tourSteps :31-33/:90; utils export :391-404/:519-520; CustomerDetailModal :289/:616 | stamp (+ admin and office who send work) | stage DISCOM SUBMISSION | demo_profiles user_type 'stamp'; admin.discom_submission keys (sent_to_stamp_maker, assigned_stamp_maker(_id), stamp_sent, stamp_approved, stamp_sendback_*); documents doc_type pm_surya_ghar_stamp; admin.pm_surya_ghar_stamp | role map; build-time removal of StampPortal; DiscomSubmissionTab fallback checkbox; Operations card; chat badge; AgentStageDetails rows |

## 4. Dependencies and sub-parts

- vendorCommission → vendorLogin. It shares its data entry (MaterialDeliveryTab commission block :315-370) with installationCommission.
- calendar → vendorLogin. Only vendors can mark unavailability, and it also needs a DB table before it is usable.
- installationCommission → vendor assignment (vendors directory, MaterialDeliveryTab "Pick a Vendor"). It has only a soft link to installationView: both read installation_status. In code it does not require InstallationView.
- deliveryBatches → bomMaker (the loading sheet reads BOMs, and the DB trigger requires a saved BOM). The inventory link is DB-level only, via `issue_delivered_bom_stock`. deliveryChallan is a sub-part of deliveryBatches, though the per-customer "Print Delivery Note" also exists without batches.
- inventory → bomMaker (stock issue and catalog sync both run off BOM items).
- dealerFiltering → dealers → (channelPartners OR cpos).
- branches (office2) → cpos.
- operationsPage is a container. Its cards belong to cpos, channelPartners, vendorLogin, stampLogin and deliveryBatches (drivers). The dropdown directories (brand, inverter, registration, integration) are core.
- Stage-coupled features: loanTracking→LOAN, finance→CASH, bomMaker→MATERIAL INTEGRATION, deliveryBatches→MATERIAL DELIVERY, installationView→INSTALLATION STATUS, subsidyTracking→SUBSIDY STATUS, stampLogin→DISCOM SUBMISSION. Pipeline config must refuse, or cascade, when a required stage is removed.
- checklists and documentUploads are two halves of one setting (documentMode).
- activityLog: the view is optional, but logging is core (HistoryTab, move_stage).
- staffManagement is effectively core in client builds; it is the only way to create real logins.

## 5. Background jobs and side effects

- Demo-only, remove: App.jsx:35-53 (+97/116/136) and LoginScreen.jsx:95-97/144-150 (ensureThreeDemoVendors, ensureThreeDemoDrivers, ensureGroupedDemoBatches); TeamChat seed and reset (:146-177, :236-255); attendance local defaults (staffAttendance.js:86, :183-197); payout fabrication (InstallationPaymentsView :92-135, VendorPortal :881-922); stageRequirements banner (CustomerDetailModal :1836-1838, AgentPortal import :1); DemoHeader, tour and `useDemoTourNavigation` hooks (Dashboard :210, AgentPortal :76, VendorPortal :38, LoanView, SubsidyView, InventoryView :18).
- Realtime (gate together with the owning feature): Dashboard `admin_changes` :607-678 (core); AgentPortal :251; VendorPortal :383 + 2-min poll :420 (vendorLogin); StampPortal :546 (stampLogin); ActivityLogView :156 (activityLog); DeliveryBatchesView :342 (deliveryBatches); TeamChatDrawer :186 (teamChat).
- DB triggers: issue_delivered_bom_stock (inventory), sync_inventory_catalog_after_bom_change (inventory/bom), assign_demo_lead_creator (cpos), ensure_admin_timestamps (core), demo_integration_staff on metadata (03:161, demo), touch_updated_at (core).
- Edge functions: add_user (staffManagement), send-lead-to-vendor (vendorLogin), send-enquiry-email (marketing, exclude).

## 6. Proposed feature registry shape

```js
// src/config/featureRegistry.js
export const FEATURE_REGISTRY = {
  inventory: {
    label: 'Inventory (Godown)',
    description: 'Keep stock of panels, inverters and materials. Stock is deducted automatically when a delivery is marked Delivered.',
    group: 'materials',            // materials | workflow | team | roles | admin
    status: 'available',           // available | removed | not_built
    default: false,
    dependsOn: ['bomMaker'],       // all-of
    dependsOnAny: [],              // any-of (e.g. dealers: ['channelPartners','cpos'])
    requiresStages: [],            // pipeline stage ids that must exist
    roles: ['admin','sales'],      // who sees it
    grantsRole: null,              // e.g. 'vendor' for vendorLogin
    views: ['inventory'],          // Dashboard view ids it owns
    sqlModules: ['inventory.sql'], // packaged into the client zip
    enquiryLabel: 'Inventory',     // matches enquiries/brief.js INTEREST_OPTIONS
  },
  // vendorLogin:  {grantsRole:'vendor', requiresStages:['MATERIAL DELIVERY','INSTALLATION STATUS','GEO TAG PHOTO'], sqlModules:['vendors.sql'], edgeFunctions:['send-lead-to-vendor'], default:false}
  // vendorCommission: {dependsOn:['vendorLogin'], default:false}
  // calendar: {dependsOn:['vendorLogin'], views:['vendor_availability'], sqlModules:['vendor_calendar.sql'], default:false}
  // installationView: {requiresStages:['INSTALLATION STATUS'], views:['installation_tags'], default:true}
  // installationCommission: {views:['installation_payments'], roles:['admin'], default:false}
  // deliveryBatches: {dependsOn:['bomMaker'], views:['delivery_batches'], sqlModules:['delivery.sql'], default:false}
  // bomMaker: {requiresStages:['MATERIAL INTEGRATION'], default:true}
  // dealers: {grantsRole:'agent2', dependsOnAny:['channelPartners','cpos'], default:false}
  // dealerFiltering: {dependsOn:['dealers'], default:false}
  // cpos: {grantsRole:'channel_partner_office', dependsOn:['channelPartners'], sqlModules:['cpo_scope.sql'], default:false}
  // branches: {grantsRole:'office2', dependsOn:['cpos'], default:false}
  // channelPartners: {grantsRole:'agent', default:true}
  // staffManagement: {views:['users'], edgeFunctions:['add_user'], default:true}
  // operationsPage: {views:['channel_partner_mgmt'], default:true}
  // finance: {requiresStages:['CASH'], default:true}
  // subsidyTracking: {requiresStages:['SUBSIDY STATUS'], views:['subsidy'], default:true}
  // loanTracking: {requiresStages:['LOAN'], views:['loan_tags'], default:true}
  // checklists: {default:true}; documentUploads: {sqlModules:['storage.sql'], default:false}
  // quotationMaker: {views:['quotations'], default:true}
  // attendance: {views:['attendance'], sqlModules:['attendance.sql'], default:false}
  // teamChat: {sqlModules:['team_chat.sql'], default:false}
  // activityLog: {views:['activity'], default:true}
  // trash: {views:['trash'], default:true}
  // dataExports: {views:['exports'], default:false}
  // toolbox: {views:['toolbox'], default:false}
  // misUpload / cpCommission / technicianLogin: {status:'not_built', default:false}
  // warrantyTracking: {status:'removed'}; stampLogin: {status:'removed', grantsRole:'stamp', requiresStages:['DISCOM SUBMISSION']}
};

// src/config/features.js
import cfg from './client.config.js';
export function resolveFeatures(input = cfg.features, stages = cfg.pipeline.stages.map(s => s.id)) {
  const on = {};
  for (const [id, f] of Object.entries(FEATURE_REGISTRY)) on[id] = f.status === 'available' && (input[id] ?? f.default) === true;
  let changed = true;
  while (changed) { changed = false;
    for (const [id, f] of Object.entries(FEATURE_REGISTRY)) {
      const ok = on[id] && (f.dependsOn||[]).every(d => on[d]) && (!f.dependsOnAny?.length || f.dependsOnAny.some(d => on[d])) && (f.requiresStages||[]).every(s => stages.includes(s));
      if (on[id] && !ok) { on[id] = false; changed = true; }
    }
  }
  return Object.freeze(on);
}
export const features = resolveFeatures();
export const isOn = id => features[id] === true;
export const ROLE_FEATURE = { vendor:'vendorLogin', stamp:'stampLogin', agent2:'dealers', agent:'channelPartners', channel_partner_office:'cpos', office2:'branches' };
export const isRoleEnabled = t => !ROLE_FEATURE[t] || isOn(ROLE_FEATURE[t]);
export const enabledRoles = () => APP_ROLES.filter(r => isRoleEnabled(r.user_type));
export const VIEW_FEATURE = { inventory:'inventory', delivery_batches:'deliveryBatches', subsidy:'subsidyTracking', loan_tags:'loanTracking', installation_tags:'installationView', quotations:'quotationMaker', toolbox:'toolbox', attendance:'attendance', channel_partner_mgmt:'operationsPage', vendor_availability:'calendar', installation_payments:'installationCommission', activity:'activityLog', users:'staffManagement', exports:'dataExports', trash:'trash' };
export const isViewOn = v => !VIEW_FEATURE[v] || isOn(VIEW_FEATURE[v]);
export const documentMode = () => isOn('checklists') && isOn('documentUploads') ? 'both' : isOn('documentUploads') ? 'files' : 'checklist';
```

## 7. Minimal gating call sites (about 22)

1. App.jsx:140 – `isRoleEnabled(user.userType)`; build-time exclusion of StampPortal (and VendorPortal and AgentPortal when their roles are off).
2. App.jsx:173 – mount TeamChatDrawer only if `teamChat`.
3. constants.js:81 – `enabledRoles()`, used by UserManagementView :626/:1451/:1674 and the CPO role select :583-600.
4. Dashboard.jsx:1365-1432 – data-driven NAV_ITEMS using `isViewOn`, with empty groups hidden.
5. Dashboard.jsx:1638-1723 – one `isViewOn(currentView)` guard around the router; session restore :235-242 falls back to 'dashboard'.
6. Dashboard.jsx header :1551/:1596/:1609 – channelPartners or cpos, dealerFiltering, dataExports.
7. Dashboard.jsx data :367-389, :411, :430-442 – skip dealer, delivery and trash queries.
8. CustomerDetailModal.jsx:1705-1713 – tabs from the pipeline config, DOCUMENTS only if documentUploads; toggle :1646-1680 only if documentMode()==='both'; delete :1689 only if trash.
9. utils/checklistMode.js – forced mode.
10. MaterialDeliveryTab.jsx – :131 deliveryChallan, :147/:683 calendar, :186-215/:605-680 vendor notification (vendorLogin), :318 commission (installationCommission || vendorCommission), :259 status (deliveryBatches).
11. InstallationStatusTab.jsx:220-370 – vendorLogin.
12. DiscomSubmissionTab.jsx:418-705 – stampLogin, with a fallback pm_surya_ghar_stamp checkbox.
13. FinalReviewTab.jsx:33/:69 and AgentStageDetails.jsx:47-49/:59-61/:72 – warrantyTracking, stampLogin, vendorLogin.
14. AgentPortal.jsx:1066/:1067/:1505 – quotationMaker, toolbox, documentUploads.
15. VendorPortal.jsx:1056-1071/:1111-1186 – vendorCommission, calendar.
16. ChannelPartnerManagementView.jsx:771-934 – per-card flags.
17. AddLeadModal.jsx:783-845 and LeadsTab.jsx:105-124 – channelPartners/cpos and dealers fields.
18. DashboardView.jsx:179-185 and CustomerCard.jsx:42/:100/:106 – deliveryBatches, subsidyTracking and vendor badges.
19. InventoryView.jsx:231/:237 and AttendanceView.jsx:527 – dataExports (replaces DATA_EXPORTS_ENABLED).
20. TeamChatDrawer.jsx:96/:66-75 – drop the stamp role badge and seeds.
21. SQL packaging – include `sqlModules` only for enabled features. The inventory trigger ships only with inventory.
22. LoginScreen.jsx – client mode is credentials-only; remove the persona and questionnaire code paths (:126-202, :391-579).

## 8. Isolation and demo plumbing to replace (not feature flags, but needed for a client zip)

- src/supabase.js:11-28 (createDemoClient pinning, /functions block); src/demo/config.js:2-12; index.html:5 CSP; package.json dev and build scripts run scripts/check-isolation.mjs; tests/isolation/*.
- `isDemo` on login (App.jsx:95/134, LoginScreen.jsx:100/118/143) → UserManagementView targetTable (:882-883).
- start_demo_session (App.jsx:128, LoginScreen.jsx:133), DemoHeader, RolePicker, tour, dev previews (src/dev/*, *-preview.html).
- supabase/migrations/20260927183052_enquiry_email_notifications.sql:38 hard-codes the demo functions URL (marketing; exclude from client SQL).