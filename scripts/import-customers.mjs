// Loads a client's old customers before handover.
//
//   node scripts/import-customers.mjs <client folder | client.config.js> <file.xlsx|csv>
//       [--sheet name] [--mapping mapping.json] [--write-mapping mapping.json]
//       [--out file.sql] [--duplicates skip|import]
//
// Reads the file with the same code as the app's Import customers page and
// matches columns and stages the same way, unless a mapping file says
// otherwise. It prints what it decided, then writes one SQL file
// (client-zips/<slug>-import-customers.sql) that adds the customers in a
// single transaction. Run it after backend/setup.sql, as the database owner
// (SQL Editor or the Management API), as one query.
//
// Running the file again adds nothing new: a row from an earlier run has the
// same id, and with --duplicates skip (the default) a customer already in the
// database with the same mobile or consumer number is left out too.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveClientConfig, validateClientConfig } from '../template/src/config/resolve.js';
import {
    buildImport, columnNames, consumerKey, detectHeaderRow, distinctValues, guessMapping, guessStageMap, importTargets,
    matchKey, mappingProblem, phoneKey, readSpreadsheet, STAGE_TARGET, usableSheets,
} from '../template/src/lib/import/index.js';

const USAGE = 'Usage: node scripts/import-customers.mjs <client folder | client.config.js> <file.xlsx|csv> [--sheet name] [--mapping mapping.json] [--write-mapping mapping.json] [--out file.sql] [--duplicates skip|import]';
const SHOWN = 20;

// ── SQL ──────────────────────────────────────────────────────────────────

// As backend/seed.js: Postgres rejects NUL in text and lone surrogates in
// jsonb, so both go; everything else is safe once quotes are doubled
// (standard_conforming_strings is on, so backslashes are literal).
const clean = value => String(value ?? '').toWellFormed().replaceAll('\0', '');
const cleanDeep = value => {
    if (typeof value === 'string') return clean(value);
    if (Array.isArray(value)) return value.map(cleanDeep);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [clean(key), cleanDeep(item)]));
    return value;
};
const sqlText = value => `'${clean(value).replaceAll("'", "''")}'`;
const oneLine = value => clean(value).replace(/[\r\n\u2028\u2029]+/g, ' ');
const COLUMN = /^[a-z][a-z0-9_]*$/;

// The same rules as phoneKey() and consumerKey() in lib/import/values.js.
const PHONE_KEY_SQL = `case
      when k.digits ~ '^[0-9]{10}$' then k.digits
      when k.digits ~ '^91[0-9]{10}$' then substr(k.digits, 3)
      when k.digits ~ '^0[0-9]{10}$' then substr(k.digits, 2)
      when k.digits ~ '^0091[0-9]{10}$' then substr(k.digits, 5)
    end`;

/** A uuid that is the same for the same row of the same file on every run. */
function stableId(slug, payload, occurrence) {
    const hex = createHash('sha256').update(`solarflow-import:${slug}:${occurrence}:${JSON.stringify(payload)}`).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 + (parseInt(hex[16], 16) % 4)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * One transaction that inserts `payloads` (from buildImport) into
 * public.admin, logs one activity entry, and adds new channel partner and
 * panel brand names to their dropdown lists, as the app does for a new lead.
 */
export function importSql({ config, payloads, source, duplicatePolicy = 'skip', generatedAt = new Date() }) {
    const resolved = resolveClientConfig(config);
    const slug = resolved.client.slug;
    const seen = new Map();
    const items = payloads.map(payload => {
        const fingerprint = JSON.stringify(payload);
        const occurrence = seen.get(fingerprint) || 0;
        seen.set(fingerprint, occurrence + 1);
        return {
            row: { id: stableId(slug, payload, occurrence), ...payload },
            phone: phoneKey(payload.phone_number),
            consumer: consumerKey(payload.consumer_no),
        };
    });
    const columns = [...new Set(items.flatMap(item => Object.keys(item.row)))];
    const bad = columns.find(column => !COLUMN.test(column));
    if (bad) throw new Error(`"${bad}" is not a column name.`);
    const list = columns.join(', ');
    const fileName = oneLine(source?.file || 'a spreadsheet');
    const where = source?.sheet ? `${fileName} (sheet "${oneLine(source.sheet)}")` : fileName;
    const dedupe = duplicatePolicy === 'import' ? '' : `
    and (i.phone_key = '' or not exists (select 1 from existing x where x.phone_key = i.phone_key))
    and (i.consumer_key = '' or not exists (select 1 from existing x where x.consumer_key = i.consumer_key))`;

    return [
        `-- ${payloads.length} customers for ${oneLine(resolved.client.name)}, from ${where}.`,
        `-- Written by scripts/import-customers.mjs on ${generatedAt.toISOString().slice(0, 10)}. Run it after backend/setup.sql.`,
        '-- Running it again adds nothing new: rows from an earlier run are skipped'
            + (duplicatePolicy === 'import' ? '.' : ', and so is a customer already saved with the same mobile or consumer number.'),
        'begin;',
        '',
        'with incoming as (',
        `  select r.*, coalesce(e.item ->> 'phone', '') as phone_key, coalesce(e.item ->> 'consumer', '') as consumer_key, e.n`,
        `  from jsonb_array_elements(${sqlText(JSON.stringify(cleanDeep(items)))}::jsonb) with ordinality as e(item, n)`,
        `  cross join lateral jsonb_populate_record(null::public.admin, e.item -> 'row') r`,
        '), existing as (',
        `  select ${PHONE_KEY_SQL} as phone_key,`,
        `    case when length(k.consumer) >= 4 then k.consumer end as consumer_key`,
        '  from public.admin a',
        `  cross join lateral (select regexp_replace(coalesce(a.phone_number, ''), '[^0-9]', '', 'g') as digits,`,
        `    ltrim(regexp_replace(upper(coalesce(a.consumer_no, '')), '[^A-Z0-9]', '', 'g'), '0') as consumer) k`,
        '  where a.deleted_at is null',
        '), inserted as (',
        `  insert into public.admin (${list})`,
        `  select ${columns.map(column => `i.${column}`).join(', ')} from incoming i`,
        `  where not exists (select 1 from public.admin a where a.id = i.id)${dedupe}`,
        '  order by i.n',
        '  on conflict (id) do nothing',
        '  returning id, channel_partner, module_brand',
        '), logged as (',
        '  insert into public.activity_log (action, message, new_value)',
        `  select 'create', 'Imported ' || count(*) || ' customers from ' || ${sqlText(where)}, 'Loaded by the SolarFlow team before handover'`,
        '  from inserted having count(*) > 0',
        '  returning id',
        ')',
        'insert into public.metadata (category, label)',
        'select distinct on (l.category, lower(l.label)) l.category, l.label',
        `from inserted i cross join lateral (values ('channel_partner', trim(i.channel_partner)), ('module_brand', trim(i.module_brand))) l(category, label)`,
        `where coalesce(l.label, '') <> ''`,
        '  and not exists (select 1 from public.metadata m where m.category = l.category and lower(trim(m.label)) = lower(l.label))',
        'order by l.category, lower(l.label), l.label',
        'on conflict (category, label) do nothing;',
        '',
        'commit;',
        '',
    ].join('\n');
}

// ── Config, sheet and mapping ────────────────────────────────────────────

export function findConfigPath(input) {
    const path = resolve(input);
    if (!existsSync(path)) throw new Error(`${input} does not exist.`);
    if (!statSync(path).isDirectory()) return path;
    const found = ['src/config/client.config.js', 'client.config.js', 'template/src/config/client.config.js']
        .map(candidate => join(path, candidate)).find(existsSync);
    if (!found) throw new Error(`No src/config/client.config.js in ${input}. Give the unzipped client folder or the path to its client.config.js.`);
    return found;
}

const targetFor = (value, targets) => {
    const wanted = String(value).trim().toLowerCase();
    return targets.find(target => target.key.toLowerCase() === wanted || target.label.toLowerCase() === wanted);
};
const stageFor = (value, stages) => {
    const wanted = String(value).trim().toLowerCase();
    return stages.find(stage => stage.id.toLowerCase() === wanted || stage.label.toLowerCase() === wanted);
};

/** The mapping a --mapping file describes, checked against this sheet and client. */
export function readMappingFile(json, { names, targets, stages }) {
    const problems = [];
    const notes = [];
    const columns = json?.columns && typeof json.columns === 'object' ? json.columns : {};
    const byName = new Map(names.map((name, col) => [name.toLowerCase(), col]));
    const mapping = names.map(() => null);
    for (const [name, value] of Object.entries(columns)) {
        const col = byName.get(name.trim().toLowerCase());
        if (col === undefined) { notes.push(`Column "${name}" in the mapping file is not in the sheet.`); continue; }
        if (value == null || value === '') continue;
        const target = targetFor(value, targets);
        if (!target) problems.push(`"${value}" (for column "${name}") is not something this client's SolarFlow can store.`);
        else mapping[col] = target.key;
    }
    const stageMap = {};
    for (const [value, stageId] of Object.entries(json?.stages && typeof json.stages === 'object' ? json.stages : {})) {
        const stage = stageFor(stageId, stages);
        if (!stage) problems.push(`"${stageId}" (for stage value "${value}") is not a stage in this client's pipeline.`);
        else stageMap[matchKey(value)] = stage.id;
    }
    return { mapping, stageMap, problems, notes };
}

export function mappingFileFor({ sheet, headerRowNumber, names, mapping, stageValues, stageMap, duplicatePolicy }) {
    return {
        sheet,
        headerRow: headerRowNumber,
        columns: Object.fromEntries(names.map((name, col) => [name, mapping[col]])),
        stages: Object.fromEntries(stageValues.filter(value => value.key).map(value => [value.value, stageMap[value.key]])),
        duplicates: duplicatePolicy,
    };
}

/**
 * Everything the command does except printing and exiting. `log(kind, text)`
 * receives the report ('info' | 'warn'). Returns { outPath, written } or
 * throws an Error worded for the person running it.
 */
export async function importCustomers({ configInput, filePath, sheet: sheetName, mappingPath, writeMappingPath, out, duplicates, log = () => {} }) {
    const configPath = findConfigPath(configInput);
    // The file's age in the URL, so a config edited since an earlier call in this process is read again.
    const { default: config } = await import(`${pathToFileURL(configPath).href}?v=${statSync(configPath).mtimeMs}`);
    const { errors } = validateClientConfig(config);
    if (errors.length) throw Object.assign(new Error('The client config has problems; fix them first.'), { details: errors });
    const resolved = resolveClientConfig(config);
    const targets = importTargets(resolved);

    const workbook = await readSpreadsheet({ name: filePath, bytes: readFileSync(filePath) });
    const mappingJson = mappingPath ? JSON.parse(readFileSync(mappingPath, 'utf8')) : null;
    const wantedSheet = sheetName ?? mappingJson?.sheet;
    const withRows = workbook.sheets.filter(item => item.rows.length);
    // A sheet too big to read (often a hidden lookup list) is skipped unless asked for by name.
    const sheet = wantedSheet != null
        ? workbook.sheets.find(item => item.name.toLowerCase() === String(wantedSheet).trim().toLowerCase())
        : usableSheets(workbook.sheets)[0];
    if (!sheet) {
        const list = workbook.sheets.map(item => `"${item.name}"`).join(', ');
        throw new Error(wantedSheet != null ? `There is no sheet named "${wantedSheet}". The sheets are: ${list}.` : 'The file has no rows to import.');
    }
    if (sheet.error) throw new Error(`Sheet "${sheet.name}" cannot be imported: ${sheet.error}`);
    if (wantedSheet == null && withRows.length > 1) log('info', `Using sheet "${sheet.name}". Other sheets: ${withRows.filter(item => item !== sheet).map(item => `"${item.name}"`).join(', ')} (use --sheet to pick one).`);

    const fromFile = Number(mappingJson?.headerRow);
    const headerRow = Number.isInteger(fromFile) && sheet.rowNumbers.includes(fromFile) ? sheet.rowNumbers.indexOf(fromFile) : detectHeaderRow(sheet.rows);
    const names = columnNames(sheet.rows[headerRow] || [], sheet.columnLetters);

    let mapping;
    let stageMap = {};
    if (mappingJson) {
        const read = readMappingFile(mappingJson, { names, targets, stages: resolved.stages });
        if (read.problems.length) throw Object.assign(new Error('The mapping file has problems.'), { details: read.problems });
        read.notes.forEach(note => log('warn', note));
        ({ mapping, stageMap } = read);
    } else {
        mapping = guessMapping(names, targets);
    }
    const problem = mappingProblem(mapping, targets);
    if (problem) throw new Error(`${problem} Use --write-mapping to get a mapping file, set the column there, and run again with --mapping.`);

    const stageColumn = mapping.indexOf(STAGE_TARGET);
    const stageValues = stageColumn === -1 ? [] : distinctValues(sheet.rows, headerRow, stageColumn);
    stageMap = { ...guessStageMap(stageValues, resolved.stages), ...stageMap };
    const duplicatePolicy = duplicates ?? mappingJson?.duplicates ?? 'skip';
    if (!['skip', 'import'].includes(duplicatePolicy)) throw new Error('--duplicates must be skip or import.');

    const label = key => targets.find(target => target.key === key)?.label || '(not imported)';
    const width = Math.min(32, Math.max(...names.map(name => name.length)));
    log('info', `Columns in "${sheet.name}" (names in row ${sheet.rowNumbers[headerRow]}):`);
    names.forEach((name, col) => log('info', `  ${name.padEnd(width)}  →  ${label(mapping[col])}`));
    if (stageValues.length) {
        const stageName = id => resolved.stages.find(stage => stage.id === id)?.label || id;
        log('info', 'Stages:');
        for (const value of stageValues) log('info', `  ${`${value.value || '(empty)'} (${value.count})`.padEnd(width)}  →  ${stageName(value.key ? stageMap[value.key] : 'LEADS')}`);
    }

    if (writeMappingPath) {
        const file = mappingFileFor({ sheet: sheet.name, headerRowNumber: sheet.rowNumbers[headerRow], names, mapping, stageValues, stageMap, duplicatePolicy });
        writeFileSync(writeMappingPath, `${JSON.stringify(file, null, 2)}\n`);
        log('info', `✓ ${writeMappingPath} (edit it and run again with --mapping)`);
    }

    const result = buildImport({
        rows: sheet.rows, headerRow, rowNumbers: sheet.rowNumbers, mapping, stageMap, existing: [], duplicatePolicy, config: resolved, now: null,
    });
    const { counts } = result;
    const others = counts.skipped - (duplicatePolicy === 'import' ? 0 : counts.duplicates);
    log('info', `${counts.rows} rows: ${counts.ready} ready to import, ${duplicatePolicy === 'import' ? `${counts.duplicates} possible duplicates kept` : `${counts.duplicates} repeated in the file and left out`}, ${others} skipped.`);
    for (const item of result.skipped.slice(0, SHOWN)) log('warn', `Row ${item.rowNumber} not imported: ${item.reason}.`);
    if (result.skipped.length > SHOWN) log('warn', `… and ${result.skipped.length - SHOWN} more rows not imported.`);
    for (const item of result.warnings.slice(0, SHOWN)) log('warn', `Row ${item.rowNumber}, ${item.column}: ${item.message}`);
    if (result.warnings.length > SHOWN) log('warn', `… and ${result.warnings.length - SHOWN} more warnings.`);
    if (!result.ready.length) throw new Error('Nothing to import: every row was skipped.');

    const outPath = out || join('client-zips', `${resolved.client.slug}-import-customers.sql`);
    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    writeFileSync(outPath, importSql({
        config, payloads: result.ready, duplicatePolicy, source: { file: basename(filePath), sheet: workbook.sheets.length > 1 ? sheet.name : '' },
    }));
    return { outPath, written: result.ready.length, result };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
    let args;
    try {
        args = parseArgs({
            allowPositionals: true,
            options: {
                sheet: { type: 'string' }, mapping: { type: 'string' }, 'write-mapping': { type: 'string' },
                out: { type: 'string' }, duplicates: { type: 'string' }, help: { type: 'boolean', short: 'h' },
            },
        });
    } catch (error) {
        console.error(`${error.message}\n${USAGE}`);
        process.exit(1);
    }
    if (args.values.help || args.positionals.length !== 2) {
        console.error(USAGE);
        process.exit(args.values.help ? 0 : 1);
    }
    try {
        const { outPath, written } = await importCustomers({
            configInput: args.positionals[0],
            filePath: args.positionals[1],
            sheet: args.values.sheet,
            mappingPath: args.values.mapping,
            writeMappingPath: args.values['write-mapping'],
            out: args.values.out,
            duplicates: args.values.duplicates,
            log: (kind, text) => (kind === 'warn' ? console.warn(`! ${text}`) : console.log(text)),
        });
        console.log(`✓ ${outPath} (${written} customers)`);
    } catch (error) {
        for (const detail of error.details || []) console.error(`✗ ${detail}`);
        console.error(`✗ ${error.message}`);
        console.error('The SQL file was not written.');
        process.exit(1);
    }
}
