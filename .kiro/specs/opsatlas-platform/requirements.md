# Requirements Document

## Introduction

OpsAtlas is an interactive operational learning platform that combines a curated incident knowledge atlas with a production decision simulator. The Atlas provides deeply researched, source-cited records of real-world production incidents including timelines, root causes, causal factors, and lessons learned. The Simulator transforms selected incident lessons into branching scenarios where engineers observe staged telemetry, request evidence, choose mitigations, experience consequences, and receive a multi-dimensional evidence-based debrief. The platform targets software engineers, SREs, DevOps/platform engineers, cloud engineers, and engineering leads who want to build operational judgment through structured learning and deliberate practice.

OpsAtlas is free and public. The Platform has no sign-in, no accounts, and no user identity of any kind. The static site is hosted on Cloudflare Pages and the Simulator API runs on Cloudflare Workers, both on free tiers. All incident, scenario, and Rubric content lives in a private GitHub repository; Cloudflare Pages builds the site from that repository, Content_Contributors change content through pull requests, and CI validates content on every pull request. The site uses a single light colour theme.

The MVP delivers 5–10 curated incidents, 3–5 deterministic branching scenarios, a device-local learning profile with skill tracking, a pull-request-based content workflow, and scenario analytics.

## Glossary

- **Platform**: The OpsAtlas system as a whole, comprising the static site served by Cloudflare Pages and the Simulator API served by Cloudflare Workers.
- **Visitor**: Any anonymous person using the Platform through a web browser; the Platform has no sign-in and no user accounts.
- **Atlas**: The curated repository of real-world production incident records within OpsAtlas.
- **Incident**: A documented production failure event with timeline, root cause, impact analysis, source citations, and linked lessons.
- **Scenario**: A deterministic, branching simulation exercise inspired by a real incident, with objectives, staged telemetry, action choices, and a debrief.
- **Simulator**: The interactive environment where Visitors practice responding to operational failures through scenario execution, backed by the Simulator API on Cloudflare Workers.
- **Session**: A single anonymous run through a specific version of a scenario, recording all decisions, evidence requests, and outcomes, and accessible only through its Session_Key.
- **Session_Key**: An unguessable random session identifier with at least 128 bits of entropy that is the only way to access an anonymous Session.
- **Local_Progress**: The list of the Visitor's past Session_Keys and Session results stored in the browser's local storage on the current device.
- **State**: The snapshot of service health, metrics, dependencies, customer impact, available evidence, and active alerts at a point in a scenario.
- **Action**: A decision option available to the Visitor during a scenario, with preconditions, time cost, effects, side effects, reversibility, and rationale options.
- **Transition**: A state change triggered by an action or elapsed simulated time, governed by guard conditions and effects.
- **Decision_Journal**: The ordered record of timestamps, actions taken, evidence context, and selected rationales captured during a Session.
- **Debrief**: The post-scenario review showing the Visitor's decision path, multi-dimensional scores, alternative paths, and lessons connected back to the source incident.
- **Rubric**: The versioned scoring specification defining dimensions and criteria used to evaluate a Session.
- **Skill_Tag**: A label connecting an incident or scenario to a specific operational skill domain (e.g., database operations, network diagnosis, deployment safety).
- **Content_Repository**: The private GitHub repository that holds all incident, scenario, and Rubric content and from which Cloudflare Pages builds the public site.
- **Content_Contributor**: A person with write access to the Content_Repository who proposes content changes through pull requests; this is a repository role, not an application role.
- **CI_Pipeline**: The continuous integration checks that run on every pull request to the Content_Repository and on every commit to the main branch.
- **Validator**: The scenario validation component executed by the CI_Pipeline that checks scenario definitions against the rules in Requirement 13.
- **Slug**: A URL-safe identifier derived from an incident or topic title, used in page routes.
- **Confidence_Label**: An editorial annotation on an incident claim indicating whether it is a confirmed fact, inference, teaching simplification, or unknown.
- **Source_Tier**: A classification of citation quality: Tier 1 (official company postmortem), Tier 2 (engineer talk or interview), Tier 3 (reputable secondary reporting).
- **Simulated_Time**: The in-scenario clock representing time elapsed within the fictional incident, explicitly distinct from wall-clock time.
- **Failure_Domain**: A category of failure type used for filtering and skill tagging (e.g., database saturation, network impairment, deployment regression, retry storm, storage exhaustion).
- **Score_Dimension**: One of six independent scoring axes evaluated in the Debrief: Impact Control, Diagnostic Quality, Risk Management, Recovery Quality, Communication, and Learning/Reflection.
- **Content_Workflow**: The GitHub pull-request workflow used for all Atlas and Simulator content: draft branch → pull request review → CI_Pipeline validation → merge to main → rebuild and publish.

---

## Requirements

### Requirement 1: Browse Incident Atlas

**User Story:** As a software engineer, I want to browse a list of published incidents, so that I can discover relevant case studies and open a detailed incident page.

#### Acceptance Criteria

1. THE Atlas SHALL display all published incidents on the `/atlas` page, ordered by publication date descending by default.
2. WHEN a user opens the `/atlas` page, THE Atlas SHALL render each incident entry with its title, provider, failure domain, severity, and up to 3 primary Skill_Tags.
3. WHEN a user selects an incident entry, THE Atlas SHALL navigate the user to the incident detail page at `/atlas/incidents/{slug}`.
4. IF no published incidents exist, THEN THE Atlas SHALL display an empty-state message explaining that content is coming soon.
5. THE Atlas SHALL allow users to move focus between incident entries using the Tab key and activate the focused entry using the Enter or Space key, with a visible focus indicator on the currently focused entry at all times.
6. IF the incident detail page at `/atlas/incidents/{slug}` cannot be found, THEN THE Atlas SHALL display an error message indicating the incident does not exist and provide a link back to the `/atlas` page.

---

### Requirement 2: Search and Filter Incidents

**User Story:** As a software engineer, I want to search and filter the incident atlas by provider, technology, and failure domain, so that I can quickly find incidents relevant to my work context.

#### Acceptance Criteria

1. WHEN a user submits a search query of 1 to 200 characters on the `/atlas` page, THE Atlas SHALL return incidents whose title, summary, or Skill_Tags contain all query terms using case-insensitive substring matching.
2. WHEN a user applies a provider filter, THE Atlas SHALL restrict the incident list to incidents matching the selected provider value.
3. WHEN a user applies a technology filter, THE Atlas SHALL restrict the incident list to incidents matching the selected technology value.
4. WHEN a user applies a failure domain filter, THE Atlas SHALL restrict the incident list to incidents matching the selected Failure_Domain value.
5. WHEN a user applies multiple filters simultaneously with an active search query, THE Atlas SHALL return only incidents that match all active filter criteria AND all search query terms.
6. WHEN a search or filter operation produces no results, THE Atlas SHALL display a no-results message and retain the active filter state.
7. WHEN a user clears all filters and the search query, THE Atlas SHALL restore the full published incident list.
8. WHEN a user selects multiple values within a single filter dimension, THE Atlas SHALL return incidents matching any of the selected values within that dimension.
9. WHEN a user changes a filter or search query, THE Atlas SHALL reflect updated results within 500ms on the client side.

---

### Requirement 3: Source Transparency

**User Story:** As a software engineer, I want every incident to display its source references and confidence labels, so that I can assess the reliability of the information I am reading.

#### Acceptance Criteria

1. THE Atlas SHALL require every published Incident to have at least one source citation with a Source_Tier classification before the incident may be published.
2. IF a pull request to the Content_Repository contains an Incident without at least one source citation that includes a Source_Tier classification, THEN THE CI_Pipeline SHALL fail the content schema check and report an error indicating that a classified source citation is required.
3. WHEN a user views an incident detail page, THE Atlas SHALL display all source citations, each showing its Source_Tier label, publication date, and a URL hyperlink to the original source; where no URL is available, THE Atlas SHALL display the bibliographic reference text in place of the hyperlink.
4. WHEN a user views any factual claim on an incident detail page, THE Atlas SHALL associate a Confidence_Label drawn from exactly the set {fact, inference, teaching simplification, unknown} with that claim, displayed as a visible text label adjacent to the claim.
5. IF an incident is a reconstruction inspired by a real event, THEN THE Atlas SHALL display a label reading "Educational Reconstruction — not a verbatim account" at the top of the incident detail page, above the incident body content.
6. THE Atlas SHALL render each Confidence_Label value ({fact, inference, teaching simplification, unknown}) using a distinct text label and a distinct non-color visual indicator (such as an icon or border style), so that the labels remain distinguishable without relying on color alone, in conformance with WCAG 2.1 Level AA criterion 1.4.1.

---

### Requirement 4: Incident Timeline

**User Story:** As a software engineer, I want to read an ordered, time-labeled incident timeline, so that I can understand the sequence of events and their relationship to evidence.

#### Acceptance Criteria

1. WHEN a user views an incident detail page, THE Atlas SHALL display timeline events in ascending chronological order, with the earliest event first.
2. THE Atlas SHALL label each timeline event with a timestamp that includes date, time, and UTC offset in ISO 8601 format.
3. WHEN a timeline event has associated evidence, THE Atlas SHALL render a navigable hyperlink to that evidence within the event entry.
4. WHEN a user views an incident detail page, THE Atlas SHALL display the incident summary, architecture context, customer impact, causal factors, recovery steps, and lessons learned sections; IF a section has no content, THEN THE Atlas SHALL display that section with an indicator that no content is available.
5. WHEN a scenario is linked to an incident, THE Atlas SHALL display a clearly labeled hyperlink on the incident detail page that navigates the user to the linked scenario brief in the same browser tab.

---

### Requirement 5: Scenario Catalog

**User Story:** As a software engineer, I want to browse available scenarios and inspect their objectives, difficulty, estimated duration, and skills before starting, so that I can choose a scenario appropriate to my current learning goal.

#### Acceptance Criteria

1. THE Simulator SHALL display all scenarios with a status of "published" on the `/simulator` page, where a published scenario is one merged to the main branch of the Content_Repository and marked as active and visible to end users.
2. WHEN a user views the scenario catalog, THE Simulator SHALL display each scenario's title, difficulty rating on a three-point scale (Beginner, Intermediate, Advanced), estimated duration between 5 and 240 minutes inclusive, up to 10 required Skill_Tags, and a one-sentence objective summary of no more than 160 characters.
3. WHEN a user selects a scenario, THE Simulator SHALL navigate the user to the scenario brief page at `/simulator/{scenarioId}/brief`, where `scenarioId` is the unique alphanumeric identifier assigned to the scenario.
4. THE Simulator SHALL make every scenario card in the catalog reachable and activatable via keyboard Tab and Enter keys without requiring a pointing device.
5. IF no published scenarios exist, THEN THE Simulator SHALL display an empty-state message explaining that scenarios are coming soon.

---

### Requirement 6: Deterministic Scenario Engine

**User Story:** As a software engineer, I want a scenario to produce the same outcomes for the same action sequence, so that I can replay, compare, and learn from my decisions with confidence that outcomes reflect my choices.

#### Acceptance Criteria

1. THE Simulator SHALL pin every Session to the scenario's version identifier at the moment the session is created.
2. WHEN the same scenario version receives the same sequence of Actions in a replay, THE Simulator SHALL produce State transitions and outcomes whose field values and transition sequence order are identical to those of the original Session.
3. WHEN a Session is completed or abandoned, THE Simulator SHALL persist the full event log for that Session, where each entry records the sequence position, the Action taken, its precondition evaluation result, and the resulting State.
4. IF a scenario version is updated, THEN THE Simulator SHALL preserve all Sessions pinned to prior versions such that each Session's stored data is retrievable and unchanged.
5. IF a scenario version is updated, THEN THE Simulator SHALL apply the prior version's rules when replaying any Session pinned to that prior version.
6. IF a Session creation request references a scenario version identifier that does not exist, THEN THE Simulator SHALL reject the request and return an error indicating that the referenced version was not found.

---

### Requirement 7: Branching Decisions

**User Story:** As a software engineer, I want each scenario to present at least three meaningful decision points with distinct consequences, so that my choices materially affect the scenario outcome and I experience the operational trade-offs.

#### Acceptance Criteria

1. THE Simulator SHALL present at least three decision points in each MVP scenario, where each decision point offers at least two Actions and the set of available Actions at each decision point differs from at least one other decision point in the same scenario.
2. WHEN a user selects an Action at a decision point, THE Simulator SHALL apply the Action's effects and side effects to the current State according to the Transition rules.
3. WHEN an Action has a precondition that is not satisfied by the current State, THE Simulator SHALL disable that Action and display the unmet precondition inline alongside the Action.
4. WHEN an Action has a time cost, THE Simulator SHALL advance the Simulated_Time by that cost after the Action is applied.
5. WHEN an Action produces a delayed effect, THE Simulator SHALL apply that effect after the specified Simulated_Time delay has elapsed within the scenario.
6. IF the current State satisfies the conditions defined in the Transition rules for triggering an Action's negative side effects, THEN THE Simulator SHALL apply those negative side effects when the Action is executed.
7. WHEN a user selects an Action that is marked irreversible in the scenario definition, THE Simulator SHALL display the list of State attributes the Action will modify and the irreversibility flag before the user confirms the Action.

---

### Requirement 8: Evidence Requests

**User Story:** As a software engineer, I want to request logs, metrics, topology diagrams, and change history during a scenario, so that I can gather information before making a decision.

#### Acceptance Criteria

1. WHEN a user requests a piece of evidence during an active Session, THE Simulator SHALL return the evidence payload defined for that evidence type and current State in the scenario data.
2. THE Simulator SHALL support at least four evidence types: logs, metrics, topology, and change history.
3. WHEN a user requests evidence that is not defined for the current State in the scenario data, THE Simulator SHALL return a response that explicitly indicates unavailability, distinguishable from a valid evidence payload by a dedicated status field set to "unavailable".
4. WHEN a user requests evidence during an active Session, THE Simulator SHALL record the request in the Decision_Journal with the evidence type, the Simulated_Time at the moment of the request, and the current State at the moment of the request.
5. WHEN evidence is requested and the scenario definition assigns no time cost to that evidence type, THE Simulator SHALL not advance Simulated_Time.
6. WHEN evidence is requested and the scenario definition assigns a time cost to that evidence type, THE Simulator SHALL advance Simulated_Time by exactly the number of minutes specified as the time cost for that evidence type in the scenario data.
7. IF a user requests evidence and no Session is active, THEN THE Simulator SHALL return an error response indicating that no active session exists and SHALL not record an entry in the Decision_Journal.

---

### Requirement 9: Decision Journal

**User Story:** As a software engineer, I want the system to record every action and evidence request I make during a scenario, so that I can review my reasoning process during the debrief.

#### Acceptance Criteria

1. THE Simulator SHALL record every Action selection in the Decision_Journal with the Simulated_Time of selection, the Action identifier, the Scenario_State snapshot (comprising the active Phase, current Threat_Level, and the set of Conditions visible to the user at the moment of selection), and the rationale option the user selected from the presented set of rationale choices for that Action.
2. THE Simulator SHALL record every evidence request in the Decision_Journal with the Simulated_Time of the request, the Evidence_Item identifier, the Evidence_Item category (Observable, Indicator, or Artifact), and the Scenario_State snapshot at the time of the request.
3. WHEN a Session concludes — whether by completion, user abandonment, or timeout — THE Simulator SHALL persist the complete Decision_Journal to non-volatile storage within 5 seconds of the concluding event.
4. WHEN a request presents the Session_Key of a Session, THE Simulator SHALL return that Session's Decision_Journal for retrieval during Debrief and progress review.
5. WHEN a Session is created, THE Platform SHALL record the Session's Session_Key in Local_Progress in the Visitor's browser.
6. THE Simulator SHALL expose the Decision_Journal as a read-only artifact; IF any request is made to modify or delete a Decision_Journal entry after the Session has concluded, THEN THE Simulator SHALL reject the request and return an error indicating that journal entries are immutable.

---

### Requirement 10: Debrief and Replay

**User Story:** As a software engineer, I want to replay my decision sequence after completing a scenario and see how my choices affected the outcome, so that I can understand what I would do differently.

#### Acceptance Criteria

1. WHEN a user completes or times out of a Session, THE Simulator SHALL navigate the user to the debrief page at `/simulator/{scenarioId}/debrief`.
2. THE Simulator SHALL display each Score_Dimension score as a separately labeled entry on the debrief page; THE Simulator SHALL NOT collapse all dimensions into a single composite score.
3. WHEN a user views the debrief, THE Simulator SHALL present a step-by-step replay of the Decision_Journal, where each step corresponds to one Decision_Journal entry and shows the State and the set of evidence items that had been revealed up to that entry.
4. THE Simulator SHALL display at least one alternative action at each decision point in the Decision_Journal and display a text description of no more than 200 characters explaining how choosing that alternative would have changed the outcome.
5. WHEN the debrief replay is active, THE Simulator SHALL show which evidence items were available but not requested by the user at each decision point in the Decision_Journal.
6. IF the scenario is linked to an incident, THEN THE Simulator SHALL display a navigable link from the debrief page to the source incident detail page in the Atlas.
7. WHEN a user selects the retry action on the debrief page, THE Simulator SHALL create a new Session using the same scenario version and navigate the user to the scenario brief.

---

### Requirement 11: Progress History

**User Story:** As an anonymous Visitor, I want to view my completed scenarios and skill trends on this device, so that I can understand my growth and identify gaps to focus on next without creating an account.

#### Acceptance Criteria

1. WHEN a Visitor navigates to `/learning`, THE Platform SHALL read Local_Progress on the current device and fetch the Debrief of each listed Session by its Session_Key.
2. WHEN a Visitor navigates to `/learning` and Local_Progress contains at least one completed Session, THE Platform SHALL display the completed scenario history ordered from most recent to oldest, including scenario title, completion date in YYYY-MM-DD format, and Score_Dimension results for each completed Session.
3. WHEN a Visitor navigates to `/learning` and Local_Progress contains at least one completed Session, THE Platform SHALL display a skill map showing assessed proficiency across Skill_Tags based on the completed Sessions in Local_Progress, where proficiency is expressed on a 1–5 scale.
4. WHEN Local_Progress contains at least 2 completed Sessions for the same scenario, THE Platform SHALL show each attempt separately and indicate trend direction per Score_Dimension as "up", "down", or "unchanged" by comparing the most recent Session to the immediately preceding Session.
5. THE Platform SHALL calculate skill trends using only Sessions whose Session_Keys are listed in Local_Progress on the current device.
6. THE Platform SHALL display a notice on `/learning` stating that progress is stored only on this device and is not available on other devices or browsers.
7. THE Platform SHALL display a "Clear my progress" control on `/learning`.
8. WHEN a Visitor activates the "Clear my progress" control, THE Platform SHALL remove all entries from Local_Progress on the current device and display the empty state.
9. IF Local_Progress is empty or contains no completed Sessions, THEN THE Platform SHALL display an explanatory message indicating no history is available and SHALL NOT render the skill map or trend indicators.
10. IF the Debrief for a Session_Key listed in Local_Progress cannot be retrieved, THEN THE Platform SHALL omit that Session from the skill map and trends and mark the history entry as no longer available.

---

### Requirement 12: Content Workflow

**User Story:** As a Content_Contributor, I want to draft, review, validate, and publish incident and scenario content through GitHub pull requests on the Content_Repository, so that all published content meets quality and source standards before learners can access it.

#### Acceptance Criteria

1. WHILE a content change exists only on a draft branch or an unmerged pull request in the Content_Repository, THE Platform SHALL exclude that change from the Atlas and the Simulator catalog.
2. WHEN a pull request that changes content is opened or updated in the Content_Repository, THE CI_Pipeline SHALL run content schema validation and scenario validation as defined in Requirement 13.
3. IF content schema validation or scenario validation fails on a pull request, THEN THE CI_Pipeline SHALL report a failing required status check that blocks the pull request from being merged.
4. THE Content_Repository SHALL be configured with GitHub branch protection on the main branch that requires at least one approving review from a reviewer other than the pull request author, requires all CI_Pipeline status checks to pass, and disallows direct pushes to the main branch.
5. WHEN a reviewed pull request with passing CI_Pipeline checks is merged to the main branch, THE Platform SHALL rebuild and publish the site so that the merged content becomes visible in the Atlas and the Simulator catalog.
6. WHEN an incident is published, THE Platform SHALL assign the incident a unique Slug derived from the incident title.
7. IF a pull request contains an incident record with fewer than one source citation that includes a Source_Tier classification, THEN THE CI_Pipeline SHALL fail the content schema check and report an error indicating that at least one classified source citation is required.
8. IF a pull request modifies any content field of a previously published scenario version without assigning a new scenario version identifier, THEN THE CI_Pipeline SHALL fail the version check and report an error indicating that a version bump is required.
9. WHEN a modified published scenario is merged with a new version identifier, THE Platform SHALL publish the new scenario version while preserving the prior published version so that all Sessions pinned to the prior version remain replayable.

---

### Requirement 13: Scenario Validation

**User Story:** As a Content_Contributor, I want the CI_Pipeline to validate every scenario before publication, so that invalid transitions, unreachable states, and missing debrief mappings are caught before learners encounter them.

#### Acceptance Criteria

1. WHEN the CI_Pipeline runs on a pull request or on the main branch, THE Validator SHALL verify that every State referenced in a Transition exists in the scenario's state graph.
2. WHEN the CI_Pipeline runs on a pull request or on the main branch, THE Validator SHALL verify that every State in the scenario is reachable from the initial State via at least one valid Action sequence.
3. WHEN the CI_Pipeline runs on a pull request or on the main branch, THE Validator SHALL verify that every terminal State has a corresponding debrief mapping in the Rubric.
4. WHEN the CI_Pipeline runs on a pull request or on the main branch, THE Validator SHALL verify that every Action referenced in a Transition has a defined precondition, time cost, effects set, and at least one rationale option.
5. IF scenario validation detects any violation, THEN THE Validator SHALL print to the CI_Pipeline output a structured list of all violations where each entry includes the affected State or Action identifier, the violation category (one of: invalid-reference, unreachable-state, missing-debrief, incomplete-action), and a human-readable description of the specific violation, and SHALL exit with a failing status.
6. IF scenario validation passes with no violations, THEN THE Validator SHALL exit with a passing status, allowing the Content_Workflow to proceed to merge and publish.
7. WHEN a new commit that changes a scenario's state graph, Transitions, or Rubric is pushed to an open pull request, THE CI_Pipeline SHALL re-run scenario validation against the updated scenario version.
8. IF the Validator encounters a system error during validation execution, THEN THE Validator SHALL exit with a failing status and print an error message indicating that validation could not be completed.

---

### Requirement 14: Accessibility

**User Story:** As a software engineer using keyboard navigation or assistive technology, I want core navigation and simulator actions to be operable without a pointing device, so that the platform is accessible to engineers with different interaction needs.

#### Acceptance Criteria

1. THE Platform SHALL make all navigation links, buttons, form controls, and interactive elements within the scenario workflow, evidence request flow, and debrief flow operable using Tab, Shift+Tab, Enter, and Space keys, with no keyboard focus trap occurring at any point in those flows.
2. THE Platform SHALL render a visible focus indicator on every interactive element such that the focus indicator has a minimum contrast ratio of 3:1 against all adjacent colors.
3. THE Platform SHALL meet a minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text (18pt or 14pt bold) and for meaningful non-text UI elements across the scenario workflow, evidence request flow, and debrief flow.
4. THE Platform SHALL provide a programmatic text alternative for every non-text element in the scenario workflow, evidence request flow, and debrief flow that conveys information, and SHALL mark purely decorative non-text elements so that assistive technologies ignore them.
5. WHERE a user's operating system has enabled a reduced motion preference, THE Platform SHALL limit all animations and transitions to a maximum duration of 0.3 seconds or convert them to instant state changes with no motion.
6. THE Simulator SHALL label the Simulated_Time display with an accessible name that explicitly identifies it as simulated time, not wall-clock time.
7. THE Platform SHALL make the scenario action panel, evidence request panel, and debrief replay controls fully operable using the same Tab, Shift+Tab, Enter, and Space key interactions defined in criterion 1, with no keyboard focus trap occurring within those panels.
8. THE Platform SHALL render every page in a single light colour theme whose text and non-text colour pairs meet WCAG 2.2 Level AA contrast requirements, independent of the operating system colour-scheme preference.

---

### Requirement 15: Home Page and Navigation

**User Story:** As a first-time visitor, I want the home page to clearly explain what OpsAtlas is and provide direct paths to the Atlas and Simulator, so that I understand the product's value within 10 seconds.

#### Acceptance Criteria

1. THE Platform SHALL render a hero section on `/` that contains a headline of no more than 10 words and a single descriptive sentence, where the entire hero section is visible within the initial viewport at both 1024px and 375px widths without vertical scrolling.
2. THE Platform SHALL display two primary calls-to-action on `/` that navigate to `/atlas` and `/simulator` respectively, where each call-to-action is rendered as a distinct interactive element with a visible label.
3. THE Platform SHALL display between 3 and 6 featured incidents on `/`, where each featured incident shows a title, a cloud or service provider name, and at least one failure domain label.
4. THE Platform SHALL display a how-it-works section on `/` that presents each of the five steps — Discover, Understand, Practice, Reflect, and Improve — as a separately labelled item with a one-sentence description.
5. THE Platform SHALL render all five sections of the home page — hero, calls-to-action, featured incidents, how-it-works, and navigation — at desktop viewport widths of 1024px and above and at mobile viewport widths of 375px and above, where all navigation links resolve to their target routes and no section contains broken or missing images.
6. THE Platform SHALL render the home page and navigation in the single light colour theme defined in Requirement 14, meeting WCAG 2.2 Level AA contrast, with no dark theme and no theme switcher control.

---

### Requirement 16: Scenario Pause and Resume

**User Story:** As a software engineer in learning mode, I want to pause and resume an active scenario, so that I can step away and return without losing my progress.

#### Acceptance Criteria

1. WHEN a user selects the pause action during an active Session, THE Simulator SHALL suspend Simulated_Time advancement and record the pause event with a wall-clock timestamp in the Decision_Journal.
2. WHEN a user resumes a paused Session by presenting the Session's Session_Key, THE Simulator SHALL restore the Session to the Simulated_Time, pending events queue, current Metrics values, and Decision_Journal contents that existed at the moment of pause.
3. THE Simulator SHALL preserve the full Decision_Journal and current State for a paused Session in durable storage for a minimum of 30 days or until the user resumes or abandons the Session, whichever comes first.
4. WHILE a Session is paused, THE Simulator SHALL display a "Paused" status label and disable all Action selection controls.
5. IF a user attempts to submit an Action while a Session is paused, THEN THE Simulator SHALL reject the submission and display an error message indicating that the Session must be resumed before Actions can be taken.
6. IF a pause, resume, or Action request presents a Session_Key that does not match an existing Session, THEN THE Simulator SHALL reject the request and return a not-found error.

---

### Requirement 17: Performance

**User Story:** As a software engineer, I want the platform to respond quickly to common read operations, so that latency does not interrupt learning flow.

#### Acceptance Criteria

1. WHILE the Platform is serving up to 100 concurrent read requests, THE Platform SHALL return responses for incident list, incident detail, scenario catalog, and scenario state read operations at or below 500ms at the 95th percentile.
2. THE Simulator SHALL enforce a rate limit of no more than 60 requests per minute per client IP address on all Simulator API endpoints.
3. THE Platform SHALL serve static pages from the Cloudflare Pages CDN without application-level rate limiting.
4. IF a client exceeds the Simulator API rate limit within a 60-second window, THEN THE Simulator SHALL reject the request with an error response indicating the limit has been exceeded and include a retry indication specifying when the client may resume requests.
5. IF user-supplied input fails validation in any API handler, THEN THE Platform SHALL reject the request with an error response indicating which input is invalid and SHALL NOT process or persist the offending input.
6. THE Platform SHALL validate and sanitize all user-supplied input for maximum field lengths not exceeding 10,000 characters per text field and reject inputs containing malformed data structures before processing in any API handler.

---

### Requirement 18: Security and Safety

**User Story:** As a platform operator, I want the platform to handle anonymous sessions securely and collect no personal data, so that visitors are protected and no simulated action can affect real infrastructure.

#### Acceptance Criteria

1. THE Simulator SHALL grant access to an anonymous Session only to requests that present that Session's Session_Key.
2. THE Simulator SHALL generate every Session_Key with a cryptographically secure random generator producing at least 128 bits of entropy.
3. THE Platform SHALL exclude Session_Keys from all application logs, analytics events, and error reports.
4. IF a request asks for Session data without presenting the matching Session_Key, THEN THE Simulator SHALL reject the request without returning any data belonging to that Session.
5. THE Simulator SHALL execute all scenario transitions and state changes within an isolated sandbox that has no outbound network access to external infrastructure, cloud providers, or production systems, no read or write access to file system paths outside the sandbox working directory, and no ability to spawn processes outside the sandbox boundary.
6. THE Platform SHALL collect no personal data: no accounts, no email addresses, and no tracking cookies.
7. THE Platform SHALL keep Local_Progress exclusively in the Visitor's browser local storage and SHALL NOT transmit Local_Progress contents to the Simulator API other than the individual Session_Key needed to fetch a Session.
8. THE Platform SHALL expose content from the private Content_Repository only through the built public site and the deployed Simulator API.
9. WHEN an anonymous Session has had no activity for 30 days, THE Simulator SHALL delete that Session and its Decision_Journal from storage.

---

### Requirement 19: Content Separation and Maintainability

**User Story:** As a platform engineer, I want incident content, simulation rules, scoring logic, and UI components to be maintained in separate, well-defined modules, so that changes to one concern do not require changes to unrelated modules.

#### Acceptance Criteria

1. THE Platform SHALL store incident content records, scenario state graphs and transition rules, Rubric definitions, and UI component code in separate modules such that each module exposes a documented interface and no module directly reads or writes the internal data structures of another module.
2. WHEN a pull request that updates incident content fields is merged, THE Platform SHALL apply that update without requiring any change to scenario engine code or Rubric definitions.
3. WHEN a Rubric is updated, THE Platform SHALL assign it a new version identifier that is distinct from all prior version identifiers of that Rubric, leaving the associated scenario state graph unchanged.
4. WHEN a scenario version is created, THE Platform SHALL record the scenario version identifier and the Rubric version identifier together so that replay uses the same Rubric as the original Session.
5. IF the Rubric version identifier recorded with a scenario version is not present in the Platform at replay time, THEN THE Platform SHALL reject the replay request and return an error indicating that the required Rubric version is unavailable.
6. THE Platform SHALL keep all incident, scenario, and Rubric content in the private Content_Repository.
7. WHEN Cloudflare Pages builds the site, THE Platform SHALL read Atlas incident content from the Content_Repository at build time.
8. WHEN the Simulator API is deployed, THE Platform SHALL bundle or upload the published scenario and Rubric definitions from the Content_Repository to the Cloudflare Worker at deploy time.
