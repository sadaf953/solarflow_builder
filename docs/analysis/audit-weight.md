# weight

## summary
Bundle-weight and dead-code audit of solarflow_client_builder (read-only; I built the import graph with scratch scripts and ran no build).

1. **Heavy libraries are already loaded lazily.** jspdf, html2canvas, pdf-lib and @zxing/browser are only pulled in on click. zod is the exception: it is loaded normally, and only for a single safeParse call.
2. **The real weight comes from the app's own wiring:**
   - About two thirds of the 272 KB startup bundle (source size) is demo or marketing code: the enquiry form, enquiry helpers, tour, role picker, demo seeders and demo.css.
   - AgentPortal imports Quotations, Toolbox, AddLead, Agreement and BOM print up front, plus 14 stage tabs it never renders. That makes its chunk about 778 KB of source.
   - CustomerModalTabsRouter imports all 15 stage tabs up front, so the CustomerDetailModal chunk is about 838 KB. A stage that is switched off still gets downloaded.
3. **Dead code:**
   - 12 source files (about 1.36k lines) are never imported, plus HistoryEntryEditor, which is only imported and never used.
   - 192 imported names are never used, across 40 files.
   - About 330 lines of utils.jsx are dead, including exportAllToCSV (about 290 lines).
   - StampPortal (989 lines) is still reachable.
   - reference.json (72 KB) is demo data, and only a small part of it is used.
   - public/banner.png is 1.1 MB.
4. **No build was measured.** The client_builder node_modules is missing the built files for 54 of its 382 packages, including vite, jspdf, lucide-react and @supabase/*, so build and lint cannot run until `npm ci`. All sizes are source bytes; any min/gzip figures are estimates.

Expected effect if the plan is applied: about 75–80% less app code at startup, about 55–60% less when the agent portal first opens, and about 70% less when a customer is opened. Switched-off features would never be downloaded. Roughly 7k lines can be deleted, and the shared components below save about 1.5k more.

## candidates
### featureRegistry + <FeatureOutlet>/useFeature(id) (risk medium, ~150 lines)
Single config-driven registry {id, title, navGroup, roles, load: () => import(...)} that drives the sidebar, title, view switch and portal choice. A view is rendered (and its lazy chunk fetched) only when its feature switch is on, and build-time stripping stops disabled features being emitted at all.
- replaces: src/App.jsx:11-17; src/App.jsx:140; src/components/Dashboard.jsx:21-39; src/components/Dashboard.jsx:1331-1346; src/components/Dashboard.jsx:1366-1400; src/components/Dashboard.jsx:1638-1670; src/components/AgentPortal.jsx:14; src/components/AgentPortal.jsx:18-19; src/components/AgentPortal.jsx:39; src/demo/config.js:5 (DATA_EXPORTS_ENABLED, the existing one-off flag)
- notes: Keep each view's existing role gates (e.g. admin-only channel_partner_mgmt/vendor_availability/installation_payments; admin+sales for inventory/quotations; canSeeDeliveryBatches) as a `roles`/`can(user)` field next to the feature flag. Dashboard currently calls openQuotations() before setCurrentView('quotations') (Dashboard.jsx:1366), so the registry needs an onEnter hook.

### <StageTabOutlet> (lazy stage-tab registry) (risk low, ~70 lines)
Map stageId to a lazyWithRetry(() => import('./modal-tabs/XTab')) entry, so every stage tab becomes its own chunk, is fetched only when opened, and is never fetched when that stage is turned off in the client's stage config.
- replaces: src/components/CustomerModalTabsRouter.jsx:1-43; src/components/CustomerDetailModal.jsx:36-52 (17 imports, 15 unused); src/components/AgentPortal.jsx:24-37 (14 unused tab imports)
- notes: InstallationStatusTab gets an extra prop isEditable={props.isInstallationDetailsEditable} (router line 33-34). HoldProcurementTab is keyed on STAGE_IDS.LOST_PROJECT, not on its own id. HistoryTab and CustomerDocumentsTab are rendered outside the router (CDM:1843,1863) and should also become lazy entries.

### src/lib/lazy.js: lazyWithRetry + <LazyBoundary> (risk low, ~30 lines)
Move lazyWithRetry (stale-chunk reload) out of the 54 KB utils.jsx so App.jsx and the registries can use it without pulling in utils. One shared Suspense+fallback wrapper replaces the hand-rolled Loader/ViewLoader components.
- replaces: src/utils.jsx:1262-1279; src/App.jsx:11-18 (plain lazy, no retry); src/App.jsx:144,163,171,173 (Suspense wrappers); src/components/Dashboard.jsx:45 (ViewLoader)
- notes: Keep the sessionStorage 'retry-lazy-refreshed' one-shot reload semantics. Pair it with the unwired src/components/UpdateChecker.jsx, which polls public/version.json.

### Split utils.jsx into lib/format, lib/documents, lib/adminWrites, lib/activity (and delete dead exports) (risk medium, ~340 lines)
utils.jsx is a 54 KB module shared by about 30 files, so every lazy view drags in document upload/download/PDF-merge code. Splitting it lets the tag views and list views load only the formatters and write helpers they use.
- replaces: src/utils.jsx:9-48 (logActivity); src/utils.jsx:54-68 (useMetadata, unused); src/utils.jsx:94-105 (diffAdminUpdates, unused); src/utils.jsx:251-540 (exportAllToCSV, unused); src/utils.jsx:546-628 (formatters); src/utils.jsx:602-611 (getTodayISTDateString, unused); src/utils.jsx:695-1200 (documents); src/utils.jsx:697-705,797-806,832,866 (demo mock-doc branches); src/components/AgentPortal.jsx:703 and src/components/modal-tabs/shared.jsx:725 (dynamic import('../utils') that cannot split because utils is also imported statically)
- notes: normalizeAdminValues and compressImage are used only inside utils.jsx and can stop being exported. downloadDocumentsAsPdf dynamically imports pdf-lib (utils.jsx:1051) and must stay dynamic. getViewUrl/getDownloadUrl currently return '/demo-document.svg' for demo ids; drop that in the client build.

### <TagTrackingView config={subsidy|loan|installation}> (risk medium, ~700 lines)
One table/filter/tag view driven by config (tag list, colours, column set, title) instead of three roughly 80% identical files. That turns 3 chunks into 1, and the tag lists become client-configurable dropdowns.
- replaces: src/components/SubsidyView.jsx:1-360; src/components/LoanView.jsx:1-376; src/components/InstallationView.jsx:1-380
- notes: diff Subsidy vs Loan: 74 differing lines; Loan vs Installation: about 65. Subsidy and Loan call useDemoTourNavigation and Installation does not. Each uses different *_TAGS / *_TAG_COLORS from constants.js and differs in its isFinal logic (isFinalTagValue). All three import CUSTOMER_CARD_COLUMNS without using it.

### Toolbox tool registry + <PrintableVoucher> (risk low, ~250 lines)
Split the 1,565-line ToolboxView into 8 lazily loaded tool modules listed in config, so only the opened tool downloads and a client can switch individual tools off (e.g. warranty certificate). Merge the customer, staff and vendor receipt generators into one voucher component driven by config.
- replaces: src/components/ToolboxView.jsx:14-36 (TOOL_GROUPS); src/components/ToolboxView.jsx:131-573 (EMI/GST/Savings calculators); src/components/ToolboxView.jsx:656-858 (CustomerReceiptGenerator); src/components/ToolboxView.jsx:861-1022 (StaffReceiptGenerator); src/components/ToolboxView.jsx:1025-1189 (VendorReceiptGenerator); src/components/ToolboxView.jsx:1192-1373 (WarrantyCardGenerator); src/components/ToolboxView.jsx:1376-1565 (OnePageQuotationGenerator)
- notes: Staff vs vendor receipt: about 83 of about 162 lines differ, and both already use ProfessionalDocument (ToolboxView.jsx:578). Each generator prints with window.print(). Keep the per-generator default line items (salary/TA/commission options at 772, 919).

### validateFields(fieldConfig) + defaultsFromFields() (risk medium, ~190 lines)
A small config-driven validator for the new custom-field system that replaces zod (its only consumer is one safeParse) and the hand-written DEFAULT_LEAD_FORM. This removes zod from the bundle (estimated 55–60 KB minified, about 15 KB gzip).
- replaces: src/utils/validation.js:1-127; src/models.jsx:1-83; src/components/AddLeadModal.jsx:1,11,226,256,485-500; src/components/AgentPortal.jsx:16 (unused DEFAULT_LEAD_FORM import)
- notes: It must keep these behaviours: phone cleaning (strip non-digits, leading 0, 91 prefix, then exactly 10 digits); pincode exactly 6 digits or empty; payment_type normalised to Cash/Loan with empty failing; passthrough of undeclared keys (comment at validation.js:19-22); the exact error-message strings; and AddLeadModal's rule of showing optional fields when an issue is outside customer_name/phone_number (line 494). customerSchema (line 122) is unused.

### useMetadataOptions(category) (cached) (risk low, ~40 lines)
One cached hook or service for dropdown options from the metadata table, replacing per-portal ad-hoc fetches and the demo reference.json inverter list. This becomes the backbone of config-driven dropdowns.
- replaces: src/utils.jsx:54-68 (useMetadata, currently dead); src/components/Dashboard.jsx:418-430; src/components/AgentPortal.jsx:290-300; src/components/modal-tabs/MaterialIntegrationTab.jsx:7,63 (bomReference.metadata.inverter_make); src/components/modal-tabs/shared.jsx:57-89 (fetchVendorNames cache pattern to generalise)
- notes: Write paths (UserManagementView/ChannelPartnerManagementView insert/update/delete on metadata) must invalidate the cache, the same way invalidateVendorNames (shared.jsx:76, currently unused) was meant to.

### bomTemplates config (single source) (risk medium, ~3140 lines)
BOM roof/shed templates exist in three places. Move them to per-client config or a DB table and delete the 72 KB demo reference.json from the AgentPortal and CustomerDetailModal chunks (about 38.6 KB minified JSON, of which only ROOF[0]/SHED[0] items and inverter_make are read).
- replaces: src/constants.js:97-194 (ROOF_BOM_TEMPLATE, SHED_BOM_TEMPLATE, COMMON_BOM_ITEMS); src/inventory/reference.json:1-3046; src/utils/bom.js:13-15; src/components/VendorPortal.jsx:12,152,173; src/components/modal-tabs/MaterialIntegrationTab.jsx:7,63; src/components/CustomerDetailModal.jsx:20 (unused ROOF/SHED imports)
- notes: bom.js marks every template item quantity_editable:true. VendorPortal picks the shed template by roof_shed containing 'shed' and bom.js uses type==='SHED', so keep both rules or unify them. The tests tests/**/bom and inventory read reference.json, and dev/tourPreview uses .catalog (delete with dev).

### src/lib/pdf.js capturePagesToPdf(pages, {scale, quality}) (risk low, ~25 lines)
One dynamically imported html2canvas+jsPDF page-capture routine shared by the agreement PDF and the quotation PDF, so the PDF stack stays in one async chunk.
- replaces: src/components/agreement/AgreementPreview.jsx:19-41; src/quotations/pdf.jsx:9-33
- notes: Agreement uses scale 1.5, JPEG 0.88, and temporarily blanks inline background-color highlights. Quotation uses scale 2.25, JPEG 0.97, fixed 794x1123 window, zeroes canvas after use, and requires exactly 3 pages.

### config/featureCatalog.js (risk low, ~30 lines)
The feature list that the sales enquiry form already contains (INTEREST_OPTIONS / OTHER_INTEREST_OPTIONS / DOCUMENT_OPTIONS) becomes one catalogue shared by the new setup forms and the runtime featureRegistry. The 64 KB enquiry form itself can then leave the client runtime entirely.
- replaces: src/enquiries/brief.js:1-25; src/components/CustomizationEnquiryForm.jsx:10-16; src/components/PricingView.jsx:20-30
- notes: The catalogue currently lists removed or never-built features ('MIS upload auto updater', 'Channel partner commission view', 'Warranty tracking', 'Stamp staff login'). Mark them unavailable rather than silently dropping them, because saved briefs reference these strings.

### Plain AppShell (remove demo wrappers) (risk medium, ~700 lines)
Replace the DemoHeader render-prop wrapper, demo cleanup jobs, the demo role-picker login and the demo-isolated Supabase client with a plain shell, env-configured client and real email/password login. This removes the demo modules from the startup bundle.
- replaces: src/App.jsx:1-2,7,10,20-53,111-138,170-172; src/components/LoginScreen.jsx:1-2,10,12,14-16,95-99,128-160,540-592; src/demo/DemoHeader.jsx:1-41; src/demo/RolePicker.jsx:1-33; src/demo/tour.js:1-25; src/demo/tourSteps.js:1-109; src/demo/demo.css:1-116; src/demo/deliveryBatches.js:1-40; src/demo/drivers.js:1-23; src/demo/vendors.js:1-26; src/supabase.js:1-28; useDemoTourNavigation call sites in Dashboard/AgentPortal/VendorPortal/StampPortal/SubsidyView/LoanView/InventoryView
- notes: Keep the password-recovery flow (App.jsx:71-73,104,143-151 to PasswordRecoveryModal) and signInWithPassword (LoginScreen.jsx:80). demo/stageRequirements.js is real stage-gating logic, so move it into the stage config instead of deleting it. vendor name remapping demoVendorTarget (App.jsx:94,132) is demo-only. demo.css class names are referenced throughout Dashboard (demo-dashboard-main etc., Dashboard.jsx:1460-1700), so rename them before deleting the file.


## details
## 0. Caveats
- I ran no build. That is forbidden here, and it would fail anyway: client_builder/node_modules has 54 of 382 packages with a missing `main`/`module` file. Affected packages include vite, @vitejs/plugin-react, jspdf, html2canvas, lucide-react, @supabase/* and eslint-visitor-keys; it looks like the copy left out `dist/` folders. Run `npm ci` before measuring with `vite build` plus a visualizer.
- All sizes below are **source bytes** taken from the import graph. Rough conversion: minified ≈ 0.55× source, gzip ≈ 0.27× minified.
- `package.json` is still named `solarflow-demo`.
- `scripts/check-isolation.mjs:15,24` pins the demo hostname and demo Supabase ref.
- `index.html`'s CSP hard-codes the demo Supabase ref. The client template has to make it a template value.

## 1. Heavy libraries (package.json and how they are imported)
| lib | imported by | how it loads |
|---|---|---|
| jspdf + html2canvas | components/agreement/AgreementPreview.jsx:20-22, quotations/pdf.jsx:9 | Lazy (`import()` on click). OK |
| pdf-lib | feasibilityReport.js:98, utils.jsx:1051 | Lazy. OK |
| @zxing/browser (+ @zxing/library peer) | components/SerialScanner.jsx:36 | Lazy. OK |
| zod 4.6.5 | utils/validation.js:1, only consumer AddLeadModal.jsx:492 | Loaded normally inside the AddLead and AgentPortal chunks; about 15 KB gzip for one `safeParse` |
| lucide-react 0.454 | 63 files, named imports, 99 distinct icons | Unused icons are dropped at build (`sideEffects: false`); 122 unused icon imports are only clutter |
| @supabase/supabase-js | supabase.js | Loaded at startup (expected) |
| fflate | not imported directly; it is a dependency of jspdf | — |

**Lazy loading today:**
- App.jsx:11-17 lazy-loads 7 screens: the PasswordRecovery screen, TeamChat, Dashboard, Agent, Vendor and Stamp portals, and Pricing.
- Dashboard.jsx:21-39 lazy-loads 17 views with lazyWithRetry.
- vite.config.js sets no `build` options: no manualChunks, no feature stripping at build time.

## 2. Large static data
- **src/inventory/reference.json** (3,046 lines, 71.8 KB; 38.6 KB as minified JSON):
  - Imported normally by utils/bom.js:13 and by MaterialIntegrationTab.jsx:7, which are reached from AgentPortal and CustomerDetailModal. Also used by dev/tourPreview.jsx:4.
  - Code reads only `scenarios.ROOF[0]`, `scenarios.SHED[0]` (bom.js:15) and `metadata.inverter_make` (MIT:63).
  - `templates`, `catalog`, `source_counts` and the other scenarios are unused, and all of it is demo data ("Demo Cedar Solar"…).
  - Verdict: demo-only. Delete it and move the BOM templates into config.
- **src/demo/seed200.js** (130 lines): only dev/tourPreview.jsx uses it, and that file is never imported. Dead.
- **src/mock/** and **src/hooks/**: empty directories.
- **src/quotations/template/data/initialData.js** (208 lines, 6.7 KB):
  - Path: model.js:1 → repository → quotations/client.js.
  - Dashboard.jsx:41 imports it normally, only for `insertConversionLead` at :1197, so it sits in the Dashboard chunk.
  - Content is a demo company ("SOLARFLOW", DEMO-GST-001, demo intro text) plus INVERTER_PRESETS. Should become per-client branding config.
- **src/utils/staffAttendance.js:86-179** is a demo staff list and attendance seed. The whole store lives in localStorage (:180-205). The client version needs a DB table.
- **public/banner.png** (1.1 MB) is used only by the quotation template (Page1.tsx:26, CompanyLogos.tsx:20). Replace with an uploaded per-client logo, or a WebP of about 100 KB.

## 3. Import graph (from src/main.jsx)
### Loaded at startup: 30 files, 272 KB source
Demo and marketing code makes up about 181 KB of this (about 66%):

| file | size |
|---|---|
| CustomizationEnquiryForm.jsx | 63.6 K |
| enquiries/brief, reopen, submit, draft | 16.2 K |
| LoginScreen.jsx (mostly the demo role grid) | 25 K |
| demo/tourSteps.js | 18.9 K |
| demo/demo.css | 18.6 K |
| DemoHeader + RolePicker + tour | 10.2 K |
| demo seeders (deliveryBatches, drivers, vendors) | 7.6 K |

Other startup files that can be cut down:
- **constants.js** (35 K, 561 lines) loads at startup only because LoginScreen needs `APP_ROLES`.
- **ImageCropModal** (17.9 K) loads at startup through GlobalPopup.jsx:11. It is only used in 'image-cropper' mode.

### Lazy chunk sizes
These are new source bytes beyond the startup set, ignoring unused imports.

| chunk | size | contents |
|---|---|---|
| AgentPortal | 778 K / 39 files | AgentPortal 211K, Toolbox 94K, reference.json 72K, AddLead 66K, shared 55K, utils 54K, the quotation module (about 26 files, about 137K + 20K css), BomPrintView/Modal 23.5K, agreement pages 40K, zod |
| CustomerDetailModal | 838 K / 39 files | all 15 stage tabs (394K), reference.json, VendorCalendarView 33K (via MaterialDeliveryTab:7), feasibilityReport 12K (via LoanTab:6), SerialScanner, BomPrint, AgreementPreview |
| QuotationModule | 318 K | |
| VendorPortal | 289 K | includes VendorCalendarView 33K, imported at VendorPortal.jsx:16 but used only at :1112 |
| Dashboard | 217 K | |
| AddLeadModal | 182 K | |
| DeliveryBatches | 175 K | |
| UserManagement | 167 K | |
| StampPortal | 162 K | |
| ChannelPartnerMgmt | 156 K | |
| Attendance | 147 K | |

utils.jsx (54K) and modal-tabs/shared.jsx (55K) end up in almost every chunk, so Rollup will make them shared chunks.

### Files never imported (12 source files, about 1,357 lines with HistoryEntryEditor)
| file | lines |
|---|---|
| components/BrevoModal.jsx | 475 |
| components/DevRoleSwitcher.jsx | 228 |
| components/SetPassword.jsx (PasswordRecoveryModal is used instead) | 198 |
| demo/seed200.js | 130 |
| demo/DemoPeople.jsx | 19 |
| dev/bomPreview.jsx, quotationPreview.jsx, tourPreview.jsx | 149 total |
| quotations/template/components/ContactLine.tsx | 17 |
| utils/customerDetailHandlers.js (duplicate of shared.jsx:90) | 16 |
| components/HistoryEntryEditor.jsx (only imported, unused, at CustomerDetailModal.jsx:23) | 125 |

Also:
- Root `bom-preview.html`, `quotation-preview.html` and `tour-preview.html` exist only for dev.
- **Never imported but worth keeping and wiring up:** UpdateChecker.jsx (104 lines, polls public/version.json) and OfflineBanner.jsx (35 lines).

### Unused imports: 192 names in 40 files
eslint.config.js:40 has `varsIgnorePattern '^[A-Z_]'`, which hides every one of these.
- 122 are lucide icons.
- 29 are stage-tab imports: AgentPortal.jsx:24-37 (14) and CustomerDetailModal.jsx:36-50 (15).
- CustomerDetailModal also has unused Page1 (:25), HistoryEntryEditor (:23), DocGalleryRemarkRow, normalizeInstallationStatus (:56) and 6 constants (:20).
- CUSTOMER_CARD_COLUMNS is imported and unused in 6 views (Dashboard, Subsidy, Loan, Installation, InstallationPayments, Trash).
- ROOF/SHED/COMMON_BOM in MaterialIntegrationTab.jsx.
- DELIVERY_PICKER_COLUMNS in DeliveryBatchesView.jsx.
- CustomizationEnquiryForm in DashboardView.jsx:13. Its only use sits in the commented-out block at :122-155, and the unused `showEnquiryModal` state is at :94.
- AgentPortal DEFAULT_LEAD_FORM (:16), AddLeadModal toIndianCommas, ToolboxView useRef, QuotationForm validate, VendorCalendarView getVendorUnavailability.
- SectionHeader, ChecklistModeToggle and EditableDetailItem imported in 6 tabs without use.

### Unused exports
- **utils.jsx:** useMetadata (54), diffAdminUpdates (94), exportAllToCSV (252-540, about 290 lines), getTodayISTDateString (605). normalizeAdminValues and compressImage are used only inside the file.
- **shared.jsx:** invalidateVendorNames (76) is unused. MetaSelect, StageRemarkSection, DetailItem and PaymentsEditor are used only inside the file. generateDemoSampleFile (9-56) is demo-only.
- **constants.js:** META_CATEGORIES (79) and DEFAULT_PAGE_SIZE (528) are unused. DELIVERY_PICKER_COLUMNS (552) is only imported, never used.
- **validation.js:** customerSchema (122) is unused.

### Removed features
- **StampPortal (989 lines)** is still reachable: App.jsx:16 and :140, the 'stamp' role at constants.js:89, and LoginScreen's `Stamp` icon. Stamped-document handling also appears in DiscomSubmissionTab (126 'stamp' references; these are a document type, so keep them).
- **MIS upload:** no code exists, only marketing text (PricingView.jsx:28,111; CustomizationEnquiryForm.jsx:15,587; enquiries/brief.js:20).
- **Warranty tracking:** no tracker exists. There is only the Toolbox WarrantyCardGenerator (ToolboxView.jsx:1190-1373), the doc type `warranty_card` (constants.js:272,308,475,502), the dead CSV export, and PricingView.jsx:23.
- **Channel partner commission:** no module exists. Vendor commission lives in InstallationPaymentsView (670 lines) and VendorPortal.jsx:1119-1145. InstallationPaymentsView.jsx:102-124 **makes up** missing delivery/installation dates and a ₹2,200/kWp commission. That is demo-only behaviour and must go.

## 4. Ordered plan

### Phase A: safe deletions (no behaviour change)
1. Delete src/dev/ and the 3 root *-preview.html files.
2. Delete demo/seed200.js and demo/DemoPeople.jsx.
3. Delete BrevoModal.jsx, DevRoleSwitcher.jsx and SetPassword.jsx.
4. Delete utils/customerDetailHandlers.js and template/components/ContactLine.tsx.
5. Delete HistoryEntryEditor.jsx together with its import at CustomerDetailModal.jsx:23.
6. Remove the empty src/mock and src/hooks directories.
7. Remove the 192 unused imports and the dead exports listed above. Change the eslint `varsIgnorePattern` so unused component imports get flagged.
8. Wire up UpdateChecker and OfflineBanner rather than deleting them.

### Phase B: demo and marketing removal (needs code edits)
9. **StampPortal** and the stamp role (App.jsx:16,140; constants.js:89; LoginScreen.jsx:15).
10. **Marketing pages:** PricingView, CustomizationEnquiryForm and enquiries/* (1,037 lines, 89 KB, of which about 80 KB loads at startup). Also App.jsx:58-68,119-120,152-164 and DashboardView.jsx:13,94,122-155.
    - The setup forms need the feature list, so move it to config/featureCatalog.js.
    - Lazy-load the form only on the builder/admin route.
    - Update the tests in tests/enquiries and tests/demo.
11. **Demo runtime** (413 lines, 55 KB, all loaded at startup): DemoHeader, RolePicker, tour, tourSteps, demo.css, and the deliveryBatches/drivers/vendors seeders.
    - Remove the demo branches in App.jsx and LoginScreen.jsx.
    - Remove useDemoTourNavigation from 7 files.
    - Replace demo/config.js and the supabase.js isolation wrapper with an env client.
    - Move demo/stageRequirements.js into the stage config.
12. **Demo data inside real modules:**
    - utils.jsx:697-705, 797-806, 832, 866
    - shared.jsx:9-56
    - staffAttendance.js:86-205 (replace with a DB table)
    - InstallationPaymentsView.jsx:102-124
    - initialData.js company text
    - public/banner.png
13. **reference.json:** replace with bomTemplates config and useMetadataOptions('inverter_make'). Remove the duplicate BOM templates at constants.js:97-194.

### Phase C: lazy-loading boundaries (largest first-load win first)
A lazy() chunk is fetched only when it renders, and Vite does not prefetch dynamic imports. So **a feature-flag check before rendering is enough to keep a switched-off feature from ever being downloaded**, provided no normal import of it remains anywhere in the reachable graph.

14. **AgentPortal:** make these lazy:
    - QuotationModule (:19, rendered at :1404)
    - ToolboxView (:14, :1419)
    - AddLeadModal (:18, :1425)
    - AgreementPreview (:5, :2877)
    - BomPrintModal and utils/bom (:39-40, :2885)

    Also drop the 14 dead tab imports. Effect: about 778 K → about 330 K source (−57%).
15. **Customer modal:** add `<StageTabOutlet>` as a per-stage lazy registry and drop the dead imports at CustomerDetailModal.jsx:36-52. Make AgreementPreview (:24, :2049) and ConflictResolutionModal lazy. Effect: about 838 K → about 235 K, plus about 25 K on average per opened tab. Disabled stages are never fetched.
16. **Inside the tabs:**
    - MaterialDeliveryTab.jsx:7: make VendorCalendarView lazy (33 K, rendered at :706).
    - LoanTab.jsx:6: load feasibilityReport with `import()` inside the handlers at :229/:261.
    - MaterialIntegrationTab.jsx:5,10: make BomPrintModal and SerialScanner lazy (rendered at :1154/:1164).
17. **VendorPortal.jsx:16:** make VendorCalendarView lazy.
18. **Dashboard.jsx:41:** turn the quotations/client import into `import()` at :1197. Gate all 17 lazy views through featureRegistry.
19. **App.jsx:173:** TeamChatDrawer is mounted for every logged-in user, so its 25.6 K always downloads. Gate it on `features.teamChat` and mount it on first open.
    - GlobalPopup.jsx:11/146: make ImageCropModal lazy (18 K off startup).
20. **ToolboxView:** load each of the 8 tools lazily.
21. **constants.js:** split it into a tiny roles/stages module and lazy domain modules or config (DOC_TYPE_*, ADMIN_COLUMNS 390-512, BOM).
22. **utils.jsx:** split it into lib/* modules. Remove the two `import('../utils')` calls (AgentPortal.jsx:703, shared.jsx:725); they cannot split anything because utils is also imported normally.

### Phase D: build configuration
- **Stable vendor chunks** for cache reuse across client rebuilds:
  ```js
  build.rollupOptions.output.manualChunks = {
    'vendor-react': ['react', 'react-dom', 'scheduler'],
    'vendor-supabase': ['@supabase/supabase-js'],
  }
  ```
  Leave jspdf, html2canvas, pdf-lib and zxing as their own lazy chunks, as they are today.
- **Strip disabled features at build time:**
  - Add `define: { __FEATURES__: JSON.stringify(clientConfig.features) }`.
  - Write registry entries as `__FEATURES__.x && lazyWithRetry(() => import(...))`.
  - Rollup then drops the import, so a disabled feature isn't even emitted.
  - Runtime switches stored in the DB still hide features and keep them from being fetched.
- **Optional:** jsPDF's ES build has optional dynamic imports (canvg, dompurify) that only matter for `.html()` and SVG. Aliasing them to a stub trims emitted chunks; verify after the build.
- **index.html:** remove the Google Fonts Roboto link.
  - It loads 5 weights and blocks rendering.
  - The body font is 'Nunito Sans' (index.css:40), which is never loaded.
  - Roboto is used only in the DeliveryBatchesView print CSS (:649).

## 5. Expected size wins (estimates)
- **Startup app code:** 272 K → about 55–65 K source (about −78%; roughly 38 K → 9 K gzip). One render-blocking font stylesheet is also removed.
- **Agent portal first open:** about −450 K source (about −65 K gzip), with zod (about −15 K gzip) and reference.json (about −7 K gzip) gone.
- **Opening a customer:** about −600 K source (about −85 K gzip). Switched-off stages and features cost 0 bytes.
- **public/:** about −1 MB (banner.png).
- **Source lines:** deletions come to about 7k lines (about 15% of 48k): 1,357 unreachable, 1,037 marketing, 413 demo runtime, 989 StampPortal, 3,046 JSON, about 330 dead utils code, and unused imports. The shared components above save about 1.5k more lines.