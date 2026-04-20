# Milestones

Grouping of phases into shippable milestones with end-to-end user-visible outcomes.

## Milestone 1 — Core MVP

**Phases:** 1, 2, 3, 4, 5, 6

**User-visible outcome:** A mobile-first WebApp where a visitor can:

- Land on the home page (bilingual en/my)
- Browse as guest OR sign in with Google
- Complete a 3-minute structured onboarding
- Receive a personalized recommendation feed with clear "because…" reasons
- Search titles, open detail pages, track what they've watched
- Carry guest data into a Google account when they sign in later

**Technical milestones:**

- Strict modular monolith monorepo (DDD style domain isolation)
- PostgreSQL first (designed to be shard-aware, but not shard-first)
- Redis required as early infrastructure for staging/prod caching and queues
- TMDB integration with local cache
- Guest + Google identity, merge-safe architecture with transactional core
- Structured signal model and deterministic rule-based engine
- Deployed to a staging environment with TLS

**Exit criteria:**

- First-time mobile user completes onboarding → feed in under 5 minutes
- Feed returns personalized results with explanations for typical profiles
- Guest → Google upgrade preserves all data
- Schema includes reparent-all test for user-owned tables
- CI green; staging deploy reachable

**Indicative timeline:** 3–4 months for one full-stack developer, faster with two.

---

## Milestone 2 — Multi-Platform MVP

**Phases:** 7, 8

**User-visible outcome:** Same product now reachable via Telegram bot, and web/Telegram accounts can be linked into one.

**Technical milestones:**

- Bot as thin client reusing the core API
- Inline-keyboard-driven onboarding, recommendation, and rating flows
- One-time-code linking flow with conflict preview
- Audit logging on all identity operations

**Exit criteria:**

- `/start` → onboarding → `/recommend` works end-to-end in the bot
- A Telegram user can link to a web account; their data merges correctly
- Linking respects conflict rules (higher rating wins, audit logged)
- No user-visible difference in "what the engine knows" between platforms

**Indicative timeline:** ~1–1.5 months.

---

## Milestone 3 — Smart Assistant Layer

**Phases:** 9, 10

**User-visible outcome:** Users can talk to the system, describe vague moods, and get results that feel smart — without losing the deterministic engine underneath.

**Technical milestones:**

- AI chat on web and Telegram via abstracted LLM Gateway (No provider lock-in)
- Guardrails: no hallucinated titles, signal proposals require confirmation
- Descriptive search parser (free text → structured filters)
- Expanded ranking with profile-aware boost

**Exit criteria:**

- "Find me something like Parasite but lighter" returns engine-backed results
- Saying "I love slow-burn thrillers" offers signals to confirm, never writes without consent
- Search parses natural queries and shows its interpretation
- LLM cost per user per day stays inside budget
- No phase-5 regression: personalization still deterministic and explainable

**Indicative timeline:** ~1.5–2 months.

---

## Milestone 4 — Scale and Refine

**Phases:** 11, 12, 13, 14

**User-visible outcome:** Product feels mature — stable, safe, and noticeably smarter over time. Ready for broader audiences.

**Technical milestones:**

- Admin tools and analytics (tuning, not micromanagement)
- Production hardening: logs, metrics, alerts, backups, rate limits
- Personalization loops: weight adaptation, decay, neighbor hints
- Expansion-ready architecture: pgvector semantic search enhancements, full event-driven background processing, microservice-ready (but not implemented prematurely)

**Exit criteria:**

- p95 latencies within budget under load test
- Backup + restore drill passes monthly
- Admin can blacklist a title, tune onboarding, see funnel, read audit logs
- A user who uses the product for a month sees recommendations that reflect their evolving taste
- Expansion decisions (mobile, community, monetization) are backlog items evaluated against evidence, not speculative builds

**Indicative timeline:** ongoing; each of Phases 11–13 is 2–3 weeks, Phase 14 is ongoing.

---

## Build-order summary (plain terms)

1. Foundation
2. Auth and user identity
3. Title metadata and caching
4. Structured onboarding
5. Recommendation engine
6. Web MVP
7. Telegram MVP
8. Account linking
9. AI chat refinement
10. Search intelligence
11. Admin & analytics
12. Hardening
13. Personalization maturity
14. Expansion (as evidence justifies)

## Strategic anchors (repeated from general direction)

**Avoid:**

- Building a "super-intelligent AI brain" from day one
- Letting free-text become the primary source of preference storage
- Building Telegram and web as separate products
- Overbuilding admin tooling before real users arrive
- Overengineering infra before real users arrive

**Focus on:**

- Clean user data model
- Strong onboarding
- Structured taste signals
- Good recommendation explanations
- Clean Telegram linking flow
- Mobile-first web UX

## Final outcome vision

If built in this order, the product becomes:

- Usable early
- Affordable to host
- Easy to improve
- Smart in a believable way
- Ready for mobile apps later
- Strong enough for both Myanmar and broader audiences
