# OpsAtlas

The Cloud Architecture Decision Atlas, plus real incidents to learn from and a simulator to practise on.

- **Decision Atlas:** a decision-centric knowledge graph covering 19 layers, from foundations to failure patterns. Decision pages state the question, alternatives, a tradeoff matrix over ten dimensions, when to choose each option, failure modes and what comes next. It also includes problem-oriented journeys ("I need to scale my system"), a knowledge graph explorer and problem-aware search. Content lives in `content/atlas/`; see "Cloud Architecture Decision Atlas (Extension)" in the design doc.
- **Incident Atlas:** source-cited postmortems of real incidents (AWS, GitHub, Cloudflare, Google Cloud) with search, filters and timelines.
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
| `content/atlas/` | Decision Atlas layers, entities (by domain) and journeys |
| `src/frontend/lib/atlas/` | Atlas content model, loader, integrity validator, graph and search |
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
npm run validate-content          # schemas + Decision Atlas link integrity
npm --prefix src/frontend run typecheck
```

### Adding Atlas content

Add an entity object to the matching file in `content/atlas/entities/`, link it with `relations` (outgoing edges only; incoming ones are derived), and optionally reference it from a topic in `layers.json` or a step in `journeys.json`. `npm run validate-content` and `next build` both fail on a broken link, an orphaned page, or a decision without a tradeoff matrix, guidance or a linked failure pattern.
