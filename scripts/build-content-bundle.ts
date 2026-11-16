// build-content-bundle.ts
// Bundles content/scenarios, content/rubrics and content/incidents into
// src/generated/content-bundle.json for the Cloudflare Worker (design D5).
//
// Usage: ts-node --project tsconfig.scripts.json scripts/build-content-bundle.ts [outputPath]
// Exit 1 on invalid content, duplicate (id, version) pairs or unknown rubric_version.
import * as fs from 'fs';
import * as path from 'path';
import {
  buildContentBundle,
  ContentBundleError,
  type RawContentFile,
} from '../src/content/build-bundle';

const root = path.join(__dirname, '..');
const outPath = path.resolve(
  process.argv[2] ?? path.join(root, 'src', 'generated', 'content-bundle.json'),
);

function readDir(sub: string): RawContentFile[] {
  const dir = path.join(root, 'content', sub);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const file = path.posix.join('content', sub, f);
      try {
        return { file, data: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as unknown };
      } catch (err) {
        throw new ContentBundleError([`${file}: failed to parse JSON -- ${String(err)}`]);
      }
    });
}

try {
  const bundle = buildContentBundle({
    scenarios: readDir('scenarios'),
    rubrics: readDir('rubrics'),
    incidents: readDir('incidents'),
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2) + '\n', 'utf-8');
  console.log(
    `Wrote ${path.relative(root, outPath)}: ${bundle.scenarios.length} scenario version(s), ` +
      `${bundle.rubrics.length} rubric(s), ${bundle.incidents.length} incident(s)`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
