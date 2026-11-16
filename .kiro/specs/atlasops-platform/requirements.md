# Requirements Document

## Introduction

AtlasOps is an interactive web platform that combines a curated atlas of major real-world DevOps failures with a production decision simulator. The platform enables users to study incident postmortems from historical outages, step into realistic simulated outage scenarios, make critical operational decisions, and immediately observe how those decisions affect system reliability, downtime, cost, and customer experience.

The platform consists of two tightly integrated modules: a **Knowledge Repository (Incident Atlas)** that catalogs real-world incidents with structured postmortem data, and an **Interactive Production Simulator** that transforms those incidents into branching decision-tree scenarios. A scoring system (MTTR, user impact, cost) benchmarks user decisions against what real-world engineers actually did, and a War Room Mode delivers a high-pressure multi-panel incident command experience.

## Glossary

- **AtlasOps**: The name of the platform being built.
- **Incident**: A documented real-world DevOps or infrastructure failure event with defined severity, duration, affected users, root cause, and lessons learned.
- **Postmortem**: A structured written analysis of an incident covering timeline, root cause, impact, and remediation steps.
- **Simulation**: An interactive, branching recreation of an incident in which the user makes sequential operational decisions.
- **Decision**: A discrete action option presented to the user during a simulation (e.g., "Rollback Deployment", "Scale DB").
- **Consequence**: The immediate and downstream impact on system metrics resulting from a user's decision within a simulation.
- **Scenario**: A complete simulation script for a specific incident, composed of stages, each containing a situation description, available decisions, and consequence branches.
- **Stage**: A single decision point within a scenario, presenting the current system state and a set of available decisions.
- **Score**: A numeric value (0–100) computed at the end of a simulation based on MTTR, user impact, and cost metrics.
- **MTTR**: Mean Time To Recovery — the simulated time elapsed from incident start to full resolution.
- **War Room Mode**: A high-fidelity, multi-panel incident command simulation presenting simultaneous metrics, log streams, and user complaint feeds.
- **SEV-1**: The highest severity classification for an incident, indicating complete service outage or critical data loss.
- **Leaderboard**: A ranked list of users ordered by simulation score for a specific scenario or globally.
- **Atlas**: The searchable catalog of all incidents in the knowledge repository.
- **Incident_Atlas**: The front-end module rendering the Atlas.
- **Simulator**: The front-end module running interactive simulations.
- **Decision_Engine**: The back-end component that evaluates a user's decision, applies consequence logic, and returns the updated system state.
- **Scoring_Engine**: The back-end component that computes the final score at the end of a simulation.
- **Content_Repository**: The back-end data store holding all incident records, postmortem content, and scenario scripts.
- **Leaderboard_Service**: The back-end service that stores and retrieves ranked scores per scenario.
- **Search_Service**: The back-end service that indexes and queries incident records.
- **Auth_Service**: The back-end service handling user registration, login, and session management.
- **User**: A registered or anonymous visitor of the AtlasOps platform.
- **Metric**: A quantified system health indicator tracked during a simulation (e.g., API Success Rate, Latency, CPU Utilization, Error Rate, Revenue Loss per Minute).

---

## Requirements

### Requirement 1: Incident Atlas — Browse and Search

**User Story:** As a DevOps engineer, I want to browse and search a curated catalog of real-world incidents, so that I can quickly find relevant historical failures to study.

#### Acceptance Criteria

1. THE Incident_Atlas SHALL display a paginated list of incidents, each showing incident name, severity level, date, affected system, and a brief summary.
2. WHEN a user submits a search query, THE Search_Service SHALL return incidents whose title, affected system, tags, or summary contain the query string, within 500ms.
3. WHEN a user applies a severity filter, THE Incident_Atlas SHALL display only incidents matching the selected severity level.
4. WHEN a user applies a date-range filter, THE Incident_Atlas SHALL display only incidents whose occurrence date falls within the specified range.
5. WHEN a user applies a category filter (e.g., network, database, deployment), THE Incident_Atlas SHALL display only incidents tagged with that category.
6. WHEN a user clears all filters, THE Incident_Atlas SHALL restore the full unfiltered incident list.
7. IF no incidents match the applied filters or search query, THEN THE Incident_Atlas SHALL display a message indicating no results were found.
8. THE Incident_Atlas SHALL display a horizontal visual timeline of major incidents ordered chronologically.

---

### Requirement 2: Incident Detail Page

**User Story:** As a DevOps engineer, I want to view the full postmortem for an incident, so that I can understand the root cause, impact, and lessons learned in depth.

#### Acceptance Criteria

1. WHEN a user selects an incident from the Atlas, THE Incident_Atlas SHALL display the incident detail page containing: severity, duration, number of affected users, root cause, business impact, and lessons learned.
2. THE Incident_Atlas SHALL display a chronological incident timeline showing each event with its timestamp and description.
3. THE Incident_Atlas SHALL provide a "View Postmortem" action that renders the full structured postmortem document for the incident.
4. THE Incident_Atlas SHALL provide a "Recreate This Incident" action that launches the Simulator pre-loaded with the scenario corresponding to that incident.
5. IF an incident does not have an associated scenario, THEN THE Incident_Atlas SHALL display the "Recreate This Incident" action in a disabled state with a "Simulation coming soon" label.

---

### Requirement 3: Homepage and Platform Entry Points

**User Story:** As a new visitor, I want a clear and engaging homepage that orients me to the platform's capabilities, so that I can quickly start learning or simulating.

#### Acceptance Criteria

1. THE AtlasOps SHALL display a homepage containing three primary call-to-action elements: "Search Incidents", "Simulate Incident", and "Leaderboard".
2. THE AtlasOps SHALL display real-time platform statistics on the homepage, including total number of incidents in the atlas, total simulations played, and the platform-wide average recovery time across all completed simulations.
3. THE AtlasOps SHALL display a "Featured Outages" section on the homepage showing at least four curated incidents as cards.
4. THE AtlasOps SHALL display a horizontal visual timeline of major DevOps failures on the homepage.
5. WHEN a user clicks a featured outage card, THE AtlasOps SHALL navigate the user to the corresponding incident detail page.
6. WHEN a user clicks "Search Incidents", THE AtlasOps SHALL navigate the user to the Incident Atlas page.
7. WHEN a user clicks "Simulate Incident", THE AtlasOps SHALL navigate the user to the scenario selection screen.
8. WHEN a user clicks "Leaderboard", THE AtlasOps SHALL navigate the user to the global leaderboard page.

---

### Requirement 4: Simulation — Scenario Selection

**User Story:** As a user, I want to choose from a list of available simulation scenarios, so that I can practice the incidents most relevant to my learning goals.

#### Acceptance Criteria

1. THE Simulator SHALL display a scenario selection screen listing all available scenarios, each showing the incident name, difficulty level, estimated completion time, and average score.
2. WHEN a user selects a scenario, THE Simulator SHALL display a pre-simulation briefing screen showing the incident title, initial situation description, and the objectives the user will be scored on.
3. WHEN a user confirms the briefing and starts the simulation, THE Simulator SHALL transition to the active simulation screen for the selected scenario.

---

### Requirement 5: Simulation — Active Decision Loop

**User Story:** As a user running a simulation, I want to view live system metrics, read an incident feed, and choose from realistic decision options, so that I can experience operational decision-making under pressure.

#### Acceptance Criteria

1. WHILE a simulation is active, THE Simulator SHALL display a live metrics panel showing the current values of: API Success Rate (%), Latency (ms), CPU Utilization (%), Error Rate (%), and Revenue Loss per Minute ($).
2. WHILE a simulation is active, THE Simulator SHALL display a real-time incident log stream showing timestamped system events in chronological order.
3. WHILE a simulation is active, THE Simulator SHALL present the user with 3 to 6 labeled decision options relevant to the current stage of the scenario.
4. WHEN a user selects a decision option and executes the action, THE Decision_Engine SHALL evaluate the decision, update all metric values, append consequential events to the incident log, and advance the scenario to the next stage.
5. WHEN the Decision_Engine processes a decision, THE Simulator SHALL reflect updated metrics and log entries within 300ms of the user's action.
6. IF a user's decision causes a metric to reach a critical threshold (e.g., Error Rate ≥ 90%, Revenue Loss ≥ $100,000), THEN THE Simulator SHALL display a visual alert indicating the critical state.
7. THE Simulator SHALL track and display an elapsed simulation time counter from the moment the scenario starts.

---

### Requirement 6: Simulation — Consequence Display

**User Story:** As a user, I want to immediately see the result of each decision I make, so that I can understand the operational consequences of my actions.

#### Acceptance Criteria

1. WHEN the Decision_Engine processes a user's decision, THE Simulator SHALL display a consequence screen showing: the decision taken, a narrative description of the outcome, the change in each affected metric (delta and new value), and whether the decision resulted in partial resolution, full resolution, or escalation.
2. WHEN a consequence results in full resolution of the incident, THE Simulator SHALL transition to the final score screen.
3. WHEN a consequence results in partial resolution or escalation, THE Simulator SHALL display a "What next?" prompt and return the user to the active decision loop at the next stage.
4. THE Simulator SHALL display the running elapsed simulation time on the consequence screen.

---

### Requirement 7: Simulation — Scoring and Reveal

**User Story:** As a user who has completed a simulation, I want to receive a score and see what the real engineers actually did, so that I can benchmark my decisions and learn from the real-world outcome.

#### Acceptance Criteria

1. WHEN a simulation ends, THE Scoring_Engine SHALL compute a final score between 0 and 100 based on simulated MTTR, total user impact (cumulative affected users during the simulation), and total cost incurred.
2. WHEN a simulation ends, THE Simulator SHALL display the final score screen showing: the numeric score (0–100), individual breakdowns for MTTR, user impact, and cost components, and the user's total elapsed time.
3. WHEN a simulation ends, THE Simulator SHALL reveal the actual sequence of decisions made by the real-world engineering team, displayed step by step in chronological order.
4. WHEN a simulation ends, THE Simulator SHALL display a side-by-side comparison of the user's decisions and the real-world decisions at each stage.
5. THE Simulator SHALL display a narrative summary of what the real-world engineers actually did and the outcome they achieved.
6. WHERE a user is authenticated, THE Scoring_Engine SHALL persist the completed simulation result including score, decisions taken, and elapsed time to the user's profile.

---

### Requirement 8: War Room Mode

**User Story:** As an advanced user, I want a high-fidelity SEV-1 incident command experience with simultaneous metric, log, and complaint feeds, so that I can practice coordinating a real-time major incident response.

#### Acceptance Criteria

1. WHEN a user launches War Room Mode for a SEV-1 scenario, THE Simulator SHALL display a three-panel layout comprising: a Metrics Dashboard panel, a Logs Stream panel, and a User Complaints panel.
2. WHILE War Room Mode is active, THE Simulator SHALL continuously update all three panels with new data at intervals no greater than 5 seconds.
3. WHILE War Room Mode is active, THE Simulator SHALL display the following action controls: "Scale Service", "Rollback", "Circuit Breaker", and "Emergency Patch".
4. WHEN a user executes an action in War Room Mode, THE Decision_Engine SHALL process the action, update all panel data, and reflect the updated state across all three panels within 500ms.
5. WHILE War Room Mode is active, THE Simulator SHALL display a SEV-1 incident timer counting elapsed time from incident start.
6. IF a War Room Mode simulation reaches a state where all critical metrics fall below their critical thresholds, THEN THE Simulator SHALL transition to the incident resolution screen.

---

### Requirement 9: Leaderboard

**User Story:** As a user, I want to see how my simulation scores compare to other users, so that I can gauge my operational proficiency and compete with peers.

#### Acceptance Criteria

1. THE Leaderboard_Service SHALL maintain ranked scores per scenario and a global ranking across all scenarios.
2. WHEN a user navigates to the leaderboard, THE AtlasOps SHALL display the global leaderboard showing the top 50 ranked entries, each containing: rank, username, scenario name, score, and elapsed simulation time.
3. WHEN a user selects a specific scenario on the leaderboard page, THE AtlasOps SHALL display the per-scenario leaderboard showing the top 50 ranked entries for that scenario.
4. WHERE a user is authenticated and has completed at least one simulation, THE Leaderboard_Service SHALL display the user's own rank and score on the leaderboard page even if the user does not appear in the top 50.
5. WHEN a new simulation score is submitted, THE Leaderboard_Service SHALL update the affected leaderboard rankings within 2 seconds.

---

### Requirement 10: User Authentication and Profiles

**User Story:** As a user, I want to register and maintain a profile so that my simulation history, scores, and progress are saved and accessible across sessions.

#### Acceptance Criteria

1. THE Auth_Service SHALL support user registration using an email address and password.
2. THE Auth_Service SHALL support user login using registered email and password credentials.
3. WHEN a user registers, THE Auth_Service SHALL validate that the provided email address is in a valid format and that the password is at least 8 characters in length.
4. IF a registration is submitted with an email address already associated with an existing account, THEN THE Auth_Service SHALL return an error message indicating the email is already in use.
5. IF a login attempt is made with invalid credentials, THEN THE Auth_Service SHALL return an error message and SHALL NOT reveal whether the email or the password was incorrect.
6. WHERE a user is authenticated, THE AtlasOps SHALL display a user profile page showing: username, total simulations completed, average score across all simulations, best score per scenario, and a history of all completed simulations.
7. WHEN an authenticated user's session token expires, THE Auth_Service SHALL require the user to log in again before accessing authenticated features.

---

### Requirement 11: Content Repository — Incident and Scenario Data

**User Story:** As a platform operator, I want a structured content system for managing incidents and simulation scenarios, so that the atlas and simulator are driven by consistent, maintainable data.

#### Acceptance Criteria

1. THE Content_Repository SHALL store each incident record with at minimum: unique identifier, title, date, severity level, affected system, category tags, duration, affected user count, root cause, business impact, lessons learned, and a chronological event timeline.
2. THE Content_Repository SHALL store each scenario with at minimum: unique identifier, linked incident identifier, difficulty level, estimated completion time, a sequence of stages each containing a situation description and a set of decisions with their consequence branches.
3. THE Content_Repository SHALL store each decision with: label, narrative outcome, per-metric consequence deltas, resolution status (none, partial, full), and a flag indicating whether it matches the real-world decision.
4. THE Content_Repository SHALL store at least 10 seed incidents at launch, covering a diversity of failure categories (network, database, deployment, configuration, hardware).
5. THE Content_Repository SHALL store at least 5 seed scenarios at launch, each linked to one of the seed incidents.

---

### Requirement 12: Platform Statistics

**User Story:** As a user, I want to see live platform-wide stats on the homepage, so that I understand the scale and activity of the learning community.

#### Acceptance Criteria

1. THE AtlasOps SHALL compute and expose the total number of incidents in the Content_Repository.
2. THE AtlasOps SHALL compute and expose the total number of completed simulations across all users.
3. THE AtlasOps SHALL compute and expose the platform-wide average MTTR computed across all completed simulations.
4. WHEN platform statistics are requested, THE AtlasOps SHALL serve cached statistics with a maximum staleness of 60 seconds.
