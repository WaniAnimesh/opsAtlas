# OpsAtlas

Learn from real production failures, then practise the response.

- **Atlas:** source-cited postmortems of real incidents (AWS, GitHub, Cloudflare, Google Cloud) with search, filters and timelines.
- **Simulator:** deterministic branching scenarios. Request evidence, choose mitigations, see consequences, get a six-dimension debrief.

Target design: free and public, no sign-in. Static site on Cloudflare Pages, simulator API on a Cloudflare Worker with D1, content in a private GitHub repo, light theme only.

## Status

Backend (catalogs, simulation engine, scoring, D1 adapters, Worker entry) is done and tested. Not finished:

- Frontend rewrite for the no-login design (run, debrief and Learning pages still expect sign-in).
- Light theme, Docker cleanup, CI scripts and deploy workflows.

See `.kiro/specs/opsatlas-platform/tasks.md` for the full list.

## Layout

| Path | Contents |
|---|---|
| `src/modules/` | Incident and scenario catalogs, simulation runtime, scoring, scenario validator |
| `src/api/` | Hono routes and middleware |
| `src/app.ts`, `src/server.ts`, `src/worker.ts` | App factory, Node entry, Cloudflare Worker entry |
| `src/frontend/` | Next.js static site (own `package.json`) |
| `content/` | Incidents, scenarios, rubrics and JSON schemas |
| `db/migrations/` | D1 (SQLite) schema |
| `scripts/` | Content validation and build scripts |
| `.kiro/specs/opsatlas-platform/` | Requirements, design and tasks |

## Run locally

```bash
npm ci && npm --prefix src/frontend ci
npm run build
node dist/server.js                          # API on :3001
NEXT_PUBLIC_API_URL=http://localhost:3001 npm --prefix src/frontend run dev   # site on :3000
```

Worker with local D1: `npm run worker:dev`.

## Checks

```bash
npm run build && npm run lint && npm run test:run
npm run validate-content
npm --prefix src/frontend run typecheck
```
