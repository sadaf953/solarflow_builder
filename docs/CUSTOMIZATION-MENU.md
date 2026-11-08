# Customization menu

Every client gets the same launch: **3–5 working days** once their Supabase and Brevo accounts are ready. To keep that promise, what a client can change is a fixed menu. Everything on it is a setting in the setup forms or on the admin page, so nobody writes code for it.

Anything outside the menu is a **paid add-on**. It is quoted separately, built on its own timeline, and never delays the launch.

The code reads the menu from `builder/src/catalog/menu.js` (`CUSTOMIZATION_MENU`, `LAUNCH_DAYS`). The setup form shows it on the Send step under "What's included at no extra cost". If you change the menu, change that file and this page together.

## What's included in the launch

| Part | What the client can change | Limits |
|---|---|---|
| **Feature switches** | Every switchable feature in `template/src/config/catalog/features.js` (sales and partners, payments and subsidy, material and delivery, installation, team). The questions in Form A turn them on or off; the client and the admin can switch them by hand too. | Only features with status `available`. Removed and unbuilt features are never offered. |
| **Pipeline stages** | Rename any stage, put them in their own order, remove the ones they do not use, add their own. | Leads, Completed and Lost Project always stay, and so do the stages their features need. Up to 20 custom stages (`LIMITS.customStages`). |
| **Dropdown lists** | The choices in every list: panel brands, panel wattage, inverter brands, registration and store staff, ways customers pay, and the loan, subsidy, installation and lost-project statuses. | Up to 100 items per list. Status lists keep the steps the app relies on; installation statuses can only be renamed. |
| **Extra fields** | Their own fields on any stage except Completed and Lost Project: short or long text, number, amount (₹), date, dropdown, yes / no, phone number, file or photo upload. A field can be "must be filled before moving on" (except file uploads), and fields on Leads can be asked when adding a lead. | Up to 80 fields (`LIMITS.customFields`). |
| **Payment tabs** | Loan tracking, cash payment tracking, the installation payments page and the installer payout page. These are feature switches, set by the payment and installer questions. | — |
| **Details on documents** | Company name, address, GSTIN, website and logo; bank account details; the DISCOM name and the registration charges label. The admin fills these in on the client page. | — |

## What counts as a paid add-on

Anything that needs new code or a new design rather than a setting. Typical examples:

- a new document template (their own agreement, invoice or report format)
- a custom report
- WhatsApp messages sent from the app
- a new portal or login type
- moving old data beyond what the customer importer maps

When it is unclear, check the menu above. If the request is really a setting on it (renaming a stage, a new list value, an extra field), it is part of the launch at no charge.

## How requests are captured and quoted

1. On the Send step, the client lists anything they need that is not in the form ("Need something that isn't in this form?"). Up to 20 requests, 500 characters each. They are saved with the form as `addOnRequests`.
2. On the client page, the **Add-ons** section shows each request. For each one the admin picks a decision:
   - **In the menu — no charge**: it turned out to be a setting. Set it up as part of the launch.
   - **Paid add-on**: add the price in ₹ and a timeline, such as "2 weeks after launch".
   - **Not doing**: say why in the note.
3. The admin can add items of their own, for example something agreed on the phone.
4. Decisions save with the other admin settings (`settings.addOns`) and are printed in `SETUP-SUMMARY.md` under "Paid add-ons (separate timeline, not part of the launch)".
5. Send the client the quote for the paid add-ons separately, after the launch date is fixed.

## The rule

Add-ons never delay the launch. The app goes live with what is on the menu; paid add-ons follow on their own timeline, as a later update to the client's app.
