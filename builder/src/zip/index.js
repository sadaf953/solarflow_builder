// Zip generation for the admin pages. The work happens in build.js, which
// scripts/make-client.mjs shares, so the website and the CLI give the same zip.

import schemaSql from '../../../template/backend/schema.sql?raw';
import { downloadBlob } from '../../../template/src/lib/download.js';
import { createClientZip, createSetupSql } from './build.js';

export { buildClientFiles, makeZip, parseSubmissionJson, checkClientConfig } from './build.js';

let templatePromise = null;

// The packed template (builder/public/client-template.json), fetched once.
export function loadTemplateFiles() {
    templatePromise ||= fetch('./client-template.json', { cache: 'no-cache' })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(pack => {
            if (!pack?.files?.['package.json']) throw new Error('empty pack');
            return pack.files;
        })
        .catch(error => {
            templatePromise = null;
            throw new Error(`Could not load the app template (client-template.json): ${error.message}. Rebuild the builder with npm run build:builder.`);
        });
    return templatePromise;
}

export async function generateClientZip({ submission, adminOverrides = {}, slug, ownerEmail, generatedAt } = {}) {
    const templateFiles = await loadTemplateFiles();
    return createClientZip({ templateFiles, schemaSql, submission, adminOverrides, slug, ownerEmail, generatedAt });
}

export function generateSetupSql({ submission, adminOverrides = {}, slug, ownerEmail } = {}) {
    return createSetupSql({ schemaSql, submission, adminOverrides, slug, ownerEmail });
}

export function downloadBytes(bytes, fileName, mime = 'application/zip') {
    downloadBlob(bytes, mime, fileName);
}
