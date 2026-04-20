# Recommended Procedures

This document turns the phase plans into an execution workflow. The phase docs explain *what* to build; this file explains the recommended procedure for building it safely and consistently.

## Purpose

Use these procedures whenever work spans schema, API, recommendation logic, web UI, Telegram behavior, or operations. The main goals are:

- keep web and Telegram behavior aligned
- avoid merge-related data loss
- make rollout and rollback routine
- keep the docs trustworthy as the implementation evolves

## General Implementation Workflow

For every implementation, modification, update, and change across the whole system, observe the following flow:

1. **Read docs**: Review all relevant phase plans and context.
2. **Read rules**: Review cross-cutting rules and recommended procedures.
3. **Do implementation**: Execute code and script changes based on recommendations, commands, or prompts. *Important*: Before running the implementation, if there is any clarification needed based on the current system or anything is unclear, **ask the user for clarifications first**.
4. **Update docs**: After any changes, update documents related to each feature/phase to keep them future-proof.

## Standard delivery order

For any feature larger than a small bug fix, use this sequence:

1. Update the relevant phase doc first when the implementation meaningfully changes scope, schema, API shape, or rollout order.
2. Add or adjust the data model and merge behavior before UI work.
3. Implement domain logic in shared packages before client-specific rendering.
4. Add automated tests for merge safety, deterministic behavior, and acceptance criteria.
5. Integrate the web app and Telegram bot against the same backend contract.
6. Add observability, flags, and rollback notes before enabling the feature broadly.
7. Update the docs again after implementation if any procedure changed in practice.

This order matters because most expensive mistakes in this product are schema and identity mistakes, not UI mistakes.

## Definition Of Ready

A phase or sub-project is ready to start when:

- the owning phase doc has a stable goal and scope
- dependencies on earlier phases are either complete or explicitly mocked
- the data model additions are described clearly enough to write migrations
- merge behavior is documented for every user-owned table involved
- API consumers are known: web, bot, internal jobs, or admin
- rollout risk is understood: direct ship, staged flag, or migration-first

If any of those is unknown, pause and clarify the doc before coding.

## Definition Of Done

Treat work as done only when all of the following are true:

- acceptance criteria in the phase doc are satisfied
- direct `user_id` tables are included in merge/reparent coverage
- transitively-owned child rows are covered by integration tests
- user-visible strings are localized through shared keys
- logs, metrics, and audit rows exist where the phase says they should
- rollback or outage handling is documented for any new operational risk
- the index and supporting docs link to any new permanent documentation

## Schema procedures

### 1. Identity and merge safety

Every new table that stores user-owned data must declare one of these behaviors:

- `reparent` - move rows to the surviving `user_id`
- `retain` - keep rows historically, optionally with `user_id` set null
- `rebuild` - recompute after merge from surviving source data
- `delete` - safe to discard on merge

Document that behavior in the phase where the table is introduced.

### 2. Direct vs transitive ownership

Use two test layers:

- Direct ownership test: enumerate tables with a direct `user_id` column and assert merge handling exists.
- Transitive ownership test: for child tables without `user_id`, run an integration test proving their parent reparent keeps the full graph valid.

This avoids false confidence from only checking one style of ownership.

### 3. Title identity procedure

Do not use a bare external provider id as the only durable database key for titles. Recommended pattern:

- internal stable row id for joins and foreign keys
- explicit external source metadata such as `source='tmdb'`, `media_type`, and `source_id`
- unique constraint on the external identity tuple

Reason:

- movie ids and TV ids should not rely on implicit uniqueness assumptions
- future secondary metadata sources should not force a rewrite
- joins stay simple because other tables can reference one internal title row id

### 4. Migration procedure

For every non-trivial migration:

1. write the migration so existing code can still run during rollout when possible
2. deploy additive schema first
3. backfill asynchronously if the data volume is meaningful
4. switch reads and writes to the new shape
5. remove old columns or paths only after production verification

Avoid coupling a destructive migration with a same-release behavior change unless the rollback story is proven.

## API procedures

### Public vs internal surfaces

Use separate intent boundaries:

- public app endpoints: `/api/...`
- internal automation, bots, jobs, admin helpers: `/internal/...` or `/admin/api/...`

Before shipping any additional public client beyond the main web app, freeze the public contract under `/api/v1/*`.

### Compatibility rules

Prefer:

- additive fields over breaking replacements
- nullable introduction before required enforcement
- explicit version bumps over silent contract changes
- idempotent POST behavior for retried writes

If a response shape changes in a way that affects both web and Telegram, update both consumers in the same delivery sequence.

## Feature delivery procedures

### Recommendation and personalization changes

When changing ranking, explanations, or feedback loops:

1. give the logic a version identifier
2. preserve reproducibility in stored events where practical
3. update fixture-based evaluation tests
4. confirm that reasons shown in UI are grounded in actual score contributions

### Chat and LLM changes

Before enabling a new AI behavior:

1. confirm the non-LLM fallback still works
2. validate title references against cached content
3. confirm no auto-write to durable preference storage
4. put quotas, cost logging, and an outage fallback in place

### Bot changes

Before shipping a Telegram change:

1. confirm the flow still works with inline keyboards only
2. check callback payload size constraints
3. ensure the bot path writes to the same backend tables as web
4. update the bot outage runbook if the operational procedure changed

## Rollout procedure

Use this default release sequence for medium and high-risk changes:

1. merge code behind a feature flag if the behavior is user-visible or operationally risky
2. deploy to staging
3. run smoke checks for web, API, and bot surfaces affected
4. verify logs, metrics, and migrations
5. enable for internal/admin users first when practical
6. roll out gradually
7. watch error rate, latency, and user feedback
8. either complete rollout or use the rollback runbook immediately

High-risk examples:

- identity or linking changes
- recommendation scoring changes
- new chat behavior
- schema migrations on large tables
- auth/session changes

## Documentation maintenance procedure

When a phase changes materially, update:

- the relevant phase file
- [docs/_index/index.md](./_index/index.md) if navigation changes
- [docs/milestones.md](./milestones.md) if milestone boundaries or outcomes change
- the matching runbook if operating the system changes

Prefer updating docs in the same change as the implementation, not in a later cleanup pass.

## Suggested review checklist for future doc edits

- Does this phase introduce a new table with user-owned data?
- Does the doc say how merge and linking affect it?
- Is the API consumer boundary clear?
- Is the fallback behavior defined when TMDB, Redis, or the LLM is down?
- Is there a safe rollout path?
- Does the acceptance criteria describe something observable?
- Will a future teammate know which runbook to follow?
