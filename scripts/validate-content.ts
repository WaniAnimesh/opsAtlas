// validate-content.ts
// Content validation script -- validates all incident and scenario JSON files
// against their AJV JSON schemas.
//
// Usage:  ts-node --project tsconfig.scripts.json scripts/validate-content.ts
//
// Exit 0 -- all files valid (or no files found)
// Exit 1 -- one or more validation errors

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as unknown;
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
}

// ---------------------------------------------------------------------------
// Bootstrap AJV
// ---------------------------------------------------------------------------

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// ---------------------------------------------------------------------------
// Load schemas
// ---------------------------------------------------------------------------

const schemaDir = path.join(__dirname, '..', 'content', 'schema');
const incidentSchemaPath = path.join(schemaDir, 'incident.schema.json');
const scenarioSchemaPath = path.join(schemaDir, 'scenario.schema.json');
const rubricSchemaPath = path.join(schemaDir, 'rubric.schema.json');

const incidentSchema = readJson(incidentSchemaPath);
const scenarioSchema = readJson(scenarioSchemaPath);

const validateIncident = ajv.compile(incidentSchema as object);
const validateScenario = ajv.compile(scenarioSchema as object);
const validateRubric = ajv.compile(readJson(rubricSchemaPath) as object);

// ---------------------------------------------------------------------------
// Validate files
// ---------------------------------------------------------------------------

const root = path.join(__dirname, '..');
const incidentsDir = path.join(root, 'content', 'incidents');
const scenariosDir = path.join(root, 'content', 'scenarios');
const rubricsDir = path.join(root, 'content', 'rubrics');

let hasError = false;

function validateFiles(
  files: string[],
  validateFn: ReturnType<typeof ajv.compile>,
): void {
  for (const filePath of files) {
    const rel = path.relative(root, filePath);
    let data: unknown;
    try {
      data = readJson(filePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('\u2717 ' + rel + ': failed to parse JSON -- ' + message);
      hasError = true;
      continue;
    }

    const valid = validateFn(data);
    if (valid) {
      console.log('\u2713 ' + rel);
    } else {
      const errors = (validateFn.errors ?? [])
        .map((e) => (e.instancePath || '(root)') + ' ' + (e.message ?? 'unknown error'))
        .join('; ');
      console.error('\u2717 ' + rel + ': ' + errors);
      hasError = true;
    }
  }
}

const incidentFiles = listJsonFiles(incidentsDir).filter(
  (f) => !f.endsWith('.gitkeep'),
);
const scenarioFiles = listJsonFiles(scenariosDir).filter(
  (f) => !f.endsWith('.gitkeep'),
);

if (incidentFiles.length === 0) {
  console.log('(no incident files found -- skipping incident validation)');
} else {
  validateFiles(incidentFiles, validateIncident);
}

if (scenarioFiles.length === 0) {
  console.log('(no scenario files found -- skipping scenario validation)');
} else {
  validateFiles(scenarioFiles, validateScenario);
}

const rubricFiles = listJsonFiles(rubricsDir);
if (rubricFiles.length === 0) {
  console.log('(no rubric files found -- skipping rubric validation)');
} else {
  validateFiles(rubricFiles, validateRubric);
}

process.exit(hasError ? 1 : 0);