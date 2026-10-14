// `npm run setup-sql`: rebuilds backend/setup.sql from src/config/client.config.js,
// backend/schema.sql and backend/seed.js, exactly as the SolarFlow builder does.
// Run it after changing features or stages in client.config.js, then run the
// new backend/setup.sql in the Supabase SQL Editor and rebuild the app.
import { readFileSync, writeFileSync } from 'node:fs';
import clientConfig from '../src/config/client.config.js';
import { validateClientConfig } from '../src/config/resolve.js';
import { setupSql } from '../backend/seed.js';

const backend = new URL('../backend/', import.meta.url);
const { errors, warnings } = validateClientConfig(clientConfig);

for (const warning of warnings) console.warn(`! ${warning}`);
if (errors.length) {
  console.error(['', 'src/config/client.config.js has problems, so backend/setup.sql was not changed:', ...errors.map(error => `  ✗ ${error}`), ''].join('\n'));
  process.exit(1);
}

const schema = readFileSync(new URL('schema.sql', backend), 'utf8');
writeFileSync(new URL('setup.sql', backend), setupSql({ schema, config: clientConfig }));
console.log([
  '✓ Wrote backend/setup.sql.',
  'Next: run it in Supabase → SQL Editor, then build and publish the app again (npm run build).',
].join('\n'));
