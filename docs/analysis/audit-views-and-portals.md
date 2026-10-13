# views-and-portals

## summary
Read-only audit of 19 in-scope files (about 18.5k lines) plus src/utils.jsx, src/utils/*, src/constants.js, modal-tabs/shared.jsx, AgentStageDetails.jsx and CustomerModalTabsRouter.jsx. There is a lot of duplication.

- **Tag views:** SubsidyView, LoanView and InstallationView share 311–318 identical lines (about 87%), which is about 1,116 lines that one config-driven `<TagTrackingView>` can replace.
- **Copied infrastructure:** 11 hand-written "fetch every page" loops, 6 refresh-on-focus listeners, 7 realtime-subscription blocks, about 40 hand-built modal overlays (only 3 use the native `<dialog>` element), 166 input class strings in 101 variants, 57 rupee amounts formatted by hand, and 3 copies each of the month-name list and the mobile portal header.
- **Helpers already exist but go unused:** `useMetadata`, `getTodayISTDateString`, `normalizeAdminValues`/`updateAdminRecord`, `readModuleSerials`, `DetailRow`/`DetailItem`, `STAGE_FIELDS` and `.sf-input` are all there but bypassed.
- **Dead code:** about 770 lines can be deleted with no behaviour change, including 276 lines of AgentPortal JSX that can never render.
- **Lazy-loading gaps:**
  - The enquiry form loads on the login screen even though it is hidden.
  - The image-crop modal is part of the global popup provider, so every page loads it.
  - AgentPortal statically imports Toolbox, Quotations, Add Lead and Agreement, plus 14 tab files it never renders.
  - The customer modal's tab router imports all 15 stage tabs up front.
  - Switching a feature off cannot keep its code out of the download until views, stages and tabs come from a registry of `import()` calls that checks feature flags.
- **Real bugs found:** AgentPortal error messages are never shown, AgentPortal displays the wrong email field, the "Last month" filter does nothing, dates near midnight use UTC instead of India time, and the channel-partner filter matches names three different ways. Details below.

Combined estimate: about 5,000–5,600 fewer lines.

## candidates
### Dead-code removal (no new module) (risk low, ~770 lines)
Delete code that can never run or is never imported. Zero behaviour change and immediately lighter.
- replaces: src/components/AgentPortal.jsx:1850-1918, 1920-1954, 1990-2026, 2312-2346, 2374-2390, 2392-2443, 2569-2599 (7 blocks gated on displayedStage === '__REMOVED_*__' sentinel strings that can never match; 276 lines); src/components/AgentPortal.jsx:24-37 (14 modal-tab imports, none rendered); src/components/AgentPortal.jsx:1238-1252 (a duplicate search input inside className="hidden"); src/components/CustomerDetailModal.jsx:36-50 (15 tab imports never used as JSX; the router renders the tabs); src/utils.jsx:252-545 (exportAllToCSV, 0 importers, ~294 lines); src/utils.jsx:94-105 (diffAdminUpdates, 0 importers); src/components/modal-tabs/shared.jsx:136-194 (StageRemarkSection, 0 uses); src/components/modal-tabs/shared.jsx:866-940 (PaymentsEditor, 0 uses); src/components/modal-tabs/shared.jsx:76 (invalidateVendorNames, 0 uses)
- notes: Keep useMetadata (utils.jsx:54-68) and getTodayISTDateString (utils.jsx:605-611): they are unused today but are the right shared helpers, so adopt them instead (see later candidates). MetaSelect and DetailItem look unused from outside but EditableDetailItem uses them internally (shared.jsx:302,304), so keep them.

### <TagTrackingView config> + useTagCounts + src/config/tagViews.js (risk low, ~750 lines)
One searchable, tag-filtered, paged customer-card view driven by a config object for the subsidy, loan and installation trackers. New tracker types (e.g. DISCOM tags) become config entries.
- replaces: src/components/SubsidyView.jsx:1-360; src/components/LoanView.jsx:1-376; src/components/InstallationView.jsx:1-380; src/components/Dashboard.jsx:1649-1651 (three near-identical mount lines become one registry entry)
- notes: Pairwise identical lines: Subsidy/Loan 311, Subsidy/Installation 318, Loan/Installation 314. The config must preserve these per-view differences:
- **Counts:** Subsidy has no stage exclusion. Loan and Installation add .neq('stage','COMPLETED') to the list and the per-tag counts (Loan.jsx:68,114; Installation.jsx:53,68,118).
- **Loan total** is a custom sum: (stage=LOAN count) + (tagged and not in the LOAN or COMPLETED stages) (Loan.jsx:39-51,88-89). Note that the 'All' tile therefore counts untagged LOAN-stage rows that the list excludes.
- **Installation matching:** uses statusFilterFor alias OR-matching ('Installed'↔'yes', 'In process'↔'process') (Installation.jsx:14-19,70-73,128-131) and selects the extra columns installation_date and material_delivery_date (116).
- **Loan client-side filter:** Loan drops whitespace-only loan_tag on the client (146-148). Its badge label comes from LOAN_TAGS, with a 'Pending Tag' fallback (308-316).
- **Card fields:** Installation shows Delivery Date and Vendor/Tech instead of Current Stage (336-347).
- **Layout and copy:** grid columns 6/8/5, the empty-state icon (Tag/IndianRupee/Wrench), the titles and the noun.
- **Loading state and tour:** only Subsidy has a countsLoading placeholder. Only Subsidy ('subsidy') and Loan ('loan_tags') hook useDemoTourNavigation.
- **Duplicate count queries:** Subsidy fetches counts twice on mount (effect at 92-94 plus the finally block at 161), about 12 HEAD queries. Fetch once.
- **Query cost:** each load issues 1+N HEAD count queries (6/9/5). An optional grouped-count RPC would make it one.

### <DetailRow>, <InfoCard>, <FieldList fields record> driven by src/config/stageFields.js (risk low, ~450 lines)
Read-only label/value rendering from one field config. This is the base for config-driven stages and custom fields. Promote STAGE_FIELDS out of AgentStageDetails into config so client custom fields are config entries.
- replaces: src/components/AgentPortal.jsx:63-72 (local DetailRow, used only 10x); src/components/AgentPortal.jsx:1594-1612, 1670-1735, 2028-2094, 2211-2297, 2445-2568, 2619-2825 (117 inline copies of the label-row span 'text-[10px] font-bold text-stone-400 uppercase tracking-wide', each about 4 lines; 24 copies of the identical h5 section header); src/components/AgentStageDetails.jsx:5-81 (STAGE_FIELDS map moves to config); src/components/TrashView.jsx:33-47; src/components/modal-tabs/shared.jsx:195-233 (DetailItem becomes the 'tile' variant of DetailRow); src/components/modal-tabs/shared.jsx:941-967 (SectionHeader becomes the InfoCard header); src/components/AgentPortal.jsx:549-568 (local getTelephoneHref/renderPhoneLink; utils.jsx:197 already exports getTelephoneHref)
- notes: Bug the config fixes: AgentPortal.jsx:1603, 1688 and 2642 render selectedCust.email, which is not a column (ADMIN_COLUMNS only has email_address, as constants.js and STAGE_FIELDS show), so Email always shows '–'. Line 2046 does it correctly.

The field config needs:
- a value formatter (kWp, ₹, date, phone link, URL link)
- role visibility, for the !isAgent2 Channel Partner rows
- computed values, such as subChannelPartnerOf (AgentPortal.jsx:182)
- a 'tile' variant (shared.jsx bg-stone-50 box) and a 'row' variant (AgentPortal divide-y rows)

### <AppShell> + <SidebarNav>/<NavItem>/<NavGroup> + src/config/views.js (view registry) (risk medium, ~160 lines)
A single registry of { id, title, icon, group, roles, feature, countKey, load: () => import(...) } drives the sidebar, the header title, the system-view flag, the tour whitelist and the lazy router. This is the main hook for feature switches.
- replaces: src/components/Dashboard.jsx:21-36 (16 lazyWithRetry declarations); src/components/Dashboard.jsx:143-166 (NavBtn); src/components/Dashboard.jsx:187-206 (STAGE_GROUPS + SidebarGroup); src/components/Dashboard.jsx:211 (hard-coded tour view whitelist); src/components/Dashboard.jsx:1320-1347 (isSystemView list + 18-line headerTitle ternary chain); src/components/Dashboard.jsx:1350-1457 (sidebar: 17 <NavBtn> calls, each passing the same 5 props); src/components/Dashboard.jsx:1637-1689 (view router conditionals); src/components/Dashboard.jsx:269-293 (mobile-drawer focus trap; reuse the <Modal> focus logic)
- notes: Must preserve:
- per-entry role gating (admin-only systems block at 1402-1416, non-admin Self Service at 1419-1424, the CPO 'Partner Office' block at 1427-1432, canSeeDeliveryBatches at 362)
- the stage NavItem active rule (view 'stages' + selectedStage)
- the red trash badge, and count sources from metrics
- the special Quotations entry that also sets the hash (1366)
- the highlighted Toolbox button style (1367-1378)
- STAGE_GUIDANCE (168-185), which belongs in the stage registry

Feature-off views must be filtered out of the registry before lazy() is called, so their chunk is never fetched. Replace the compile-time DATA_EXPORTS_ENABLED (demo/config.js:5) with features.exports.

### <Modal> (native <dialog>) + <ModalHeader variant=light|dark> + <ModalFooter> (risk medium, ~320 lines)
One accessible modal shell with Esc handling, focus trap via utils/dialogFocus.js containDialogFocus, focus restore and a consistent z-index scale. Based on the pattern already in GlobalPopup.jsx:26-36,156-250 and DeliveryBatchesView.jsx:282-290,1305.
- replaces: src/components/TrashView.jsx:20-51, 193-212; src/components/AttendanceView.jsx:931-~1050, 1057-~1160, 1165-~1240 (identical overlay string, 3x); src/components/VendorCalendarView.jsx:376-~475, 481-~575 (same overlay string, 2x); src/components/ChannelPartnerManagementView.jsx:1227-1246 (+2 more overlays); src/components/UserManagementView.jsx:127 (ResetPasswordModal shell), 524 (CreateUserModal shell); src/components/AgentPortal.jsx:1437-1494 (bottom-sheet customer modal shell), 2827-2875 (validation popup); src/components/VendorPortal.jsx:1905-1952 (give-up modal), 1954-1981 (BOM modal shell); src/components/DeliveryBatchesView.jsx:1557, 1700; src/inventory/InventoryView.jsx:266-267 (div role=dialog backdrops); src/components/modal-tabs/MaterialDeliveryTab.jsx, DiscomSubmissionTab.jsx, LoanTab.jsx, InstallationStatusTab.jsx, shared.jsx:356 FilePreviewModal (shell only)
- notes: About 40 'fixed inset-0' overlays across 27 files, in at least 12 distinct overlay class strings with z-indexes from z-50 to z-[99999]. Only GlobalPopup, RolePicker and DeliveryBatchesView use <dialog>, and only 6 files handle Escape. Needs a bottom-sheet variant (AgentPortal.jsx:1437 'items-end sm:items-center'), a print-friendly variant ('print-only-modal', VendorPortal.jsx:1955) and a 'busy' lock so Escape cannot close mid-save (DeliveryBatchesView.jsx:1305 onCancel checks saving). Replace the TrashView inline confirm and the 7 native confirm()/alert() calls with the existing showConfirm/showAlert.

### <MobilePortalShell> + <PortalHero> (risk low, ~110 lines)
Shared sticky header (BrandMark label, user name/email, optional refresh, DEV role switcher, logout with an optional save-before-exit guard, demoControls slot) and the dark welcome hero used by every mobile portal.
- replaces: src/components/AgentPortal.jsx:1013-1027 (header), 1031-1064 (hero), 1405-1421 ('Back to Portal' sub-header); src/components/VendorPortal.jsx:975-1014 (header), 1019-1031 (hero); src/components/StampPortal.jsx:748-785 (header), 789-798 (hero)
- notes: The header markup is the same in all three (StampPortal even comments 'matching Vendor / Agent Portal'). Differences:
- Logout: Agent and Vendor wrap it in saveBeforeAgentExit/saveBeforeVendorExit. Pass onBeforeLogout.
- Refresh: Agent has no refresh button. Vendor uses refreshingAssignments and Stamp uses loading for the spinner.
- User line: Vendor shows the email under the name.
- Hero: the kicker text and the description differ.

### src/lib/db.js: fetchAllPages(), customerSource(scope), applyScope(query, scope); hooks useMetadata (revived), useDealers(partner) (risk medium, ~220 lines)
One place for the 1000-row page loop, the 'cpo_leads' vs 'admin' table switch, channel-partner/dealer scoping, the grouped metadata dropdown lists and dealer options.
- replaces: src/components/Dashboard.jsx:49-68, src/components/AgentPortal.jsx:219-230, src/components/VendorPortal.jsx:336-351, src/components/StampPortal.jsx:481-511, src/components/TrashView.jsx:64-85, src/components/DataExportView.jsx:88-109, src/components/ChannelPartnerManagementView.jsx:75-93, src/components/DeliveryBatchesView.jsx:216, src/utils.jsx:808-825, src/inventory/InventoryView.jsx:21, src/demo/deliveryBatches.js:9 (11 page loops); isChannelPartnerOffice ? 'cpo_leads' : 'admin' x20: Dashboard.jsx (8), LoanView.jsx (4), SubsidyView.jsx (3), InstallationView.jsx (3), DataExportView.jsx (2); channel_partner/sub_channel_partner scope clauses: Dashboard.jsx:59,60,75,76,508-514,733-736; DataExportView.jsx:59-64; SubsidyView/LoanView/InstallationView (13 clauses); src/components/Dashboard.jsx:417-428 and src/components/AgentPortal.jsx:289-304 (inline duplicates of utils.jsx:54-68 useMetadata); src/components/Dashboard.jsx:367-389 (dealer loader duplicating utils.jsx:1202-1220 fetchAgent2SubAgents)
- notes: Scoping uses three different match rules today:
- .eq for the dashboard stats (Dashboard.jsx:59,75)
- ilike with no wildcards for exports (DataExportView.jsx:61)
- ilike '%x%' for the tag views, the stage list (509) and global search (734)

So filtering 'SOLAR' shows stats only for 'SOLAR' but lists every partner whose name contains it. Pick one rule on purpose (probably case-insensitive exact).

Dealer lists also differ:
- Dashboard: agent2 only, .eq on the channel partner, status = active
- fetchAgent2SubAgents: agent2 or agent, ilike, any status

The header filter and the Add Lead/CustomerDetail dealer dropdowns can therefore show different dealers. fetchAllPages must keep each caller's error behaviour: throw (Dashboard, DataExport, Vendor) or break and keep the partial result (TrashView, utils getCustomerDocuments).

### Hooks: useDebouncedValue, usePagedQuery (load-more), useRefreshOnFocus, useRealtimeRows, useClickOutside (risk medium, ~260 lines)
Shared versions of the lifecycle code each list view hand-writes: debounced search, server-side 'Load more' with de-duplication, refresh on window focus or visibility, a Supabase postgres_changes upsert/remove reducer with an ownership predicate, and click-outside closing.
- replaces: usePagedQuery: src/components/Dashboard.jsx:348-350, 489-569, 1705-1714; src/components/ActivityLogView.jsx:68-126, 267-285; tag views (covered by TagTrackingView); useRefreshOnFocus: src/components/Dashboard.jsx:588-605; src/components/AgentPortal.jsx:274-285; src/components/VendorPortal.jsx:410-429; src/components/ActivityLogView.jsx:143-151; src/components/DeliveryBatchesView.jsx:357-369; useRealtimeRows: src/components/AgentPortal.jsx:251-272; src/components/VendorPortal.jsx:383-405; src/components/StampPortal.jsx:546-~580; src/components/DeliveryBatchesView.jsx:342-355; src/components/ActivityLogView.jsx:155-174; src/components/Dashboard.jsx:607-678; useDebouncedValue: SubsidyView.jsx:26-32, LoanView.jsx:25-31, InstallationView.jsx:35-41, Dashboard.jsx:706-746 (300ms timer); useClickOutside: Dashboard.jsx:691-702, CustomerCard.jsx:11-18, modal-tabs/shared.jsx:245-253, AddLeadModal.jsx (1); 'sync selected record from list': Dashboard.jsx:681-688, AgentPortal.jsx:307-314, VendorPortal.jsx:432-439
- notes: Options the hooks need:
- **useRefreshOnFocus:** a throttle (Dashboard uses 10s at 588-593) and an optional interval (Vendor polls every 120s at 420).
- **useRealtimeRows:** an async belongs(row) (the Dashboard CPO path re-queries cpo_leads at 614-617), stage-membership updates (Dashboard 645-667) and an onAnyChange callback for scheduleMetricsRefresh.
- **usePagedQuery:** an inFlight guard (ActivityLog 79-80) and offset-from-current-length paging (ActivityLog 84).

VendorPortal filters given-up rows two different ways. The initial load checks installation_status !== 'Giveup' (355), while realtime uses normalizeInstallationStatus(...) !== 'Give Up' (390), so legacy 'Give Up' rows show on load and vanish on the next realtime event. Fix this with a single belongs() predicate.

### src/lib/customers.js: saveCustomer(), createLead(), moveStage(), syncMetadata() (risk medium, ~250 lines)
One write path for the admin table: sanitize, normalise blanks and numbers, verify rows were actually changed, detect an expired session, and create leads with document uploads. It wraps the existing utils.jsx:232-249 updateAdminRecord.
- replaces: src/components/Dashboard.jsx:806-924 (handleUpdateCustomer re-implements normalizeAdminValues inline, 824-841); src/components/AgentPortal.jsx:374-432 (handleUpdateCustomer, the same normalisation again at 381-396); src/components/Dashboard.jsx:1159-1237 and src/components/AgentPortal.jsx:435-524 (handleAddLead / handleSubmitLead: identical numeric parsing, ''→null, timestamps, quotation conversion and failed-upload collection); src/components/Dashboard.jsx:760-804 (syncMetadata); src/components/Dashboard.jsx:1002-1139 (handleMoveStage; lead readiness check duplicates CustomerDetailModal's getMissingStageRequirements)
- notes: Keep caller-specific behaviour as options:
- Dashboard applies optimistic updates with rollback and logs out on JWT errors (904-907).
- Agent updates are not optimistic and use maybeSingle.
- An agent lead forces channel_partner and sub_channel_partner from the user (AgentPortal.jsx:436-443), while admin sets lead_creator_profile_id (Dashboard.jsx:1162).
- The activity log text differs: 'Done by' versus 'Done by Agent'.

Vendor and Stamp already call updateAdminRecord, so all four paths would then share one guard.

### useCustomerDocuments(customerId) + documentActions (preview/download/downloadAll/upload-with-crop/replaceReturned/remark) + getDocumentsForCustomers(ids) (risk medium, ~250 lines)
One document workflow for all portals and the detail modal, plus a batched loader to remove an N+1 query.
- replaces: src/components/AgentPortal.jsx:316-323, 575-725 (preview, download, download-all, upload with stage gating, returned-doc delete via an inline '[RETURNED]' check, remark); src/components/CustomerDetailModal.jsx:~560-680 (upload, download, downloadAll, preview with URL cache, delete, remark); src/components/VendorPortal.jsx:~490-630, 1892-1903; src/components/StampPortal.jsx:180-210, 610-640, 975-990; src/components/StampPortal.jsx:528-535 (Promise.all of getCustomerDocuments per customer, N+1); src/components/AgentPortal.jsx:693 (inline copy of modal-tabs/shared.jsx:574 isReturnedDocument)
- notes: Permission rules differ by caller and must be injected as a canUpload(docType, stage) / canDelete(doc) policy:
- Agent: upload only in LEADS/REGISTRATION, plus meter documents at METER and signature/stamp at DISCOM (AgentPortal.jsx:657-663). Delete only RETURNED documents.
- Vendor: geo_tag_image only, with replacingPhotoRef.
- Stamp: only the pm_surya_ghar_stamp document.
- Admin modal: delete anything, then log activity and refresh the logs.

CustomerDetailModal caches view URLs (urlCacheRef), which is worth keeping for everyone.

### Form kit: <Field>, <TextInput>, <Select>, <ChoiceGroup>, <SegmentedControl>, useFormState(schema), <FormRenderer schema> (risk medium, ~400 lines)
One set of input primitives (built on the existing .sf-input) and a schema-driven form renderer for the new per-client setup forms and custom fields.
- replaces: 166 input/select className strings containing focus:ring, in 101 distinct variants (top: 14x 'w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5…', 11x 'w-full bg-stone-50 … disabled:bg-stone-100'); .sf-input is used only 4 times; 12+ label class variants (32x 'font-semibold text-stone-600 block mb-1', 20x 'text-[9px] font-bold text-stone-400 uppercase tracking-wider block mb-1', …); src/components/CustomizationEnquiryForm.jsx:46-66 (21 separate useState fields), 359-390 (choiceField helpers), 470-600 (field markup); src/components/UserManagementView.jsx:253-875 (CreateUserModal fields), 16-251 (ResetPasswordModal); src/components/modal-tabs/shared.jsx:110-133, 300-353 (MetaSelect/EditableDetailItem become schema field types); src/components/InstallationPaymentsView.jsx:496-506 (segmented status toggle); src/components/DataExportView.jsx:158-170 (mode buttons and inputs)
- notes: EditableDetailItem already switches on type (select, money with formatInputValue, textarea, auto-calc, channel-partner autocomplete), so it is the natural seed for FieldRenderer field types. CustomizationEnquiryForm keeps draft autosave (126-155) and its mobile step layout, so useFormState needs a snapshot/serialize API. UserManagementView uses hidden fake username/password inputs to stop autofill (534-535), so keep a noAutofill option.

### <MetadataDirectoryManager> + src/config/metadataCategories.js + useMetadataCategory(category) (risk low, ~300 lines)
Config-driven dropdown directories (channel_partner, module_brand, registration_by, integration_by, inverter_make, plus client-defined lists). Lets each client add dropdown categories without code.
- replaces: src/components/ChannelPartnerManagementView.jsx:95-168 (fetchMetadata split into 5 state arrays); src/components/ChannelPartnerManagementView.jsx:31-45 (10 per-category useState); src/components/ChannelPartnerManagementView.jsx:317-457 (5 near-identical handleAdd* functions: trim, de-duplicate, insert, append, log); src/components/ChannelPartnerManagementView.jsx:791-941 (9 category tiles of about 18 lines each); src/components/ChannelPartnerManagementView.jsx:1170-1216 (if/else chain mapping category to title/list/input/handler); src/components/UserManagementView.jsx:329-340, 458-470, 1069-1080 (inline metadata inserts)
- notes: Channel partner differs: it is stored uppercase and de-duplicated with normalizeDirectoryLabel/dedupeChannelPartnerDirectory (7-28, 321-328) and has a search box (1222-1224, 1249). Vendor, driver, CPO office and stamp report are not metadata-backed, so they stay custom tiles. Edit and delete (548-~730) cascade renames to admin rows and must keep using runWrite.

### List chrome: <SearchInput>, <FilterBar>, <LoadMoreButton>, <EmptyState>, <LoadingState>/<Spinner>, <ErrorBanner>, <StatTile>, <TagBadge>, <PageShell width> (risk low, ~400 lines)
Presentational building blocks for every list or table view.
- replaces: SearchInput (17 icon+input+clear copies): SubsidyView.jsx:188-205, LoanView.jsx:198-215, InstallationView.jsx:202-219, Dashboard.jsx:1483-1513, AgentPortal.jsx:1074-1093, 1283-1299, InstallationPaymentsView.jsx:454-463, StampPortal, VendorPortal, UserManagementView.jsx:1433, ChannelPartnerManagementView, AttendanceView, DeliveryBatchesView; EmptyState: SubsidyView.jsx:265-271, LoanView.jsx:275-281, InstallationView.jsx:279-285, Dashboard.jsx:1717-1721, TrashView.jsx:110-116, ActivityLogView.jsx:231-245, AgentPortal.jsx:1308-1316, 1098-1100, InstallationPaymentsView.jsx:658-664, DeliveryBatchesView.jsx:903, UserManagementView; LoadingState/Spinner: App.jsx:17, Dashboard.jsx:44, 1695-1697, ActivityLogView.jsx:176-180, TrashView.jsx:108, InstallationPaymentsView.jsx:513-516, tag views (3x); about 45 inline Loader2/RefreshCw spinners; LoadMoreButton: Dashboard.jsx:1705-1714, ActivityLogView.jsx:267-285, tag views (3x); ErrorBanner: SubsidyView.jsx:179-184, LoanView.jsx:189-194, InstallationView.jsx:193-198; StatTile: InstallationPaymentsView.jsx:365-404, AgentPortal.jsx:1126-1139, StampPortal.jsx:800-~830, VendorPortal.jsx:1033-1071, DataExportView.jsx:175-178, tag tiles (3x); TagBadge: ActivityLogView.jsx:248-256, tag-view card badges (3x), CustomerCard subsidy badge; PageShell: TrashView.jsx:122, ActivityLogView.jsx:183, DataExportView.jsx:148, InstallationPaymentsView.jsx:344 (4 different max-width wrappers; DataExport and InstallationPayments add p-4/p-6 inside a parent that already pads, at Dashboard.jsx:1632)
- notes: Purely presentational, with no data changes. Keep the aria-labels and the readOnly-until-focus anti-autofill trick on the Dashboard search inputs (1485, 1510).

### Date/month kit: MONTH_NAMES, monthKey(), monthLabel(), getMonthBounds(), <MonthNavigator>, <MonthSelect>, <YearSelect> (risk low, ~150 lines)
Shared month and year filtering and calendar navigation.
- replaces: src/components/AttendanceView.jsx:26-31, 548-578; src/components/VendorCalendarView.jsx:15-19, 72-79, 209-229; src/components/Dashboard.jsx:120-135, 516-543, 1515-1548; src/components/StampPortal.jsx:712, 730-741, 837-866; src/components/ChannelPartnerManagementView.jsx:298, 1490-1540; src/components/InstallationPaymentsView.jsx:22-45, 179-194, 480-493; src/components/CustomerDetailModal.jsx:66 (short month array)
- notes: Two bugs to fix while centralising:
- Dashboard.jsx:1543 offers 'last-month', but fetchStageCustomers (533-541) only handles 'this-month'. 'last-month' becomes `${year}-last-month`, getMonthBounds returns null and no filter is applied while the dropdown says 'Last month'.
- The year options are hard-coded to 2026 and 2025 (1523-1525). YearSelect should generate them.

Also preserve:
- AttendanceView navigates by week or by month.
- InstallationPayments keys rows by payout month (installation month + 1).

### src/lib/format.js: formatINR (enforce), formatCount, formatKwp, formatDate(variant), todayIST() (risk low, ~120 lines)
One formatting layer for currency, counts, capacity and dates in India time.
- replaces: 57 hand-built '₹'+toIndianCommas: ToolboxView (26), InstallationPaymentsView (10: 373, 386, 399, 421, 438, 585 …), LoanTab (8), AgentPortal (6), VendorPortal (3), ChannelPartnerManagementView (2); utils.jsx:558 formatINR already exists; about 45 toLocaleString('en-IN') count formats (tag views 9, ToolboxView 27, DataExportView, CPM); src/components/TrashView.jsx:12-15 (local formatDate shadows utils.formatDate); src/components/Dashboard.jsx:70 (indiaDate), src/components/DataExportView.jsx:5-7 (todayInIndia), both duplicating utils.jsx:605-611; src/components/VendorCalendarView.jsx:28, src/components/CustomerDetailModal.jsx:62, src/components/TeamChatDrawer.jsx:10-22, src/inventory/InventoryView.jsx:10, ActivityLogView.jsx:217, 261; 38 toISOString().split('T')[0] call sites outside utils/demo (DiscomSubmissionTab 5, ToolboxView 5, InstallationPaymentsView 5, CustomerDetailModal 5, VendorPortal 4, SubsidyStatusTab 3, DeliveryBatchesView 3, AgentPortal, Dashboard.jsx:1099 …); kWp template formatting (about 20 sites: VendorPortal 4, DeliveryBatchesView 4, AgentPortal 4, …)
- notes: toISOString().split('T')[0] gives the UTC date, so between 00:00 and 05:30 IST it records yesterday. getTodayISTDateString exists for exactly this and has 0 callers. Changing to IST changes which date gets saved during that window, which is the intended fix, but call it out in review. formatINR returns '–' for 0 (utils.jsx:560), while the ledger shows ₹0, so add a zero option.

### usePrintPortal() + <PrintPreviewModal>; VendorPortal BOM uses BomPrintModal + loadBomForCustomer (risk medium, ~330 lines)
One print-portal implementation (clone into #native-print-portal, add body.is-printing-document, set and restore document.title, clean up after printing) and one BOM loader.
- replaces: src/components/VendorPortal.jsx:108-186 (own BOM fetch and template fallback); src/components/VendorPortal.jsx:206-242 (copy of the print portal); src/components/VendorPortal.jsx:1954-2177 (BOM modal + duplicated print CSS); src/components/BomPrintModal.jsx:16-55; src/components/modal-tabs/MaterialDeliveryTab.jsx:93-120, 534-~600; src/components/DeliveryBatchesView.jsx:616, 639, 679, 1718
- notes: Behaviour divergence to resolve on purpose: VendorPortal falls back to ROOF_BOM_TEMPLATE/SHED_BOM_TEMPLATE from constants (152, 173). utils/bom.js uses inventory/reference.json and merges saved items against the template (utils/bom.js:14-60, 'single source of truth'). So vendors print a different blank BOM from admin and agent. Print CSS differs per document (font sizes, page breaks), so usePrintPortal should take a stylesheet or class per document.

### src/lib/download.js: toCsv(rows, columns), downloadBlob(content, type, filename) (risk low, ~80 lines)
One CSV builder (BOM, quoting) and one blob-download helper.
- replaces: src/components/DataExportView.jsx:9-26, 127-133; src/inventory/InventoryView.jsx:36-60, 61-85 (two inline CSV builders with their own escapeCsv); src/utils/staffAttendance.js:423-530; src/utils.jsx:274, 535 (inside the dead exportAllToCSV)
- notes: DataExportView JSON-stringifies object cells (escapeCsv at 10), while InventoryView does not. Default to the DataExportView behaviour.

### src/config/stages.js (stage registry): stageLabel(), isStageApplicable(stage, customer), lazy STAGE_TABS (risk medium, ~80 lines)
Config-driven stages: label, icon, group, guidance, feature flag, applicability rule and a lazily imported tab component. CustomerModalTabsRouter becomes a lazy lookup, so a switched-off stage's tab is never downloaded.
- replaces: src/components/CustomerModalTabsRouter.jsx:3-43 (15 static tab imports + 15 conditionals); src/components/Dashboard.jsx:168-192 (STAGE_GUIDANCE, STAGE_GROUPS); payment-type stage rules: src/components/AgentPortal.jsx:1498-1503; src/components/CustomerDetailModal.jsx:880-883, 902-905, 1707-1708; 16 PRIMARY_STAGES.find(s => s.id === x)?.label lookups (CustomerDetailModal 3, AgentPortal 3, utils 2, TrashView 2, Dashboard 2, HoldProcurementTab, VendorPortal, DeliveryBatchesView, CustomerCard); src/components/AgentPortal.jsx:1190-1215 (drawer stage list), 1496-1547 (stage tab strip)
- notes: Stage tabs total 7.5k lines (MaterialIntegrationTab 1185, LoanTab 956, DiscomSubmissionTab 944, MaterialDeliveryTab 725). Keep the INSTALLATION_STATUS prop remap (isEditable={props.isInstallationDetailsEditable}, Router:32-34). LOST_PROJECT maps to HoldProcurementTab. Add a <Suspense> fallback inside the modal body so the header does not flash.

### GlobalPopup upgrades: toast(), lazy ImageCropModal; migrate local alert systems (risk low, ~40 lines)
One notification system. Removes broken or duplicate local systems and native dialogs.
- replaces: src/components/AgentPortal.jsx:142, 423-427, 501-508, 660, 681-685, 695-699, 706, 712, 720 (setCustomAlert is called 8 times but customAlert is never rendered, so update, upload and permission errors are silently lost); src/components/UserManagementView.jsx:909, 920-923 (+20 showToast calls); native dialogs: StampPortal.jsx:61, InstallationPaymentsView.jsx:278, ChannelPartnerManagementView.jsx:260, 530, 715, UserManagementView.jsx:1237, 1287; src/components/GlobalPopup.jsx:11 (static ImageCropModal import, 363 lines, loaded for every user via main.jsx)
- notes: The AgentPortal fix is a real bug fix, not cosmetic: handleUpdateCustomer returns false and the user sees nothing. Lazy-load ImageCropModal only when popup.mode === 'image-cropper'.

### <ChannelPartnerFilter> + <DealerSelect> (combobox on shared ChannelPartnerAutocomplete) (risk medium, ~100 lines)
A reusable 'type, pick a suggestion, Apply/Clear' partner filter plus a dependent dealer select. The new per-client setup screens need the same control.
- replaces: src/components/Dashboard.jsx:254-262 (6 filter state vars), 1257-1269 (dedupe + suggestions), 1551-1607 (filter + dealer markup); src/components/modal-tabs/shared.jsx:236-298 (ChannelPartnerAutocomplete, the same suggestion-dropdown pattern); src/components/Dashboard.jsx:1467-1477 (scope chips in header)
- notes: Dashboard keeps the typed value separate from the applied value (channelPartnerFilterInput vs channelPartnerFilter). The CPO hides the partner input and labels the dealer option 'My office + dealers' (1604). It depends on useDealers from the db.js candidate.

### Lazy-load the remaining eager imports (no new module; lazyWithRetry) (risk low, ~30 lines)
Keep rarely used or switched-off features out of the first download for each role.
- replaces: src/components/LoginScreen.jsx:12 (CustomizationEnquiryForm, 618 lines + enquiries/*, mounted hidden at 589 on the landing page; LoginScreen is eager in App.jsx:8). Move DEFAULT_BASIC_VERSION_URL (CustomizationEnquiryForm.jsx:10) to constants first; src/components/DashboardView.jsx:13 (CustomizationEnquiryForm, opened only as a modal at 124); src/components/AgentPortal.jsx:14 ToolboxView (1565), 18 AddLeadModal (1139, pulls zod via utils/validation.js), 19 QuotationModule, 5 AgreementPreview (342 + pages), 38 AgentStageDetails, 39 BomPrintModal/BomPrintView (406); src/components/VendorPortal.jsx:16 (VendorCalendarView, 578, only for the AVAILABILITY tab); src/components/GlobalPopup.jsx:11 (ImageCropModal); src/components/CustomerModalTabsRouter.jsx:3-17 (see the stage registry candidate)
- notes: Already done well: portals are lazy in App.jsx:12-16, and Dashboard secondary views use lazyWithRetry at 21-36. pdf-lib, jspdf, html2canvas and @zxing are already dynamic imports. I could not run a build (read-only task), so measure chunk sizes with rollup-plugin-visualizer after the change. Rollup probably tree-shakes the 14 unused tab imports, but they still tie the agent chunk to the modal-tab modules.

### readModuleSerials adoption (src/serials/record.js) (risk low, ~35 lines)
Use the existing canonical panel-serial parser everywhere.
- replaces: src/components/AgentPortal.jsx:42-59 (parsePanelSerials); src/components/VendorPortal.jsx:18-35 (parsePanelSerials)
- notes: VendorPortal returns [''] for empty input so its editor starts with one blank row (19-20, 25). Keep that with `readModuleSerials(v).length ? … : ['']` at the call site. MaterialIntegrationTab already uses readModuleSerials.


## details
## Method
- Read-only. I only read inside `solarflow_client_builder` and wrote nothing. No build was run, so chunk sizes are not measured.
- Read all 19 target files plus `utils.jsx`, `utils/*`, `constants.js`, `modal-tabs/shared.jsx`, `AgentStageDetails.jsx`, `CustomerModalTabsRouter.jsx`, `App.jsx`, `main.jsx` and `LoginScreen.jsx`.
- Similarity was measured with `difflib`. Counts come from `grep` over `src/`.
- In-scope files total about 18.5k lines. All `.js`/`.jsx` in `src/` total about 42k.

## Real bugs found (the shared components must fix or deliberately preserve these)
1. **AgentPortal errors are never shown.** `AgentPortal.jsx:142`: `customAlert` is set at 8 sites (423, 501, 660, 681, 695, 706, 712, 720) but never rendered. Save, upload and permission errors are invisible.
2. **Email always blank in AgentPortal.** `AgentPortal.jsx:1603, 1688, 2642` read `selectedCust.email`. That column does not exist; it is `email_address`. Line 2046 is correct.
3. **"Last month" filter does nothing.** `Dashboard.jsx:1543` offers 'last-month', but `fetchStageCustomers` (533-541) never handles it, so no filter is applied.
4. **Year list is hard-coded.** `Dashboard.jsx:1523-1525` hard-codes 2026 and 2025.
5. **Dates near midnight use UTC.** 38 `toISOString().split('T')[0]` sites give the UTC date before 05:30 IST. `getTodayISTDateString` (`utils.jsx:605`) exists and has 0 callers.
6. **Channel-partner filter matches three ways.** Scoping uses `.eq`, ilike-exact or ilike-`%x%` depending on the screen (`Dashboard.jsx:59,75` vs `DataExportView.jsx:61` vs the tag views and `Dashboard.jsx:509,734`). Stats and lists can disagree.
7. **Dealer lists differ.** `Dashboard.jsx:374-381` uses agent2 + `.eq` + active only; `utils.jsx:1202-1220` uses agent2|agent + ilike + any status.
8. **Vendor give-up filter is inconsistent.** VendorPortal checks `!== 'Giveup'` on load (355) but `!== 'Give Up'` after normalising on realtime events (390).
9. **Vendor prints a different blank BOM.** VendorPortal falls back to the constants templates; admin and agent use `inventory/reference.json` through `utils/bom.js`.
10. **Extra queries.**
    - SubsidyView runs its count queries twice on mount (92-94 and 161).
    - StampPortal fetches documents once per customer (528-535).
11. **Native dialogs bypass GlobalPopup** in 7 places.

## Feature switches and lazy loading (so switched-off features are never downloaded)
- **Rule:** a feature module may only be reached through an `import()` factory stored in a registry. Shared kit code (`src/ui`, `src/layout`, `src/hooks`, `src/lib`) must never statically import a feature module.
- **`src/config/features.js` + `useFeatures()`:**
  - Loaded once per client from a config row; defaults live in code.
  - Replaces the compile-time `DATA_EXPORTS_ENABLED` (`demo/config.js:5`).
  - Suggested keys: `loan, cash, subsidy, installationTracking, inventory, deliveryBatches, attendance, vendorCalendar, installationPayments, quotations, toolbox, exports, teamChat, agentPortal, vendorPortal, stampPortal`.
- **Registries:**
  - **`src/config/views.js`:** each entry is `{id,title,icon,group,roles,feature,countKey,load}`. It feeds SidebarNav, the header title, the router and the demo-tour whitelist.
  - **`src/config/stages.js`:** each entry is `{id,label,icon,group,guidance,feature,appliesTo,tab:()=>import(...)}`. It feeds Dashboard stage navigation, the CustomerDetailModal router and the AgentPortal stage strip and drawer.
  - **`src/config/tagViews.js`:** the subsidy, loan and installation tracker configs.
  - **`src/config/metadataCategories.js`:** dropdown directories, including client-defined ones.
  - **`src/config/stageFields.js`:** promoted from `AgentStageDetails.jsx:5-81`; extended with client custom fields.
- **Filter before calling lazy:** filter registry entries by `roles ∩ features`, then memoise `lazyWithRetry(entry.load)` per id. A disabled entry's `import()` is never called.
- **App.jsx:** also gate `Portal` selection (`App.jsx:136`) and `TeamChatDrawer` (`App.jsx:172`) on features.
- **Eager imports to convert:** see the lazy-load candidate. The biggest are:
  - CustomizationEnquiryForm on the login screen
  - ImageCropModal in the global popup provider
  - AgentPortal's Toolbox, AddLead, Quotation, Agreement and BOM imports, plus its 14 unused tab imports
  - all 15 tabs in CustomerModalTabsRouter

## Proposed structure
- **`src/ui/`:** `Modal`, `Field`, `TextInput`, `Select`, `ChoiceGroup`, `SegmentedControl`, `SearchInput`, `FilterBar`, `EmptyState`, `LoadingState`/`Spinner`, `ErrorBanner`, `StatTile`, `TagBadge`, `DetailRow`, `InfoCard`, `FieldList`, `LoadMoreButton`, `MonthNavigator`, `MonthSelect`, `YearSelect`, `PageShell`
- **`src/layout/`:** `AppShell`, `SidebarNav`, `NavItem`, `NavGroup`, `MobilePortalShell`, `PortalHero`
- **`src/hooks/`** (currently empty): `useDebouncedValue`, `usePagedQuery`, `useRefreshOnFocus`, `useRealtimeRows`, `useClickOutside`, `useMetadata`, `useDealers`, `useCustomerDocuments`, `useFormState`, `usePrintPortal`, `useFeatures`
- **`src/lib/`:**
  - `db.js`: `fetchAllPages`, `customerSource`, `applyScope`
  - `customers.js`: `saveCustomer`, `createLead`, `moveStage`, `syncMetadata`
  - `format.js`
  - `download.js`
- **`src/config/`:** `features`, `views`, `stages`, `stageFields`, `tagViews`, `metadataCategories`
- **`src/features/tag-tracking/TagTrackingView.jsx`**

## Suggested phasing
- **Phase 0 (no behaviour change, about 1 day):**
  - Delete dead code (about 770 lines).
  - Route AgentPortal `setCustomAlert` to `showAlert`.
  - Lazy-load the eager imports.
  - Move `DEFAULT_BASIC_VERSION_URL` to constants.
- **Phase 1 (presentational, low risk):** `src/ui` primitives, `format.js`, the date/month kit, `download.js`, `readModuleSerials`.
- **Phase 2 (biggest wins):** TagTrackingView, DetailRow/FieldList (fixes the email bug), MobilePortalShell, the `<Modal>` migration.
- **Phase 3 (enables client config):** the views, stages and metadata-category registries with `useFeatures`; AppShell/SidebarNav; the stage-tab lazy router.
- **Phase 4 (data paths, medium risk):** `db.js` scoping (decide the single channel-partner rule first), the hooks, `customers.js` writes, `useCustomerDocuments`, the form kit with FormRenderer for the new setup forms, the print portal.

## Verification advice
- For TagTrackingView, record the Supabase query-builder call chain per config before and after (counts and list). They should match exactly, apart from the deliberate de-duplication of Subsidy's count queries.
- After Phases 0 and 3, add `rollup-plugin-visualizer` (it needs an install, which was out of scope here) and confirm a switched-off feature's chunk is absent from the network log for that role.
- The existing tests (`tests/isolation`) cover the transport allowlist and isolation, not UI behaviour, so add focused tests per migrated view.

## Totals
Estimated reduction: about 5,000–5,600 lines, roughly 11–13% of `src` (about 27–30% of the audited files). The largest items:
- TagTrackingView: about 750
- dead code: about 770
- DetailRow/FieldList: about 450
- form kit: about 400
- list chrome: about 400
- print unification: about 330
- Modal: about 320
- metadata directory manager: about 300