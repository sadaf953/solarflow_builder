# tabs-and-forms

## summary
I audited 11,122 lines across 17 modal-tabs, shared.jsx, CustomerDetailModal (CDM), the router, AddLeadModal, AgentStageDetails and HistoryEntryEditor. About 2,800–3,200 lines (25–30%) are duplicated or dead.

**What shared.jsx already provides, and where tabs ignore it:**
- **SectionHeader** is copied out by hand in 5 places: LeadsTab, RegistrationTab, MaterialOrderTab, MaterialDeliveryTab and LoanTab. CDM also has a 6th private copy that is never rendered.
- **EditableDetailItem and MetaSelect** are skipped by about 45 hand-built label+input blocks.
- **StageRemarkSection and PaymentsEditor** have no callers at all. CDM and CashTab write their own versions instead.
- **ChannelPartnerAutocomplete and MetaSelect** are duplicated inside AddLeadModal.
- **DocRemarkRow and DocGalleryRemarkRow** are about 90-line near-twins inside shared.jsx itself.
- **The vendor list fetch** is cached in shared.jsx, but the vendor picker and its confirm modal around it are still written twice (MaterialDelivery and InstallationStatus).

**About 340 lines are dead and can be deleted at zero risk:**
- HistoryEntryEditor.jsx (imported, never rendered)
- StageRemarkSection and PaymentsEditor
- CDM's private SectionHeader, 15 unused tab imports and an unused Page1 import
- MaterialDeliveryTab's parsePanelSerials and serial-count code
- utils/customerDetailHandlers.js

**Biggest repeated patterns:**
- The save sequence (onUpdate → stop on failure → logActivity → fetchLogs → setSaving) is written out about 40 times.
- 7 Yes/No and status-tag button groups.
- About 20 section-card headers.
- 24 CheckboxRemarkItem calls that each pass the same 8–10 props.
- 2 status-timeline + add-entry blocks (Loan and Subsidy).
- 9 separate `canDeleteDocs` definitions, using 2 different rules.
- The lead field list exists in 8 places.
- Required-field asterisks are typed into labels by hand, separately from stageRequirements.js.

**A config-driven `<FieldRenderer>`/`<StageForm>` could fully or mostly replace these tabs:** FinalReview, Registration, DiscomInspection, MeterInstallation, GeoTag, MaterialOrder and Leads. Cash, Subsidy and HoldProcurement could be about 70–85% config plus a small custom block. The same config would drive AddLeadModal and AgentStageDetails, and client custom fields stored in a `custom_fields` JSON column.

**Must stay custom, but rebuilt from the shared pieces:** Loan, MaterialIntegration, MaterialDelivery, InstallationStatus and DiscomSubmission. Their bespoke logic is loan payments and the feasibility PDF, the BOM and serial scanner, vendor assignment and printing, the give-up approval, and the stamp-maker workflow.

**Lazy loading:** the router imports all 15 tabs statically, so they all ship together with CDM in one chunk. It should become a lazy map gated by feature switches. The heavy pieces should also load lazily: VendorCalendarView (33KB), inventory/reference.json (72KB), BomPrintModal, SerialScanner, AgreementPreview/Page1 and feasibilityReport.

## candidates
### Dead-code purge (no new component) (risk low, ~340 lines)
Delete code that is never rendered or never called before any refactor, so the duplication counts below are not inflated
- replaces: src/components/HistoryEntryEditor.jsx:1-125 (imported at CustomerDetailModal.jsx:23, zero JSX usages); src/components/modal-tabs/shared.jsx:136-192 (StageRemarkSection, zero consumers); src/components/modal-tabs/shared.jsx:866-938 (PaymentsEditor, zero consumers); src/components/CustomerDetailModal.jsx:1477-1499 (local SectionHeader, never rendered); src/components/CustomerDetailModal.jsx:25,36-50,53 (Page1 + 15 tab imports + DocGalleryRemarkRow import, all unused; router renders tabs); src/components/modal-tabs/MaterialDeliveryTab.jsx:2-3,9-32,64-68 (unused icons/SectionHeader, parsePanelSerials, panelSerials/filledCount); src/utils/customerDetailHandlers.js:1-16 (duplicate getStageRemarkFromData, never imported)
- notes: Check with a build before deleting. The JSX counts were grep-verified: no <HistoryEntryEditor>, <SectionHeader>, <Page1> or tab components are rendered in CDM, and StageRemarkSection/PaymentsEditor appear only in shared.jsx.

### useStageSave (hook) (risk low, ~170 lines)
Single save-and-log path: save(patch, logMessage, {action, onSuccess}) wraps setSaving, onUpdate===false short-circuit, logActivity(user.id, action, `${customer_name}: msg`, '', customer.id) and fetchLogs; returns boolean
- replaces: src/components/modal-tabs/CashTab.jsx:179-187; src/components/modal-tabs/DiscomSubmissionTab.jsx:108-113,131-138,158-163,180-191,222-234,272-290,311-323,651-657,903-914; src/components/modal-tabs/HoldProcurementTab.jsx:126-149,151-181; src/components/modal-tabs/InstallationStatusTab.jsx:60-88,118-127,271-289,325-334,472-513; src/components/modal-tabs/LoanTab.jsx:64-119,179-195,310-315,356-363,379-386,890-922; src/components/modal-tabs/MaterialDeliveryTab.jsx:171-180,272-281,628-670; src/components/modal-tabs/SubsidyStatusTab.jsx:35-75,228-261; src/components/CustomerDetailModal.jsx:701-720,731-748,791-839
- notes: Keep these existing behaviours: MaterialDelivery's delivery-status select rolls local state back on failure (281); DiscomSubmission throws so actionError is set (109,132,159,181,223); HoldProcurement guards logActivity/fetchLogs with `if (logActivity && user?.id)`; SFDC save calls onSfdcSaved (InstallationStatusTab:124); MaterialIntegration's scan logging is fire-and-forget (143-145). onUpdate is CDM.handleSectionUpdate, which already merges the patch into savedDataRef, so the hook must not double-merge.

### <TagPicker> (segmented status buttons) (risk low, ~110 lines)
One component for every Yes/No or status-tag selector, driven by an options array [{id,label,isFinal,activeClass|colors}]
- replaces: src/components/modal-tabs/DiscomInspectionTab.jsx:51-76; src/components/modal-tabs/MeterInstallationTab.jsx:60-90; src/components/modal-tabs/GeoTagPhotoTab.jsx:88-114; src/components/modal-tabs/InstallationStatusTab.jsx:188-217; src/components/modal-tabs/HoldProcurementTab.jsx:258-278; src/components/modal-tabs/LoanTab.jsx:502-526; src/components/modal-tabs/SubsidyStatusTab.jsx:100-124
- notes: Props needed: cols (2/3/4/8), allowDeselect (Loan, Subsidy, Hold, Installation toggle off on reselect; DiscomInspection, Meter and GeoTag do not), lockWhenFinal + adminOverride via isFinalTagValue (Loan, Subsidy, Installation), and two styles (solid activeClass vs pastel colorMap bg/text/border/dot). The onSelect side effects stay in the caller or a config `effects`: Meter sets installation_date to today or '' (MeterInstallationTab:72-77); Installation fills in the date and resets give-up approval (InstallationStatusTab:45-58). InstallationStatusTab hard-codes its tags (189-194) in a different order from INSTALLATION_TAGS (constants.js:195).

### <SectionCard> + extended <SectionHeader> (risk low, ~180 lines)
Card shell (title, subtitle, icon badge with tone, right-side actions slot) and pencil-toggle header with scroll-into-view; supports controlled editingSection OR local boolean
- replaces: src/components/modal-tabs/LeadsTab.jsx:55-82; src/components/modal-tabs/RegistrationTab.jsx:54-81; src/components/modal-tabs/MaterialOrderTab.jsx:67-83; src/components/modal-tabs/MaterialDeliveryTab.jsx:142-154,259-313; src/components/modal-tabs/LoanTab.jsx:289-303,418-423,471-493,531-561,816-820; src/components/modal-tabs/DiscomInspectionTab.jsx:39-48; src/components/modal-tabs/MeterInstallationTab.jsx:48-57; src/components/modal-tabs/GeoTagPhotoTab.jsx:76-85,119-127; src/components/modal-tabs/InstallationStatusTab.jsx:95-98,144-164; src/components/modal-tabs/DiscomSubmissionTab.jsx:251-256,302-331,837-845; src/components/modal-tabs/SubsidyStatusTab.jsx:80-91,129-133,150-154; src/components/modal-tabs/HoldProcurementTab.jsx:208-213; src/components/modal-tabs/CashTab.jsx:68-79; src/components/modal-tabs/FinalReviewTab.jsx:26-31; src/components/modal-tabs/CustomerDocumentsTab.jsx:43-62; src/components/modal-tabs/shared.jsx:941-967
- notes: There are two card shells today: `bg-white p-6 rounded-[24px] border-stone-100 shadow-sm` (15 uses) and `bg-white p-5 rounded-2xl border-stone-200/70 shadow-xs` (Loan ×5, Hold ×1). Pick one or add a `density` prop. Scroll-on-open is inconsistent: Leads, Registration and shared scroll; MaterialOrder and MaterialDelivery do not. LoanTab's App Details pencil uses local state (LoanTab:40,297), so the header needs to support an uncontrolled mode.

### <InfoBanner> (risk low, ~55 lines)
Permission/view-only/not-applicable/frozen notices: tone (amber|blue|rose|emerald), icon, title, body
- replaces: src/components/modal-tabs/DiscomInspectionTab.jsx:27-37; src/components/modal-tabs/MeterInstallationTab.jsx:35-45; src/components/modal-tabs/GeoTagPhotoTab.jsx:53-73; src/components/modal-tabs/MaterialOrderTab.jsx:54-64,85-98; src/components/modal-tabs/InstallationStatusTab.jsx:139-143,182-187; src/components/modal-tabs/CashTab.jsx:63-66; src/components/modal-tabs/LoanTab.jsx:282-285,495-500; src/components/modal-tabs/SubsidyStatusTab.jsx:93-98; src/components/CustomerDetailModal.jsx:1736-1765
- notes: The stage config can declare `banner: {when: ctx => !canEdit, tone, title, text}` so tabs do not each recompute role flags. MaterialOrderTab uses a compact size (p-2.5, w-4); the others use p-4, w-5.

### <Field> / <FieldRenderer> + input registry (risk medium, ~550 lines)
One labelled control for text/number/money/date/textarea/select/autocomplete/phone/url with three modes (edit, view, disabled) and variants (tile = current EditableDetailItem look, form = AddLeadModal look, compact = payment-card look). Select handles case-insensitive matching and keeps an unknown stored value visible. View mode reuses DetailItem formatting (tel link, url link, money, capacity commas). Supports dot-paths (discom_submission.stamp_value, hold_procurement.comment, custom_fields.x).
- replaces: src/components/modal-tabs/shared.jsx:84-133,195-233,300-353 (become thin wrappers); src/components/modal-tabs/CashTab.jsx:83-94,106-155; src/components/modal-tabs/DiscomSubmissionTab.jsx:334-415,849-870; src/components/modal-tabs/HoldProcurementTab.jsx:217-250,282-298; src/components/modal-tabs/InstallationStatusTab.jsx:405-442; src/components/modal-tabs/MaterialDeliveryTab.jsx:320-368; src/components/modal-tabs/MeterInstallationTab.jsx:93-107; src/components/modal-tabs/LoanTab.jsx:305-393,857-887; src/components/modal-tabs/SubsidyStatusTab.jsx:191-225; src/components/modal-tabs/MaterialIntegrationTab.jsx:894-984; src/components/modal-tabs/MaterialOrderTab.jsx:150-165; src/components/modal-tabs/LeadsTab.jsx:148-178; src/components/AddLeadModal.jsx:18-32,604-990
- notes: The variants must reproduce today's three visual densities. Tabs bypass EditableDetailItem because they need disabled inputs instead of read-only tiles, nested JSON paths, autosave on blur (LoanTab:337-341,356-364,379-387) and 'not in list' option labels (MaterialIntegrationTab:907-909,942-944). The keep-unknown + case-insensitive select logic is copied 7 times: shared.jsx:126-128,322-324; LoanTab:320-322; LeadsTab:156-168; AddLeadModal:946-961; MaterialIntegrationTab:907-909,942-944. Sanitizers (digits, phone, 6-digit pincode) live today in CDM.handleChange:841-856, AddLeadModal.handleChange and LeadsTab:92, and should move to field defs. EditableDetailItem silently ignores the `user`/`meta` props callers pass (RegistrationTab:101, LeadsTab:125-126, MaterialIntegrationTab:660).

### Field registry + <FieldGrid>/<StageForm> (config-driven stages) (risk medium, ~420 lines)
Single source of truth `src/config/stages.js` + `fields.js`: per-stage sections of field defs {key,label,type,options|optionsSource,required,validate,numeric,sanitize,showIf,readOnly,roles,span,autoSave,effects}. StageForm renders sections of kind fields|documents|tags|timeline|reference|custom, and appends client custom fields. The same defs drive required asterisks, missingStageRequirements, numeric normalisation on save, AddLeadModal, and AgentStageDetails read-only rows.
- replaces: src/components/modal-tabs/LeadsTab.jsx:83-137; src/components/modal-tabs/RegistrationTab.jsx:83-118; src/components/modal-tabs/MaterialOrderTab.jsx:101-149,169-193; src/components/modal-tabs/MaterialIntegrationTab.jsx:560-641,643-672; src/components/modal-tabs/MaterialDeliveryTab.jsx:372-410; src/components/modal-tabs/FinalReviewTab.jsx:51-83; src/components/AgentStageDetails.jsx:5-81 (STAGE_FIELDS becomes derived); src/components/AddLeadModal.jsx:485-490 (string-coercion key list); src/components/CustomerDetailModal.jsx:975-992,1168-1190 (numeric normalisation, duplicated twice); src/demo/stageRequirements.js:5-20 (becomes derived from required/validate)
- notes: The lead field list currently lives in 8 places: LeadsTab, AddLeadModal, AgentStageDetails, MaterialOrderTab ref, MaterialIntegrationTab ref, models.jsx DEFAULT_LEAD_FORM, AddLeadModal:485-490 and validation.js:124. Required '*' markers are hand-typed in labels and can drift from stageRequirements. The module_wp fallback list is duplicated (LeadsTab:126, AddLeadModal:546). Keep per-field quirks as config: agent2 Dealer lock (LeadsTab:117-124), channel_partner admin-only edit because of RLS (LeadsTab:103-116), capacity Auto button (LeadsTab:34-41,128), bank fields showIf payment_type=loan (LeadsTab:95-100), and the payment_type title-case display (RegistrationTab:84). The reference blocks read customer||editData in opposite orders (MaterialOrderTab:178-191 vs MaterialIntegrationTab:626-639).

### <DocChecklist> + DocumentContext (and pending-file mode) (risk medium, ~330 lines)
Render a list of document items from config [{field,label,showIf,note}] via CheckboxRemarkItem without re-passing documents/onUpload/onDelete/onPreview/onUpdateRemark/canDelete; includes count badge, ChecklistModeToggle 'Fill demo docs', and dirty save bar. A `pending` mode (local File objects) replaces AddLeadModal's look-alike item.
- replaces: src/components/modal-tabs/LeadsTab.jsx:140-209; src/components/modal-tabs/RegistrationTab.jsx:24-43,120-185; src/components/modal-tabs/LoanTab.jsx:417-468; src/components/modal-tabs/DiscomSubmissionTab.jsx:251-299; src/components/modal-tabs/FinalReviewTab.jsx:25-45; src/components/modal-tabs/GeoTagPhotoTab.jsx:118-146; src/components/modal-tabs/InstallationStatusTab.jsx:95-135; src/components/modal-tabs/SubsidyStatusTab.jsx:129-147; src/components/AddLeadModal.jsx:101-220,922-1092; src/components/CustomerDetailModal.jsx:686-748 (REG_ and OPERATIONAL_ checklist save become one saveChecklist(fields,label))
- notes: The 8 lead documents and their payment_type!=='cash' gating appear 3 times (LeadsTab:181-195, AddLeadModal:997-1083, CDM:686-695), with a label mismatch for index_2: 'Vera Pavti / aakarni' (LeadsTab:188) vs 'Index 2' (AddLeadModal:1031). Per-item differences: Registration autosaves on check (RegistrationTab:45-49,147); GeoTag's onChange flips geo_tag_status (GeoTagPhotoTab:34-47); the stamp item has a dynamic `note` (DiscomSubmissionTab:521); InstallationStatusTab uses isSfdcEditable instead of isEditable. The dirty-save rules differ per tab: global dirty in Leads/FinalReview, field-compare in Discom (264-268) and Installation (114).

### <StatusTimeline> + <AddStatusEntry> + useTaggedHistory (risk medium, ~260 lines)
Shared tag-save-with-history, timeline rendering (colour from *_TAG_COLORS) and manual add-entry form for any {status,date,remark,created_at}[] JSONB column
- replaces: src/components/modal-tabs/LoanTab.jsx:34-36,56-104,815-932; src/components/modal-tabs/SubsidyStatusTab.jsx:21-75,149-270; src/components/CustomerDetailModal.jsx:1258-1332 (subsidy/loan diff copy → diffHistory(old,new,label)); src/components/HistoryEntryEditor.jsx:1-125 (dead; superseded)
- notes: Loan hides payment rows ('Down Payment','Total Quotation','Quotation') from the timeline (LoanTab:198) and has a Clear Tag action (106-119). The status options disagree with the constants: LOAN_STATUS_OPTIONS (LoanTab:9) has 'Rejected'/'Processed', but LOAN_TAGS has 'Reject'/'Inprocess'. Subsidy add-entry options (SubsidyStatusTab:199-203) omit 'Inprocess' and add 'Rejected', which is not in SUBSIDY_TAGS. Timeline pill colours are hard-coded (LoanTab:827-833, SubsidyStatusTab:161-167) and contradict the constants (Approved is emerald in the tab but indigo in SUBSIDY_TAG_COLORS). Decide which list is the source of truth before merging.

### <VendorAssignment> + useVendorAssignment (risk low, ~210 lines)
Vendor dropdown (cached fetchVendorNames), confirm-assign, save+log, send/resend vendor email with status text, remove-vendor flow
- replaces: src/components/modal-tabs/MaterialDeliveryTab.jsx:54-58,75-81,155-245,601-680; src/components/modal-tabs/InstallationStatusTab.jsx:31-43,306-397,445-523
- notes: Differences to keep as props: label/placeholder ('Assign New Vendor'/'Select New Vendor...'), log text 'for new vendor' (InstallationStatusTab:364), and failure message. Installation shows a fixed 'Failed to send' (390-393) while Delivery shows err.message (238-242). The confirm modal can become GlobalPopup.showConfirm. Delivery also shows a vendor-availability warning (MaterialDeliveryTab:247-257), which should be an optional slot.

### Replace inline confirm modals with useGlobalPopup().showConfirm (risk low, ~150 lines)
Use the confirm dialog already used by CheckboxRemarkItem/CustomerDocumentsTab/AddLeadModal instead of bespoke fixed-inset modals
- replaces: src/components/modal-tabs/DiscomSubmissionTab.jsx:50-53,712-834 (reassign/send/recall); src/components/CustomerDetailModal.jsx:2000-2046 (soft-delete, mark-completed)
- notes: The reassign dialog shows a From→To summary (DiscomSubmissionTab:725-741). Either pass that as message text or allow a ReactNode body in showConfirm. Vendor confirm modals are counted under VendorAssignment.

### <DocRemarkEditor variant='compact'|'gallery'> (risk low, ~80 lines)
One remark view/edit state machine for per-document remarks
- replaces: src/components/modal-tabs/shared.jsx:477-568 (DocRemarkRow); src/components/modal-tabs/shared.jsx:969-1059 (DocGalleryRemarkRow)
- notes: The two copies differ only in class sizes and the gate. Compact requires isEditing && onUpdateRemark to show '+ Add remark'; gallery requires only isEditable. Both keep the editor open when the save returns false.

### <PaymentEntryCard> (amount/date/remark group) (risk medium, ~170 lines)
Reusable locked/editable payment card with label, lock badge, Amount (INR formatting), Date, Remark/Ref; used by Loan breakdown and Cash tracker, and later by client-configured instalment schedules
- replaces: src/components/modal-tabs/LoanTab.jsx:569-767; src/components/modal-tabs/CashTab.jsx:98-158
- notes: Loan derives cards from loan_history rows by status and has per-tag edit locks (canEditDown/First/Second, LoanTab:151-153). Its read view shows '–' and 'Date:', and the 2nd card's badge reads 'Pending' vs 'View' (720-722). Cash uses a fixed array of 3 plus a Payment Type select (Cash/Online/DD/Cheque) and Transaction ID (CashTab:119-155). The card should take a `fields` array so both fit. The reconciliation summary bars (LoanTab:770-811, CashTab:162-194) can share a <TotalsBar>.

### ChannelPartnerAutocomplete / MetaSelect dedupe (risk low, ~80 lines)
AddLeadModal should import the shared autocomplete/select (with a `variant='form'`) instead of re-declaring them
- replaces: src/components/AddLeadModal.jsx:17-32 (AddLeadMetaSelect); src/components/AddLeadModal.jsx:34-102 (ChannelPartnerAutocomplete copy)
- notes: The AddLead copy has its own label and larger padding, and is missing the `String(s||'')` null-guard that shared.jsx:256 has. Note that shared's version takes an unused isAdmin prop.

### useChecklistMode (hook) (risk low, ~20 lines)
Subscribe once to 'solarflow-checklist-mode-changed' instead of three hand-written listeners
- replaces: src/components/modal-tabs/shared.jsx:577-585; src/components/modal-tabs/shared.jsx:618-626; src/components/CustomerDetailModal.jsx:150-158
- notes: Put it in utils/checklistMode.js next to get/setChecklistMode.

### usePermissions(user, stage) / role helpers (risk medium, ~45 lines)
Compute canDeleteDocs, canEditStage, isVendor/isAdmin/isCPO once (in CDM tabProps or a hook) and pass via context; stage config declares roles.edit
- replaces: src/components/modal-tabs/LeadsTab.jsx:46; src/components/modal-tabs/RegistrationTab.jsx:22; src/components/modal-tabs/LoanTab.jsx:32; src/components/modal-tabs/FinalReviewTab.jsx:20; src/components/modal-tabs/GeoTagPhotoTab.jsx:23-32; src/components/modal-tabs/SubsidyStatusTab.jsx:25; src/components/modal-tabs/DiscomSubmissionTab.jsx:64-69; src/components/modal-tabs/DiscomInspectionTab.jsx:16-20; src/components/modal-tabs/MeterInstallationTab.jsx:22-26; src/components/modal-tabs/MaterialOrderTab.jsx:26-33; src/components/modal-tabs/InstallationStatusTab.jsx:30
- notes: There are two different delete rules today. Seven tabs use userType in admin|sales|office. InstallationStatusTab:30 and CDM:276 use isAdmin||isOffice, where isOffice also matches role containing 'office' but excludes CPO/office2 (CDM:271). Unifying them changes who can delete documents in some tabs, so it needs the owner's decision.

### CustomerDetailModal internal helpers (risk low, ~90 lines)
Collapse duplicated logic inside the modal
- replaces: src/components/CustomerDetailModal.jsx:871-916 (hasNextStage and nextStageId walk the same list; hasNextStage = nextStageId != null); src/components/CustomerDetailModal.jsx:1780-1832 (inline stage-remark editor; reuse a fixed StageRemarkSection); src/components/CustomerDetailModal.jsx:797-805 and ~955-963 (stages_remarks JSON parse; reuse getStageRemarkFromData/parseRemarks); src/components/CustomerDetailModal.jsx:1501-1527 (tabProps aliases onUpload/onFileUpload, onDelete/onFileDelete/onDeleteDocument, onPreview/onFilePreview/onViewDocument, and 3 download aliases; pick one name)
- notes: LeadsTab:43-45 picks between those aliases (`onPreview || onFilePreview || onViewDocument`). Keep the aliases until callers are migrated. Pass tabs a single `docs` object via DocumentContext.

### parsePanelSerials consolidation (risk low, ~40 lines)
Use serials/record.js readModuleSerials everywhere
- replaces: src/components/modal-tabs/MaterialDeliveryTab.jsx:9-32 (dead); src/components/AgentStageDetails.jsx:87-96; src/components/modal-tabs/MaterialIntegrationTab.jsx:13-16 (thin wrapper, keep); (outside scope) src/components/AgentPortal.jsx:42, VendorPortal.jsx:18, BomPrintView.jsx:24
- notes: The copies differ: some split on '\n' then ',', and AgentStageDetails splits on /[\n,]/. Check readModuleSerials handles JSON arrays and comma lists before switching.

### BOM persistence service (move out of tab) (risk medium, ~30 lines)
Move loadBOM/saveBOM supabase logic (bom, bom_items transactional replace with restore, admin.bom_data, localStorage backup) into utils/bom.js so MaterialIntegrationTab is UI-only and can be lazy-loaded with a feature switch
- replaces: src/components/modal-tabs/MaterialIntegrationTab.jsx:179-207,221-242,245-514; src/components/modal-tabs/MaterialIntegrationTab.jsx:225-239 vs 463-481 (localStorage document built twice)
- notes: This mostly moves code rather than removing it. Keep the safety guards exactly as they are: refuse save when the load failed (255-260); ignore non-UUID ids (275-280); never insert after a failed read (290-301); compare delete count to snapshot (397-414); restore on insert failure (434-450). CDM calls this through saveBomRef on every save (CDM:1155-1165), so the service must keep the same contract.

### Lazy, feature-gated tab router (risk low, ~20 lines)
Turn CustomerModalTabsRouter into a map {stageId: config | lazyWithRetry(import)} with Suspense; stages switched off by client config are never fetched; config-only stages render <StageForm>
- replaces: src/components/CustomerModalTabsRouter.jsx:1-43; src/components/CustomerDetailModal.jsx:36-50 (static imports); src/components/CustomerDetailModal.jsx:1688-1695 (tab bar payment_type filter → config showIf)
- notes: lazyWithRetry already exists in utils.jsx:1262 and Dashboard.jsx:21-39 uses it. Lazy-load these within tabs too: VendorCalendarView (33KB, MaterialDeliveryTab:7, modal-only), BomPrintModal and SerialScanner (MaterialIntegrationTab:5,10, modal-only), inventory/reference.json (72KB, MaterialIntegrationTab:7, used only for an inverter_make fallback at 61-63), feasibilityReport (LoanTab:6, button-only) and AgreementPreview/Page1 (CDM:24, DiscomSubmissionTab:4). pdf-lib and @zxing are already dynamic. AddLeadModal is lazy in Dashboard but static in AgentPortal.jsx:18 and QuotationModule.jsx:4 (outside scope).


## details
## 1. Scale
- Audited 11,122 lines. The five largest files hold 57% of them: CDM (2,094), MaterialIntegration (1,185), AddLeadModal (1,139), shared.jsx (1,059) and LoanTab (956).
- Repeated pattern counts (grep): `=== false` save guards ×44, `logActivity(` ×47, `fetchLogs()` ×38, `<EditableDetailItem` ×75, `<CheckboxRemarkItem` ×24, card shell ×15+6, the 9px label class ×32, the emerald save-button class ×23, `canDeleteDocs` defined ×9, the unselected-tag class ×7, `fixed inset-0` modals ×14.
- Expected result: about 11.1k lines become about 8k, with about 1.2k lines of new shared code.

## 2. What shared.jsx has vs what tabs do anyway
| shared.jsx export | Status |
|---|---|
| SectionHeader (941-967) | Used by Cash, FinalReview, MaterialIntegration and History. Copied out by hand in Leads:55-82, Registration:54-81, MaterialOrder:67-83, MaterialDelivery:297-311 and Loan:290-303. CDM has its own dead copy at 1477. |
| EditableDetailItem / DetailItem / MetaSelect | Used for tile grids only. About 45 hand-built label+input blocks skip them (see the Field candidate). |
| StageRemarkSection (136-192) | No consumers. CDM:1780-1832 writes it inline. |
| PaymentsEditor (866-938) | No consumers. CashTab:98-158 and LoanTab:569-767 write their own. |
| ChannelPartnerAutocomplete (236-298) | Copied in AddLeadModal:34-102. |
| CheckboxRemarkItem | Widely used, but each of the 24 calls re-passes 8–10 identical props. AddLeadModal:101-220 rebuilds its look for pending files. Inside it, handleFileSelected and handleUploadSampleDoc repeat the same replace logic (664-674 vs 688-697). |
| DocRemarkRow / DocGalleryRemarkRow | Two near-identical copies of about 90 lines each. |
| fetchVendorNames | Cached, but the picker and confirm UI around it is duplicated in two tabs. |
| getStageRemarkFromData | Also duplicated, and unused, in utils/customerDetailHandlers.js. |

## 3. Proposed FieldRenderer / StageForm design
```js
// src/config/fields.js: one def per field (built-in or client custom)
{ key: 'roof_shed',           // dot-paths OK: 'discom_submission.stamp_value', 'custom_fields.site_type'
  label: 'Roof / Shed', type: 'select',      // text|number|money|date|textarea|select|autocomplete|phone|email|url|yesno|tags|document
  options: ['Roof','Shed'] | optionsSource: 'meta:registration_by' | 'vendors' | 'stampMakers' | 'tags:LOAN_TAGS',
  required: true, validate: 'positive' | fn,  // drives the asterisk AND missingStageRequirements
  numeric: true, sanitize: 'digits'|'phone'|'pincode',
  showIf: d => d.payment_type?.toLowerCase()==='loan', readOnly: ctx => ..., roles: { edit: ['admin','vendor'] },
  span: 'full', placeholder, note, autoSave: 'blur', logLabel: 'Updated Loan Date',
  effects: (value, prev) => ({ installation_date: value==='Yes' ? (prev.installation_date||today()) : '' }) }
// src/config/stages.js
[STAGE_IDS.MATERIAL_ORDER]: { feature: 'materialOrder', banner: {...}, sections: [
  { kind:'fields', id:'mat_order', title:'Material Order Specifications', icon:'ShoppingBag', editRoles:[...], fields:[...] },
  { kind:'reference', title:'Customer & Site Reference', fields: CUSTOMER_REFERENCE } ] },
[STAGE_IDS.LOAN]: { feature:'loan', component: () => import('../components/modal-tabs/LoanTab') }
```
- **Client custom fields** `{key,label,type,options,required}` map straight onto this def. They are stored in `admin.custom_fields` (JSONB) and resolved by dot-path. StageForm appends `clientConfig.customFields[stage]` as a final "Additional details" section. The same `required` flag feeds the advance-stage check. Save sends `custom_fields` as one merged object, so it fits CDM's `getChangedFields`.
- **Component tree:** `StageForm(stageCfg, ctx)` renders sections. Each section is either `SectionCard` + `SectionHeader` (pencil, editingSection) + `FieldGrid`, or `DocChecklist`, `TagPicker`, `StatusTimeline`, `ReferenceGrid`, or a lazy `custom` slot. `FieldGrid` renders `FieldRenderer`, which looks up `FIELD_TYPES[type]` (extensible for clients). `ctx = {editData, setEditData/handleChange, customer, user, meta, perms, docs(DocumentContext), save: useStageSave}`.
- **Read-only display:** AgentStageDetails:5-81 is already a config table (label, paths). Derive it from the same registry and render it with FieldRenderer in `view` mode.
- **Validation:** derive `stageRequirements` (src/demo/stageRequirements.js) from `required` and `validate`, so asterisks and the advance check cannot drift.

## 4. Tab classification
| Tab (lines) | Verdict | Notes |
|---|---|---|
| FinalReview (86) | Config 100% | doc checklist + 3 text fields |
| Registration (189) | Config 100% | 5 fields + 3 docs; checkbox autosave becomes `autoSave` on the doc section |
| DiscomInspection (81) | Config 100% | banner + yesno with editRoles |
| MeterInstallation (114) | Config about 95% | yesno + `effects` + conditional date |
| GeoTagPhoto (158) | Config about 90% | 3-tag picker + doc whose upload `effects` set status=Proceed; two role banners |
| MaterialOrder (196) | Config 100% | 7 fields + reference grid |
| Leads (212) | Config about 85% | Small hooks for capacity Auto-calc, agent2 Dealer lock and admin-only channel_partner |
| Cash (200) | About 70% config | needs a `repeat` group or PaymentEntryCard ×3 + TotalsBar |
| SubsidyStatus (273) | About 85% | TagPicker + DocChecklist + StatusTimeline |
| HoldProcurement (343) | About 70% | fields over hold_procurement.*; normaliser 19-98 is written twice (getHoldState and getSavedHoldState, about 40 lines saved); custom "Save & go back" action |
| History (84), CustomerDocuments (201) | Not stages | Keep; switch to SectionCard, Field and showConfirm |
| **Loan (956)** | Custom, about 450 after | payment breakdown from loan_history, per-tag locks, blur autosave, feasibility PDF with mobile native viewer, Clear Tag |
| **MaterialIntegration (1185)** | Custom, about 550 after | BOM table, serial editor + scanner, print; move BOM persistence to utils/bom; inverter/reference/milestones become config |
| **MaterialDelivery (725)** | Custom, about 400 after | VendorAssignment, availability warning, vendor calendar, dispatch-note print, delivery status synced with batches, admin commission |
| **InstallationStatus (526)** | Custom, about 280 after | give-up approval, reassign via VendorAssignment, SFDC doc |
| **DiscomSubmission (944)** | Custom, about 500 after | stamp-maker send/reassign/recall/approve/send-back + audit trail, agreement preview; the checklist and the 7 submission fields over discom_submission.* become config; 3 modals become showConfirm; direct supabase `demo_profiles` query (74-86) moves to a cached service like fetchVendorNames |

## 5. Lazy-loading plan
1. The router (CustomerModalTabsRouter.jsx:3-17) imports all 15 tabs statically, so every tab ships in the CDM chunk. Replace this with `stages.js`, where `component: lazyWithRetry(() => import(...))` loads only when the tab opens and the client's feature is on. A disabled stage is never imported.
2. Remove CDM's 15 unused tab imports (36-50) and the unused Page1 import (25). Load AgreementPreview (24) only when the popup opens.
3. Load modal-only heavy pieces lazily: VendorCalendarView (33KB), BomPrintModal, SerialScanner, AgreementPreview/Page1-4 (about 36KB) and the feasibilityReport module.
4. `inventory/reference.json` (72KB) is statically imported by MaterialIntegrationTab:7 just for `metadata.inverter_make`. Move that list into meta, or load it with a dynamic import.

## 6. Behaviour conflicts to decide before merging
- canDeleteDocs: two rules (see the usePermissions candidate).
- Status lists: LOAN_STATUS_OPTIONS vs LOAN_TAGS, the Subsidy add-entry list vs SUBSIDY_TAGS, and hard-coded timeline colours vs the *_TAG_COLORS constants.
- InstallationStatus tag order differs from INSTALLATION_TAGS.
- index_2 has different labels in Leads and AddLead.
- The vendor-email failure message differs between the two copies.
- Pencil scroll-into-view is inconsistent across sections.

## 7. Suggested order
1. Dead-code purge.
2. useStageSave, SectionCard/SectionHeader, InfoBanner, TagPicker, showConfirm, DocRemarkEditor, useChecklistMode (all low risk).
3. Field/FieldRenderer, then the config registry with FieldGrid/StageForm; convert FinalReview, Registration, DiscomInspection, Meter, GeoTag and MaterialOrder first.
4. DocChecklist + LEAD_DOCUMENTS, then Leads and AddLeadModal.
5. StatusTimeline, PaymentEntryCard and VendorAssignment, then slim Loan, Subsidy, Cash, Delivery and Installation.
6. Lazy router + feature switches.
7. BOM service and the DiscomSubmission cleanup.