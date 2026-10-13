# stages

## summary
The pipeline is one ordered array, PRIMARY_STAGES (src/constants.js:11-28). It has 16 uppercase string ids, each with a label and a lucide icon. STAGE_IDS (constants.js:30-32) maps each id with its spaces turned into underscores, so 'MATERIAL DELIVERY' becomes STAGE_IDS.MATERIAL_DELIVERY. A project's stage is the plain text column `admin.stage` ("projects" are the `admin` table). That column defaults to 'LEADS' and has no CHECK constraint or enum (supabase-setup/01_solarflow_demo.sql:141). Three other places also store stage ids: the keys of the `stages_remarks` jsonb, `hold_procurement.previous_stage`, and the free text of `activity_log` entries. Only labels can be renamed safely; ids must stay the same. In the admin customer modal, the "next stage" rule is array order. LOAN is skipped once when payment_type is 'cash', CASH once when it is 'loan', and LOST PROJECT is never a next stage (CustomerDetailModal.jsx:871-918). Gating uses a separate map in src/demo/stageRequirements.js. Each stage id is wired to its tab component by hand in CustomerModalTabsRouter.jsx. A lot is hard-coded per stage: the sidebar groups (STAGE_GROUPS) and guidance text (STAGE_GUIDANCE) in Dashboard.jsx, the agent portal's forced moves (MATERIAL ORDER to MATERIAL INTEGRATION, METER INSTALLATION to DISCOM INSPECTION to SUBSIDY STATUS), and the vendor portal's three-tab sub-pipeline (MATERIAL DELIVERY, INSTALLATION STATUS, GEO TAG PHOTO, ending at DISCOM SUBMISSION). The database also lists stages in fixed form: the `move_stage` RPC has a 16-id allow-list, and `get_dashboard_metrics_scoped` names COMPLETED, LOST PROJECT and INSTALLATION STATUS directly. Its per-stage counts are dynamic (jsonb_object_agg). Stock deduction is not tied to a stage. It fires on `delivery_status` changing to 'DELIVERED' (trigger issue_delivered_bom_stock). Three stages are structural: LEADS, COMPLETED and LOST PROJECT. LOAN/CASH, the vendor stages, the agent-portal stages and MATERIAL INTEGRATION are coupled to features. REGISTRATION, FINAL REVIEW and new custom stages are generic. A generic CustomStageTab fits the existing "edit editData, footer Save diffs and patches" pattern if four things are done: add a `custom_data jsonb` column, add it to ADMIN_COLUMNS (otherwise every save silently drops it), recreate the `select *` cpo_leads view, and relax the move_stage allow-list.

## risks
- STAGE_IDS is derived from PRIMARY_STAGES (constants.js:30). If a client build filters out a built-in, STAGE_IDS.X becomes undefined. Supabase queries like LoanView .eq('stage', undefined) and the router or role checks then misbehave silently. STAGE_IDS must come from the full built-in catalog.
- The move_stage RPC (01_solarflow_demo.sql:354) rejects any stage outside its 16-id allow-list. The admin card override (Dashboard.jsx:1058) fails with 'Unknown stage' for every custom stage until the SQL changes.
- STAGE_GROUPS (Dashboard.jsx:187-192) is hard-coded. A custom stage would get counts and a modal tab, but no sidebar entry, so users could never list its projects.
- Agent portal transitions (AgentPortal.jsx:842, 891, 915) and vendor portal transitions (VendorPortal.jsx:1657, 1807) jump to fixed ids. A custom stage inserted between those stages is skipped, and removing one of the targets makes the moves write an id that is not in the pipeline.
- LOAN/CASH branching is a single-step skip that assumes LOAN and CASH are adjacent (CustomerDetailModal.jsx:880-890). It keys on payment_type text equal to 'cash' or 'loan', while payment_type options come from metadata. A client payment type like 'EMI' would route through BOTH stages and fail the REGISTRATION requirement (stageRequirements.js:7).
- ADMIN_COLUMNS / sanitizeAdminUpdate (constants.js:390, utils.jsx:75) silently strips unknown keys. If custom_data is not added, custom-stage saves show 'Saved' but write nothing.
- cpo_leads is a `select *` view (19_convert...sql:368). Postgres fixes its column list at creation, so CPO and Manager roles will not see custom_data unless the view is re-created after the column is added.
- Postgres re-orders jsonb keys. getChangedFields uses JSON.stringify (CustomerDetailModal.jsx:97), which can mark custom_data dirty or put it in the conflict dialog after a save. The modal already documents this for hold_procurement (1129-1131).
- custom_data is written as a whole object. Two users editing different custom stages on the same project at once will hit the 'same field' conflict path, or overwrite each other on force-overwrite. A merge RPC avoids this.
- handleSave's changeSummary skips object values (CustomerDetailModal.jsx:1243-1247), so custom field edits would not appear in the Activity Log unless a dedicated diff block is added.
- Existing bug: AgentPortal uses STAGE_IDS keys as stage ids ('METER_INSTALLATION', 'DISCOM_INSPECTION', 'MATERIAL_ORDER' at 749-755 and 924), so the priority and after-inspection workdesk shows an empty list.
- completed_at is set only by the move_stage RPC (01_solarflow_demo.sql:359). The modal 'Save & Move to Completed' path never sets it, so card and modal show it inconsistently.
- The shared schema has no stage index: admin_stage_idx was dropped by CASCADE when demo_session_id was dropped. Every sidebar click runs .eq('stage') plus an order by over the whole table.
- Stage ids are persisted in admin.stage, stages_remarks keys, hold_procurement.previous_stage, activity_log text, sessionStorage ('solarflow_selected_stage', 'solarflow_modal_active_tab') and generated SQL. Changing or removing an id after go-live leaves projects stuck in a stage that is no longer listed. Only labels should be editable after go-live.
- Dashboard.jsx:491 uppercases the selected stage before querying, so a custom id with lowercase letters would never list its projects.
- Reserved modal tab ids 'DOCUMENTS', 'history' and 'CUSTOMER_CARD', plus the legacy aliases 'MATERIAL INSTALLATION', 'COMMISSIONING' and 'HOLD PROCUREMENT', would collide if a client used them as custom stage ids.
- tests/demo/workflow.test.mjs asserts 1-2 requirements per stage. Config-driven required fields can break CI for client builds.

## recommendations
- Create src/config/pipeline.js. It holds BUILTIN_STAGES (the full catalog with id, default label, icon name, group, tab component name, guidance, hideWhenPaymentType, terminal flags, feature dependencies). It resolves client config into PRIMARY_STAGES (enabled, ordered, relabelled, plus custom). It exports STAGE_IDS (always the full built-in set), STAGE_BY_ID, STAGE_GROUPS, STAGE_GUIDANCE, isStageEnabled, isStageApplicable(stage, record) and getNextStageId(record). constants.js re-exports them so the roughly 20 importing files keep working.
- Make labels editable for every stage and ids immutable. Validate custom ids in the setup form: uppercase only matching ^[A-Z0-9][A-Z0-9 _-]{0,47}$, no '.', not equal to any built-in, reserved or legacy id, and frozen after first publish.
- Pin LEADS as the entry stage and COMPLETED and LOST PROJECT as terminal stages. Allow reorder and remove only between them. Have the setup form block removing a built-in while a feature that needs it is on: Vendor login needs MATERIAL DELIVERY, INSTALLATION STATUS and GEO TAG PHOTO; Loan tracking needs LOAN; Subsidy tracking needs SUBSIDY STATUS; BOM maker needs MATERIAL INTEGRATION; Installation view needs INSTALLATION STATUS.
- Replace the duplicated next-stage logic in CustomerDetailModal (871-918), AgentPortal (842, 891, 915) and VendorPortal (handleSaveChanges destinations) with getNextStageId. Model LOAN/CASH as config: LOAN hideWhenPaymentType ['cash'], CASH ['loan'].
- Store custom-stage values in admin.custom_data jsonb, namespaced as custom_data[STAGE_ID][fieldKey]. Use the same structure for 'extra fields' on built-in stages (a CustomFieldsSection under built-in tabs).
- Implement CustomStageTab on the footer-save pattern (as in DiscomInspectionTab and FinalReviewTab). It writes into editData.custom_data through setEditData, and handleSave diffs and sends the narrowed patch. Add optional per-section Save through onUpdate (handleSectionUpdate), as handleSaveRegChecklist does.
- Ship SQL that adds custom_data, re-creates cpo_leads, and generates the move_stage allow-list from config (or validates format only). Optionally add the merge RPC set_custom_stage_data, a completed_at trigger and a stage index (exact SQL in details).
- Add 'custom_data' to ADMIN_COLUMNS. Make getChangedFields use a key-sorted stable stringify. Add a custom_data diff block to handleSave and handleAdvanceStage so changes reach the Activity Log.
- Drive the Dashboard STAGE_GROUPS and STAGE_GUIDANCE, the AgentStageDetails STAGE_FIELDS, the DeliveryBatchesView stage options and the DataExportView columns from config.
- Fix the AgentPortal key-versus-id bug (749-755, 924) while refactoring, and replace remaining literal stage strings with STAGE_IDS: CustomerCard.jsx:20, DashboardView.jsx:162/287, HoldProcurementTab.jsx:22/63/153/227, solarStats.js:33/45, Dashboard.jsx:88.
- Exclude demo-only stage code from client builds: seed200.js, tourSteps.js, deliveryBatches.js, dev/*, SQL seeds 02/05/08/10/11, and the 'Demo essentials' banner at CustomerDetailModal.jsx:1836.

## open_questions
- Which built-in stages may a client actually remove? Removing MATERIAL DELIVERY, INSTALLATION STATUS, GEO TAG PHOTO or DISCOM SUBMISSION breaks Vendor login, and removing LOAN breaks Loan tracking. Should the setup form block this, or make the vendor sub-pipeline itself configurable?
- When a stage is removed from the pipeline but its feature stays on (e.g. no LOAN stage but Loan tracking on), should its tab remain as a non-stage panel in the customer modal?
- Can custom stages sit between vendor-handled or agent-handled stages (e.g. between INSTALLATION STATUS and GEO TAG PHOTO)? That requires the vendor and agent portals to switch to getNextStageId.
- Should custom stages have per-role permissions (agent editable, CPO/Manager view-only, vendor visible), or is admin/office edit plus agent read-only enough at first?
- Are 'extra fields' on built-in stages also stored in custom_data[STAGE_ID] and rendered by the same component under the built-in tab? This design assumes yes.
- Do custom fields need file uploads (documents table with custom doc_type), or only text, date, select and yes/no?
- Should the setup SQL bake the client's stage list into move_stage, so the DB rejects unknown ids, or only validate the id format so stages can change later without a migration?
- Is LOST PROJECT (Pause / Resume) mandatory for every client, or should it be a toggle that hides the Pause button and the sidebar entry?
- Do clients have payment types other than Loan and Cash? The LOAN/CASH branch and the REGISTRATION gate assume exactly those two values.

## touchpoints
- src/constants.js:11 — PRIMARY_STAGES: 16 hard-coded {id,label,icon} entries. Their order is the pipeline order used by next-stage logic, sidebars, admin-override menus, the dashboard bar chart, the Lost-Project origin select and the vendor/agent 'future stage' index checks. => Build it from client config: the built-in catalog plus overrides (label, order, enabled, group, guidance) plus custom stages. Icons are named in config and mapped to lucide components. Keep LEADS first and COMPLETED and LOST PROJECT last, and pin them.
- src/constants.js:30 — STAGE_IDS is derived from PRIMARY_STAGES. If it is derived from a filtered (enabled-only) list, a removed built-in becomes undefined, and calls like LoanView .eq('stage', STAGE_IDS.LOAN) or the router comparisons break. => Derive STAGE_IDS from the FULL built-in catalog so it is always complete. Add STAGE_BY_ID, isStageEnabled(id), isStageApplicable(stage, record) and getNextStageId(record) helpers in a new src/config/pipeline.js, and re-export them from constants.js.
- src/constants.js:390 — ADMIN_COLUMNS whitelist used by sanitizeAdminUpdate (src/utils.jsx:75) for every admin/agent/vendor write. A key not listed here is silently dropped (see the comment at constants.js:472). => Add 'custom_data'. Without it, CustomStageTab saves would report success and write nothing.
- src/models.jsx:82 — DEFAULT_LEAD_FORM.stage = 'LEADS' sets the entry stage for AddLeadModal (Dashboard.handleAddLead at Dashboard.jsx:1159) and for agent lead creation. The DB default is also 'LEADS' (01_solarflow_demo.sql:141). => Use STAGE_IDS.LEADS. LEADS stays the structural entry id; only its label can change.
- src/demo/stageRequirements.js:5 — Per-stage gate list of [column, label, validator]. missingStageRequirements reads only top-level data[field]. REGISTRATION requires payment_type to be 'loan' or 'cash', which couples it to the LOAN/CASH branch. Used by CustomerDetailModal.jsx:920 and 1836 and by AgentPortal.jsx:834. => Move it to the config layer. Allow getter or dotted-path requirements such as custom_data.<STAGE>.<key> built from custom field `required` flags. Relax the REGISTRATION payment_type check when the client's payment types differ. Rename the 'Demo essentials' banner.
- src/components/CustomerModalTabsRouter.jsx:19 — Fixed chain of activeTab === STAGE_IDS.X checks, one built-in tab per id. LOST_PROJECT renders HoldProcurementTab. COMPLETED renders nothing. => Add `const def = STAGE_BY_ID[activeTab]; if (def?.custom) return <CustomStageTab {...props} stage={def} />`. Optionally append <CustomFieldsSection> under built-in tabs for 'extra fields'.
- src/components/CustomerDetailModal.jsx:110 — Initial activeTab: _autoPrintBom opens MATERIAL INTEGRATION, COMPLETED falls back to LEADS, then sessionStorage 'solarflow_modal_active_tab', then customer.stage. The effect at 176-181 forces COMPLETED/CUSTOMER_CARD to LEADS. => Ignore a saved tab id that is not an enabled or custom stage, or DOCUMENTS/history.
- src/components/CustomerDetailModal.jsx:278 — isDiscomOrMeterStage: a channel-partner 'agent' may edit only their own clients and only at DISCOM SUBMISSION or METER INSTALLATION (canUserEdit, 280-292). => Move to per-stage config, e.g. stage.agentEditable: true, so custom stages can opt in.
- src/components/CustomerDetailModal.jsx:294 — isStageRestrictedForUser: CPO and Manager are view-only on MATERIAL INTEGRATION and MATERIAL DELIVERY. => Per-stage config viewOnlyFor: ['channel_partner_office','office2'].
- src/components/CustomerDetailModal.jsx:871 — hasNextStage and nextStageId (871-918) are duplicated walks with a single-step LOAN/CASH skip and a LOST PROJECT skip. They assume LOAN and CASH are adjacent and that terminal stages come last. => Replace both with getNextStageId(editData) that loops over applicable, non-terminal stages (LOAN hideWhenPaymentType ['cash'], CASH ['loan']) and returns COMPLETED as the final step.
- src/components/CustomerDetailModal.jsx:927 — handleAdvanceStage: checks requirements, flushes saveBomRef (BOM), clears the old stage remark, applies on-enter seeds for LOST_PROJECT (hold_procurement), METER_INSTALLATION (meter_installation='No') and DISCOM_INSPECTION ('No'), writes a narrowed patch and logs stage_change. => No structural change. Custom stages need no on-enter hooks. If needed later, add optional config onEnter defaults that write into custom_data.
- src/components/CustomerDetailModal.jsx:80 — getChangedFields compares objects with JSON.stringify. Postgres re-orders jsonb keys (noted in the comment at 1129-1131), so custom_data can look dirty or conflicted when it is not. => Use a key-sorted stable stringify for object and array comparisons in getChangedFields and in the overlap test inside handleSave (1210-1212).
- src/components/CustomerDetailModal.jsx:1153 — handleSave builds changeSummary only from non-object keys (1243-1247) and adds hand-written diffs for subsidy_history and loan_history. Object columns are otherwise missing from the activity log. => Add a custom_data diff block that logs '<Stage label> > <Field label>: old -> new' for each changed key, using the same pattern as the subsidy_history block.
- src/components/CustomerDetailModal.jsx:1501 — tabProps passed to every tab: editData, setEditData (handleEditDataChange, which recomputes dirty), handleChange (top-level field only), isEditable, editingSection, setEditingSection, onUpdate (handleSectionUpdate), logActivity, fetchLogs, documents and upload/preview/delete handlers, meta, user, saving, handleAdvanceStage, onDirty. => No change needed. The router adds `stage` (the config definition) for CustomStageTab.
- src/components/CustomerDetailModal.jsx:1704 — Modal tab nav: PRIMARY_STAGES minus LOAN when cash, minus CASH when loan, minus COMPLETED and LOST, plus DOCUMENTS and Notes & History. => Use isStageApplicable(stage, editData) and the terminal flags. Custom stages then appear automatically.
- src/components/CustomerDetailModal.jsx:1876 — Footer and Pause block are hidden on LOST PROJECT, DOCUMENTS and history, or when the customer is COMPLETED. Save & Move shows only when activeTab === customer.stage, and moving to COMPLETED opens a confirm dialog (1936-1943, 2021+). => No change (structural ids). Hide the Pause button if config disables Lost Project.
- src/components/Dashboard.jsx:168 — STAGE_GUIDANCE: hard-coded help text per stage id (the LEADS special case is at 1635). => Read from stage.guidance in config, with built-in defaults.
- src/components/Dashboard.jsx:187 — STAGE_GROUPS: four sidebar groups with hard-coded stage-id lists. The sidebar (1393-1399) renders only stages listed in a group, so a custom stage would never appear in the sidebar. => Build the groups from config (stage.group plus a groups array). Put ungrouped stages in a default group.
- src/components/Dashboard.jsx:489 — fetchStageCustomers uppercases the stage (491) and runs .eq('stage', ...). LEADS filters by created_at and REGISTRATION by registration_date month/year (517-538 and the UI at 1530). => Custom ids must be uppercase. Keep the LEADS/REGISTRATION special filters gated on those ids.
- src/components/Dashboard.jsx:1002 — handleMoveStage (admin card override): a hard-coded 12-field check when leaving LEADS, the move_stage RPC (1058), a follow-up write of stages_remarks and hold_procurement for LOST PROJECT, and a stage_change log. => Reuse the configured LEADS requirements instead of the inline list. The RPC allow-list must accept custom ids (see the SQL touchpoint).
- src/components/Dashboard.jsx:1285 — stageCounts come from the RPC jsonb_object_agg (dynamic, so custom stages are counted). LOST PROJECT is aliased from 'Lost Project'. => No change. Counts for custom stages work as-is.
- src/components/Dashboard.jsx:1740 — defaultTab for the modal: the subsidy view opens SUBSIDY STATUS, loan_tags opens LOAN, installation_tags opens INSTALLATION STATUS. The router renders the built-in tab even when that stage is hidden from the nav. => Gate on the feature flags (subsidyTracking, loanTracking, installationView). A stage can be removed from the pipeline but kept as a non-stage panel.
- src/components/Dashboard.jsx:88 — Today summary 'installedLive' query uses the literal '("COMPLETED","LOST PROJECT")'. => Build it from STAGE_IDS terminal ids (structural, so low risk).
- src/components/CustomerCard.jsx:211 — Admin Override menu lists every PRIMARY_STAGES entry and calls onMoveStage. Line 20 uses the literal 'COMPLETED'. => Works automatically once PRIMARY_STAGES comes from config. Replace the literal with STAGE_IDS.COMPLETED.
- src/components/DashboardView.jsx:276 — 'Projects by stage' bar chart over PRIMARY_STAGES. Line 162 reads the Lost metric from stageCounts['LOST PROJECT'], and 287 colors COMPLETED. => No change beyond config-driven PRIMARY_STAGES. Replace the literals with STAGE_IDS.
- src/components/AgentPortal.jsx:820 — Hard-coded agent transitions: handleSaveMaterialOrder sets stage to MATERIAL_INTEGRATION (842). handleSaveMeterInstallation sets DISCOM_INSPECTION (891) with its own 3-check list including the meter photo. handleSaveDiscomInspection sets SUBSIDY_STATUS (915). All ignore array order, so a custom stage inserted between them is skipped. => Compute the destination with getNextStageId(record) and validate with missingStageRequirements(currentStage). Keep the meter photo as a config requirement if wanted.
- src/components/AgentPortal.jsx:740 — Per-stage counters and priorityWorkdeskTab. Latent bug: lines 749-755 and 924 pass STAGE_IDS KEYS ('METER_INSTALLATION', 'DISCOM_INSPECTION', 'MATERIAL_ORDER') where stage ids are expected, so the workdesk opens an empty list with a raw header. => Use STAGE_IDS.METER_INSTALLATION etc. (the id values). Base the counters on configured 'agent work queue' stages.
- src/components/AgentPortal.jsx:1497 — Customer stage tabs in the agent detail view use the same LOAN/CASH/terminal filter. Lines 1557-1566 exclude the stages that have custom editors, and every other stage renders the read-only AgentStageDetails. => Use isStageApplicable. Custom stages fall through to AgentStageDetails, which needs their fields.
- src/components/AgentPortal.jsx:325 — On open, maps stage to dealer sub-tab (ORDER/METER/INSPECTION/LEAD_INFO). Lines 657-659 gate document uploads by stage (LEADS/REGISTRATION, meter docs in METER, signature/stamp/dcr in DISCOM stages). Lines 2348 and 2601 accept the legacy ids 'MATERIAL INSTALLATION' and 'COMMISSIONING'. => Move upload permissions to per-stage config (agentUploads). Reserve the legacy ids so custom stages cannot use them.
- src/components/AgentPortal.jsx:1190 — Sidebar 'Pipeline Stages' lists all PRIMARY_STAGES, including COMPLETED and LOST, with client-side counts. => Works automatically with config-driven PRIMARY_STAGES. Optional per-stage showInAgentPortal flag.
- src/components/AgentStageDetails.jsx:5 — STAGE_FIELDS: read-only label/column paths per built-in stage. readPath (line 83) supports dotted paths and the component returns null when a stage has no fields. => Append custom stages: STAGE_FIELDS[def.id] = def.fields.map(f => [f.label, `custom_data.${def.id}.${f.key}`]). Stage ids must not contain '.'.
- src/components/VendorPortal.jsx:58 — TAB_STAGE_MAP pins the vendor sub-pipeline: DELIVERY is MATERIAL_DELIVERY, INSTALLATION is INSTALLATION_STATUS, GEO is GEO_TAG_PHOTO (MATERIAL is MATERIAL_INTEGRATION, hidden). vendorIsFutureTab and vendorIsPastTab use the PRIMARY_STAGES index (60-76). => Vendor login requires these three built-ins to stay enabled, or a config mapping of vendor tabs to stage ids. Validate this in the setup form.
- src/components/VendorPortal.jsx:643 — handleSaveChanges: editing is allowed only at INSTALLATION STATUS or GEO TAG PHOTO (646-649). It moves to GEO_TAG_PHOTO (button at 1807, checks at 691-709) and then DISCOM_SUBMISSION (button at 1657, checks at 712-727). Give-up only at INSTALLATION STATUS (817). Lists and counts at 875-878 and 946-953. Stage moves are logged as 'update', not 'stage_change' (760-768). => Replace the hard-coded destinations with getNextStageId. Log 'stage_change' for consistency.
- src/components/modal-tabs/HoldProcurementTab.jsx:153 — Resume writes stage = hold_procurement.previous_stage, falling back to the literal 'LEADS' (22, 63, 153). The Origin select at 227 lists PRIMARY_STAGES minus the literals 'LOST PROJECT' and 'COMPLETED'. => Use STAGE_IDS constants. If previous_stage is no longer enabled (config changed later), fall back to LEADS with a warning.
- src/components/LoanView.jsx:43 — Loan tracking counts .eq('stage', LOAN) and .neq('stage', COMPLETED) (43-49, 68, 114). Line 341 shows the raw id `c.stage || 'LEADS'` instead of a label. SubsidyView.jsx:325 has the same raw display. => Gate on loanTracking plus the LOAN stage. Show PRIMARY_STAGES labels.
- src/components/InstallationView.jsx:53 — Installation tracking excludes COMPLETED (53, 68, 118). The sidebar count comes from RPC installationTagCount = stage='INSTALLATION STATUS'. => The structural COMPLETED reference is fine. The count is coupled to the INSTALLATION STATUS stage.
- src/components/DeliveryBatchesView.jsx:280 — The project picker defaults to stage filter 'MATERIAL DELIVERY' (280, 392, 413) with literal options MATERIAL DELIVERY, INTEGRATION, ORDER and ALL (1469-1472). src/delivery/projectPicker.js:4 also defaults to 'MATERIAL DELIVERY'. => Build the options from enabled stages, with a configurable 'deliveryStage' and ALL as fallback.
- src/dashboard/solarStats.js:33 — Skips the literal 'LOST PROJECT'. The literal 'COMPLETED' drives installed capacity and completed panels (45). => Import STAGE_IDS (structural ids, low risk).
- src/components/DataExportView.jsx:123 — Exports select('*') with raw stage ids. A custom_data object would land in one JSON cell. utils.jsx exportAllToCSV (252, label mapping at 303 and 418) is never called. => Add stage-label mapping and flatten custom_data into '<Stage> - <Field>' columns from config.
- supabase-setup/01_solarflow_demo.sql:141 — admin.stage text not null default 'LEADS' (no CHECK/enum). stages_remarks jsonb at 142, hold_procurement jsonb at 96, cash_details and discom_submission jsonb at 71 and 84. => Add custom_data jsonb not null default '{}' in the client schema. Do not add a stage CHECK, so config changes need no migration.
- supabase-setup/01_solarflow_demo.sql:350 — move_stage RPC allow-list of the 16 built-in ids (354). It sets completed_at only here (359) and logs 'old → new' as action 'update'. The modal advance path never sets completed_at. => Generate the allow-list from client config, or validate the format only. Add a trigger to stamp completed_at on any path.
- supabase-setup/01_solarflow_demo.sql:329 — get_dashboard_metrics_scoped: completedCount and liveProjects use the literals COMPLETED and LOST PROJECT, installationTagCount uses 'INSTALLATION STATUS', and stageCounts are dynamic. => Keep the structural literals. The installation count is coupled to that stage.
- supabase-setup/01_solarflow_demo.sql:282 — admin_stage_idx is on (demo_session_id, stage, created_at). 19_convert_to_shared_multiuser_database.sql drops demo_session_id with CASCADE, so the shared schema has NO stage index. => Client schema: create index on admin(stage, updated_at desc) where deleted_at is null.
- supabase-setup/19_convert_to_shared_multiuser_database.sql:367 — The cpo_leads view is `select * from public.admin`, so Postgres fixes its column list when the view is created. 18_refresh_cpo_leads_view.sql exists only to re-create it after columns were added. => Create the view after custom_data exists, or re-create it in the same migration.
- supabase-setup/22_fix_shared_inventory_functions.sql:241 — issue_delivered_bom_stock trigger deducts BOM stock when delivery_status changes to 'DELIVERED' (258-263). It is not stage-based. update_delivery_batch_status_atomic (19:598) changes only delivery_status. => None for configurable stages. Renaming or removing the MATERIAL DELIVERY stage does not affect stock.
- tests/demo/workflow.test.mjs:14 — Asserts every stageRequirements entry has 1-2 requirements and is satisfiable. => Scope the test to built-in demo defaults, or allow N requirements for configured custom stages.
- src/demo/seed200.js:47 — Demo-only stage literals: seed200 (47, 65, 91), deliveryBatches.js:1, tourSteps.js, dev/tourPreview.jsx:39, and the SQL seeds 02/05/08/10/11. => Exclude from client builds (seed and tour off).

## details
All paths are relative to the repo root (/Users/mahvishsadafv2/Desktop/solarflow_client_builder). The projects table is `public.admin`.

## (1) Default stages: id, label, tab component and special behaviour

| # | id (STAGE_IDS key) | Label | Admin modal tab (CustomerModalTabsRouter.jsx) | Agent / Dealer portal | Vendor portal | Gate (stageRequirements.js) | Special behaviour |
|---|---|---|---|---|---|---|---|
| 1 | `LEADS` (LEADS) | Leads | LeadsTab | Inline editor (AgentPortal.jsx:1670); default workdesk tab (109) | – | customer_name, phone_number | Entry stage: DB default `stage text not null default 'LEADS'` (01_solarflow_demo.sql:141) and `DEFAULT_LEAD_FORM.stage` (models.jsx:82). Fallback tab for unknown or COMPLETED records (CustomerDetailModal.jsx:115,121,127,176-181; AgentPortal.jsx:325,731). Fallback Lost-Project origin (HoldProcurementTab.jsx:22,63,153). Card override checks 12 hard-coded fields when leaving it (Dashboard.jsx:1013-1039). Month/year filter by created_at (Dashboard.jsx:517-538,1530). Special guidance (1635). |
| 2 | `REGISTRATION` | Registration | RegistrationTab (+ registration checklist, handleSaveRegChecklist CDM:701) | AgentStageDetails read-only | – | registration_date; payment_type must be loan or cash | Month filter by registration_date (Dashboard.jsx:525-538). Its gate is what makes the LOAN/CASH branch work. |
| 3 | `LOAN` | Loan | LoanTab | Inline editor (AgentPortal.jsx:1956) | – | jansamarth_application_no | Hidden and skipped when payment_type=='cash' (CDM:880,902,1707; AgentPortal.jsx:1500). LoanView counts `.eq('stage','LOAN')` (LoanView.jsx:43). Loan-tracking view opens this tab (Dashboard.jsx:1740). |
| 4 | `CASH` | Cash | CashTab | AgentStageDetails | – | payment_type | Hidden and skipped when payment_type=='loan' (CDM:883,905,1708; AgentPortal.jsx:1501). |
| 5 | `MATERIAL ORDER` (MATERIAL_ORDER) | Material Order | MaterialOrderTab | Editor (2028). The agent advances it directly to MATERIAL INTEGRATION (820-861) | – | roof_shed; invoice_value > 0 | Delivery-picker option (DeliveryBatchesView.jsx:1471). Demo truck seeding (demo/deliveryBatches.js:1). Agent dealer-tab 'ORDER' (AgentPortal.jsx:327). |
| 6 | `MATERIAL INTEGRATION` | Material Integration | MaterialIntegrationTab (BOM maker; registers saveBomRef, which advance and save flush first: CDM:934-949,1154-1165) | Read-only BOM (AgentPortal.jsx:347,2211) | TAB_STAGE_MAP.MATERIAL (hidden) | inverter_make, inverter_serial_no | `_autoPrintBom` forces this tab (CDM:111,125). CPO/Manager view-only (CDM:294). |
| 7 | `MATERIAL DELIVERY` | Material Delivery | MaterialDeliveryTab (vendor allotment, driver, vehicle, admin-only vendor_quote) | AgentStageDetails | DELIVERY tab list and count (VendorPortal.jsx:479,875,946) | vendor, material_delivery_date | CPO/Manager view-only (CDM:294). Default delivery-batch picker filter (DeliveryBatchesView.jsx:280,392,413,1469; delivery/projectPicker.js:4). Stock deduction is NOT stage-based: trigger `issue_delivered_bom_stock` fires on delivery_status changing to 'DELIVERED' (22_fix_shared_inventory_functions.sql:241-337). |
| 8 | `INSTALLATION STATUS` | Installation Status | InstallationStatusTab (isEditable=isInstallationDetailsEditable; Manager can edit only the SFDC photo, CDM:301) | Inline editor (2348, also accepts legacy 'MATERIAL INSTALLATION') | INSTALLATION tab, editable only at this stage (648,862,877,950). Vendor advance goes to GEO TAG PHOTO (691-709,1807). Give-up only here (817) | installation_status Yes/Installed | RPC installationTagCount = stage='INSTALLATION STATUS' (01:342). Installation-tracking view opens this tab (Dashboard.jsx:1740). |
| 9 | `GEO TAG PHOTO` | Geo Tag Photo | GeoTagPhotoTab | AgentStageDetails | GEO tab; vendor advance goes to DISCOM SUBMISSION (712-727,1657) | geo_tag_status=='Proceed' | – |
| 10 | `DISCOM SUBMISSION` | Discom Submission | DiscomSubmissionTab (agreement generator, stamp-maker hand-off) | Editor (1579). Signature/stamp/dcr uploads allowed (657-659) | – | discom_submission.submitted_by and .date | Channel partner 'agent' may edit in the modal only here or at METER (CDM:278,285-289). StampPortal coupling (feature removed). |
| 11 | `METER INSTALLATION` | Meter Installation | MeterInstallationTab | Editor (2445). Agent advance goes to DISCOM INSPECTION with its own 3 checks including the photo (875-900) | – | meter_installation Yes; installation_date | On entry the modal seeds meter_installation='No' (CDM:1003-1008). Agent-editable (CDM:278). Agent priority queue (749). |
| 12 | `DISCOM INSPECTION` | Discom Inspection | DiscomInspectionTab | Editor (2519). Agent advance goes to SUBSIDY STATUS (902-925) | – | discom_inspection Yes | On entry seeds discom_inspection='No' (CDM:1010-1014). |
| 13 | `SUBSIDY STATUS` | Subsidy Status | SubsidyStatusTab | AgentStageDetails | – | subsidy_tag | Subsidy-tracking view opens this tab (Dashboard.jsx:1740). |
| 14 | `FINAL REVIEW` | Final Review | FinalReviewTab (operational checklist warranty_card/insurance; warranty is a removed feature) | Editor (2601, also accepts legacy 'COMMISSIONING') | – | customer_name | Its next stage is COMPLETED, which opens a confirmation dialog (CDM:1936-1943, 2021+). |
| 15 | `COMPLETED` | Completed | none (removed from nav; forced back to LEADS) | redirect to LEADS (325,731) | – | – | Terminal. isCompleted makes the record frozen for everyone, and only an admin can unlock it (CDM:266-269,1683). Footer Pause is hidden (1876). Metrics completedCount/liveProjects (01:337-338). completed_at is set only by move_stage (01:359). Excluded in InstallationView.jsx:53,68,118 and LoanView.jsx:48,68,114. solarStats installed capacity (solarStats.js:45). Card styling (CustomerCard.jsx:20). Today-summary exclusion (Dashboard.jsx:88). |
| 16 | `LOST PROJECT` (LOST_PROJECT) | Lost Project | HoldProcurementTab (hidden from nav; reached via 'Pause / Move to Lost Project' CDM:1090-1151,1876-1896) | inline view (2298) | – | – | Terminal parking. Writes hold_procurement {previous_stage, hold_date}. Resume sets stage = previous_stage (HoldProcurementTab.jsx:151-178). Never chosen as a next stage (CDM:886-890). Footer hidden (1899). The card path also writes hold_procurement (Dashboard.jsx:1088-1100). Metrics liveProjects (01:338), DashboardView Lost tile (162), solarStats skip (33). |

Reserved non-stage tab ids in the modal: `DOCUMENTS`, `history`, `CUSTOMER_CARD`. Legacy aliases still accepted in AgentPortal: `MATERIAL INSTALLATION`, `COMMISSIONING`. A comment at Dashboard.jsx:1286-1292 says `HOLD PROCUREMENT` is no longer stored.

### Where stage ids flow (every consumer)
- **Label lookup only** (safe once PRIMARY_STAGES is config-driven): utils.jsx:303,418 (exportAllToCSV, which is never called), CustomerCard.jsx:185, TrashView.jsx:40,165, DeliveryBatchesView.jsx:1191, Dashboard.jsx:1347,1498, AgentPortal.jsx:1116,1232,1447, VendorPortal.jsx:78, HoldProcurementTab.jsx:183, CDM:1094,1774.
- **Iterates the whole list**: DashboardView.jsx:276 (bar chart), CustomerCard.jsx:211 (admin override), AgentPortal.jsx:1190 (sidebar), HoldProcurementTab.jsx:227 (origin select), seed200.js:47 (demo).
- **Order or index semantics**: CDM:871-918 (next stage), VendorPortal.jsx:60-76 (future/past tab), AgentPortal.jsx:757-760 (isFutureStage).
- **Raw id shown without label**: LoanView.jsx:341, SubsidyView.jsx:325 (`c.stage || 'LEADS'`), DataExportView (raw column).
- **History / activity**: `logActivity(user.id,'stage_change',..., 'Stage: OLD → NEW', id)` in CDM:1060,1143,1378, Dashboard.jsx:1132, AgentPortal.jsx:809 (logStageMove) and HoldProcurementTab.jsx:170. Vendor stage moves log as 'update' (VendorPortal.jsx:760). The move_stage RPC logs 'update' with message 'OLD → NEW' (01:362). Stage remarks are stored as `stages_remarks[stageId]` (CDM:791-839, handleSaveStageRemark), cleared on advance (CDM:964-967) and appended to internal_remarks with the raw id.

## (2) Structural vs safely removable

**Structural (keep; only the label can change; the id is fixed):**
- `LEADS`: the entry stage. DB default, models.jsx:82, many fallbacks (CDM, HoldProcurementTab, AgentPortal), the card-override exit validation, and the created_at month filter.
- `COMPLETED`: terminal success. Freezes the record, drives completed_at and metrics (RPC, solarStats, InstallationView, LoanView, Dashboard today summary), is removed from the nav, and triggers the confirm dialog.
- `LOST PROJECT`: terminal parking. hold_procurement.previous_stage and Resume, the Pause button, metrics liveProjects and the lost tile, excluded from the next-stage walk. It could be hidden by turning off the Pause button, but code assumes the id exists, so keep it in the catalog.

**Feature-coupled (removable only together with a feature, or after the refactor):**
- `LOAN` and `CASH`: payment_type branching (CDM:880-890,1707-1708; AgentPortal.jsx:1500-1501), the REGISTRATION gate, LoanView, Loan tracking (Dashboard.jsx:1740). Removing LOAN means Loan tracking is off, or LoanTab is kept as a non-pipeline panel. Removing CASH is safe once the skip logic is generic.
- `MATERIAL INTEGRATION`: BOM maker (saveBomRef, `_autoPrintBom`, agent BOM view). Keep it if the BOM maker is on.
- `MATERIAL DELIVERY`, `INSTALLATION STATUS`, `GEO TAG PHOTO` (and `DISCOM SUBMISSION` as the vendor's exit stage): the Vendor login sub-pipeline (VendorPortal TAB_STAGE_MAP and hard-coded moves). INSTALLATION STATUS also drives Installation tracking (RPC count, defaultTab). MATERIAL DELIVERY is only the default delivery-picker filter; stock is unaffected.
- `MATERIAL ORDER`, `METER INSTALLATION`, `DISCOM INSPECTION`, `DISCOM SUBMISSION`: agent portal editors, hard-coded agent moves, agent edit and upload permissions (CDM:278; AgentPortal.jsx:657-659).
- `SUBSIDY STATUS`: Subsidy tracking opens this tab.

**Safely removable or renamable (generic code only):** `REGISTRATION` (its month filter and payment_type gate simply disappear, since payment_type is also on LeadsTab), `FINAL REVIEW` (SUBSIDY STATUS then goes straight to COMPLETED; the confirm dialog still works because it checks nextStageId===COMPLETED), `CASH` (after the generic skip), and all custom stages. Renaming the label is safe for all 16 stages, because labels are display-only and every persisted value uses the id.

**Reorder:** safe for the generic modal walk as long as LEADS stays first and COMPLETED and LOST PROJECT stay last. Not safe across the hard-coded agent and vendor transitions until those use getNextStageId.

## Database findings
- `admin.stage text not null default 'LEADS'` (01_solarflow_demo.sql:141): no CHECK, enum or FK, so new ids need no DDL.
- `move_stage(uuid,text,text,text)` (01:350-365): hard-coded 16-id allow-list. Sets completed_at. Writes stages_remarks[old]=''. Optimistic `where stage=p_old_stage`. Granted to authenticated (388-390). Only caller: Dashboard.jsx:1058.
- `get_dashboard_metrics_scoped` (01:329-344): stageCounts is dynamic (jsonb_object_agg). Literals COMPLETED, LOST PROJECT, INSTALLATION STATUS. Wrapped by get_dashboard_metrics (346) and get_cpo_dashboard_metrics (09_cpo_lead_scope.sql:124-128).
- `cpo_leads` view = `select * from admin` (09:115, 18, 19:367-374), with a security_invoker restrictive policy `cpo_lead_scope` (19:357-366). No stage references in RLS.
- Stock: `issue_delivered_bom_stock` trigger keyed on delivery_status (22:241-337). `save_delivery_batch_atomic` and `update_delivery_batch_status_atomic` (19:469,598) never touch stage.
- Stage index `admin_stage_idx` (01:282) includes demo_session_id, so it is dropped by 19's `drop column ... cascade`, and nothing re-creates it.
- Demo seeds with stage literals: 01:293, 02:30,144, 05:16, 08:48, 10:140-270, 11:91-225. Exclude these from client setup.
- Edge functions (supabase/functions/*) and supabase/migrations/* (enquiry flow) do not reference stages.

## (3) Generic CustomStageTab design

### Config shape (client config file, generated by the setup form)
```js
pipeline: {
  groups: [ { id: 'enquiry', label: 'Enquiry & finance' }, { id: 'materials', label: 'Materials & installation' }, { id: 'approvals', label: 'Approvals & subsidy' }, { id: 'closed', label: 'Closed projects' } ],
  stages: [   // order = pipeline order; LEADS first, COMPLETED/LOST PROJECT pinned last
    { id: 'LEADS', label: 'Enquiries', group: 'enquiry' },            // built-in: label/group/guidance override only
    { id: 'CASH', enabled: false },                                   // built-in removed
    { id: 'SITE SURVEY', custom: true, label: 'Site Survey', icon: 'ClipboardList', group: 'materials',
      guidance: 'Record the survey before ordering material.',
      agentVisible: true, agentEditable: false, viewOnlyFor: [],
      fields: [
        { key: 'survey_date', label: 'Survey Date', type: 'date', required: true },
        { key: 'surveyor', label: 'Surveyor', type: 'select', options: ['Team A','Team B'] },   // or optionsFrom: '<metadata category>'
        { key: 'roof_ok', label: 'Roof OK', type: 'yesno', required: true, mustEqual: 'Yes' },
        { key: 'roof_area_sqft', label: 'Roof Area (sq ft)', type: 'number' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
        { key: 'survey_photo', label: 'Survey Photo', type: 'file' }   // uses documents table, doc_type 'custom__site_survey__survey_photo'
      ] },
    ...
  ]
}
```
Built-ins get `hideWhenPaymentType` (LOAN: ['cash'], CASH: ['loan']) and `terminal` (COMPLETED, LOST PROJECT) from BUILTIN_STAGES, not from the client.

### Generic walk (replaces CDM:871-918 and the agent/vendor fixed destinations)
```js
export const isStageApplicable = (s, rec) => !(s.hideWhenPaymentType || []).includes(String(rec?.payment_type || '').trim().toLowerCase());
export function getNextStageId(rec) {
  if (!rec?.stage || rec.stage === STAGE_IDS.COMPLETED || rec.stage === STAGE_IDS.LOST_PROJECT) return null;
  const i = PRIMARY_STAGES.findIndex(s => s.id === rec.stage); if (i === -1) return null;
  for (let j = i + 1; j < PRIMARY_STAGES.length; j++) {
    const s = PRIMARY_STAGES[j];
    if (s.id === STAGE_IDS.LOST_PROJECT) continue;
    if (isStageApplicable(s, rec)) return s.id;
  }
  return null;
}
```

### Router change (CustomerModalTabsRouter.jsx:19)
```jsx
const def = STAGE_BY_ID[activeTab];
if (def?.custom) return <CustomStageTab {...props} stage={def} />;
// existing built-in lines stay; optionally append <CustomFieldsSection {...props} stage={def}/> when def.fields?.length (extra fields on built-in stages)
```

### Props CustomStageTab receives (from tabProps, CustomerDetailModal.jsx:1501-1525)
`stage` (config def, added by the router), `editData`, `setEditData` (= handleEditDataChange: functional updater that recomputes isFormDirty), `customer` (= savedDataRef.current baseline), `isEditable` (already includes the frozen/COMPLETED lock, canUserEdit and the role-restriction flags), `editingSection` / `setEditingSection` (pencil pattern via SectionHeader), `meta` (metadata dropdown options, for optionsFrom), `user`, `isAdmin`, `isOffice`, `documents`, `onFileUpload(e, docType, replacingDocId)`, `onFileDelete`, `onFilePreview`, `onDownloadDocument`, `onUpdateRemark`, `onUpdate` (= handleSectionUpdate: writes the patch and rebases the baseline), `logActivity`, `fetchLogs`, `saving` / `setSaving`, `onDirty`. Do not use `handleChange`: it only sets top-level fields.

### How save works today (pattern to copy)
1. **Footer-save pattern** (DiscomInspectionTab.jsx:60-62 uses `setEditData(prev => ({...prev, discom_inspection: tag.id}))`; FinalReviewTab uses handleChange plus SectionHeader/EditableDetailItem). The tab only mutates editData. The footer **Save** calls `handleSave` (CDM:1153), which:
   - flushes the BOM;
   - re-reads the row for the concurrency check;
   - calls `getChangedFields(updates, savedDataRef.current)` and sends only changed keys through `onUpdate`, which is Dashboard.handleUpdateCustomer (Dashboard.jsx:806): `sanitizeAdminUpdate`, then `supabase.from('admin').update(clean).eq('id',id).select('id')`, treating 0 rows as a failure;
   - re-reads the saved row as the new baseline.
   **Save & Move** calls `handleAdvanceStage` (CDM:927), which first runs `missingStageRequirements(editData.stage, editData)`, then writes the narrowed patch plus `stage` and `stages_remarks`, then logs stage_change.
2. **Section-save pattern** (handleSaveRegChecklist CDM:701-718, HoldProcurementTab save): `if (await onUpdate(customer.id, patch) === false) return; await logActivity(user.id,'update', msg,'',customer.id); fetchLogs();`.

### CustomStageTab sketch (src/components/modal-tabs/CustomStageTab.jsx)
```jsx
import { ClipboardList } from 'lucide-react';
import { SectionHeader, EditableDetailItem, CheckboxRemarkItem } from './shared';
export default function CustomStageTab({ stage, editData, setEditData, isEditable, editingSection, setEditingSection, meta, user,
  documents = [], onFileUpload, onFileDelete, onFilePreview, onUpdateRemark }) {
  const sectionId = `custom:${stage.id}`;
  const all = editData.custom_data && typeof editData.custom_data === 'object' ? editData.custom_data : {};
  const values = all[stage.id] || {};
  const editing = isEditable && editingSection === sectionId;
  const setField = (key, value) => setEditData(prev => {
    const cd = prev.custom_data && typeof prev.custom_data === 'object' ? prev.custom_data : {};
    return { ...prev, custom_data: { ...cd, [stage.id]: { ...(cd[stage.id] || {}), [key]: value } } };
  });
  const canDeleteDocs = ['admin','sales'].includes(user?.userType);
  return (<div className="space-y-4 animate-in fade-in duration-300"><section>
    <SectionHeader title={stage.label} id={sectionId} icon={ClipboardList} isEditable={isEditable} editingSection={editingSection} setEditingSection={setEditingSection} />
    <div id={`section-${sectionId}`} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {stage.fields.map(f => f.type === 'file'
        ? <CheckboxRemarkItem key={f.key} label={f.label} field={`custom__${stage.id.toLowerCase().replace(/\W+/g,'_')}__${f.key}`}
            value={!!values[f.key]} onChange={(_, v) => setField(f.key, v)} isEditing={isEditable} documents={documents}
            onUpload={onFileUpload} onDelete={onFileDelete} onPreview={onFilePreview} onUpdateRemark={onUpdateRemark} canDelete={canDeleteDocs} />
        : <EditableDetailItem key={f.key} label={f.required ? `${f.label} *` : f.label} field={f.key} value={values[f.key]}
            onChange={(_, v) => setField(f.key, v)} isEditing={editing}
            type={f.type === 'date' ? 'date' : f.type === 'textarea' ? 'textarea' : 'text'}
            options={f.type === 'yesno' ? ['Yes','No'] : f.optionsFrom ? (meta?.[f.optionsFrom] || []) : f.options} />)}
    </div></section></div>);
}
```
Notes:
- EditableDetailItem's onChange is `(field, value)`, so it is wrapped. `options` without `category` renders a plain select; `type='date'` and `'textarea'` are supported (shared.jsx:300-353).
- Uploads go through handleFileUpload. A custom doc_type that is not in DOC_TYPE_FLAG_COLUMN skips the flag-column write, and its label falls back to a title-cased doc_type (CDM:29-33,571). documents.doc_type is plain text with no constraint (01:201).
- Numbers inside jsonb are not coerced by ADMIN_NUMERIC_COLUMNS. Store them as strings, or parse with parseIndianNumber in setField.

### Requirements for custom stages
Extend stageRequirements at module load from config:
`stageRequirements[s.id] = s.fields.filter(f => f.required).map(f => [d => d?.custom_data?.[s.id]?.[f.key], f.label, f.mustEqual ? v => String(v||'').trim() === f.mustEqual : undefined])`.
Change missingStageRequirements to accept a getter (`typeof field === 'function' ? field(data) : data[field]`). The modal banner (CDM:1836) and the Save & Move gate then work unchanged. The agent portal should call the same function instead of its inline checks.

### Activity log
Add next to the subsidy_history diff in handleSave (around CDM:1253): for each stage key and field key whose value differs between `customer.custom_data` and `updates.custom_data`, push `${label(stage)} > ${fieldLabel}: ${old||'None'} → ${new||'None'}` into changeSummary. Without it, custom edits are invisible because object values are skipped (1243-1247).

### Other places that must learn about custom stages
- Dashboard STAGE_GROUPS and STAGE_GUIDANCE come from config; otherwise there is no sidebar entry.
- AgentStageDetails STAGE_FIELDS gets `[f.label, \`custom_data.${id}.${f.key}\`]`. readPath already handles dotted paths, and the AgentPortal exclusion list (1557-1566) lets custom stages fall through.
- DataExportView flattens custom_data.
- The delivery picker builds its stage options from config.
- move_stage accepts custom ids.

### Minimal SQL (client setup script)
```sql
-- 1. Storage for custom-stage fields (and extra fields on built-in stages)
alter table public.admin add column if not exists custom_data jsonb not null default '{}'::jsonb;

-- 2. cpo_leads is `select *`; its column list is frozen at creation, so re-create it after adding the column
drop view if exists public.cpo_leads;
create view public.cpo_leads with (security_invoker = true) as
  select * from public.admin
  where public.current_demo_cpo() is not null and public.can_view_demo_lead(lead_creator_profile_id);
grant select on public.cpo_leads to authenticated;

-- 3. move_stage: replace the 16-id allow-list (generate the array from client config, or validate format only)
create or replace function public.move_stage(p_customer_id uuid, p_new_stage text, p_old_stage text, p_remark text default '')
returns public.admin language plpgsql security invoker set search_path = '' as $$
declare row public.admin;
begin
  if p_new_stage is null or p_new_stage !~ '^[A-Z0-9][A-Z0-9 _-]{0,47}$' then raise exception 'Unknown stage'; end if;
  update public.admin set stage = p_new_stage,
    stages_remarks = coalesce(stages_remarks,'{}') || jsonb_build_object(p_old_stage,''),
    completed_at = case when p_new_stage = 'COMPLETED' then now() else null end
  where id = p_customer_id and stage = p_old_stage and deleted_at is null returning * into row;
  if not found then raise exception 'Record unavailable or stage changed; refresh first'; end if;
  insert into public.activity_log(user_id, customer_id, action, message, new_value)
  values (auth.uid(), p_customer_id, 'stage_change', p_old_stage || ' → ' || p_new_stage, coalesce(p_remark,''));
  return row;
end $$;
revoke all on function public.move_stage(uuid,text,text,text) from public, anon;
grant execute on function public.move_stage(uuid,text,text,text) to authenticated;
```
Recommended extras:
```sql
-- Stage index (the original was dropped by 19's CASCADE)
create index if not exists admin_stage_live_idx on public.admin(stage, updated_at desc, created_at desc) where deleted_at is null;

-- Per-stage merge, so two editors of different custom stages don't overwrite each other (RLS still applies: security invoker)
create or replace function public.set_custom_stage_data(p_customer_id uuid, p_stage text, p_values jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  update public.admin
     set custom_data = jsonb_set(coalesce(custom_data,'{}'::jsonb), array[p_stage],
                                 coalesce(custom_data->p_stage,'{}'::jsonb) || coalesce(p_values,'{}'::jsonb), true)
   where id = p_customer_id and deleted_at is null
  returning custom_data;
$$;
grant execute on function public.set_custom_stage_data(uuid,text,jsonb) to authenticated;

-- completed_at on every path (the modal advance never sets it today)
create or replace function public.stamp_completed_at() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stage = 'COMPLETED' and old.stage is distinct from 'COMPLETED' then new.completed_at := now();
  elsif new.stage <> 'COMPLETED' then new.completed_at := null; end if;
  return new;
end $$;
create trigger admin_stamp_completed_at before update of stage on public.admin for each row execute function public.stamp_completed_at();
```
On the frontend, add 'custom_data' to ADMIN_COLUMNS (constants.js:390). No change is needed to the metrics RPC: custom stages are counted through stageCounts automatically.

## Inventory of hard-coded stage literals outside constants (replace with STAGE_IDS or config)
- **Dashboard.jsx:** 88 ("COMPLETED","LOST PROJECT"), 168-185 STAGE_GUIDANCE, 187-192 STAGE_GROUPS, 1635 'LEADS', 751 'Leads'.
- **Other components:** CustomerCard.jsx:20; DashboardView.jsx:162,287; HoldProcurementTab.jsx:22,63,153,227; DeliveryBatchesView.jsx:280,392,413,1469-1471; LoanView.jsx:341; SubsidyView.jsx:325.
- **AgentPortal.jsx:** 834 'MATERIAL ORDER', 2348 'MATERIAL INSTALLATION', 2601 'COMMISSIONING', and the key-as-id bug at 749-755 and 924.
- **Other src files:** delivery/projectPicker.js:4; dashboard/solarStats.js:33,45; models.jsx:82; demo/stageRequirements.js (keys); utils/validation.js:109 (payment_type, not stage).
- **Demo-only:** demo/deliveryBatches.js:1, demo/seed200.js:65,91, demo/tourSteps.js (many), dev/tourPreview.jsx:39.