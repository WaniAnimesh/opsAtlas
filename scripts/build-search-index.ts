// build-search-index.ts
// Generates src/frontend/public/search-index.json from content/incidents/*.json.
//
// Usage: ts-node --project tsconfig.scripts.json scripts/build-search-index.ts [outputPath]
// Output path may also be set via SEARCH_INDEX_OUT. Exit 1 on invalid content.

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import { buildSearchIndex, serializeSearchIndex } from '../src/content/search-index';

const root = path.join(__dirname, '..');
const incidentsDir = path.join(root, 'content', 'incidents');
const schemaPath = path.join(root, 'content', 'schema', 'incident.schema.json');
const outPath = path.resolve(
  process.argv[2] ??
    process.env['SEARCH_INDEX_OUT'] ??
    path.join(root, 'src', 'frontend', 'public', 'search-index.json'),
);

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, 'utf-8')) as object);

type Incident = Parameters<typeof buildSearchIndex>[0][number];
const incidents: Incident[] = [];
let hasError = false;

const files = fs.existsSync(incidentsDir)
  ? fs.readdirSync(incidentsDir).filter((f) => f.endsWith('.json')).sort()
  : [];

for (const file of files) {
  const rel = path.join('content', 'incidents', file);
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(path.join(incidentsDir, file), 'utf-8'));
  } catch (err) {
    console.error('\u2717 ' + rel + ': failed to parse JSON -- ' + String(err));
    hasError = true;
    continue;
  }
  if (!validate(data)) {
    const errors = (validate.errors ?? [])
      .map((e) => (e.instancePath || '(root)') + ' ' + (e.message ?? 'unknown error'))
      .join('; ');
    console.error('\u2717 ' + rel + ': ' + errors);
    hasError = true;
    continue;
  }
  incidents.push(data as Incident);
}

if (hasError) {
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, serializeSearchIndex(buildSearchIndex(incidents)), 'utf-8');
console.log('Wrote ' + incidents.length + ' entries to ' + path.relative(root, outPath));
