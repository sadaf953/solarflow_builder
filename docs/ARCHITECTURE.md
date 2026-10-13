# SolarFlow Client Builder — architecture and contracts

This repo turns the SolarFlow demo into a per-client product.

- `template/` is the client CRM. It is shipped, nearly unchanged, inside every client zip.
- `builder/` is the agency website. Clients fill two setup forms there, and the admin downloads `<client-slug>-solarflow.zip`.
- `legacy/` holds the old demo SQL and scripts. It is reference only: nothing in `legacy/` ships, and nothing imports it.

**Hard rule:** never read from or write to `~/Desktop/solarflow_demo`. That folder is the live demo, and this repo is a copy of it. All work happens in `~/Desktop/solarflow_client_builder`.

## 1. Layout

```
template/                     client app (standalone Vite project; root of every zip)
  index.html                  CSP / title are filled in by vite.config.js from .env + client.config.js
  vite.config.js              root = template/, envDir = SF_ENV_DIR || template/
  src/config/                 THE per-client contract (see §2)
  src/ui/                     shared component kit (see §4)
  src/lib/                    shared non-UI helpers (format, db, download, lazy, ...)
  src/components/...          existing app code, being migrated onto config + ui
  backend/schema.sql          full idempotent schema (run once per client, safe to re-run)
  backend/seed.js             configSeedSql(config) -> per-client seed SQL (pure)
  backend/functions/add_user  hardened Edge Function for staff logins
  README.client.md            becomes README.md in the zip
builder/                      agency website (Vite project, imports template/src/{config,ui,lib})
scripts/                      pack-template.mjs, make-client.mjs, check-secrets.mjs
tests/                        node --test suites (config, backend SQL via PGlite, builder, app helpers)
```

Dev commands are run from the repo root. Env comes from `./.env.local`, which git ignores.

- `npm run dev:template` serves the client app on 127.0.0.1:5186.
- `npm run dev:builder` serves the builder on 127.0.0.1:5187.
- `npm test`
- `npm run build:template`
- `npm run build:builder`

## 2. Config contract (`template/src/config/`)

| file | role |
|---|---|
| `catalog/features.js` | `FEATURE_REGISTRY`, `ROLE_FEATURE`, `VIEW_FEATURE`. This is every feature, with status `core` / `available` / `removed` / `not_built`. |
| `catalog/stages.js` | `BUILTIN_STAGES` (16 stages, fixed ids), `STAGE_IDS`, `RESERVED_STAGE_IDS`, `CUSTOM_STAGE_ID`, `STAGE_ICON_NAMES` |
| `catalog/dropdowns.js` | `DROPDOWN_CATALOG`. Metadata lists are client-editable rows; tag lists use fixed ids with editable labels. Also `CUSTOM_FIELD_TYPES`. |
| `resolve.js` | pure helpers: `defaultClientConfig()`, `resolveClientConfig(cfg)`, `validateClientConfig(cfg)`, `REQUIREMENT_RULES`, `slugify`, `keyFromLabel`, `isAllowedSheetUrl` |
| `serialize.js` | `clientConfigSource(cfg)` returns the text of `client.config.js` |
| `client.config.js` | **pure data**, generated per client. The template copy turns every available feature on. |
| `index.js` | runtime API (below). Import from `'../config/index.js'` (adjust the relative path). |
| `icons.js` | stage icon name → lucide component |

Runtime API (`config/index.js`), resolved once and frozen:

- **Features:**
  - `FEATURES`, `isOn(id)`
  - `isViewOn(viewId)`: Dashboard view ids. A view that no feature owns is always on.
  - `isRoleEnabled(userType)`; `constants.js` also exports `enabledRoles()`
  - `documentMode()` returns `'both' | 'files' | 'checklist'`
- **Pipeline:**
  - `PRIMARY_STAGES`: the client's stages in order, each `{id,label,icon,iconName,group,guidance,custom,terminal,parking,hideWhenPaymentType,requirements}`
  - `STAGE_IDS`: always all 16 built-ins
  - `STAGE_BY_ID`, `STAGE_GROUPS` (`[{id,label,stages:[ids]}]`), `STAGE_GUIDANCE`
  - `isStageEnabled`, `stageLabel(id)`
  - `isStageApplicable(stage, record)`, `getNextStageId(record)`, `applicableStages(record)`
  - `getStageRequirements(id)`, `missingStageRequirements(stageId, record)`. Requirement paths may be dotted, e.g. `custom_fields.survey_date`.
- **Extra fields:** values are stored in `admin.custom_fields[key]` (jsonb, flat keys).
  - `CUSTOM_FIELDS`: each `{key,label,type,stage,options?,required,showInAddLead,help}`
  - `customFieldsForStage(id)`, `addLeadCustomFields()`, `customFieldValue(record,key)`
- **Dropdowns:**
  - `dropdownOptions(category, meta)` returns the live `meta[category]`, or the client's configured defaults if it is empty
  - `METADATA_DEFAULTS`
  - `LOAN_TAGS`, `SUBSIDY_TAGS`, `INSTALLATION_TAGS`, `HOLD_STATUS_TAGS`, `tagLabel(tags,id)`
- **Branding:** `BRANDING` (`appName, companyName, address, phone, email, gstin, state, discomName, chargesLabel`), `CLIENT` (`name, slug, ownerEmail`)

`constants.js` re-exports `PRIMARY_STAGES`, `STAGE_IDS` and the four tag lists, so existing imports keep working. Stage ids are stored data: a client may rename a stage label, but never its id.

**Feature ids:**

| group | ids |
|---|---|
| core | pipeline, staffManagement, operationsPage, activityLog, trash, dealerFiltering (core, but needs dealers) |
| available | quotationMaker, channelPartners, cpos, branches, dealers, loanTracking, cashPayments, subsidyTracking, bomMaker, deliveryBatches, inventory, documentUploads, checklists, installationView, vendorLogin, vendorCommission, installationCommission, calendar, attendance, teamChat, dataExports |
| removed (always off) | toolbox, stampLogin, warrantyTracking |
| not_built (always off) | misUpload, cpCommission, technicianLogin |

**View ids → feature:**

| view id | feature |
|---|---|
| quotations | quotationMaker |
| loan_tags | loanTracking |
| subsidy | subsidyTracking |
| installation_tags | installationView |
| installation_payments | installationCommission |
| delivery_batches | deliveryBatches |
| inventory | inventory |
| calendar | calendar |
| attendance | attendance |
| exports | dataExports |
| toolbox | toolbox |
| users | staffManagement |
| channel_partner_mgmt | operationsPage |
| activity | activityLog |
| trash | trash |

The old `vendor_availability` view is replaced by `calendar`.

**Role → feature:**

| role | feature |
|---|---|
| vendor | vendorLogin |
| agent | channelPartners |
| channel_partner_office | cpos |
| office2 | branches |
| agent2 | dealers |
| stamp | stampLogin (removed) |

admin and sales always exist.

**Gating rules:**
- Hide what is off. Never import a switched-off feature eagerly: lazy-load views, tabs and portals behind `isOn`/`isViewOn`, so their chunks are never fetched.
- A removed feature must leave no trace in the UI: no nav item, no tab, no button, no label, no empty section.
- Saved session state (sessionStorage view, tab) that points at an off feature or a missing stage falls back to `dashboard` / `LEADS`.

## 3. Database contract (`template/backend/schema.sql`)

The client's own fresh Supabase project is set up by one idempotent script, followed by the per-client seed from `configSeedSql(config)`. There are no demo tables, demo columns, personas or seed customers.

**Tables (public schema), RLS on everywhere:**

- **`app_roles`**: `user_type pk, label, role, sort_order, enabled`. Enabled is seeded from config.
- **`app_settings`**: `key text pk, value jsonb, updated_at`. Keys:
  - `features`: the resolved map
  - `pipeline`: `{stages:[ids], terminal:[...]}`
  - `owner_email`
  - `client`: `{name, slug}`
- **`profiles`**: replaces the demo's profiles + demo_profiles. Columns:
  - `id uuid pk → auth.users on delete cascade`
  - `name, email, phone_number, user_type → app_roles`
  - `role` (display label)
  - `channel_partner` (partner/branch key)
  - `status ('active'|'inactive')`
  - `parent_profile_id → profiles` (CPO for office2/agent2)
  - `cpo_profile_id` (maintained by trigger)
  - `created_by → profiles`
  - `created_at, updated_at`

  There is **no `demo_profiles` table**. Every former `demo_profiles` reader uses `profiles`.
- **`admin`**: the projects/customers table. It keeps all demo columns except `demo_session_id`, `demo_seed_key` and `demo_scenario_version`, and adds:
  - `custom_fields jsonb not null default '{}'`
  - `google_drive_link, location_link`
  - `bom_data jsonb`, `bom_stock_issued_at`
  - `lead_creator_profile_id → profiles on delete set null`
- **`metadata`**: `id, category, label, sort_order int default 0, is_active bool default true, created_at, updated_at, unique(category,label)`. Load with `.eq('is_active', true).order('sort_order')`.
- **Other tables:** `vendors`, `drivers`, `activity_log`, `documents`, `bom`, `bom_items`, `delivery_batches`, `quotations` (owner_id nullable), `inventory_items`, `inventory_movements`, `staff_attendance` (status check includes `present, absent, half_day, leave, on_duty, pending_present, holiday_request, holiday`), `team_chat_messages`.
- **`calendar_events`** (NEW, replaces the localStorage vendor availability):
  - `id uuid pk default gen_random_uuid()`
  - `title text not null`
  - `kind text not null default 'event'`, check in `event, site_visit, meeting, follow_up, leave, unavailable`
  - `starts_on date not null`, `ends_on date` (null = same day)
  - `start_time time`, `end_time time` (null = all day)
  - `notes text`
  - `customer_id uuid → admin on delete set null`
  - `vendor_name text` (set for `unavailable` entries by vendors)
  - `created_by uuid → profiles default auth.uid()`, `created_by_name text`
  - `created_at, updated_at`

  Every active user can read every event and create events. Only the creator or admin/sales can update or delete. Vendors' `unavailable` entries drive the "vendor not available that day" warning when assigning deliveries.
- **View `cpo_leads`**: security_invoker; it is created last.
- **Storage:** private bucket `customer-documents` (20 MB), with policies that inherit admin visibility.
- **Realtime publication:** admin, delivery_batches, activity_log, team_chat_messages, calendar_events.

**RPCs (granted to authenticated):**

| RPC | notes |
|---|---|
| `move_stage(p_customer_id uuid, p_new_stage text, p_old_stage text, p_remark text default '')` | validates the stage against `app_settings.pipeline`; sets completed_at; logs activity |
| `merge_custom_fields(p_customer_id uuid, p_values jsonb) returns jsonb` | `custom_fields = custom_fields || p_values`; keys with null value are removed |
| metrics | `get_dashboard_metrics_scoped(...)`, `get_dashboard_metrics(...)`, `get_cpo_dashboard_metrics(...)` |
| inventory | `record_inventory_movement(...)`, `bom_stock_document`, `get_inventory_bom_lines`, `set_bom_stock_quantity` |
| delivery batches | `save_delivery_batch_atomic`, `delete_delivery_batch_atomic`, `update_delivery_batch_status_atomic` (same signatures as the demo) |

**Security:**
- Helper functions live in schema `solarflow_private` (security definer, `search_path=''`): `my_role()`, `is_active()`, `is_admin()`, `is_head_office()` (admin|sales), `current_cpo()`, `can_view_lead(uuid)`.
- **admin rows:**
  - head office sees everything
  - CPO and its office2/agent2 see their own scope
  - agent/agent2 see their own leads (`lead_creator_profile_id = auth.uid()`) or their `channel_partner`/`sub_channel_partner` name
  - vendor sees rows where `admin.vendor` matches their vendors row (`vendors.profile_id = auth.uid()` or the name match)
- **profiles:** non-admins cannot change `user_type`, `status`, `channel_partner` or `parent_profile_id` (guard trigger).
- **Bootstrap:** trigger `on_auth_user_created` on `auth.users` runs `solarflow_private.handle_new_user()`.
  1. The first user whose email = `app_settings.owner_email`, or if that is blank the first user while no active admin exists, becomes the active `admin`.
  2. Users created by `add_user` (`app_metadata.created_via = 'add_user'`) take `user_type`, `channel_partner` and `parent_profile_id` from app_metadata.
  3. Anyone else is created `inactive`.
- **Edge Function `add_user`:** actions `create | update_password | update_email | delete | set_status`.
  - It verifies the caller's JWT, then loads the caller's profile: the caller must be an active admin, or a CPO creating office2/agent2 under itself.
  - It refuses roles that are disabled in `app_roles`, writes the role into `app_metadata`, and restricts CORS to `ALLOWED_ORIGIN` if set.
- There is no anonymous sign-in and no public sign-up. The Supabase settings to use are in README.client.md.

## 4. Shared UI kit (`template/src/ui/`) and lib (`template/src/lib/`)

Build every new screen from these. When you touch existing code, replace a hand-rolled copy with the kit component if the behaviour is identical. Keep the existing look: the `sf-*` classes in `src/index.css`, stone/orange palette, `rounded-xl`, `min-h-11` touch targets, and `lucide-react` icons.

**ui (named exports from `template/src/ui/index.js`):**

- **Form fields:** `Field`, `Input`, `Select`, `Textarea`, `Toggle`
- **Choices:** `ChoiceCards`, `TagPicker`
- **Layout:** `SectionCard`, `Modal`, `Stepper`
- **Status and feedback:** `EmptyState`, `Spinner`, `LoadingState`, `ErrorBanner`, `SuccessBanner`, `StatTile`, `Badge`
- **Lists:** `SearchInput`, `FilterBar`, `LoadMoreButton`, `MonthSelect`, `YearSelect`
- **Config-driven fields:** `FieldRenderer` (renders one config field of any `CUSTOM_FIELD_TYPES` type), `FieldList` (read-only label/value rows from a field config)
- **Hooks:** `useAutosave`, `useDebouncedValue`, `useRefreshOnFocus`

**lib:**

| file | exports |
|---|---|
| `format.js` | `formatINR`, `formatCount`, `formatKwp`, `formatDate`, `todayIST`, `MONTH_NAMES`, `monthKey`, `getMonthBounds` |
| `db.js` | `fetchAllPages`, `customerSource(isCpo)` |
| `download.js` | `toCsv`, `downloadBlob` |
| `lazy.js` | `lazyWithRetry`, `LazyBoundary` |
| `metadata.js` | `useMetadataOptions(category)`, cached and invalidatable |

## 5. Ownership and conventions for agents

- **Edit only the files your task assigns you.** If you need a change in a file someone else owns, do not make it: put it in your report under `needs_from_others`.
- **Match the surrounding code:** naming, comment density and idiom. Avoid comments that restate the code. Never add features nobody asked for.
- **No demo leftovers:** no personas, no `isDemo`, no `demo_profiles`, no demo seeding or fabricated numbers, no `Demo …` labels in client UI.
- **Indian context:** ₹ amounts via `formatINR`, dates in Asia/Kolkata (`todayIST`), plain English copy.
- **Accessibility:** labels on inputs, `role="alert"` for errors, focus handling in modals, at least 44px touch targets.
- **Verification:** run `node --test "tests/**/*.test.mjs"` and the relevant build before reporting. Report honestly what you could not verify.
