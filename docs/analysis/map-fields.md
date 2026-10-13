# fields

## summary
Dropdown values in SolarFlow come from three places. (1) The Supabase `metadata` table, with columns category and label (schema at supabase-setup/01_solarflow_demo.sql:168-174; file 19_convert_to_shared_multiuser_database.sql:140-141 changes the unique key to (category,label)). Dashboard.jsx:418-428 and AgentPortal.jsx:289-303 load it into a `meta` object grouped by category. That object is passed as a prop to AddLeadModal and every modal tab. The Operations page (ChannelPartnerManagementView.jsx) can add, rename (with cascade) and delete options for exactly 5 categories: channel_partner, module_brand, registration_by, integration_by and inverter_make. (2) Hard-coded constants: the tag arrays in src/constants.js (LOAN_TAGS, SUBSIDY_TAGS, INSTALLATION_TAGS, HOLD_STATUS_TAGS) and inline option arrays inside the tabs, such as Roof/Shed, Cash/Online/DD/Cheque, Loan/Cash, stamp value and description, geo-tag, meter and inspection Yes/No, delivery and vendor-payment status, and the quotation project type and GEB/GEDA charge. (3) Other tables: vendors, drivers, and demo_profiles (dealers and stamp makers). META_CATEGORIES (constants.js:79) is not referenced anywhere. The categories payment_method_modes, subsidy_approval_status, company_branch and sub_channel_partner are seeded but never read. Many values are tied to app logic and cannot be renamed safely. payment_type must lower-case to 'loan' or 'cash': it decides LOAN vs CASH stage routing, and zod rewrites any other value to 'Cash'. Installation status, geo-tag 'Proceed', meter/inspection 'Yes' and the loan tags '1st Payment', '2nd Payment' and 'Total Loan Payment Received' are compared as string literals in the code. Stage fields are hard-coded JSX in 15 tab components. The stage-advance gates live in src/demo/stageRequirements.js, and there is a second, stricter list for leaving Leads in Dashboard.jsx:1019-1031. Every write passes through sanitizeAdminUpdate (utils.jsx), which silently drops any key not listed in ADMIN_COLUMNS (constants.js:390-503). Custom fields therefore need a jsonb column, or generated columns plus ADMIN_COLUMNS updates. Several fields feed generated documents and must stay in the product: the feasibility PDF, PM Surya Ghar agreement, BOM print, delivery challan, quotation→lead mapping and exports. The recommended split has three classes: data lists stored as metadata rows (fully client-editable, seeded by SQL); workflow enums kept as config constants (fixed ids, editable labels, only some can be extended); and custom fields stored in a new `admin.custom_fields jsonb` column, defined per stage in the client config.

## risks
- payment_type is not a free dropdown. CustomerDetailModal.jsx:880-905 and 1707-1708 skip the LOAN or CASH stage based on the lower-cased value; LeadsTab, AddLeadModal, LoanTab and CashTab show or hide sections on 'loan'/'cash'; validation.js:105-114 rewrites any value other than LOAN to 'Cash'; the SQL RPC at 01_solarflow_demo.sql:339 counts lower(payment_type)='loan'/'cash'. Adding a value such as 'EMI' would silently save as Cash.
- Workflow tag ids are string literals in the code: 'Installed', 'Giveup', 'In process' (about 35 places plus normalizeInstallationStatus), geo_tag_status 'Proceed' (stageRequirements.js:14 and auto-set in GeoTagPhotoTab.jsx:37-42), meter/inspection 'Yes', loan '1st Payment' / '2nd Payment' / 'Total Loan Payment Received' (LoanTab.jsx:142-150), and delivery_status PENDING/IN_TRANSIT/DELIVERED (RPC and trigger in 07_bom_delivery_stock.sql:53). Renaming an id, rather than its label, breaks the gates, locks, counts and stock issue.
- sanitizeAdminUpdate drops any key missing from ADMIN_COLUMNS without telling the user; it only logs a console warning. Custom fields written as top-level keys will appear to save but never persist.
- discom_agreement is mapped in DOC_TYPE_FLAG_COLUMN (constants.js:311) but has no column on admin and is not in ADMIN_COLUMNS. Its checklist flag never persists; only the uploaded document marks it done.
- There are two different requirement lists for leaving Leads: Dashboard.jsx:1019-1031 (12 fields, card picker) and stageRequirements.js:6 (name and phone, modal). AgentPortal.jsx:882-884 adds its own meter rule that requires a photo, while the modal says 'uploads never gate'. Users get different results depending on where they move the card.
- The Meter Installation Date (MeterInstallationTab.jsx:95-101) writes to installation_date, the same column as the Installation Status date (InstallationStatusTab.jsx:410). A custom-field or relabel UI must not present these as two independent fields.
- Edits made inside the tabs are never zod-validated; only Add Lead runs demoLeadSchema. LeadsTab uses type=number for phone and consumer_no (lines 85, 87), so a required or pattern rule on a custom field must also be enforced in the tab save path and in the stage gate.
- metadata has no ordering column, so dropdown order is insertion order. Metadata renames cascade only for channel_partner, module_brand, registration_by and inverter_make (on admin) and integration_by (on bom_items). loan_by and discom_submission.submitted_by also store registration_by values but are not cascaded.
- The BOM template has two sources: constants.js ROOF/SHED_BOM_TEMPLATE (used by VendorPortal and CustomerDetailModal) and inventory/reference.json scenarios (used by utils/bom.js:15). Changing roof_shed values or templates through config must update both, or the vendor and admin BOMs will diverge.
- There is region-specific hard-coding: 'GUJARAT' in feasibilityReport.js:52, the 'GEB / GEDA' charge, the 'Vera Pavti / aakarni' label for index_2, and SOLARFLOW / 'SolarFlow Demo Energy' / '100 Demo Avenue' in the agreement, discom and quotation code. A client outside Gujarat will get wrong legal documents unless these move to config.
- The removed features leave fields inside in-scope tabs: the stamp-maker flow, stamp_value, stamp_description and pm_surya_ghar_stamp approval in DiscomSubmissionTab, and warranty_card / warranty_card_text in FinalReviewTab, OPERATIONAL_CHECKLIST_FIELDS (CustomerDetailModal.jsx:722), DOC_TYPE_LABELS and the utils.jsx export columns. Each needs an explicit feature guard so it is never shown.
- Dealer, vendor and stamp-maker option lists read demo_profiles (utils.jsx:1207, DiscomSubmissionTab.jsx:75); the integration_by trigger writes demo_profiles. Client builds with real logins must switch these to profiles, or the dropdowns will be empty.
- Exports use a fixed column list (utils.jsx ~360-480), and DataExportView builds its columns from row keys. A jsonb custom_fields column would export as a single JSON blob unless it is flattened.

## recommendations
- Introduce one client config (for example src/client.config.json, from which constants.js is generated; the constants.js header already says 'Generated by SolarFlow Client Form') with sections: features, branding, pipeline, dropdowns, fieldOverrides, customFields, stageRequirements.
- Class A, client-editable data lists, stored as metadata rows. Seed them by SQL and keep them editable afterwards in Operations: module_brand, module_wp, inverter_make, registration_by (Registration Staff), integration_by (Integration Staff), payment_method_modes (repurposed for the CashTab payment mode), channel_partner (only through Branches/CPO setup), and one cf_<key> category per custom select field.
- Class B, workflow enums kept as config constants with fixed ids, regenerated into constants.js. Allow label, color and enabled changes only: payment_type (Loan/Cash; one can be disabled for cash-only or loan-only clients, which hides that stage), INSTALLATION_TAGS, geo_tag_status, meter_installation, discom_inspection, delivery_status, vendor_payment_status. Extendable with locked ids: LOAN_TAGS (lock 1st Payment, 2nd Payment and Total Loan Payment Received) and SUBSIDY_TAGS (exactly one isFinal). roof_shed becomes a list of {id,label,bomTemplate}.
- Class C, free config lists with no DB impact: HOLD_STATUS_TAGS, cash installment names, quotation project_type, the geb_geda charge label and options, quotation brand tiers (exactly 3), and stamp value and description (only when the stamp feature is on, which it is not for now).
- Derive LOAN_STATUS_OPTIONS (LoanTab.jsx:9) from LOAN_TAGS and the subsidy manual options (SubsidyStatusTab.jsx:199-203) from SUBSIDY_TAGS. Remove the hard-coded fallbacks (module_wp at AddLeadModal.jsx:544 and LeadsTab.jsx:126, payment_type ['CASH','LOAN'], reference.json inverter_make) in favour of config defaults.
- Client metadata schema: create table metadata(id uuid pk, category text not null, label text not null, sort_order int not null default 0, is_active boolean not null default true, created_at, updated_at, unique(category,label)). Load with .eq('is_active',true).order('sort_order'). Make Operations data-driven from the registry and extend the rename cascade to loan_by and discom_submission.submitted_by.
- Custom fields: add admin.custom_fields jsonb not null default '{}' and include it in ADMIN_COLUMNS. Render a generic <CustomFieldsSection stage=...> at the bottom of each tab and in AddLeadModal (showInAddLead). File types reuse CheckboxRemarkItem with doc_type 'cf_<key>' and a label merged into DOC_TYPE_LABELS. Merge required:true into the config stageRequirements; merge requiredAtCreate into the zod lead schema. Flatten custom fields in both export paths and in AgentStageDetails.
- Default-field overrides: allow {label, hidden, requiredToLeaveStage, requiredAtCreate} per default column, but reject hidden:true for the locked fields that documents and logic depend on (listed in details §3.4).
- Unify stage gating: a single config-driven stageRequirements consumed by CustomerDetailModal, Dashboard.handleMoveStage (replacing lines 1019-1031) and AgentPortal (replacing lines 882-884).
- Move region and company literals to branding config: feasibility state, VENDOR EPC/account/IFSC, agreement vendorName/vendorAddress, discom second and purchased party, quotation company block, the 'GEB / GEDA' label and the index_2 label.
- Seed generator: emit 'insert into public.metadata(category,label,sort_order) values … on conflict(category,label) do nothing;' only for Class A lists and cf_* selects. Class B/C lists go into the generated constants or config and never into the DB, so a fresh, empty Supabase project only needs the metadata seed and no customer data.

## open_questions
- Should clients be able to add payment types beyond Loan/Cash (e.g. 'EMI via NBFC', 'Subsidy only')? If so, the config needs a payment_type → finance-stage routing map, and validation.js:105-114 must stop coercing unknown values to Cash.
- Which requirement policy applies to client builds: the demo minimum (name and phone at Add Lead, stageRequirements.js) or the strict leadSchema/Dashboard list of 12-13 fields? Should each client choose this per field in the setup form?
- After go-live, should Class A lists be edited only on the in-app Operations page, or should a re-generated setup also be able to push metadata changes into the client's live Supabase?
- Should custom fields appear in the Dealer (AgentPortal/AgentStageDetails) and Vendor portals, and in delivery challan or BOM prints? This decides whether visibleTo and printOn flags are needed in v1.
- Is the client's state always Gujarat? The 'GUJARAT' in the feasibility PDF, the 'GEB / GEDA' label and the 'Vera Pavti / aakarni' label all need state-level config otherwise.
- Should Module Wp options be tied to a module brand, or stay one flat list?
- With Stamp staff login removed, should the stamp_value, stamp_description and pm_surya_ghar_stamp approval UI in DiscomSubmissionTab be hidden entirely, or should the PM Surya Ghar stamp stay as a plain upload?
- Should the Roof/Shed mounting types be extensible (e.g. Ground-mount or Elevated), each with its own BOM template, or stay fixed at two?

## touchpoints
- src/constants.js:79 — META_CATEGORIES = ['payment_type','module_brand','payment_method_modes','subsidy_approval_status','registration_by']. Declared but not imported anywhere. => Replace with a config-driven DROPDOWN_REGISTRY: each category gets a storage type (metadata or constant), an edit mode (full, label or extend), its default values and the fields that use it. The Operations page and the seed SQL generator both read from it.
- src/constants.js:36 — SUBSIDY_TAGS (Inprocess, Redeemed, Returned, Approved, Received isFinal) and SUBSIDY_TAG_COLORS at line 44 => Generate from config. Allow relabel, recolor and adding intermediate tags. Exactly one tag must have isFinal. Keep ids stable once records exist.
- src/constants.js:54 — LOAN_TAGS (Inprocess, Sanctioned, Returned, Reject, 1st Payment, 2nd Payment, Total Loan Payment Received isFinal) and LOAN_TAG_COLORS at line 64 => Generate from config. Lock the ids '1st Payment', '2nd Payment' and 'Total Loan Payment Received' because LoanTab.jsx:142-150 depends on them. Allow other tags to be added or relabelled.
- src/constants.js:195 — INSTALLATION_TAGS (Giveup, In process, Pending, Installed isFinal) => Allow label and color changes only. About 35 string literals across InstallationStatusTab, VendorPortal, InstallationView, InstallationPaymentsView, Dashboard, normalizeInstallationStatus and stageRequirements compare these ids.
- src/constants.js:215 — HOLD_STATUS_TAGS (Project Win / Project Lost / Project Return Win). Display only; stored in hold_procurement.hold_status jsonb. => Safe to make fully client-editable through config.
- src/constants.js:390 — ADMIN_COLUMNS whitelist. sanitizeAdminUpdate drops any key not listed here. => Add 'custom_fields' (jsonb). If custom fields are ever generated as real columns, the builder must append them here and to ADMIN_NUMERIC_COLUMNS (line 513).
- src/constants.js:239 — DOC_TYPE_LABELS and DOC_TYPE_FLAG_COLUMN (line 289) map upload doc_type to its label and boolean flag column => Merge config file-type custom fields as 'cf_<key>' labels with no flag column. Remove warranty_card when Warranty is off. discom_agreement maps to a column that does not exist.
- src/utils.jsx:54 — useMetadata() hook. Unused; the real loaders are duplicated in Dashboard.jsx:418 and AgentPortal.jsx:290. => Make it the single loader, with .order('sort_order') and is_active filtering, and config defaults as fallback.
- src/components/Dashboard.jsx:418 — Loads metadata into the `meta` prop for AddLeadModal and the tabs => Use the shared hook and order by sort_order.
- src/components/Dashboard.jsx:760 — syncMetadata auto-inserts any typed channel_partner or module_brand into metadata when a lead is saved => Put behind a config flag (autoGrowDropdowns). Client lists would otherwise grow with typos.
- src/components/Dashboard.jsx:1019 — Hard-coded list of 12 fields required to move a card out of LEADS. Differs from stageRequirements LEADS, which only needs name and phone. => Read the same config-driven stageRequirements used by the modal.
- src/demo/stageRequirements.js:5 — Per-stage gates for advancing a stage (demo essentials) => Move into client config as stageRequirements. Merge in custom fields marked required:true. Rename the 'Demo essentials' banner at CustomerDetailModal.jsx:1837.
- src/utils/validation.js:105 — payment_type preprocess turns any value other than 'LOAN' into 'Cash'. demoLeadSchema (line 121) requires only name and phone; leadSchema requires 13 fields but is not used directly. => Build the lead schema from config (requiredAtCreate per field, including custom fields). Keep payment_type ids fixed as Loan/Cash.
- src/components/ChannelPartnerManagementView.jsx:95 — Operations page manages 5 metadata categories through 5 copy-pasted add/rename/delete handlers (add 316-450, rename 547-675, delete 688-735) with a hard-coded category→column cascade map => Make it data-driven from the dropdown registry so module_wp, payment_method_modes and cf_* categories are editable too. Extend the rename cascade to loan_by and discom_submission.submitted_by, which also hold registration_by values.
- src/components/AddLeadModal.jsx:544 — Hard-coded module_wp fallback list (540…620), payment_type fallback ['CASH','LOAN'] at line 946, module_brand select with no fallback at 852-859 => Fall back to config defaults instead of literals. Render showInAddLead custom fields for stage LEADS.
- src/components/modal-tabs/LeadsTab.jsx:126 — Duplicate module_wp fallback list; payment_type options from meta at line 156; Gujarati label 'Vera Pavti / aakarni' for index_2 at line 188 => Use config defaults and config labels. Add a CustomFieldsSection for stage LEADS.
- src/components/modal-tabs/RegistrationTab.jsx:84 — Payment Type select hard-coded ['Loan','Cash']; registration_no is labelled 'Feasibility No' (line 105) => Use the payment_type config (labels and enabled flags). Make field labels config-overridable.
- src/components/modal-tabs/CashTab.jsx:127 — Cash payment mode options Cash/Online/DD/Cheque (lines 127-130) and fixed installment names at line 20 => Read from metadata category payment_method_modes (already declared, unused). Installment names come from config.
- src/components/modal-tabs/LoanTab.jsx:9 — LOAN_STATUS_OPTIONS ['Processed','Sanctioned','Rejected','Returned','1st Payment','2nd Payment'] used for manual history. Out of step with LOAN_TAGS ids (Inprocess, Reject), yet it writes loan_tag. => Derive from LOAN_TAGS config.
- src/components/modal-tabs/SubsidyStatusTab.jsx:199 — Manual subsidy history status options Approved/Returned/Rejected/Redeemed/Received are hard-coded separately from SUBSIDY_TAGS => Derive from SUBSIDY_TAGS config. Drop or repurpose the unused metadata category subsidy_approval_status.
- src/components/modal-tabs/MaterialOrderTab.jsx:38 — roofShedOptions = ['Roof','Shed']. The value picks the BOM template (bom.js:18-19, VendorPortal.jsx:152/173, DeliveryBatchesView.jsx:708). => Config list of mounting types, each mapped to a BOM template key. AgentPortal.jsx:2111-2112 has the same hard-coded options.
- src/components/modal-tabs/MaterialIntegrationTab.jsx:61 — inverter_make options from meta, falling back to src/inventory/reference.json metadata.inverter_make; integration_by options at line 171 => Fall back to config defaults instead of reference.json.
- src/components/modal-tabs/DiscomSubmissionTab.jsx:389 — Stamp Value 50/300 (396-398), Stamp Description Affidavit/Undertaking/'Option 3' (410-413), second and purchased party default 'SOLARFLOW DEMO ENERGY' (34-35, 373, 383), stamp-maker flow (73-88, 420-700) => Gate the stamp parts behind the stamp feature flag (StampPortal is removed). Party defaults come from client branding config. Stamp lists, if kept, come from config.
- src/components/modal-tabs/FinalReviewTab.jsx:33 — warranty_card file (33), insurance_status file (34), sfdc_photo_text / warranty_card_text / file_status text fields (62-78) => Hide warranty_card and warranty_card_text when Warranty is off. The other fields can be hidden or relabelled through config.
- src/components/CustomerDetailModal.jsx:686 — Local REG_CHECKLIST_FIELDS (686) and OPERATIONAL_CHECKLIST_FIELDS (722, includes warranty_card) shadow the unused exports in constants.js:355/366. Agreement vendorName and vendorAddress are hard-coded at 331-333 and 485-487. => Use one config-driven checklist list per stage. Agreement party details come from branding config.
- src/feasibilityReport.js:42 — mapFeasibilityReport reads customer_name, consumer_no, registration_no/feasibility_no, jansamarth_application_no, full_address, district, pincode, system_capacity_kwp and loan_history 'Total Quotation'. State 'GUJARAT' is hard-coded at line 52 and VENDOR at lines 2-8. => Mark these fields as locked (cannot be hidden) while Loan or feasibility is on. State and vendor details come from client config.
- src/components/AgentStageDetails.jsx:5 — STAGE_FIELDS: per-stage read-only field list for the dealer portal (also references the non-existent column subsidy_amount at line 69) => Build from the same field catalog, plus custom fields with visibleTo including agent roles.
- src/quotations/QuotationForm.jsx:169 — project_type Residential/Commercial (169) and geb_geda_charge Including/Excluding (175), validated in model.js:55-56. Panel make and inverter brand are free text (170, 174). Three brand tiers come from template/data/initialData.js:40-60 (exactly 3 enforced at model.js:57). => Put the option lists and the 'GEB / GEDA' label in config. Use metadata module_brand and inverter_make as datalists. Brand tier names come from the quotation config.
- supabase-setup/01_solarflow_demo.sql:168 — metadata table: id, demo_session_id, category, label, timestamps. No sort_order or active flag. Seeds at 316-320, 02_sample_data_50.sql:47-54 and 03_connected_demo_scenarios.sql:61-67; integration_by trigger syncs demo_profiles (03:120-161). => Client schema: drop demo_session_id, add sort_order int and is_active bool, unique(category,label), RLS read for authenticated and write for admin/office. Generate the seed inserts from config. Re-target the integration_by trigger to profiles.

## details
# Dropdown & field catalog for the client setup form

All paths are relative to `/Users/mahvishsadafv2/Desktop/solarflow_client_builder`.

## 0. How dropdown values are loaded today

- **Table**: `public.metadata(id, demo_session_id, category, label, created_at, updated_at)`, defined at `supabase-setup/01_solarflow_demo.sql:168-174`. File `19_convert_to_shared_multiuser_database.sql:132-141` dedupes it and sets `unique(category,label)`. There is no `sort_order` or `is_active` column.
- **Loaders**: `Dashboard.jsx:418-428` and `AgentPortal.jsx:289-303` run `select('category,label')`, group the rows into `meta = {category:[labels]}`, and pass `meta` to `AddLeadModal`, `CustomerModalTabsRouter` (and from there every tab) and `QuotationModule`. `utils.jsx:54 useMetadata()` does the same job but is unused. `ChannelPartnerManagementView.jsx:95-160` (Operations) loads 5 categories itself.
- **Management UI**: the Operations page adds, renames (with cascade) and deletes options for channel_partner, module_brand, registration_by, integration_by and inverter_make (`ChannelPartnerManagementView.jsx:316-450`, `547-675`, `688-735`). Deleting keeps existing record values.
- **Auto-growth**: `Dashboard.jsx:760-805 syncMetadata` inserts any new channel_partner or module_brand typed on a lead. `UserManagementView.jsx:329-340/455-470/1069-1080` inserts channel_partner when a CPO login is created.
- **Seeds**: `01_solarflow_demo.sql:316-320` and `02_sample_data_50.sql:47-54` seed channel_partner, sub_channel_partner, company_branch, payment_type (Loan, Cash), module_brand (SolarFlow Essential, SolarFlow Plus), payment_method_modes (Demo Transfer), registration_by (Demo Office) and subsidy_approval_status. `03_connected_demo_scenarios.sql:61-67` seeds integration_by from demo_profiles, subsidy tags, and inverter_make (DemoVolt, DemoGrid, DemoSun). A trigger at `03:120-161` keeps integration_by in sync with `demo_profiles(user_type='integration')` and renames bom and bom_items values.
- **Reference defaults**: `src/inventory/reference.json` → `metadata` holds realistic defaults: module_brand [ADANI, GOLDI, AATMANIRBHAR, GOLDI/ADANI, WAAREE, TATA, APS], module_wp [540…620], inverter_make [Goodwe, UTL, Solaryaan, Solax], roof_shed [Roof, Shed], subsidy_approval_status [Returned, Approved, Pending, Rejected], payment_method_modes [Bank Solar Loan], payment_type [Loan, Cash], plus demo channel_partner, registration_by and integration_by names. Only `inverter_make` is read at runtime, as a fallback (`MaterialIntegrationTab.jsx:61-63`).
- **Dead or dormant**: `META_CATEGORIES` (`constants.js:79`) is not imported anywhere. The categories payment_method_modes, subsidy_approval_status, company_branch and sub_channel_partner are never read. `REG_CHECKLIST_FIELDS` and `OPERATIONAL_CHECKLIST_FIELDS` exported from constants are shadowed by local copies at `CustomerDetailModal.jsx:686/722`. `INVERTER_PRESETS` (`quotations/template/data/initialData.js:3-8`) is unused.
- **Absent**: no DISCOM-name list and no lead-source list exist anywhere in src or SQL. Both are good first custom select fields.

## 1. Dropdown catalog

Legend for **Safe?**: **Full** = client may add, rename or remove. **Label** = ids fixed, only label, color or enabled flag may change. **Extend** = may add new values but listed ids are locked. **N/A** = not a setup-form list.

### 1a. Metadata-backed lists

| # | Dropdown | Current source | Current values | Used by (field → stage) | Safe? |
|---|---|---|---|---|---|
| 1 | Payment Type | metadata `payment_type`, fallback `['CASH','LOAN']` at AddLeadModal.jsx:946, `[]` at LeadsTab.jsx:156; hard-coded `['Loan','Cash']` at RegistrationTab.jsx:84 | Loan, Cash | `payment_type` → Add Lead, LEADS, REGISTRATION (required by stageRequirements.js:7). Drives LOAN/CASH routing (CustomerDetailModal.jsx:880-905,1707), the doc checklist (non-cash shows Aadhaar/PAN/Index-2/House photo), and the LoanTab/CashTab guards | **Label only.** zod coerces non-LOAN to Cash (validation.js:105-114). May disable one value (hides that stage). Do not add values without a routing map. |
| 2 | Module Brand | metadata `module_brand`; Operations UI; auto-add on lead save | Seed: SolarFlow Essential, SolarFlow Plus (reference: ADANI, GOLDI, WAAREE, TATA, APS…) | `module_brand` → Add Lead (AddLeadModal.jsx:852-859), LEADS (LeadsTab.jsx:125). Read-only in MATERIAL ORDER and INTEGRATION; BOM print; quotation leadMapping `solar_panel_make` | **Full** |
| 3 | Module Wp | metadata `module_wp` (no seed, no Operations UI); fallback literal [540,545,550,570,575,580,585,590,600,610,615,620] at AddLeadModal.jsx:544-546 and LeadsTab.jsx:126 | the fallback list | `module_wp` (numeric column) → Add Lead, LEADS; capacity auto-calc; BOM and challan | **Full** (numeric strings only) |
| 4 | Inverter Make | metadata `inverter_make`; Operations UI; fallback reference.json | Seed: DemoVolt, DemoGrid, DemoSun | `inverter_make` → MATERIAL INTEGRATION (MaterialIntegrationTab.jsx:655-660), required to advance (stageRequirements.js:11); BOM print | **Full** |
| 5 | Registration Staff | metadata `registration_by`; Operations UI | Demo Office | `registration_by` (RegistrationTab.jsx:95-99), `loan_by` (LoanTab.jsx:308-323), `discom_submission.submitted_by` (DiscomSubmissionTab.jsx:59-61, 335-345; required) | **Full** (staff names). Rename does not cascade to loan_by or submitted_by. |
| 6 | Integration Staff | metadata `integration_by`; Operations UI; trigger syncs demo_profiles | Demo Preparer, Loader, Installer | `bom.paper_prepared_by`, `bom.material_loaded_by`, `bom_items.integration_by` → MATERIAL INTEGRATION (MaterialIntegrationTab.jsx:171, 897-960, 1052) | **Full** (staff names). The trigger must target `profiles`. |
| 7 | Channel Partner (branch) | metadata `channel_partner`; Operations; UserManagement sync; lead auto-add | Demo Aurora Solar | `channel_partner` → Add Lead autocomplete (AddLeadModal.jsx:799), LEADS (admin-only edit, LeadsTab.jsx:105); Dashboard filter (Dashboard.jsx:1256); this is the RLS branch scope | **N/A** in this form. It comes from Branches/CPO setup. Seed only if Branches is on. |
| 8 | Payment method modes | metadata `payment_method_modes`, seeded but **unused** | Demo Transfer / Bank Solar Loan | (none) | Repurpose as #14 |
| 9 | Subsidy approval status | metadata `subsidy_approval_status`, seeded but **unused** | Inprocess (+ subsidy tags) | (none) | Drop, or merge into #17 |
| 10 | company_branch, sub_channel_partner | metadata, seeded but **unused** | Demo Branch, Demo Dealer | (none) | Drop from client seed |

### 1b. Lists from other tables (not setup-form lists)

| # | Dropdown | Source | Used by |
|---|---|---|---|
| 11 | Dealer (sub_channel_partner) | `demo_profiles` user_type agent/agent2 filtered by channel_partner (`utils.jsx:1202-1220 fetchAgent2SubAgents`) | Add Lead (AddLeadModal.jsx:832), LEADS (LeadsTab.jsx:119) |
| 12 | Vendor | `vendors` table (`shared.jsx:56-73 fetchVendorNames`) | MATERIAL DELIVERY vendor allotment (MaterialDeliveryTab.jsx:155-160, required), INSTALLATION reassign (InstallationStatusTab.jsx:312) |
| 13 | Stamp maker | `demo_profiles` user_type 'stamp' (DiscomSubmissionTab.jsx:73-88) | DISCOM SUBMISSION. The Stamp feature is **removed**, so this must be hidden. |
| — | Drivers | `drivers` table | Delivery batches only. The MaterialDeliveryTab driver_name field is free text. |

### 1c. Hard-coded option arrays

| # | Dropdown | Current source | Values | Used by | Safe? |
|---|---|---|---|---|---|
| 14 | Cash payment mode | CashTab.jsx:127-130 | Cash, Online, DD, Cheque | `cash_details.payments[i].type` → CASH | **Full**. Move to metadata `payment_method_modes`. |
| 15 | Cash installment names | CashTab.jsx:20 (3 fixed slots) | 1st/2nd/3rd Payment | `cash_details.payments[i].name` | Label only (changing the count needs code) |
| 16 | Loan tags | constants.js:54-62 (+ colors at 64-76) | Inprocess, Sanctioned, Returned, Reject, 1st Payment, 2nd Payment, Total Loan Payment Received (final) | `loan_tag` → LOAN tag bar (LoanTab.jsx:503); LoanView counts; export labels (utils.jsx:420) | **Extend.** Lock 1st Payment, 2nd Payment and Total Loan Payment Received (payment breakdown logic, LoanTab.jsx:142-150). |
| 16b | Loan manual-history status | LoanTab.jsx:9 `LOAN_STATUS_OPTIONS` | Processed, Sanctioned, Rejected, Returned, 1st Payment, 2nd Payment | `loan_history[].status`, and also writes `loan_tag` | Bug: does not match LOAN_TAGS ids. Derive from #16. |
| 17 | Subsidy tags | constants.js:36-42 (+ colors at 44-52) | Inprocess, Redeemed, Returned, Approved, Received (final) | `subsidy_tag` → SUBSIDY STATUS (required to advance, any value); SubsidyView, CustomerCard, TrashView | **Extend.** Exactly one isFinal. |
| 17b | Subsidy manual-history status | SubsidyStatusTab.jsx:199-203 | Approved, Returned, Rejected, Redeemed, Received | `subsidy_history[].status` | Derive from #17 |
| 18 | Installation status | constants.js:195-200 | Giveup, In process, Pending, Installed (final) | `installation_status` → INSTALLATION STATUS (gate requires 'installed'/'yes'); VendorPortal, InstallationView, InstallationPaymentsView, Dashboard; normalizeInstallationStatus (utils.jsx ~1248) | **Label only** |
| 19 | Geo tag status | GeoTagPhotoTab.jsx:88-92 | No, Pending, Proceed | `geo_tag_status` (gate requires 'Proceed'; set automatically on upload, lines 37-42) | Label only |
| 20 | Meter installation | MeterInstallationTab.jsx:62-63 | No, Yes | `meter_installation` (gate requires Yes) | Fixed |
| 21 | DISCOM inspection | DiscomInspectionTab.jsx:53-54 | No, Yes | `discom_inspection` (gate requires Yes) | Fixed |
| 22 | Delivery status | MaterialDeliveryTab.jsx:291-293; DeliveryBatchesView.jsx:963-964, 1253-1255 | PENDING, IN_TRANSIT, DELIVERED | `delivery_status`; RPC `update_delivery_batch_status_atomic`; stock trigger (07:53) | Fixed (labels only) |
| 23 | Vendor payment status | MaterialDeliveryTab.jsx:359-360; InstallationPaymentsView.jsx:632-633 | Pending (shown as "Unpaid"), Paid | `vendor_payment_status` (+ auto vendor_paid_date, vendor_paid_by) | Fixed (labels only) |
| 24 | Roof / Shed (mounting type) | MaterialOrderTab.jsx:38; AgentPortal.jsx:2111-2112; reference.json | Roof, Shed | `roof_shed` → MATERIAL ORDER (required); picks the BOM template (bom.js:18-19, VendorPortal.jsx:152/173, DeliveryBatchesView.jsx:708) | **Extend with mapping.** Each value must map to a BOM template (ROOF or SHED or a new one). |
| 25 | Lost-project status | constants.js:215-234 | Project Win, Project Lost, Project Return Win | `hold_procurement.hold_status` (jsonb) → LOST PROJECT | **Full** |
| 26 | Lost-project previous stage | HoldProcurementTab.jsx:222-230 (PRIMARY_STAGES minus LOST and COMPLETED) | pipeline stages | `hold_procurement.previous_stage` | Derived from the pipeline config |
| 27 | Stamp value | DiscomSubmissionTab.jsx:396-398 | 50, 300 | `discom_submission.stamp_value` | Full, but **hide** while Stamp is removed |
| 28 | Stamp description | DiscomSubmissionTab.jsx:410-413 | Affidavit, Undertaking, "Option 3" (placeholder) | `discom_submission.stamp_description` | Full; hide with Stamp |
| 29 | Quotation project type | QuotationForm.jsx:169; validated in quotations/model.js:55 | Residential, Commercial | `quotations.project_type` | Full, if model.js validation reads config |
| 30 | GEB/GEDA charge | QuotationForm.jsx:175; model.js:56 | Including, Excluding | `quotations.geb_geda_charge` | Options fixed; the label "GEB / GEDA" is Gujarat-specific and should come from config |
| 31 | Quotation brand tiers | initialData.js:40-60; exactly 3 enforced at model.js:57 | SolarFlow Essential, Plus, Premium | `quotation_data.form.options[].brandName` | Full (rename; count stays 3) |
| 32 | Quotation panel make / inverter brand | free text, QuotationForm.jsx:170, 174 | — | `solar_panel_make`, `inverter_brand` | Suggest a datalist from #2 and #4 |
| 33 | Inventory section and unit | free text with datalist of existing values (InventoryView.jsx:11, 108, 266) | General, … | `inventory_items.category`, `uom` | N/A (optional seed catalog) |
| 34 | User role pickers | UserManagementView.jsx:598-599, 1660-1661 | Manager, Dealer | profile user_type | N/A (feature or role config) |

## 2. Per-stage field catalog

Notes for all tables:
- "Gate" means the field is required to advance from that stage, per `src/demo/stageRequirements.js`.
- "Doc" means a generated document reads the field.
- Every stage also has a **Stage Remark** text input that writes `stages_remarks[stageId]` (`shared.jsx:136 StageRemarkSection`).
- `CheckboxRemarkItem` uploads write `documents.doc_type = field` and tick the boolean column through `DOC_TYPE_FLAG_COLUMN`.

### 2.0 Add Lead (AddLeadModal.jsx; schema `demoLeadSchema`)
| Label | Column | Type | Options source | Rules / notes |
|---|---|---|---|---|
| Customer Name * | customer_name | text | — | zod: 2-100 chars (required) |
| Phone Number * | phone_number | tel | — | zod: 10 digits after stripping +91 or a leading 0; `sanitizePhoneNumber` |
| Email Address | email_address | email | — | format checked if given (leadSchema requires it) |
| Consumer No | consumer_no | text (digits only, line 333) | — | leadSchema: 3-30 chars |
| Villages / Address | villages | text | — | leadSchema: min 2 |
| Full Address (optional) | full_address | textarea | — | Doc: feasibility |
| Pincode (optional) | pincode | text, 6 digits | — | zod `^\d{6}$`; Doc: feasibility |
| Tehsil / Sub Division | sub_divisions | text | — | Doc: agreement (taluka) |
| District | district | text | — | Doc: agreement, feasibility |
| Google Drive Link | google_drive_link | url | — | |
| Site Location Link | location_link | url | — | |
| Channel Partner Name | channel_partner | autocomplete text | metadata channel_partner | locked to the user's own branch for CPO/agent; RLS scope |
| Dealer Name | sub_channel_partner | select | demo_profiles agent/agent2 | locked for agent2 |
| MODULE BRAND | module_brand | select | metadata module_brand | lines 852-859 |
| MODULE WP | module_wp | select | metadata module_wp, else literal list | numeric |
| No of Modules | no_of_modules | number | — | numeric |
| System Capacity | system_capacity_kwp | text + Auto button | — | Auto = Wp × modules ÷ 1000 (utils/capacity.js) |
| Payment Type Selection | payment_type | select | metadata payment_type, else ['CASH','LOAN'] | coerced to Cash/Loan |
| Bank Name / Bank Branch | bank_name, bank_branch | text | — | shown only when payment_type is Loan |
| Doc checklist | adhaar_card_front, adhaar_card_back, pan_card, index_2, house_geo_tag_photo (non-cash only); light_bill, bank_details, extra_docs | file (pending upload) | — | lines 1003-1078 |

Full `leadSchema` (validation.js:23-115, not wired up) requires: customer_name, phone_number, email_address, consumer_no, villages, channel_partner, module_brand, module_wp, no_of_modules, system_capacity_kwp, sub_divisions, district, payment_type. `Dashboard.jsx:1019-1031` enforces almost the same set (without email) when a card is moved out of Leads.

### 2.1 LEADS (LeadsTab.jsx)
The fields at lines 84-128 are the same as Add Lead, plus a read-only "Lead Generated (IST)" (`created_at`). Edit-mode inputs: phone and consumer_no are `type=number` (85, 87); full_address is a textarea (90); pincode keeps digits only, max 6 (92); bank_name and bank_branch show only for Loan (97-98); channel_partner is admin-only edit (105-117); dealer select options come from `subAgents` (119-124); module_brand and module_wp are MetaSelects (125-126); capacity has the Auto button (128). Payment Type select at lines 145-171 (`meta.payment_type`). The doc checklist (file) at lines 185-194 includes index_2, labelled "Vera Pavti / aakarni". Gate: customer_name and phone_number.

### 2.2 REGISTRATION (RegistrationTab.jsx)
| Label | Column | Type | Options | Rules |
|---|---|---|---|---|
| Payment Type * | payment_type | select | literal ['Loan','Cash'] (84) | Gate: must be loan or cash |
| Registration date * | registration_date | date (text column) | — | Gate |
| Registration By | registration_by | select | metadata registration_by | |
| Feasibility No | registration_no | text | — | Doc: feasibility (`feasibilityNo`) |
| File No | folder_no | number (numeric column) | — | Doc: BOM print modal, challan |
| Application Acknowledgment | application_acknowledgment | file | — | 144 |
| Feasibility Document | feasibilty_document (sic) | file | — | 158 |
| Subsidy Token Photo | subsidy_token_photo | file | — | 172 |

### 2.3 LOAN (LoanTab.jsx; only shown when payment_type is loan)
| Label | Column | Type | Options | Rules |
|---|---|---|---|---|
| Loan By | loan_by | select | metadata registration_by | 308-323 |
| Total Quotation Amount (₹) | loan_history[status='Total Quotation'].amount | money | — | Doc: feasibility `projectCost` (required there) |
| Jansamarth Application No * | jansamarth_application_no | text | — | Gate; Doc: feasibility |
| Loan Date | loan_registration_date | date | — | |
| Solar Feasibility Report | generates the `site_feasibility` document | action | — | getMissingFeasibilityFields: name, consumer_no, full_address, district, pincode, capacity, feasibility no, Jansamarth no, quotation amount |
| Vendor Feasibility / Site Feasibility / Digital Certificate | vendor_feasibility, site_feasibility, digital_certificate | file | — | 430, 443, 456 |
| Loan Status tag bar | loan_tag (+ loan_history entry) | tag buttons | LOAN_TAGS | final tag locks it for non-admins |
| Down / 1st / 2nd Payment | loan_history[status].{amount, date, remark ("Cash / UPI / Cheque…" or "Ref No…")} | money / date / text | — | shown for 1st/2nd/Total tags |
| Manual loan entry | loan_history[] {status, date, remark} and loan_tag | select / date / text | LOAN_STATUS_OPTIONS | 856-885 |

### 2.4 CASH (CashTab.jsx; only shown when payment_type is cash)
| Label | Column | Type | Options |
|---|---|---|---|
| Total Deal Amount (₹) | cash_details.total_amount | money | — |
| Payment 1-3: Amount | cash_details.payments[i].amount | money | — |
| Payment Type | cash_details.payments[i].type | select | Cash/Online/DD/Cheque (127-130) |
| Date | cash_details.payments[i].date | date | — |
| Transaction ID | cash_details.payments[i].transaction_id | text | — |

Gate: payment_type present.

### 2.5 MATERIAL ORDER (MaterialOrderTab.jsx)
| Label | Column | Type | Options | Rules / Doc |
|---|---|---|---|---|
| Roof / Shed * | roof_shed | select | ['Roof','Shed'] (38) | Gate; picks BOM template; Doc: BOM print |
| DC Cable (Meters) | dc_cable | number | — | Doc: BOM |
| AC Cable (Meters) | ac_cable | number | — | Doc: BOM |
| Structure Front Leg Height (ft) | structure_front_leg_height | number | — | Doc: BOM |
| Structure Rear Leg Height (ft) | structure_rear_leg_height | number | — | Doc: BOM |
| Invoice Value (₹) * | invoice_value | money | — | Gate: > 0; Doc: BOM, challan |
| Notes / Special Instructions | material_order_notes | textarea | — | |
| Read-only customer block | customer_name, phone_number, email, consumer_no, folder_no, feasibility_no/registration_no, villages, sub_divisions, channel_partner, sub_channel_partner, module_brand, module_wp, no_of_modules, system_capacity_kwp | display | — | lines 178-191 |

The Agent Portal edits the same fields (AgentPortal.jsx:2105-2112 and its own save; gate via missingStageRequirements at line 834).

### 2.6 MATERIAL INTEGRATION (MaterialIntegrationTab.jsx)
| Label | Column | Type | Options | Rules / Doc |
|---|---|---|---|---|
| Material Order spec (read-only) | roof_shed, dc_cable, ac_cable, legs, invoice_value, material_order_notes | display | — | 570-610 |
| Customer block (read-only) | same as 2.5 | display | — | 626-639 |
| INVERTER MAKE * | inverter_make | select | metadata inverter_make, else reference.json | Gate; Doc: BOM |
| INVERTER SERIAL NO. * | inverter_serial_no | text | — | Gate; Doc: BOM |
| Panel serial numbers | panel_serial_no (newline-joined text) | multi-line list / scanner | — | Doc: BOM |
| Paper Prepared By / Date | bom.paper_prepared_by, bom.paper_prepared_date | select / date | metadata integration_by | 897-930 |
| Material Loaded By / Date | bom.material_loaded_by, bom.material_loaded_date | select / date | metadata integration_by | 932-960 |
| BOM lines | bom_items.{product_name, quantity, uom, integration_by, note, stock_quantity} | table | template from reference.json or constants; integration_by from metadata | BOM print, stock |

### 2.7 MATERIAL DELIVERY (MaterialDeliveryTab.jsx)
| Label | Column | Type | Options | Rules / Doc |
|---|---|---|---|---|
| VENDOR ALLOTMENT * | vendor | select | vendors table | Gate; challan |
| Delivery status | delivery_status | select | PENDING / IN_TRANSIT / DELIVERED | RPC and stock trigger |
| Commission / Vendor Quote (₹) | vendor_quote | money | — | Vendor commission page |
| Vendor payment | vendor_payment_status (+ vendor_paid_date, vendor_paid_by) | select | Pending ("Unpaid") / Paid | Installation commission view |
| INVOICE NO | invoice_no | text | — | |
| DELIVERY DATE * | material_delivery_date | date | — | Gate; challan |
| VEHICLE / TRUCK NO | vehicle_number | text | — | challan |
| DRIVER NAME | driver_name | text | — | challan |
| DRIVER PHONE NUMBER | driver_phone_number | text (numeric column) | — | challan |

### 2.8 INSTALLATION STATUS (InstallationStatusTab.jsx)
| Label | Column | Type | Options | Rules |
|---|---|---|---|---|
| SFDC Photo | sfdc_photo | file | — | 101-102 |
| Installation status | installation_status | tag buttons | INSTALLATION_TAGS | Gate: Installed; final tag locks it |
| Give-up reason | vendor_note | textarea | — | shown when status is Giveup (255) |
| Approve give-up | vendor_give_up_approved | boolean action | — | 275 |
| Reassign vendor | vendor | select | vendors table | 312 |
| Installation date | installation_date | date | — | for In process / Installed (410) |
| Installation note | installation_note | textarea | — | 437 |

### 2.9 GEO TAG PHOTO (GeoTagPhotoTab.jsx)
`geo_tag_status` tag buttons No / Pending / Proceed (Gate: Proceed). `geo_tag_image` is a file input (optional; only vendors can upload).

### 2.10 DISCOM SUBMISSION (DiscomSubmissionTab.jsx)
| Label | Column | Type | Options | Rules / Doc |
|---|---|---|---|---|
| DCR Certificate / PCR Certificate / Signature / PM Surya Ghar Model Agreement | dcr_certificate, pcr_certificate, signature_pic, discom_agreement (no such column) | file | — | signature feeds the agreement |
| File Submitted By | discom_submission.submitted_by | select | metadata registration_by | Gate |
| Submission Date | discom_submission.date | date | — | Gate |
| First Party / Second Party / Purchased Party | discom_submission.first_party / second_party / purchased_party | text | default customer_name / 'SOLARFLOW DEMO ENERGY' | from branding |
| Stamp Value / Stamp Description | discom_submission.stamp_value / stamp_description | select | 50, 300 / Affidavit, Undertaking, Option 3 | Stamp feature |
| Stamp maker assignment, send-back remark, approve / recall | discom_submission.* | select / textarea / actions | demo_profiles 'stamp' | **hide: Stamp removed** |
| PM Surya Ghar Stamp | pm_surya_ghar_stamp | file | — | Stamp flow; agreement GPA stamp |
| Agreement Execution Date | stages_remarks.discom_agreement_date | date | — | Doc: agreement `executionDate` |

### 2.11 METER INSTALLATION (MeterInstallationTab.jsx)
`meter_installation` No / Yes (Gate: Yes). "Meter Installation Date *" writes `installation_date` (Gate), which is the same column as 2.8. The Agent Portal also requires the `meter_installation_photo` upload (AgentPortal.jsx:882-884).

### 2.12 DISCOM INSPECTION (DiscomInspectionTab.jsx)
`discom_inspection` No / Yes (Gate: Yes).

### 2.13 SUBSIDY STATUS (SubsidyStatusTab.jsx)
`subsidy_tag` tag bar from SUBSIDY_TAGS (Gate: any value; final tag locks it). `plant_commissioning_report` is a file (optional). Manual history `subsidy_history[]` {status select (199-203), date, remark}.

### 2.14 FINAL REVIEW (FinalReviewTab.jsx)
`warranty_card` (file; **Warranty removed**), `insurance_status` (file), `sfdc_photo_text` (text), `warranty_card_text` (text; **Warranty removed**), `file_status` (text; this column is text, not boolean, so it must never be put in the flag map).

### 2.15 LOST PROJECT (HoldProcurementTab.jsx)
`hold_procurement.previous_stage` (select from PRIMARY_STAGES), `.hold_date` (date), `.hold_status` (HOLD_STATUS_TAGS buttons), `.comment` (textarea). Resume writes `stage` and `resumed_to`.

### 2.16 COMPLETED
No tab.

## 3. Recommendation

### 3.1 Which dropdowns become client-editable, and where they live
| Class | Lists | Storage | Editable after go-live? |
|---|---|---|---|
| A: data lists | module_brand, module_wp, inverter_make, registration_by, integration_by, payment_method_modes (cash modes), cf_<key> custom selects; channel_partner only via Branches | `metadata` rows, seeded by SQL | Yes, in Operations (made data-driven) |
| B: workflow enums | payment_type, loan_tags, subsidy_tags, installation_tags, geo_tag_status, meter_installation, discom_inspection, delivery_status, vendor_payment_status, roof_shed (with bomTemplate) | config, generated into constants.js | No (rebuild). Ids locked, labels, colors and enabled flags editable; loan and subsidy tags can be extended |
| C: config lists | hold_status_tags, cash installment names, quotation project_type, geb_geda label, quotation brand tiers, stamp value and description (Stamp off) | config | No (rebuild) |

Suggested config shape:
```json
{
  "dropdowns": {
    "module_brand":   {"storage":"metadata","edit":"full","values":["WAAREE","ADANI","TATA"]},
    "module_wp":      {"storage":"metadata","edit":"full","values":["540","545","580","600"]},
    "inverter_make":  {"storage":"metadata","edit":"full","values":["Goodwe","Solax"]},
    "registration_by":{"storage":"metadata","edit":"full","values":[]},
    "integration_by": {"storage":"metadata","edit":"full","values":[]},
    "payment_method_modes":{"storage":"metadata","edit":"full","values":["Cash","Online","DD","Cheque"]},
    "payment_type":   {"storage":"constant","edit":"label","values":[{"id":"Loan","label":"Loan","enabled":true},{"id":"Cash","label":"Cash","enabled":true}]},
    "loan_tags":      {"storage":"constant","edit":"extend","locked":["1st Payment","2nd Payment","Total Loan Payment Received"],"values":[{"id":"Inprocess","label":"In process","color":"teal"},{"id":"Total Loan Payment Received","label":"Total Received","isFinal":true}]},
    "subsidy_tags":   {"storage":"constant","edit":"extend","values":[{"id":"Received","label":"Received","isFinal":true}]},
    "installation_tags":{"storage":"constant","edit":"label","values":[{"id":"Installed","label":"Installed","isFinal":true}]},
    "roof_shed":      {"storage":"constant","edit":"extend","values":[{"id":"Roof","label":"Roof","bomTemplate":"ROOF"},{"id":"Shed","label":"Shed","bomTemplate":"SHED"}]},
    "hold_status_tags":{"storage":"constant","edit":"full","values":["Project Win","Project Lost","Project Return Win"]}
  }
}
```

Seed SQL generated for the client's empty project (metadata lists only, no customer data):
```sql
create table if not exists public.metadata (
  id uuid primary key default gen_random_uuid(),
  category text not null, label text not null,
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (category, label));
insert into public.metadata (category, label, sort_order) values
  ('module_brand','WAAREE',10),('module_brand','ADANI',20),
  ('module_wp','540',10),('module_wp','580',20),
  ('inverter_make','Goodwe',10),
  ('payment_method_modes','Cash',10),('payment_method_modes','Online',20),('payment_method_modes','DD',30),('payment_method_modes','Cheque',40),
  ('cf_discom_name','PGVCL',10),('cf_lead_source','Referral',10)
on conflict (category, label) do nothing;
alter table public.admin add column if not exists custom_fields jsonb not null default '{}'::jsonb;
```
Do not seed payment_type, company_branch, sub_channel_partner or subsidy_approval_status into metadata. Read payment_type from config.

### 3.2 Custom-field JSON shape
```json
{
  "key": "discom_name",              
  "label": "DISCOM",
  "type": "select",                   
  "options": ["PGVCL", "UGVCL", "MGVCL", "DGVCL"],
  "optionsSource": "metadata",        
  "required": false,                  
  "requiredAtCreate": false,          
  "stage": "LEADS",                   
  "section": "Customer Info",
  "order": 100,
  "showInAddLead": true,
  "visibleTo": ["admin","office","channel_partner_office","office2","agent2"],
  "editableBy": ["admin","office"],
  "export": true,
  "validation": {"maxLength": 100, "min": null, "max": null, "pattern": null}
}
```
Rules:
- `key` must match `^[a-z][a-z0-9_]{1,39}$`, must be unique, and must not collide with ADMIN_COLUMNS.
- `type` is one of text, textarea, number, money, date, select, multiselect, checkbox, file, phone, email or url.
- `stage` must be a PRIMARY_STAGES id. The builder rejects disabled stages.
- `required` means the field blocks leaving `stage`; it is merged into stageRequirements.
- `requiredAtCreate` is only valid when `stage` is LEADS and adds the field to the zod lead schema.
- `optionsSource` is `metadata` (seeded to category `cf_<key>`, editable in Operations) or `inline` (fixed in config).

Storage:
- Values are stored in `admin.custom_fields[key]` (add `custom_fields` to ADMIN_COLUMNS).
- `file` fields upload as `documents.doc_type = 'cf_<key>'` and register a label in DOC_TYPE_LABELS with no flag column. The tick is derived from the uploaded document, which is how CheckboxRemarkItem already works in upload mode (shared.jsx:628-630).

### 3.3 Default-field overrides
Shape: `fieldOverrides: {"registration_no": {"label":"PM Surya Ghar Application No","hidden":false,"requiredToLeaveStage":true}, "index_2": {"label":"Index-2"}}`. The builder applies overrides to labels in the tabs, the Add Lead form, AgentStageDetails and exports. It rejects `hidden:true` for the locked fields in 3.4.

### 3.4 Locked fields (cannot be hidden while their feature is on)
- **Logic**: stage, payment_type, channel_partner, sub_channel_partner, installation_status, geo_tag_status, meter_installation, installation_date, discom_inspection, loan_tag, subsidy_tag, delivery_status, delivery_batch_id, vendor, vendor_quote, vendor_payment_status, hold_procurement, stages_remarks, lead_creator_profile_id.
- **Feasibility PDF**: customer_name, consumer_no, registration_no (or feasibility_no), jansamarth_application_no, full_address, district, pincode, system_capacity_kwp, loan_history 'Total Quotation' amount.
- **Agreement PDF**: customer_name, consumer_no, villages, sub_divisions, district, stages_remarks.discom_agreement_date, signature_pic and stamp docs.
- **BOM print**: customer_name, phone_number, email_address, consumer_no, folder_no, villages, sub_divisions, channel_partner, sub_channel_partner, module_brand, module_wp, no_of_modules, system_capacity_kwp, roof_shed, dc_cable, ac_cable, structure_front_leg_height, structure_rear_leg_height, invoice_value, inverter_make, inverter_serial_no, panel_serial_no.
- **Challan (DELIVERY_PICKER_COLUMNS, constants.js:552)**: customer_name, phone_number, consumer_no, folder_no, system_capacity_kwp, module_wp, no_of_modules, invoice_value, material_delivery_date, driver_name, driver_phone_number, vehicle_number, vendor.
- **Quotation → lead mapping (model.js:11-16)**: customer_name, phone_number, email_address, full_address, villages, sub_divisions, district, pincode, system_capacity_kwp, module_brand, no_of_modules, module_wp.
- **Can be hidden freely**: google_drive_link, location_link, bank_name, bank_branch, folder_no (if BOM print is off), material_order_notes, invoice_no, sfdc_photo, sfdc_photo_text, file_status, insurance_status, installation_note, the doc checklist items (each one individually), and the warranty fields (forced off now).