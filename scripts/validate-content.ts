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

// ---------------------------------------------------------------------------
// Decision Atlas: schema validation, then cross-file referential integrity
// (broken relations, orphans, per-type content contracts).
// ---------------------------------------------------------------------------
const atlasDir = path.join(root, 'content', 'atlas');
if (!fs.existsSync(atlasDir)) {
  console.log('(no content/atlas directory -- skipping Decision Atlas validation)');
} else {
  const validateAtlasEntities = ajv.compile(
    readJson(path.join(schemaDir, 'atlas-entity.schema.json')) as object,
  );
  const validateAtlasLayers = ajv.compile(
    readJson(path.join(schemaDir, 'atlas-layers.schema.json')) as object,
  );
  const validateAtlasJourneys = ajv.compile(
    readJson(path.join(schemaDir, 'atlas-journeys.schema.json')) as object,
  );
  const entityFiles = listJsonFiles(path.join(atlasDir, 'entities'));
  const errorsBefore = hasError;
  hasError = false;
  validateFiles([path.join(atlasDir, 'layers.json')], validateAtlasLayers);
  validateFiles([path.join(atlasDir, 'journeys.json')], validateAtlasJourneys);
  validateFiles(entityFiles, validateAtlasEntities);
  const schemaOk = !hasError;
  hasError = errorsBefore || hasError;

  if (schemaOk) {
    // Loaded lazily so a schema failure reports cleanly first.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateAtlas } = require('../src/frontend/lib/atlas/validate') as typeof import('../src/frontend/lib/atlas/validate');
    const content = {
      layers: readJson(path.join(atlasDir, 'layers.json')),
      journeys: readJson(path.join(atlasDir, 'journeys.json')),
      entities: entityFiles.flatMap((f) => readJson(f) as unknown[]),
    } as Parameters<typeof validateAtlas>[0];
    const incidentSlugs = new Set(
      incidentFiles
        .map((f) => (readJson(f) as { slug?: unknown }).slug)
        .filter((s): s is string => typeof s === 'string'),
    );
    const integrity = validateAtlas(content, incidentSlugs);
    if (integrity.length === 0) {
      console.log(
        '\u2713 content/atlas: ' +
          content.entities.length +
          ' entities, ' +
          content.entities.reduce((n, e) => n + e.relations.length, 0) +
          ' relations, ' +
          content.journeys.length +
          ' journeys -- integrity OK',
      );
    } else {
      for (const msg of integrity) console.error('\u2717 content/atlas: ' + msg);
      hasError = true;
    }
  }
}

process.exit(hasError ? 1 : 0);