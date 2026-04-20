# Phase 14 — Expansion Phase

## Goal

Position the product for broader growth once the earlier phases have proven traction. This phase is **optional and opportunistic** — only pursue items here when demand, budget, and product-market fit justify them. The aim is to plan so that expansion is possible without a rewrite, not to build speculatively.

## Scope

Expansion tracks (pick based on evidence):

- Native mobile apps (iOS / Android)
- Public API separation and versioning
- Managed/replicated database
- Social and community features
- Monetization
- Additional languages beyond en/my
- Regional content partnerships

Out of scope:

- Anything requiring product validation we don't yet have
- Vanity features with unclear ROI

## Decision gates

Pursue an expansion item only when at least one of these is true:

1. Users are repeatedly asking for it in reports / support
2. A concrete revenue or retention hypothesis justifies the build cost
3. A technical cliff is near (scale limit on current architecture)

Keep Phase 14 items in a prioritized backlog in `docs/expansion-backlog.md` (future) with evidence notes.

## 14.1 Native mobile apps

### Approach

- Build as thin clients sharing the API
- Options:
  - **React Native (Expo)** — maximum code reuse with web components
  - **Fully native (SwiftUI + Jetpack Compose)** — best UX, more effort
- Recommendation: React Native with Expo to reuse components and i18n

### What needs to be ready before starting

- Public API versioned and stable
- Design system extracted into a reusable package
- Push notifications infra on the backend

### Scope

- Feed, detail, search, profile
- Push notifications for new personalized picks
- Biometric unlock (optional)
- App store presence in target regions

## 14.2 Public API separation

- Factor the API into a versioned public surface: `/api/v1/*`
- Documented with OpenAPI
- Rate-limited per key
- Useful for: mobile apps, third-party integrations, potential partner bots
- Keep internal bot-to-backend calls separate under `/internal/*`

## 14.3 Database scale path

### When the single-host Postgres starts to strain

Milestones in order:

1. **Tune before scaling** — indexes, query plans, pool sizes, read replicas
2. **Streaming replica** for read traffic (reporting, search candidate pool)
3. **Partition** large tables by time (`chat_messages`, `recommendation_events`, `signal_weight_history`)
4. **Managed Postgres** (RDS, Supabase, Neon, etc.) once ops burden outweighs cost
5. **Consider a search engine** (Meili/Typesense/OpenSearch) only if Phase 10's Postgres-based search hits limits

Do NOT move to a managed DB prematurely — the cost delta on a young product is significant.

## 14.4 Social & community features

### Possible features (validate each)

- Shareable recommendation lists ("my top 10 Korean thrillers")
- Follow users with compatible taste
- Comment threads on titles (moderation-heavy — approach cautiously)
- Collaborative watchlists (for couples / friend groups)

### Prerequisites

- Robust moderation workflow (Phase 11 expanded)
- Abuse reporting pipeline
- Privacy controls on profiles

### Warning

Community features massively increase moderation load. Start with sharing (low-moderation) before commenting (high-moderation).

## 14.5 Monetization (optional)

### Models to evaluate

- **Freemium premium tier**: unlimited chat, advanced filters, taste reports
- **Affiliate linking** to streaming services where legal (JustWatch partnership)
- **Sponsored slots** — avoid unless tastefully handled; could damage recommendation trust

### Prerequisites

- Payments provider integration (Stripe — region-dependent; for Myanmar consider alternative)
- Subscription state machine in DB
- Clear free vs paid matrix
- Receipt validation (mobile IAP if applicable)

### Principle

If monetization conflicts with recommendation trust, do not do it. The core value is "I trust what it suggests."

## 14.6 Additional languages

Expansion beyond en/my:

- Thai, Korean, Japanese are natural given content mix
- Requires:
  - Additional translation catalogs
  - TMDB fan-out for those locales in content layer
  - Burmese-specific typography extended to new scripts (Thai, Hangul, kana/kanji)
- Community translation possible — admin UI accepts i18n string proposals

## 14.7 Regional content & partnerships

- Seed title lists curated by region (KR, JP, TH, MM)
- Partnerships with local film communities for onboarding seeds
- Optional "staff picks" surfaced via the admin tools

## Architectural preparation to do before any of this

These are *cheap now, expensive later*. Keep them in mind during earlier phases:

- API versioning baked in from day one: `/api/v1/*` (already implied, confirm)
- If versioning is not introduced in Phase 1, cut the public surface to `/api/v1/*` before any second public client beyond the main web app ships (for example native mobile or partner integrations). Avoid mixing mobile/public consumers onto an unversioned API.
- No coupling of web-specific session state into the core domain
- `core` package free of framework dependencies (no React, no Fastify)
- Clear internal vs public endpoints
- Event log (`recommendation_events`, `search_events`, chat messages) captured structurally so future analytics and ML can re-read them
- i18n keys never mixed with English fallback inline

## Work breakdown (when pursued)

Per expansion track, typical workstream:

- [ ] Write a mini-spec (problem, approach, decision gate evidence)
- [ ] RFC circulated to relevant stakeholders
- [ ] Cost + effort estimate
- [ ] Phased rollout behind feature flags
- [ ] Explicit rollback / sunset plan

## Acceptance criteria

Phase 14 has no single acceptance criterion. Each expansion track is judged against its own hypothesis. The overall signal of success:

- The product grows without requiring structural rewrites
- New surfaces (mobile, community) feel consistent with the core web/bot experience
- Monetization (if pursued) does not degrade recommendation trust
- Ops cost scales sub-linearly with users

## Dependencies

- Real, sustained usage
- Clear product hypotheses
- Budget and team capacity

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Building mobile too early | Wait for evidence of sustained web/bot usage |
| Managed DB cost bloats before it's needed | Tune Postgres first; move only on clear signal |
| Community features bring abuse | Start with sharing-only; iterate moderation |
| Monetization damages trust | Never put paid results in the recommendation feed without explicit disclosure |
| Scope creep | One expansion track at a time; finish before starting next |

## Estimated effort

**Variable — each track is XL in its own right.** Do not treat "Phase 14" as a single sprint; treat it as an ongoing backlog informed by the product's reality.
