# AI Movie & Series Recommender — Implementation Plan Index

This directory contains the phase-by-phase implementation plan for the AI-powered personal Movie/Series recommendation assistant (web + Telegram).

## Product summary

- Responsive, mobile-first WebApp
- Telegram Bot sharing the same backend and database
- Guest mode + Google login (web), Telegram ID auth (bot), cross-platform account linking
- Structured preference capture first (multiple-choice + ratings), AI chat refinement later
- Bilingual UI: English + Burmese (my)
- Metadata via TMDB, cached locally
- Low-cost VPS hosting, no heavy AI dependence in early phases

## How to read this plan

Each phase document follows the same structure:

1. **Goal** — what this phase must deliver
2. **Scope** — what is in / out
3. **Tech choices** — concrete stack for this phase
4. **Work breakdown** — task-level implementation steps
5. **Data model changes** — DB tables / columns touched
6. **API surface** — endpoints introduced
7. **Acceptance criteria** — observable definition of done
8. **Dependencies** — previous phases / external prerequisites
9. **Risks & mitigations**
10. **Estimated effort** — relative sizing (S/M/L/XL)

## Milestone grouping

| Milestone | Phases | Outcome |
|-----------|--------|---------|
| M1 — Core MVP | 1–6 | Usable WebApp with onboarding + recommendations |
| M2 — Multi-platform MVP | 7–8 | Telegram bot + account linking |
| M3 — Smart assistant | 9–10 | AI chat + richer discovery |
| M4 — Scale & refine | 11–14 | Admin, hardening, personalization, expansion |

See [milestones.md](../milestones.md) for more detail.

## Recommended supporting docs

- [recommended-procedures.md](../recommended-procedures.md) - delivery workflow, merge-safety checklist, rollout procedure, and doc-maintenance expectations
- [runbooks/index.md](../runbooks/index.md) - operational runbooks for restore, rollback, and external dependency outages

## Phase documents

| # | Phase | Link |
|---|-------|------|
| 1 | Foundation and project setup | [phase-01-foundation.md](../phase-01-foundation.md) |
| 2 | Core account and identity system | [phase-02-identity.md](../phase-02-identity.md) |
| 3 | Title metadata and content ingestion | [phase-03-content.md](../phase-03-content.md) |
| 4 | Structured onboarding and taste capture | [phase-04-onboarding.md](../phase-04-onboarding.md) |
| 5 | Recommendation engine MVP | [phase-05-recommendation.md](../phase-05-recommendation.md) |
| 6 | WebApp MVP experience | [phase-06-webapp.md](../phase-06-webapp.md) |
| 7 | Telegram Bot MVP integration | [phase-07-telegram.md](../phase-07-telegram.md) |
| 8 | Web and Telegram account linking | [phase-08-linking.md](../phase-08-linking.md) |
| 9 | AI-assisted chat and taste refinement | [phase-09-ai-chat.md](../phase-09-ai-chat.md) |
| 10 | Search intelligence and discovery | [phase-10-search.md](../phase-10-search.md) |
| 11 | Admin and analytics tools | [phase-11-admin.md](../phase-11-admin.md) |
| 12 | Quality, security, production hardening | [phase-12-hardening.md](../phase-12-hardening.md) |
| 13 | Personalization maturity | [phase-13-personalization.md](../phase-13-personalization.md) |
| 14 | Expansion phase | [phase-14-expansion.md](../phase-14-expansion.md) |

## Cross-cutting design rules & Future-Proof Architecture

1. **Strict modular monolith first:** Use a Turborepo monorepo with DDD-style domain boundaries (e.g., identity, recommendations, chat). Modules communicate via explicit interfaces/contracts. Avoid premature microservices.
2. **Database scaling strategy:** PostgreSQL first with stable UUIDs and tracking columns. Architecture is shard-aware for the future, but NOT shard-first now. Avoid premature distributed SQL.
3. **Transactional core + async event processing:** Critical state (like identity merges) must use strict DB transactions. Heavy secondary side-effects and recalculations must use event-driven job queues (e.g., `UserMergedEvent`).
4. **LLM Gateway required to avoid provider lock-in:** All AI integrations route through an internal abstract gateway. The rest of the app shouldn't know if the provider is Anthropic, OpenAI, or a local model.
5. **Redis required for deployed environments early:** While minimal fallbacks can exist for local dev, production assumes Redis for caches, queues, and rate-limits to avoid future friction.
6. **pgvector-ready, but deterministic recommendation first:** Prepare schemas for vector embeddings early, but keep MVPs deterministic and not heavily reliant on embeddings initially.
7. **One backend, one database.** Web and Telegram are clients of the same API surface.
8. **Structured input first, free-text second.** Any inferred preference from free-text must be stored with a confidence score and (where material) user confirmation.
9. **Every user has one internal `user_id`.** Google, guest, and Telegram are *identities* mapped to that user, never the primary key.
10. **Bilingual by default.** Every user-facing string is keyed, never hardcoded. Content metadata keeps the original language plus translations where applicable.
11. **Idempotent writes & Merge schemas.** Onboarding answers, ratings, and linking operations must tolerate retries without duplication. Every new user-owned table must explicitly document its merge behavior and be covered by transactional or async reparenting.
12. **Cost-aware.** Cache TMDB responses (via Redis); do not call third-party APIs on every request.
13. **Observability from day one.** Structured logs with `user_id`, `request_id`, and `source` (`web` / `telegram`) on every request.
14. **Operational docs are part of the deliverable.** When a phase introduces a risky procedure, add or update the matching runbook.
