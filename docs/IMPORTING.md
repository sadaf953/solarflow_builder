# Importing customers

Most clients keep their customers in Excel, Google Sheets or WhatsApp. The importer brings those customers into SolarFlow, so the client's old data is already there on day one.

There are two ways in, and both use the same code (`template/src/lib/import/`):

- **In the app:** admins open **Import customers** in the sidebar.
- **Before handover:** the agency runs `npm run import-customers` and gets an SQL file.

## Files it reads

- **Excel workbooks (.xlsx, .xlsm).** Every sheet is read. When there are several, the user picks one.
- **CSV files** from Excel, Google Sheets or LibreOffice. Commas, semicolons and tabs all work. So do UTF-8, the old Windows encoding, and Excel's "Unicode text".

Other files get a message that says what to do:

- **Old .xls, .ods, .numbers or password-protected files:** open the file and choose **Save As → Excel Workbook (.xlsx)** or CSV.
- **Google Sheets:** choose **File → Download → Microsoft Excel (.xlsx)**.

**Limits:**
- 20,000 customers per file.
- 300 columns.
- 60 MB, both for the file and for what it unpacks to. A zip bomb is stopped as soon as it passes that.

## How columns are matched

The column names are taken from the first row with at least two filled cells, so a title row above them is skipped. The user can pick a different row.

Each column is then matched to one place in SolarFlow. Spacing, capitals and punctuation do not matter, and "Mob. No.", "Mobile Number" and "WhatsApp" all mean the mobile number. Common office and Hinglish words are understood too: "Party Name", "Gaon", "Taluka", "Jila", "CA No", "KW", "Load".

A header that is vague, or about someone else ("Dealer mobile", "Alternate mobile"), is left as **Don't import**, and the user chooses. Each place takes one column only. Every customer needs a name; the rest is optional.

The places a column can go:

- **Customer:** name, mobile, email, address, village / city, taluka, district, pincode, consumer number.
- **Solar system:** system size (kW), panel brand, panel wattage, number of panels, inverter brand.
- **Payment and partners:** payment type (Loan / Cash), invoice number and value. Some appear only when the client uses that feature:
  - loan bank, loan handled by and the Jansamarth number, for loans
  - channel partner and dealer, for partners
- **Project:** stage, date added, registration / feasibility number, registration date (only with a Registration stage), file number, installer, installation date, Google Drive and location links, remarks.
- **Your extra fields:** every extra field from the client's setup, except file uploads.

**Download a blank sheet** gives a CSV with exactly these column names, for a client who has no sheet yet.

## How values are read

- **Mobile numbers** become 10 digits: +91, 0 and spaces are dropped. If a cell has two numbers, the first is saved and the other goes into the remarks. A number that is not 10 digits is saved as written, with a warning.
- **Numbers and amounts** can be written as "5 kW", "1,20,000", "₹ 2,40,000/-" or "2.4 lakh".
- **Dates** can be:
  - Excel dates
  - 12/03/2024, read as 12 March (day first, the Indian way). A column that only makes sense month first, like 04/25/2024, is read month first.
  - 2024-03-12
  - 12 Mar 2024

  Dates are saved the way the app saves them. "Date added" is saved in India time.
- **Yes / No fields** accept yes, no, haan, nahi, true, false, 1 and 0.
- **Dropdown fields** match an option in any case. Anything else is kept as written, with a warning.

## Stages

If a column is saved as the stage, each different value in it is matched to one of the client's stages:

- by the stage's name ("Material Delivery")
- or by common wording: "Done" and "Installed" go to Completed, "Cancelled" and "Lost" go to Lost Project

The user can change each one. Anything unmatched, and empty cells, start in Leads. Only stages in the client's pipeline are ever saved.

## Duplicates

A row counts as a duplicate when its mobile number, or its consumer number, is already used. That can be by a customer already in SolarFlow, or by an earlier row of the same file. Customers in Trash do not count.

Duplicates are left out by default. The user can choose **Import them anyway**. Rows with no name, "Total" rows and repeated header rows are always left out, with the reason shown.

## In the app

The steps are: **Choose file → Match columns → Match stages → Check → Import**.

1. **Check** shows how many rows are ready, left out or have warnings, plus the first 20 customers as they will be saved. Nothing is saved before this step.
2. **Import** saves 100 customers at a time.
   - If something fails, it stops and says which rows were saved.
   - **Download rows that were not imported** gives a CSV with the reason for each row. Fix the file and import that CSV.
3. **Undo this import** moves exactly the customers from this import to Trash, the same as deleting them one by one. They can be recovered from Trash. It works until the page is left.

The import adds one entry to the Activity Log. New channel partner and panel brand names join their dropdown lists.

## Before handover (agency)

```bash
npm run import-customers -- <client folder> <file.xlsx|csv> [--sheet name] [--mapping mapping.json] [--write-mapping mapping.json] [--out file.sql] [--duplicates skip|import]
```

- The first argument is the unzipped client folder, or the path to its `src/config/client.config.js`.
- The script prints the column and stage matches it used, the counts, and the first warnings.
- It writes `client-zips/<slug>-import-customers.sql`.
- Run that file after `backend/setup.sql`, as one query: in the SQL Editor, or through the Management API.

To change the matches:

1. Run once with `--write-mapping mapping.json`.
2. Edit the file:
   - `columns`: each column name → a target such as `phone_number` or `custom_fields.survey_date`, or `null`.
   - `stages`: each value → a stage id or name.
3. Run again with `--mapping mapping.json`.

The SQL file runs in one transaction, so either every customer goes in or none does. Running it again adds nothing new: each row has a fixed id, and customers already saved with the same mobile or consumer number are skipped (unless `--duplicates import`).
