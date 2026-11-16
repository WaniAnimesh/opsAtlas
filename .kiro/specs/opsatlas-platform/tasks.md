# Implementation Plan: OpsAtlas Platform

## Overview

This plan converts the OpsAtlas design into an ordered series of coding tasks. Groups 1–16 are the original build (mostly complete). The revised design removes sign-in, accounts and in-app content governance, introduces anonymous Session_Key sessions, browser-side Local_Progress, Cloudflare D1, a Worker entry, a light theme and a pull-request content workflow. Group 21 carries out that migration and runs before the remaining groups 17–20 (see the dependency graph). Completed tasks that the new design makes obsolete are kept as history with a "Superseded by task 21.x" note. All property-based tests use fast-check. Tasks reference requirements by their section numbers (e.g., "Req 6.2").

---

## Tasks

- [x] 1. Repository scaffolding and development environment
  - [x] 1.1 Initialise monorepo structure with TypeScript, ESLint, Prettier, and path aliases
    - Create `/src/modules/`, `/src/api/`, `/src/frontend/`, `/content/` directory layout
    - Configure `tsconfig.json` with strict mode and path aliases for each module
    - Configure ESLint and Prettier; add pre-commit lint hook via Husky
    - _Requirements: 19.1_

  - [x] 1.2 Set up Docker Compose for local development
    - Write `docker-compose.yml` with `db` (postgres:16-alpine), `api` (Node 20 Alpine, ts-node-dev, port 3001), `frontend` (Node 20 Alpine, Next.js dev, port 3000)
    - Write `Dockerfile.api` and `Dockerfile.frontend`
    - Create `.env.example` with `DATABASE_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `NEXT_PUBLIC_API_URL`
    - Mount host `./src` and `./content` as volumes for hot reload
    - _Requirements: 19.1_
    - Note: Revised by task 21.10 (no `db` service, no AUTH variables).

  - [x] 1.3 Create PostgreSQL schema file and run initial migration
    - Write `db/schema.sql` containing all tables from the design: `scenarios`, `scenario_skill_tags`, `rubrics`, `scenario_sessions`, `session_events`, `assessments`, `user_skills`, `content_workflow_log`, plus all indexes
    - Verify schema applies cleanly inside the `db` Docker Compose container on first boot
    - _Requirements: 6.1, 6.3, 9.3, 10.2, 11.2, 12.1_
    - Note: Superseded by task 21.6 (PostgreSQL removed; D1 migration `db/migrations/0001_init.sql`).

  - [x] 1.4 Define content JSON schemas and set up AJV validation
    - Create `content/schema/incident.schema.json` covering all fields of `IncidentContentFile` (slug, title, org, incident_date, summary, impact, failure_domain, severity, is_reconstruction, skill_tags, sources, timeline, causal_factors, lessons)
    - Create `content/schema/scenario.schema.json` covering all fields of `ScenarioContentFile` and embedded `ScenarioDefinition`
    - Write `scripts/validate-content.ts` that runs AJV against all files in `/content/incidents/` and `/content/scenarios/` and exits non-zero on any violation
    - _Requirements: 3.1, 13.1, 13.2, 13.4_

  - [x] 1.5 Scaffold shared TypeScript types and error utilities
    - Create `src/types/index.ts` exporting all shared interfaces from the design: `IncidentContentFile`, `IncidentSource`, `TimelineEvent`, `CausalFactor`, `Lesson`, `ScenarioContentFile`, `ScenarioDefinition`, `ScenarioState`, `ScenarioAction`, `ScenarioTransition`, `EvidenceItem`, `ApiError`
    - Create `src/api/errors.ts` with factory helpers for each error code in the design error table (e.g., `notFound`, `selfApprovalNotPermitted`, `journalImmutable`)
    - _Requirements: 17.4, 17.5_

  - [x] 1.6 Set up API server entry point and middleware
    - Write `src/server.ts` bootstrapping an Express (or Hono) HTTP server on port 3001
    - Add JSON body parsing, request ID header injection, and a global error handler that serialises `ApiError` shapes
    - Add Zod-based input validation middleware; cap text fields at 10,000 characters; cap search queries at 200 characters; reject malformed bodies with HTTP 400
    - _Requirements: 17.4, 17.5_

  - [x] 1.7 Set up fast-check and the test runner
    - Install `fast-check`, `vitest` (or Jest), and `@vitest/coverage-v8` as dev dependencies
    - Configure `vitest.config.ts` with coverage thresholds and the test include glob
    - Add `npm run test:run` (single-pass) and `npm run test:watch` scripts
    - _Requirements: 6.2, 9.3_

- [x] 2. Checkpoint — Foundation is solid
  - Ensure `docker compose up --build` succeeds with all three services healthy, the schema is applied, and `scripts/validate-content.ts` exits 0 on sample fixtures. Ask the user if questions arise.

- [x] 3. Incident Catalog module
  - [x] 3.1 Implement `IncidentCatalogService` — list and get
    - Create `src/modules/incident-catalog/index.ts` exporting the `IncidentCatalogService` interface
    - Implement `listPublished(filters)` by reading all `*.json` files from `/content/incidents/`, filtering by provider, technology, failure domain, and severity; sort by `incident_date` descending
    - Implement `getBySlug(slug)` by reading the matching content file; return `null` when not found
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Implement `IncidentCatalogService` — search
    - Implement `search(query, filters)` performing case-insensitive substring matching of all query terms across `title`, `summary`, and `skill_tags` on the already-filtered incident list
    - Enforce the multi-term AND semantic (all terms must match)
    - _Requirements: 2.1, 2.5, 2.8_

  - [x] 3.3 Write property test for search result relevance (Property 6)
    - **Property 6: Search Result Relevance** — for any query and incident set, every returned incident contains at least one query term (case-insensitive) in title, summary, or skill_tags
    - **Validates: Requirements 2.1**
    - Use fast-check arbitrary strings and generated `IncidentContentFile` arrays
    - Tag: `// Feature: opsatlas-platform, Property 6: Search Result Relevance`

  - [x] 3.4 Write property test for multi-filter intersection (Property 7)
    - **Property 7: Multi-Filter Intersection** — for any filter combination and incident set, every returned incident satisfies all active filter criteria AND all search query terms simultaneously
    - **Validates: Requirements 2.5**
    - Use fast-check arbitrary filter objects and incident arrays
    - Tag: `// Feature: opsatlas-platform, Property 7: Multi-Filter Intersection`

  - [ ]* 3.5 Write unit tests for Incident Catalog
    - Test `listPublished` with no filters, each filter in isolation, and combined filters
    - Test `getBySlug` hit and miss
    - Test `search` with multi-term query returning mixed results
    - Test empty-state path (no files in directory)
    - _Requirements: 1.4, 2.6, 2.7_

  - [x] 3.6 Register Incident Catalog HTTP routes
    - `GET /api/v1/incidents` — calls `listPublished`; accept query params `q`, `provider`, `technology`, `failure_domain`, `severity`
    - `GET /api/v1/incidents/:slug` — calls `getBySlug`; return 404 with `INCIDENT_NOT_FOUND` when null
    - Wire routes into the API server
    - _Requirements: 1.3, 1.6, 2.1–2.9_

- [x] 4. Scenario Catalog module
  - [x] 4.1 Implement `ScenarioCatalogService` — list and get
    - Create `src/modules/scenario-catalog/index.ts`
    - Implement `listPublished()` reading `scenarios` table rows with `status = 'published'`, joining `scenario_skill_tags`
    - Implement `getScenarioBrief(id)` returning title, difficulty, est_duration_min, skill_tags, and objective; return `null` when not found
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x] 4.2 Register Scenario Catalog HTTP routes
    - `GET /api/v1/scenarios` — calls `listPublished`
    - `GET /api/v1/scenarios/:id/brief` — calls `getScenarioBrief`; 404 on miss with `SCENARIO_VERSION_NOT_FOUND`
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 5. Simulation Runtime module — pure engine
  - [x] 5.1 Implement `applyTransition` pure function
    - Create `src/modules/simulation-runtime/engine.ts`
    - Implement `applyTransition(state, action, definition): TransitionResult`
    - Steps: evaluate preconditions against state, find matching `ScenarioTransition`, apply effects to produce next state, collect `delayed_effects` as pending events, return `{ nextState, sideEffects, pendingEvents, simTimeDelta }`
    - No I/O, no randomness — pure function only
    - _Requirements: 6.2, 7.2, 7.3, 7.5, 7.6_

  - [x] 5.2 Write property test for deterministic replay (Property 1)
    - **Property 1: Deterministic Scenario Replay** — for any valid scenario version and any action sequence, replaying the same sequence produces identical state transitions and transition order
    - **Validates: Requirements 6.2, 6.5**
    - Generate arbitrary action sequences over fixed scenario definitions using fast-check
    - Tag: `// Feature: opsatlas-platform, Property 1: Deterministic Scenario Replay`

  - [x] 5.3 Write property test for simulated time advancement (Property 5)
    - **Property 5: Simulated Time Advancement** — for any action with non-zero time cost, sim time after = sim time before + action's time_cost exactly
    - **Validates: Requirements 7.4, 8.6**
    - Generate arbitrary actions with random `time_cost` values ≥ 1
    - Tag: `// Feature: opsatlas-platform, Property 5: Simulated Time Advancement`

  - [x] 5.4 Write property test for evidence availability consistency (Property 3)
    - **Property 3: Evidence Availability Consistency** — for any state and evidence item ID, if the evidence is defined for that state the status is not "unavailable"; if not defined the status is "unavailable"
    - **Validates: Requirements 8.1, 8.3**
    - Generate arbitrary state × evidence-id pairs
    - Tag: `// Feature: opsatlas-platform, Property 3: Evidence Availability Consistency`

  - [ ]* 5.5 Write unit tests for applyTransition
    - Test precondition met → correct next state
    - Test precondition unmet → error returned without state mutation
    - Test action with delayed effects → pending events populated
    - Test irreversible action flag propagation
    - _Requirements: 7.2, 7.3, 7.6_

  - [x] 5.6 Implement `SimulationRuntimeService` — session lifecycle
    - Create `src/modules/simulation-runtime/index.ts` implementing the `SimulationRuntimeService` interface
    - Implement `createSession(userId, scenarioId)`: pin `scenario_version` at creation time; insert `scenario_sessions` row + initial `session_events` row
    - Implement `getSession(sessionId)`: reconstruct current state by replaying event log through `applyTransition` from initial state
    - Return `SESSION_NOT_FOUND` when session does not belong to calling user
    - _Requirements: 6.1, 6.3, 6.4, 6.6_
    - Note: Revised by tasks 21.1–21.3 (no `userId`; Session_Key is the session id; optional pinned `scenarioVersion`).

  - [x] 5.7 Write property test for event log reconstruction (Property 2)
    - **Property 2: Session Event Log Completeness** — reconstructing state from persisted event log produces final state identical to state recorded at session end
    - **Validates: Requirements 6.3, 9.3**
    - Generate arbitrary sessions with random action/evidence sequences; compare replayed final state vs. recorded final state
    - Tag: `// Feature: opsatlas-platform, Property 2: Session Event Log Completeness`

  - [x] 5.8 Implement `applyAction` and `requestEvidence` on session
    - Implement `applyAction(sessionId, actionId, rationale)`: call `applyTransition`; append `session_events` row; advance `sim_time_elapsed`; write Decision_Journal entry via `session_events` payload
    - Implement `requestEvidence(sessionId, evidenceId)`: resolve evidence from scenario definition; append evidence request event to `session_events`; advance sim time if evidence has `time_cost > 0`
    - Return `NO_ACTIVE_SESSION` error if session is not active
    - _Requirements: 7.2, 7.4, 8.1, 8.2, 8.3, 8.5, 8.6, 8.7_

  - [x] 5.9 Write property test for evidence journal recording (Property 4)
    - **Property 4: Evidence Journal Recording** — for any evidence request during an active session, the resulting session_events entry contains evidence type, sim time at request, and state snapshot
    - **Validates: Requirements 8.4, 9.2**
    - Generate arbitrary evidence requests against mock sessions
    - Tag: `// Feature: opsatlas-platform, Property 4: Evidence Journal Recording`

  - [x] 5.10 Implement pause and resume on session
    - Implement `pauseSession(sessionId)`: set `status = 'paused'`, write pause event atomically in same DB transaction as status update
    - Implement `resumeSession(sessionId)`: set `status = 'active'`, reconstruct and return session state from event log
    - Reject all `applyAction` calls with `SESSION_PAUSED` when session is paused
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 5.11 Write property test for paused session state preservation (Property 10)
    - **Property 10: Paused Session State Preservation** — after pause then resume, sim time, pending events, metrics, and Decision_Journal contents are identical to those at moment of pause
    - **Validates: Requirements 16.2**
    - Generate arbitrary session states and verify round-trip preservation
    - Tag: `// Feature: opsatlas-platform, Property 10: Paused Session State Preservation`

  - [x] 5.12 Register Simulation Runtime HTTP routes
    - `POST /api/v1/sessions` — `createSession`; auth required
    - `GET /api/v1/sessions/:id` — `getSession`; auth required
    - `POST /api/v1/sessions/:id/actions` — `applyAction`; auth required
    - `POST /api/v1/sessions/:id/evidence` — `requestEvidence`; auth required
    - `POST /api/v1/sessions/:id/pause` — `pauseSession`; auth required
    - `POST /api/v1/sessions/:id/resume` — `resumeSession`; auth required
    - _Requirements: 6.1, 6.6, 7.3, 8.7, 16.4, 16.5_
    - Note: Revised by tasks 21.1 and 21.3 (routes are anonymous and keyed by Session_Key).

- [x] 6. Checkpoint — Simulator engine working
  - Ensure all property tests and unit tests for modules 3–5 pass. Ask the user if questions arise.

- [x] 7. Scoring and Debrief module
  - [x] 7.1 Implement `ScoringService` — compute debrief
    - Create `src/modules/scoring-debrief/index.ts`
    - Implement `computeDebrief(sessionId)`: load session event log; load rubric version pinned to session's `rubric_version`; score six dimensions (Impact Control, Diagnostic Quality, Risk Management, Recovery Quality, Communication, Learning/Reflection) using rubric criteria; persist `assessments` row; return `DebriefResult`
    - Each dimension score stored as a separately labeled `NUMERIC(4,2)` field — never collapsed into a composite
    - _Requirements: 10.1, 10.2, 10.6_

  - [x] 7.2 Write property test for score dimension independence (Property 9)
    - **Property 9: Score Dimension Independence** — for any completed session assessment, all six Score_Dimension values are stored as separately labeled fields and no single composite score field is computed or returned in their place
    - **Validates: Requirements 10.2**
    - Generate arbitrary assessment records and verify serialisation shape
    - Tag: `// Feature: opsatlas-platform, Property 9: Score Dimension Independence`

  - [x] 7.3 Implement `getReplayStep` for step-by-step debrief
    - Implement `getReplayStep(sessionId, step)`: return the state, set of revealed evidence, available-but-unrequested evidence, and at least one alternative action with ≤ 200-char outcome description for that step index
    - _Requirements: 10.3, 10.4, 10.5_

  - [ ]* 7.4 Write unit tests for Scoring and Debrief
    - Test `computeDebrief` returns all six dimensions with correct labels
    - Test `getReplayStep` shows unrequested evidence items
    - Test rubric version mismatch returns `RUBRIC_VERSION_UNAVAILABLE`
    - _Requirements: 10.2, 10.5, 19.5_

  - [x] 7.5 Register Scoring and Debrief HTTP route
    - `GET /api/v1/sessions/:id/debrief` — calls `computeDebrief`; auth required
    - _Requirements: 10.1, 10.2_
    - Note: Revised by tasks 21.1 and 21.3 (no auth; `DebriefResult.endedAt` added).

- [x] 8. Decision Journal immutability
  - [x] 8.1 Enforce journal immutability in the API layer
    - Add middleware/guard that intercepts any `PATCH`, `PUT`, or `DELETE` on `/api/v1/sessions/:id/actions/*` or the events sub-resource and returns HTTP 403 with `JOURNAL_IMMUTABLE`
    - Immutability applies only after the session has concluded (`status` in `completed | abandoned | timed_out`)
    - _Requirements: 9.5_

  - [x] 8.2 Write property test for decision journal immutability (Property 8)
    - **Property 8: Decision Journal Immutability** — for any concluded session, all attempts to modify or delete a Decision_Journal entry are rejected, and journal contents are unchanged after the attempt
    - **Validates: Requirements 9.5**
    - Generate arbitrary concluded sessions and mutation attempts
    - Tag: `// Feature: opsatlas-platform, Property 8: Decision Journal Immutability`

- [x] 9. Identity and Learning module
  - [x] 9.1 Set up managed auth provider integration (Auth0 / Clerk)
    - Install the chosen provider's Node.js SDK
    - Write `src/api/middleware/auth.ts`: extract and verify JWT on every authenticated route; populate `req.user` with `{ userId, role }`
    - Return HTTP 401 with `UNAUTHORIZED` on missing/invalid token; HTTP 403 with `FORBIDDEN` on wrong role
    - Enforce token max lifetime of 24 hours; reject tokens exceeding that lifetime
    - _Requirements: 18.1, 18.2, 18.3, 18.4_
    - Note: Superseded by task 21.1 (authentication removed).

  - [x] 9.2 Implement `IdentityAndLearningService`
    - Create `src/modules/identity-learning/index.ts`
    - Implement `getLearningHistory(userId)`: query `scenario_sessions` joined to `assessments` for completed sessions ordered by `started_at` desc; return scenario title, completion date (YYYY-MM-DD), and all six Score_Dimension results
    - Implement `getSkillMap(userId)`: query `user_skills` for the user; compute trend by comparing last two sessions on the same scenario
    - Update `user_skills` after each `assessments` write: increment `evidence_count`, recalculate `proficiency`, set `trend`
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6_
    - Note: Superseded by task 21.1 (module removed) and task 21.8 (calculations ported to `src/frontend/lib/learning.ts`).

  - [x] 9.4 Register Identity and Learning HTTP routes
    - `GET /api/v1/users/me/learning` — `getLearningHistory`; auth required; redirect unauthenticated to sign-in
    - `GET /api/v1/users/me/skills` — `getSkillMap`; auth required
    - _Requirements: 11.1, 11.2, 11.4_
    - Note: Superseded by task 21.1 (`/users` routes removed).

- [x] 10. Content Governance module
  - [x] 10.1 Implement `ContentGovernanceService` — incident workflow
    - Create `src/modules/content-governance/index.ts`
    - Implement `submitForReview(contentId, submitterId)`: transition record from `draft` → `review`; write `content_workflow_log` row; trigger Editor notification (log to console in MVP)
    - Implement `approveContent(contentId, approverId)`: verify `approverId ≠ submitterId` (reject with `SELF_APPROVAL_NOT_PERMITTED` if equal); transition to `approved`; write audit log
    - Implement `publishIncident(incidentId, editorId)`: verify source citation exists; transition to `published`; generate Slug from title; write audit log
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 3.1_
    - Note: Superseded by task 21.1 (content governance moved to the pull-request workflow).

  - [x] 10.2 Write property test for self-approval prevention (Property 12)
    - **Property 12: Self-Approval Prevention** — for any approval request where approver user ID equals submitter user ID, the approval is rejected and content record status is unchanged
    - **Validates: Requirements 12.3**
    - Generate arbitrary editor pairs including same-user pairs
    - Tag: `// Feature: opsatlas-platform, Property 12: Self-Approval Prevention`
    - Note: Superseded by task 21.1 (test deleted; self-approval is blocked by GitHub branch protection). Property 12 is now Session_Key Format and Uniqueness, task 21.2.

  - [x] 10.3 Implement scenario publish and version management
    - Implement `publishScenario(scenarioId, editorId)`: verify `validated = true` (reject with `PUBLISH_REQUIRES_VALIDATION` otherwise); mark `version` as read-only; transition to `published`; write audit log
    - Implement scenario content-field update path: if a field is modified on a published scenario, create a new `scenarios` row with a new `id` and incremented `version`, leaving the original row untouched
    - _Requirements: 12.5, 12.7, 12.8_
    - Note: Superseded by task 21.1 (service removed) and task 21.11 (CI version-bump check).

  - [x] 10.4 Implement scenario validator
    - Implement `validateScenario(scenarioId)`: load `definition_json`; check (a) every transition `to_state_id` and `from_state_id` exists in `states`, (b) every state is reachable from `initial_state_id` via BFS/DFS, (c) every terminal state has a debrief mapping in the rubric, (d) every action referenced in transitions has `preconditions`, `time_cost`, `effects`, and `rationale_options` ≥ 1
    - On violation: return structured list with `{ stateOrActionId, category, description }` per violation; leave `validated = false`
    - On pass: set `validated = true`, `publish_eligible = true`
    - On system error: leave `validated` unchanged, set `validation_attempt_failed` marker, return `VALIDATION_SYSTEM_ERROR`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_
    - Note: Superseded by task 21.1 (pure validator relocated to `src/modules/scenario-validator/`) and task 21.11 (CI script `scripts/validate-scenarios.ts`).

  - [x] 10.5 Write property test for scenario validation graph completeness (Property 11)
    - **Property 11: Scenario Validation Graph Completeness** — if all states referenced in transitions exist AND all states are reachable AND all terminal states have debrief mappings AND all actions have required fields, validator marks scenario as validated; otherwise returns structured violation list
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6**
    - Generate arbitrary valid and invalid `ScenarioDefinition` objects
    - Tag: `// Feature: opsatlas-platform, Property 11: Scenario Validation Graph Completeness`
    - Note: Relocated by task 21.1 to `src/modules/scenario-validator/` (still valid).

  - [x] 10.7 Register Content Governance HTTP routes
    - `POST /admin/incidents` — create draft; Editor role required
    - `PATCH /admin/incidents/:id` — update draft fields; Editor role required
    - `POST /admin/incidents/:id/submit-review` — `submitForReview`; Editor role required
    - `POST /admin/incidents/:id/approve` — `approveContent`; Editor role required
    - `POST /admin/incidents/:id/publish` — `publishIncident`; Editor role required
    - `POST /admin/scenarios/:id/validate` — `validateScenario`; Editor role required
    - `POST /admin/scenarios/:id/publish` — `publishScenario`; Editor role required
    - Return HTTP 403 for any non-Editor access
    - _Requirements: 12.9, 12.10, 18.2_
    - Note: Superseded by task 21.1 (`/admin` routes removed).

- [ ] 11. Checkpoint — All backend modules wired
  - Ensure `npm run test:run` exits 0 for the incident catalog, scenario catalog, simulation runtime, scoring and debrief modules, the journal immutability guard and the scenario validator. No auth middleware, `/users` or `/admin` routes are expected (removed by task 21.1). Ask the user if questions arise.

- [x] 12. Next.js frontend — static Atlas pages
  - [x] 12.1 Initialise Next.js app with Tailwind CSS and base layout
    - Create `src/frontend/` as the Next.js app root with App Router
    - Install and configure Tailwind CSS; set base colour palette, typography, spacing scale
    - Create `RootLayout` with `<header>` (nav links to `/atlas` and `/simulator`), `<main>`, `<footer>`
    - Ensure layout renders without errors at 375px and 1024px viewport widths
    - _Requirements: 15.5_

  - [x] 12.2 Implement Home Page (`/`)
    - Hero section: headline ≤ 10 words, one descriptive sentence, fully visible in initial viewport at 375px and 1024px
    - Two primary CTAs navigating to `/atlas` and `/simulator` rendered as distinct interactive elements with visible labels
    - Featured incidents section: display 3–6 hardcoded/static incident entries showing title, provider, and failure domain label
    - How-It-Works section: five labelled steps (Discover, Understand, Practice, Reflect, Improve) each with a one-sentence description
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 12.3 Implement Atlas list page (`/atlas`) as SSG
    - Generate page at build time via `getStaticProps` reading all content files through `IncidentCatalogService`
    - Render each incident card with title, provider, failure domain, severity, and up to 3 primary Skill_Tags
    - Include empty-state message when no published incidents exist
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 12.4 Implement client-side search and filter on Atlas page
    - Load pre-built `search-index.json` static asset on the client; perform in-memory filtering and fuzzy multi-term matching
    - Filters: provider, technology, failure domain (each supporting multi-value within a dimension)
    - Reflect filter changes within 500ms; display no-results message; retain filter state when no results
    - Clear-all button restores full incident list
    - Make all filter controls keyboard-operable (Tab/Enter/Space); render visible focus indicators
    - _Requirements: 2.1–2.9, 1.5_

  - [x] 12.5 Implement Incident Detail page (`/atlas/incidents/[slug]`) as SSG
    - Generate a static page per incident via `getStaticPaths` + `getStaticProps`
    - Render: title, org, incident_date, summary, impact, failure_domain, severity, is_reconstruction banner ("Educational Reconstruction — not a verbatim account")
    - Timeline section: events in ascending chronological order, each with ISO 8601 timestamp (date + time + UTC offset)
    - Sources section: Source_Tier label, publication date, URL hyperlink or bibliographic reference text
    - Confidence labels: each factual claim shows a `Confidence_Label` value from {fact, inference, teaching_simplification, unknown} as a visible text label with a distinct non-color visual indicator (icon or border) per WCAG 1.4.1
    - Causal factors, lessons, and architecture sections; display "no content available" indicator for empty sections
    - Link to linked scenario brief when `incident_slug` maps to a published scenario
    - 404 page with error message and link back to `/atlas` when slug not found
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 1.6_

  - [x] 12.6 Generate `search-index.json` at build time
    - Write `scripts/build-search-index.ts` that reads all content files, extracts `slug`, `title`, `summary`, `skill_tags`, `failure_domain`, `severity`, and `org`, and writes the array to `public/search-index.json`
    - _Requirements: 2.1_

- [x] 13. Next.js frontend — dynamic Simulator pages
  - [x] 13.1 Implement Scenario Catalog page (`/simulator`)
    - Fetch published scenarios from `GET /api/v1/scenarios` at request time (SSR)
    - Render each scenario card: title, difficulty (three-point scale), est_duration_min (5–240), up to 10 skill_tags, objective (≤ 160 chars)
    - All cards reachable and activatable via Tab and Enter without a pointing device; visible focus indicators
    - Empty-state message when no published scenarios
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [x] 13.2 Implement Scenario Brief page (`/simulator/[id]/brief`)
    - Fetch scenario brief from `GET /api/v1/scenarios/:id/brief`
    - Render objective, difficulty, estimated duration, skill tags, and Start Session button
    - Start Session triggers `POST /api/v1/sessions` and navigates to `/simulator/[id]/run`
    - _Requirements: 5.3, 6.1_

  - [x] 13.3 Implement Simulator Run page (`/simulator/[id]/run`) — CSR
    - Display current scenario state: service_health, metrics, customer_impact, active_alerts
    - Action panel: render available actions; disable actions with unmet preconditions (show precondition text inline); show irreversibility warning with modified-attribute list before confirming irreversible actions
    - Evidence request panel: render available evidence types with request buttons
    - Simulated_Time display labelled with accessible name explicitly identifying it as simulated time (not wall-clock)
    - Paused state: show "Paused" status label; disable all action and evidence controls
    - _Requirements: 7.2, 7.3, 7.7, 8.1–8.3, 14.1, 14.6, 14.7, 16.4_

  - [x] 13.4 Implement Debrief page (`/simulator/[id]/debrief`) — CSR
    - Fetch debrief from `GET /api/v1/sessions/:id/debrief`
    - Display all six Score_Dimension scores as separately labelled entries — no composite score
    - Step-by-step replay: each step shows state, revealed evidence, available-but-unrequested evidence, and ≥ 1 alternative action with ≤ 200-char outcome description
    - Link to source incident detail page when scenario is linked to an incident
    - Retry button: calls `POST /api/v1/sessions` with same scenario version and navigates to brief
    - _Requirements: 10.1–10.7_

  - [x] 13.5 Implement Learning page (`/learning`) — SSR, auth-gated
    - Redirect unauthenticated users to sign-in
    - Fetch learning history from `GET /api/v1/users/me/learning` and skill map from `GET /api/v1/users/me/skills`
    - Render completed scenario history ordered newest-to-oldest: scenario title, completion date (YYYY-MM-DD), Score_Dimension results
    - Skill map: proficiency per Skill_Tag on a 1–5 scale; trend indicator ("up" / "down" / "unchanged") for scenarios with ≥ 2 completions
    - Empty state when no completed sessions: explanatory message, no skill map rendered
    - _Requirements: 11.1–11.6_
    - Note: Superseded by task 21.8 (`/learning` rebuilt client-side from Local_Progress; no sign-in redirect).

- [x] 14. Checkpoint — All frontend pages render and wire to the API
  - Boot the site against a local API (`wrangler dev` or `docker compose up`), verify each page loads without console errors and the anonymous simulator flow works end-to-end. No `/sign-in` or `/admin` pages exist. Re-verified by task 21.12. Ask the user if questions arise.

- [x] 15. Rate limiting and performance middleware
  - [x] 15.1 Implement rate limiter middleware
    - Add in-memory (or Redis-backed) sliding-window rate limiter: 100 req/min per authenticated user, 20 req/min per unauthenticated IP
    - Return HTTP 429 with `RATE_LIMIT_EXCEEDED` and a `Retry-After` header on breach
    - _Requirements: 17.2, 17.3_
    - Note: Revised by task 21.4 (single 60 req/min per-IP tier, injectable limiter backend).

  - [ ]* 15.2 Write unit tests for rate limiter
    - Extend `src/api/middleware/rateLimit.test.ts` beyond the baseline updated in task 21.4
    - Test: 60th request from one IP succeeds; 61st within the 60-second window returns 429 `RATE_LIMIT_EXCEEDED` with `Retry-After` and `details.retry_after_seconds`
    - Test: requests from a different IP are counted separately; the window resets after 60 seconds (fake clock)
    - Test: `/api/v1/health` is exempt; CORS preflight is answered before the limiter
    - Test: `bindingLimiter` with a fake `RateLimit` binding maps `success: false` to 429 with `Retry-After: 60`
    - _Requirements: 17.2, 17.4_

- [x] 16. Security sandbox for scenario engine
  - [x] 16.1 Enforce sandbox constraints on Simulation Runtime
    - Confirm `applyTransition` has no outbound HTTP calls, no `fs` access outside the working directory, and no `child_process` spawns — add ESLint no-restricted-imports rules to enforce this statically
    - Add a runtime guard in the API layer that wraps `applyAction` calls; any thrown error from the engine is caught and converted to a 500 response without leaking internal state
    - _Requirements: 18.5_

- [ ] 17. Accessibility implementation
  - [ ] 17.1 Implement keyboard navigation and focus management
    - Audit and fix Tab / Shift+Tab / Enter / Space operation across: Atlas incident list, Simulator scenario catalog, Simulator run page (action panel, evidence panel), debrief replay controls, and the `/learning` "Clear my progress" control
    - Ensure no keyboard focus traps in any of those flows
    - Use the shared focus ring from task 21.9 (`outline: 3px solid var(--color-focus); outline-offset: 2px`) on every interactive element; remove any per-component focus styles that bypass it
    - _Requirements: 1.5, 5.4, 14.1, 14.2, 14.7_

  - [ ] 17.2 Implement ARIA labels and text alternatives
    - Add `aria-label` or `aria-labelledby` to every non-text informational element in the scenario workflow, evidence request flow, and debrief flow (status icons, confidence-label indicators, trend arrows on `/learning`)
    - Mark decorative elements with `aria-hidden="true"`
    - Add `aria-label="Simulated time (not wall-clock time)"` on the Simulated_Time display
    - Contrast is handled by the light palette from task 21.9; only fix components that still use colours outside the palette tokens
    - _Requirements: 14.3, 14.4, 14.6, 14.8_

  - [ ] 17.3 Implement reduced-motion support
    - Add a `@media (prefers-reduced-motion: reduce)` block to `src/frontend/app/globals.css` capping all transitions and animations at 0.3s (or converting them to instant state changes)
    - _Requirements: 14.5_

  - [ ]* 17.4 Run axe-core accessibility scan
    - Add `axe-core` + Playwright to run automated accessibility scans on the light-theme build: `/`, `/atlas`, `/atlas/incidents/[slug]`, `/simulator`, `/simulator/[id]/brief`, `/simulator/[id]/run`, `/simulator/[id]/debrief`, `/learning`
    - All critical and serious violations, including colour-contrast failures, must be zero before the task is marked complete
    - _Requirements: 14.1–14.8, 15.6_

- [ ] 18. CI/CD pipeline
  - The Cloudflare Worker adapter (formerly 18.4) is implemented by task 21.7; these tasks only build CI and deployment around it. No KV is used.
  - [ ] 18.1 Write GitHub Actions workflow — CI checks (`ci.yml`)
    - Create `.github/workflows/ci.yml` triggered on `pull_request` to `main`, `push` to `main` and `workflow_call`
    - Steps: `npm ci` (root and `src/frontend`); `npm run lint` and `tsc --noEmit`; `npm run test:run` (root, including the D1 adapter tests from task 21.6) and frontend `vitest run`; `npm run validate-content`; `npm run validate-scenarios`; `npm run check-scenario-versions -- --base <sha>` using `github.event.pull_request.base.sha` on pull requests and `github.event.before` on pushes (checkout with `fetch-depth: 0`); `npm run build:content-bundle`, `npm run build:search-index`, `next build`; `npx wrangler deploy --dry-run --outdir dist-worker`
    - Split into named jobs (lint, test, validate-content, validate-scenarios, check-scenario-versions, build) so each can be a required status check
    - _Requirements: 3.2, 12.2, 12.3, 12.7, 12.8, 13.1–13.8_

  - [ ] 18.2 Write GitHub Actions workflow — production deploy (`deploy.yml`)
    - Create `.github/workflows/deploy.yml` on `push` to `main` only, with `concurrency: { group: deploy-production, cancel-in-progress: false }` and GitHub environment `production`
    - First job calls `ci.yml` via `uses: ./.github/workflows/ci.yml`; the deploy job `needs` it
    - Deploy job steps in order: build content bundle, search index and `next build` with `NEXT_PUBLIC_API_URL` from the Actions variable; `npx wrangler d1 migrations apply opsatlas --remote`; `npx wrangler deploy`; `npx wrangler pages deploy src/frontend/out --project-name opsatlas --branch main`
    - Pass `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from Actions secrets as env vars only on the Wrangler steps
    - Add a "Deployment" section to `README.md` listing the required secrets and variable and the `main` branch protection settings from the design (1 approving non-author review, required CI checks, no force push, no bypass) and the paid-plan caveat for private repositories
    - _Requirements: 12.4, 12.5, 19.7, 19.8_

  - [ ]* 18.3 Write workflow configuration tests
    - Add `scripts/workflows.test.ts` that parses `ci.yml` and `deploy.yml` (YAML parser dev dependency) and asserts: every required CI step is present; `deploy.yml` runs only on `push` to `main`, needs the CI job, and orders D1 migrations before `wrangler deploy` before `wrangler pages deploy`; secrets are not referenced in `ci.yml`
    - _Requirements: 12.3, 12.5_

- [ ] 19. Integration and end-to-end tests
  - [ ]* 19.1 Write integration tests for anonymous user journeys
    - Add `src/app.integration.test.ts` driving `createApp` with in-memory deps through `app.request()` with no `Authorization` header
    - Journey: `POST /sessions` → `GET /sessions/{key}/options` → actions and evidence → pause → resume (state identical) → complete → `GET /sessions/{key}/debrief` (includes `endedAt`) → `GET /debrief/steps/{n}`
    - Retry: `POST /sessions` with the pinned `scenarioVersion` from the first session returns a new key pinned to the same version; an unknown version returns 404 `SCENARIO_VERSION_NOT_FOUND`
    - Abandon then attempt to edit the journal → 403 `JOURNAL_IMMUTABLE`
    - _Requirements: 6.1, 6.2, 6.6, 9.6, 10.1, 10.7, 16.2_

  - [ ]* 19.2 Write static build smoke tests
    - Add `src/frontend/build-output.test.ts` (run after `next build`) asserting static HTML exists for every `/atlas/*` and `/simulator/{id}/*` route, `out/search-index.json` is non-empty, `out/_headers` sets `Referrer-Policy: no-referrer`, and no file under `out/` references `/sign-in`, `/admin` or an `Authorization` header
    - _Requirements: 1.1, 2.1, 18.3, 18.6_

  - [ ]* 19.3 Write Worker smoke test against local D1
    - Add `scripts/worker-smoke.test.ts` that starts the Worker with Wrangler's `unstable_dev` (or Miniflare) and a migrated local D1, then checks `/api/v1/health`, an anonymous session from creation to debrief, the CORS header for `http://localhost:3000`, and that the `scheduled` handler purges a session whose `last_activity_at` is 31 days old
    - _Requirements: 16.3, 18.9, 19.8_

  - [ ]* 19.4 End-to-end determinism test
    - Run the same scenario twice with the same action sequence; compare full event logs byte-for-byte
    - Run it against both `InMemorySimulationRuntimeRepository` and `D1SimulationRuntimeRepository`, ignoring Session_Keys, event ids and wall-clock times
    - _Requirements: 6.2_

- [ ] 20. Final checkpoint — All tests pass and platform is deployable
  - Run `npm run test:run` (root, including D1 adapter tests) and `npm --prefix src/frontend exec vitest run`; ensure all property, unit and integration tests exit 0. Run `npm run validate-content`, `npm run validate-scenarios` and `npm run check-scenario-versions -- --base origin/main`. Verify `next build` produces static exports for all routes and `npx wrangler deploy --dry-run` succeeds. Ask the user if questions arise.

- [ ] 21. No-login, light theme and Cloudflare migration
  - Execute in order 21.1 → 21.12; each sub-task leaves `npm run lint`, `npm run build`, `npm run test:run` and the frontend `vitest run` green. Runs before groups 17–20.
  - [x] 21.1 Remove authentication and in-app content governance
    - Delete `src/api/middleware/auth.ts` and `src/api/middleware/auth.test.ts`; remove `requireAuth`, `requireRole`, `AuthOptions`, `AuthVariables` and `c.get("user")` from `src/api/routes/sessions.ts`, `src/api/routes/debrief.ts`, `src/api/middleware/journalImmutability.ts` and `src/server.ts`
    - To keep the build green, drop the `userId` argument from the route → service calls in the same change: remove `userId` from `SessionRecord`, `SimulationRuntimeServiceContract`, `ScoringServiceContract` and the in-memory repositories in `src/modules/simulation-runtime/index.ts` and `src/modules/scoring-debrief/index.ts`, and remove token/user setup from `sessions.test.ts`, `debrief.test.ts`, `journal-immutability.property.test.ts` and module tests
    - Delete `src/api/routes/admin.ts`, `admin.test.ts`, `learning.ts`, `learning.test.ts` and their registration in `src/server.ts`
    - Create `src/modules/scenario-validator/` and move `validator.ts`, `validator.test.ts` and `validation-completeness.property.test.ts` (Property 11) from `src/modules/content-governance/`; add `index.ts` exporting `validateScenarioDefinition` and its result types; keep only a type-only import of `RubricDefinition["terminalStates"]` from scoring-debrief
    - Delete the rest of `src/modules/content-governance/` (`index.ts`, `scenarios.ts`, `index.test.ts`, `scenario-revalidation.test.ts`, `scenario-versions.test.ts`, `self-approval.property.test.ts`) and all of `src/modules/identity-learning/`
    - Delete the removed error factories from `src/api/errors.ts` (`unauthorized`, `forbidden`, `selfApprovalNotPermitted`, publish/workflow/content-not-found and HTTP `VALIDATION_SYSTEM_ERROR`); remove `jose` from `package.json`; remove `AUTH_*` from `.env.example`; update tsconfig path aliases and ESLint module-boundary rules for the new and removed modules
    - Fix every import; `grep` for `auth`, `identity-learning`, `content-governance` and `userId` under `src/` (excluding frontend, handled in 21.8) returns nothing
    - _Requirements: 12.1, 12.4, 13.1–13.8, 18.6, 19.1_

  - [-] 21.2 Introduce Session_Key and key redaction
    - Create `src/modules/simulation-runtime/session-key.ts` (runtime-neutral, global `crypto` only): `SESSION_KEY_BYTES = 32`, `SESSION_KEY_PATTERN`, `generateSessionKey()` (32 bytes from `crypto.getRandomValues`, base64url without padding, 43 chars), `isWellFormedSessionKey()`, `sessionKeyFingerprint()` (first 8 hex chars of SHA-256); export from the module `index.ts`
    - Add `sessionKeyGenerator?: () => string` to `SimulationRuntimeOptions` (default `generateSessionKey`) and use it for the session id in `createSession` instead of `idGenerator`/`randomUUID`; `idGenerator` keeps producing UUIDs for event and assessment ids
    - Add `src/api/middleware/sessionKey.ts` (`sessionKeyParam`) on `/:id/*` in session and debrief routes returning 404 `SESSION_NOT_FOUND` for malformed keys before any service or storage call; the runtime still returns 404 for unknown keys
    - Remove the session id from error messages (`assertSequenceFree` and any runtime/scoring error text); replace the global `onError` in `src/server.ts` with a redacting handler (`src/api/middleware/errorHandler.ts`) that logs only error name, request id and, when a key is in scope, its fingerprint, and never the request path
    - Unit tests: malformed key → 404 with the service mock not called; a thrown error containing a Session_Key leaves no key or path in captured `console.error` output
    - Property test `session-key.property.test.ts` — **Property 12: Session_Key Format and Uniqueness** (keys from repeated `createSession` match the pattern, decode to 32 bytes, pass `isWellFormedSessionKey` and are distinct; arbitrary and near-miss strings — 42/44 chars, `+`, `/`, `=` — are rejected); **Validates: Requirements 18.2**
    - Property test `key-scoped-access.property.test.ts` — **Property 13: Key-Scoped Session Access** (via `app.request()` with the in-memory repository: any path key that is not an existing session's key returns 404 `SESSION_NOT_FOUND` with no session data; responses for session A never contain B's key or data); **Validates: Requirements 16.6, 18.1, 18.4**
    - _Requirements: 9.4, 16.6, 18.1, 18.2, 18.3, 18.4_

  - [ ] 21.3 Finish the anonymous session and debrief API
    - Confirm `src/api/routes/sessions.ts`, `debrief.ts` and `journalImmutability.ts` contain no ownership check: a session is reachable by its key alone, and there is no endpoint that lists sessions
    - Accept optional `scenarioVersion` in the `POST /sessions` Zod body (≤ 200 chars); add `getVersion(id, version)` to `ScenarioRepository` and `FileScenarioRepository` in `src/modules/scenario-catalog/index.ts`; `createSession(scenarioId, scenarioVersion?)` pins that exact version or returns 404 `SCENARIO_VERSION_NOT_FOUND`
    - Add `endedAt: string` to `DebriefResult` in `src/modules/scoring-debrief/index.ts` from the session's `endedAt`
    - Verify the journal immutability guard still returns 403 `JOURNAL_IMMUTABLE` after conclusion and 405 otherwise without auth; keep Property 8 green
    - Update `sessions.test.ts`, `debrief.test.ts` and `scenario-catalog/index.test.ts`: pinned-version create, unknown version → 404, `endedAt` present, no `Authorization` header anywhere
    - _Requirements: 6.1, 6.6, 9.4, 9.6, 10.1, 10.7, 11.2, 18.1, 18.4_

  - [ ] 21.4 Split a runtime-neutral app factory, CORS and the new rate limiter
    - Create `src/app.ts` with `AppDeps` and `createApp(deps)` per the design (request id, CORS, rate limit, health, incidents, scenarios, sessions, debrief routes, redacting error handler); it and everything it imports must have no `node:*` or `@hono/node-server` imports
    - Reduce `src/server.ts` to the Node entry: build in-memory/File* deps, Node socket IP resolver (moves `@hono/node-server/conninfo` here), `ALLOWED_ORIGINS` (default `http://localhost:3000`), `serve({ fetch: app.fetch, port: 3001 })`
    - Create `src/api/middleware/cors.ts` (`corsAllowlist(allowed)`: methods GET/POST/OPTIONS, header `Content-Type`, exposes `Retry-After` and `X-Request-Id`, `credentials: false`, `maxAge: 600`) and a `parseOrigins` helper
    - Rewrite `src/api/middleware/rateLimit.ts`: `IP_LIMIT = 60`, `WINDOW_MS = 60_000`, `RateLimiter` interface, `inMemoryLimiter()` over the existing sliding-log store, `bindingLimiter(binding)` for the Workers Rate Limiting binding, `createRateLimitMiddleware({ limiter, resolveIp })`; health exempt; remove the authenticated tier, token bucket and `node:crypto`
    - Update `rateLimit.test.ts` to the new limits; add `cors.test.ts` (allowlisted origin echoed without credentials header, other origins get no CORS headers, preflight 204); add an ESLint `no-restricted-imports` rule forbidding `node:*` in `src/app.ts`, `src/api/**` and `src/modules/**` except files listed as Node-only (`File*` repositories)
    - _Requirements: 17.2, 17.4, 18.6, 19.1_

  - [ ] 21.5 Bundle published scenarios and rubrics from content
    - Rename `content/scenarios/example-fixture.json` to `content/scenarios/{id}@{version}.json` using the file's own `id` and `version`; update every test and loader reference
    - Add `content/rubrics/1.0.0.json` (the current `createDefaultRubric()` content) and `content/schema/rubric.schema.json`; extend `scripts/validate-content.ts` to validate `content/rubrics/`
    - Write `scripts/build-content-bundle.ts` (npm script `build:content-bundle`) reading scenarios and rubrics with the catalog guards and writing `src/generated/content-bundle.json` (`generatedAt`, `scenarios`, `rubrics`, `incidents`); fail on duplicate `(id, version)` or unknown `rubric_version`; add `src/generated/` to `.gitignore`
    - Add `BundledScenarioRepository` (scenario-catalog), `BundledRubricRepository` (scoring-debrief; `RubricRepository.save()` removed) and `BundledIncidentRepository` (incident-catalog) over a `ContentBundle` object, with no `node:*` imports
    - Catalog `listPublished()` and `getById()` return the highest semver version per id in both File and Bundled repositories; `getVersion()` returns older versions
    - Tests: bundle build fails on duplicate pair and unknown rubric; latest-version selection across `1.0.0`, `1.2.0`, `1.10.0`; pinned old version still resolvable
    - _Requirements: 5.1, 6.4, 6.5, 12.9, 19.3, 19.4, 19.6, 19.8_

  - [ ] 21.6 Add D1 migration and D1 adapters
    - Create `db/migrations/0001_init.sql` exactly per the design D1 schema (no `user_id`, `last_activity_at`, `UNIQUE (session_id, sequence_pos)`, `session_events_no_update` trigger, cascade deletes, `idx_sessions_last_activity`); delete `db/schema.sql`
    - Create `src/modules/simulation-runtime/d1-repository.ts` (`D1SimulationRuntimeRepository`) and `src/modules/scoring-debrief/d1-assessment-repository.ts` (`D1AssessmentRepository`) implementing the port statements in the design's D1 Adapters table with bound parameters and `db.batch()` for multi-statement writes; maintain `last_activity_at` on every write; map unique `(session_id, sequence_pos)` violations to 409 `SESSION_CONFLICT` (and make the in-memory `assertSequenceFree` raise the same error)
    - Add `purgeInactiveSessions(db, now, maxAgeDays = 30)` deleting in batches of 500 up to a per-run cap, then orphan `scenario_versions`; log counts only
    - Test approach: add `miniflare` as a dev dependency and a helper `src/test-support/d1.ts` that creates an in-memory D1 via `new Miniflare({ modules: true, script: "", d1Databases: ["DB"] })` and applies `db/migrations/*.sql` statement by statement (keeping the trigger `BEGIN … END` body intact); this is the same workerd SQLite engine as production and needs no `wrangler.toml`
    - Write a shared repository contract suite run against both the in-memory and D1 repositories: create, append, batch atomicity, duplicate sequence → `SESSION_CONFLICT`, `UPDATE session_events` blocked by the trigger, `last_activity_at` advances on writes only; `saveIfAbsent` idempotence; purge keeps 29-day-old and recent paused sessions, deletes 31-day-old sessions with events and assessments, and removes orphan snapshots; add npm script `test:d1` for the D1 files only
    - _Requirements: 6.3, 9.3, 9.6, 10.2, 16.3, 18.9_

  - [ ] 21.7 Add the Worker entry and Wrangler configuration
    - Create `src/worker.ts` per the design: `Env { DB, RATE_LIMITER, ALLOWED_ORIGINS }`, `workerDeps(env)` wiring D1 repositories, Bundled* repositories from `src/generated/content-bundle.json`, `bindingLimiter(env.RATE_LIMITER)` keyed by `CF-Connecting-IP`, cached app per `env.DB`; `scheduled` calls `purgeInactiveSessions` via `ctx.waitUntil`
    - Add `wrangler.toml` per the design (`name = "opsatlas-api"`, D1 binding `DB` with `migrations_dir = "db/migrations"`, `[[ratelimits]]` 60/60s, cron `0 3 * * *`, `[observability] enabled = false`, `[env.dev]` adding `http://localhost:3000` to `ALLOWED_ORIGINS`); add `wrangler` and `@cloudflare/workers-types` dev dependencies and a `tsconfig` entry for Worker types
    - Add npm scripts `worker:dev` (`wrangler dev`) and `worker:dry-run` (`wrangler deploy --dry-run --outdir dist-worker`, preceded by `build:content-bundle`); add `dist-worker/` and `.wrangler/` to `.gitignore`
    - Unit test `src/worker.test.ts` calling `worker.fetch` with a Miniflare D1 and a fake rate-limit binding (health 200, 429 mapping) and `worker.scheduled` (purge invoked)
    - `npm run worker:dry-run` succeeds with no Node-only modules in the bundle
    - _Requirements: 17.2, 18.3, 18.5, 18.9, 19.8_

  - [ ] 21.8 Make the frontend anonymous and add Local_Progress learning
    - Delete `src/frontend/app/sign-in/`, `src/frontend/app/admin/` (`AdminContent.tsx`, its test, `page.tsx`), `lib/auth.ts`, `lib/admin-client.ts` and `lib/learning-client.ts`; remove the `token` parameter and `Authorization` header from every call in `lib/session-client.ts` and its callers (`BriefClient`, `RunClient`, `DebriefClient`); remove sign-in and admin links from the `RootLayout` nav and add `/learning`
    - Create `lib/local-progress.ts` per the design (`LOCAL_PROGRESS_KEY`, `MAX_ENTRIES = 200`, `ProgressStore`, `readProgress`, `addProgress`, `clearProgress`; versioned JSON; Session_Key format check; in-memory fallback when `localStorage` throws)
    - `BriefClient` calls `addProgress` after `POST /sessions` returns 201; `DebriefClient` retry sends the pinned `scenarioVersion` and records the new session
    - Create `lib/learning.ts` with `computeLearningView(inputs)` ported from the old `identity-learning` rules (completed = `completed | timed_out`; history newest first; proficiency `clamp(1 + 4 × M / maxScore, 1, 5)`; per-dimension trends at two decimals; unavailable sessions excluded from skill map and trends)
    - Rebuild `app/learning/LearningView.tsx` and `page.tsx` as a static shell + client component: read Local_Progress, fetch debriefs 4 at a time, show device-only notice, "Clear my progress" (clears storage, no network call), empty state, "no longer available" rows, storage-unavailable notice; skill tags from the build-time scenario catalog
    - Add `src/frontend/public/_headers` with `/*` → `Referrer-Policy: no-referrer`
    - Tests: update `BriefClient.test.tsx` (one Local_Progress entry written, request body has no Local_Progress data), `LearningView.test.tsx` (empty state, notice, clear, unavailable row)
    - Property test `local-progress.property.test.ts` — **Property 14: Local_Progress Round Trip**; **Validates: Requirements 9.5, 11.8**
    - Property test `learning.property.test.ts` — **Property 15: Client-Side Learning Calculations**; **Validates: Requirements 11.2, 11.3, 11.4, 11.5, 11.9, 11.10**
    - _Requirements: 9.5, 10.7, 11.1–11.10, 18.3, 18.6, 18.7_

  - [ ] 21.9 Switch to a single light theme
    - Replace the palette in `src/frontend/app/globals.css` with the design's `@theme` light tokens, `html { color-scheme: light; ... }`, and the shared focus ring; delete all dark tokens and `prefers-color-scheme: dark` rules
    - Audit `src/frontend/app/**/*.tsx` for hardcoded dark colours (e.g. `bg-gray-9xx`, `text-white` on dark surfaces, `dark:` variants, hex literals) and replace them with palette tokens; accent buttons use `#ffffff` on `--color-accent`
    - Add `src/frontend/lib/theme-contrast.test.ts` asserting every documented token pair meets its WCAG threshold (text ≥ 4.5:1, UI and focus ≥ 3:1) and that `globals.css` contains no `dark` occurrences
    - _Requirements: 14.2, 14.3, 14.8, 15.6_

  - [ ] 21.10 Simplify Docker Compose and document local runs
    - Rewrite `docker-compose.yml` to the design target (services `api` and `frontend` only; no `db` service, `postgres_data` volume, `DATABASE_URL` or `AUTH_*`; `ALLOWED_ORIGINS=http://localhost:3000`); update `Dockerfile.api` to run `node dist/server.js` with the in-memory repository
    - Update `.env.example` to `NEXT_PUBLIC_API_URL` and `ALLOWED_ORIGINS` only
    - Add a "Local development" section to `README.md` with the `wrangler dev` path (`build:content-bundle`, `wrangler d1 migrations apply opsatlas --local`, `wrangler dev`, `NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev`, scheduled-handler test command) and the Docker Compose path (data is lost on restart)
    - _Requirements: 19.1_

  - [ ] 21.11 Add CI content scripts
    - Write `scripts/validate-scenarios.ts` (npm script `validate-scenarios`): load every `content/scenarios/*.json` and its rubric by `rubric_version`, run `validateScenarioDefinition`, print `{file, stateOrActionId, category, description}` per violation; exit 1 on violations, 2 on system errors (missing rubric, unreadable JSON, thrown exception), 0 otherwise
    - Write `scripts/check-scenario-versions.ts` (npm script `check-scenario-versions`) with pure `compareScenarioVersions(base, head)` in `scripts/lib/scenario-versions.ts`; read base files with `git show <sha>:<path>`; fail with one message per file when a base `(id, version)` changed canonical JSON or disappeared; new pairs pass
    - Unit tests `scripts/validate-scenarios.test.ts` and `scripts/check-scenario-versions.test.ts` covering exit codes 0, 1 and 2 on fixtures; add a `validate-content` test that an incident without a classified source fails; include `scripts/**/*.test.ts` in `vitest.config.ts`
    - Property test `scripts/lib/scenario-versions.property.test.ts` — **Property 16: Scenario Version-Bump Check**; **Validates: Requirements 12.8, 12.9**
    - _Requirements: 3.2, 12.2, 12.3, 12.7, 12.8, 12.9, 13.1–13.8_

  - [ ] 21.12 Checkpoint — Migration verified end to end
    - Root: `npm run lint`, `npm run build`, `npm run test:run` (including D1 tests), `npm run validate-content`, `npm run validate-scenarios`, `npm run check-scenario-versions -- --base origin/main`, `npm run worker:dry-run`
    - Frontend: lint, `vitest run`, `next build` with no `/sign-in` or `/admin` output
    - Local end-to-end run (`wrangler dev` + `next build` served statically, or `docker compose up`): start an anonymous session, play it to the debrief, and confirm it appears on `/learning`; "Clear my progress" empties the page
    - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Group 21 runs before groups 17–20; see the dependency graph
- Completed tasks made obsolete by the revised design (1.3, 9.1, 9.2, 9.4, 10.1–10.4, 10.7, 13.5) are kept as history with a "Superseded by task 21.x" note; uncompleted obsolete tasks (9.3, 10.6, 13.6, 18.4) were removed
- Property-based test coverage: P1 5.2, P2 5.7, P3 5.4, P4 5.9, P5 5.3, P6 3.3, P7 3.4, P8 8.2, P9 7.2, P10 5.11, P11 10.5 (relocated in 21.1), P12 and P13 in 21.2, P14 and P15 in 21.8, P16 in 21.11. The former Property 12 (Self-Approval Prevention, task 10.2) is retired
- Property tests use fast-check with a minimum of 100 iterations; each test is tagged with `// Feature: opsatlas-platform, Property N: ...`
- Incident content is not in D1; it is served from static build artefacts (and the Worker bundle for the optional `/incidents` routes)
- D1 adapter tests use Miniflare's in-memory D1 (task 21.6) instead of the design's `getPlatformProxy()`, so they run inside `npm run test:run` without a `wrangler.toml`
- Checkpoints are not implementation tasks; they are human review points
- All API inputs are validated at the boundary by Zod before reaching any domain module

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.5"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.6", "1.7"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["3.1", "4.1", "5.1", "9.1"] },
    { "id": 4, "tasks": ["3.2", "4.2", "5.2", "5.3", "5.4", "9.2"] },
    { "id": 5, "tasks": ["3.3", "3.4", "3.6", "5.6", "5.7", "9.4"] },
    { "id": 6, "tasks": ["5.8", "5.9", "5.10", "7.1", "10.1"] },
    { "id": 7, "tasks": ["5.11", "5.12", "7.2", "7.3", "8.1", "10.2", "10.3", "10.4"] },
    { "id": 8, "tasks": ["7.5", "8.2", "10.5", "10.7", "15.1"] },
    { "id": 9, "tasks": ["12.1", "16.1"] },
    { "id": 10, "tasks": ["12.2", "12.3", "12.6", "13.1", "13.2"] },
    { "id": 11, "tasks": ["12.4", "12.5", "13.3", "13.4", "13.5"] },
    { "id": 12, "tasks": ["21.1"] },
    { "id": 13, "tasks": ["21.2"] },
    { "id": 14, "tasks": ["21.3"] },
    { "id": 15, "tasks": ["21.4", "21.5"] },
    { "id": 16, "tasks": ["21.6"] },
    { "id": 17, "tasks": ["21.7"] },
    { "id": 18, "tasks": ["21.8", "21.10", "21.11"] },
    { "id": 19, "tasks": ["21.9"] },
    { "id": 20, "tasks": ["3.5", "5.5", "7.4", "15.2", "17.1", "18.1"] },
    { "id": 21, "tasks": ["17.2", "17.3", "18.2"] },
    { "id": 22, "tasks": ["17.4", "18.3", "19.1", "19.2", "19.3", "19.4"] }
  ]
}
```
