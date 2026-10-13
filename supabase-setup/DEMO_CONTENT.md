# 50 customers and examples for every login

In the separate SolarFlow demo project's SQL Editor, paste and run the entire `02_sample_data_50.sql` file. If initial setup has never been run, run `01_solarflow_demo.sql` first. Do not rerun the initial setup against an existing database.

The sample update creates 50 fictional customers per visitor, reuses existing sample customers, and supplies quotations, notes, documents, BOMs and delivery records. Existing demo profiles are updated immediately; new visitors receive their sample data on first entry. Repeating it preserves customer edits and does not duplicate the 50 samples. Your own additional customers can make the total exceed 50.

Role switching uses the same visitor sandbox. It does not require eight real accounts or passwords.

| Login | What to show |
| --- | --- |
| Admin | Dashboard, all 50 customers, quotations and pipeline stages |
| Office | Leads, quotations, delivery and installation |
| Channel Partner Office | Customers assigned to Demo Aurora Solar |
| Manager | Demo Aurora Solar's project pipeline |
| Dealer | Customers assigned to Demo Dealer and quotations |
| Channel Partners | Demo Aurora Solar's customers and quotations |
| Vendors | Demo Vendor's delivery, installation and photo work |
| Stamp Guy | Customers 10, 26 and 42 in Pending Queue; Customer 15 in My Record |

Stamp examples are added only where the existing agreement data is empty. Any Stamp assignments or text you have already edited remain intact.

## Text you can copy or replace

- Lead note: Customer is interested in a rooftop solar system. Confirm roof measurements and prepare a proposal.
- Follow-up: Call the customer to confirm the site visit and electricity bill details.
- Delivery note: Confirm the delivery address and access for unloading before scheduling dispatch.
- Installation note: Review mounting, wiring and inverter placement with the site team.
- Photo note: Add your own sample roof, installation and geo-tag photos here.
- Stamp first party: Demo Customer 10
- Stamp second party: SolarFlow Demo Energy
- Stamp purchased by: Demo Customer 10
- Stamp value: 300
- Stamp description: Sample rooftop solar installation agreement. Demonstration only.
- Stamp remark: Review the agreement details and add your own sample stamp image.
- Completion note: Sample project completed. Review the final customer record and supporting documents.

## Add your pictures

Open a customer and use the relevant document or photo upload control. For Stamp, use **Upload PM Surya Ghar Stamp**. The seed includes local mock document previews; it does not upload photographs. Replace these with your own demo images when ready.

This file and the SQL have been prepared locally. They do not mean that the hosted database has been updated.
