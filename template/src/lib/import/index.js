// Customer import: spreadsheet files in, rows for public.admin out.
// Used by the Import customers view and by scripts/import-customers.mjs.

export { LIMITS, SpreadsheetError } from './errors.js';
export { parseCsv, detectDelimiter } from './csv.js';
export { readXlsx } from './xlsx.js';
export { readSpreadsheet, tidyRows, detectHeaderRow, columnNames, columnLetter } from './sheet.js';
export {
    importTargets, guessMapping, mappingProblem, distinctValues, guessStageMap, buildImport, blankSheetHeaders,
    headerKey, paymentTypesFor, TARGET_GROUPS, STAGE_TARGET, NAME_TARGET,
} from './mapping.js';
export { cleanText, matchKey, phoneKey, consumerKey } from './values.js';
