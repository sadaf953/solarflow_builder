# SolarFlow demo isolation

This copy uses only the new demo Supabase project qduonewmquwayrnwyzvc and the new GitHub remote https://github.com/sadaf953/Solarflow.git. The original backend, repository and deployment workflows are disconnected.

The demo is deliberately published at solarflow.deeprootsystems.in, served by GitHub Pages from the gh-pages branch with Cloudflare in front. This is a decision taken after the original isolation work, and it is the one point at which this copy shares a domain with the original project; the backend, repository and workflows remain severed. public/CNAME carries the hostname so that each `gh-pages -d dist` force-push preserves it a deploy without that file silently drops the custom domain and the site returns "There isn't a GitHub Pages site here." The isolation guard permits that one hostname and rejects a CNAME naming any other.

## Current behavior

- Environment parameters are VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Only the new demo URL and a public anon/publishable key are accepted.
- Browser transport and Content Security Policy restrict Supabase traffic to that project. Edge Functions remain blocked, so copied email integrations cannot send messages.
- Visitors choose one of eight personas without entering passwords or keys. Supabase Anonymous Sign-Ins must be enabled. Role switching preserves the visitor's private sandbox. Upgrade 03 gives every role a stable demo_profiles directory record, distinct from the visitor Auth profile, plus integration staff linked to metadata and BOMs.
- The header offers a guided feature tour and role switching. The old isolation banner is removed.
- SQL setup and seed updates are in supabase-setup/. The user reports running the 50-row seed. The connected-profile/status upgrade (03) is locally validated and has not been executed by this agent on hosted Supabase.
- Inventory upgrade 04 uses user-supplied metadata/BOM CSV labels and quantities as reference, with explicitly sample opening stock. Original IDs, dates and customer links are excluded. Upgrade 08 replaces imported partner, staff and office names with fictional demo labels, including existing linked records. Each visitor owns separate stock and movement records.
- Inventory upgrade 07 connects delivery status to transactional BOM stock deductions using the existing tables. Missing quantities and insufficient stock stop delivery; project issue markers prevent duplicate deductions. Hosted execution remains user-managed.
- Upgrade 09 scopes CPO lead reads/writes to its own creator ID and linked dealer IDs, with matching document/BOM policies. The visitor may still intentionally switch roles within their sandbox.
- Company/customer details and assets use fictional SolarFlow values. Original logos and copied screenshots/PDFs were removed. Mock documents display a local SVG, not real identity documents.

Use port 5186 for development and 4186 for preview. Other project servers are unrelated.

## Safeguards and limits

Run npm run check:isolation, npm run test:isolation, and npm run build after integration changes. Guards reject other Supabase targets, secret keys, unexpected remotes, deployment workflows and project bindings. The one exception is the approved custom domain above: a CNAME containing solarflow.deeprootsystems.in passes, and a CNAME containing anything else fails. These checks protect this working copy, not arbitrary future commands or account-wide login state.

The original Git directory is archived outside this project at /Users/mahvishsadafv2/Desktop/solarflow_demo_git_recovery_20260914/original.git. Credential-bearing local configuration and FETCH_HEAD were removed before archival. Historical secrets/customer data may remain there. Never restore or publish that archive.

Global credentials and the original project were left unchanged. Browser/OS account logout was not verified. A token previously found in the copied Git configuration should be revoked in GitHub settings.

## Verification scope

Local tests cover the transport allowlist, blocked email functions, quotations, SQL seed counts/idempotency, and cross-visitor RLS. The tour is also checked through a dev-only synthetic UI fixture. Hosted role entry currently reports Anonymous Sign-Ins disabled; end-to-end hosted Auth/Storage/realtime verification remains pending that setting and SQL setup. Personas control the displayed portal, not production permission levels: every visitor may choose Admin within their own sandbox.
