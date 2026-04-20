# Phase 13 — Personalization Maturity

## Goal

Make the system get noticeably smarter the more a user uses it. Preferences evolve; repeated behavior is learned; bad recommendations get corrected; explanations feel more precise. Introduce learning loops that are still transparent and deterministic enough to debug.

## Scope

In scope:

- Adaptive signal weights based on observed behavior
- Temporal decay of old signals
- Negative preference handling (stronger but bounded)
- Recovery after sequences of rejected recommendations
- Better explanations (higher-specificity, varied phrasing)
- Periodic "taste check-in" re-onboarding micro-flows
- Optional collaborative-style hints (nearest-neighbor) without building full CF

Out of scope:

- Deep learning / embedding models as the primary engine
- Cross-user identity matching

## Learning loops

### 13.1 Positive reinforcement

- `added_watchlist`, `rating ≥ 4`, and `watched_complete` events lift the weight of signals that matched the title
- Update rule (per signal dimension that matched):
  `newWeight = min(1.0, weight + 0.05 * matchStrength)`
- Debounce: at most one adjustment per `(user, signal)` per 24h

### 13.2 Negative reinforcement

- `not_for_me` + `rating ≤ 2` + `watched_dropped` events penalize the signals that drove the recommendation
- Update rule:
  `newWeight = max(0.1, weight - 0.08 * matchStrength)`
- Hard threshold: after 5 consecutive rejections on the same dimension, drop that dimension's weight to 0.3 and emit an "are we off?" prompt

### 13.3 Temporal decay

- All signals decay linearly by 0.02/month of `weight` (bounded above 0.1 unless explicitly saved by the user)
- Run as a nightly job; record decay events in an audit table
- Onboarding no-gos (`confidence=1.0`, hard filters) never decay

### 13.4 Re-onboarding micro-flows

- Monthly (or after 50 recommendations), show a small in-app prompt:
  "Quick check: still into slow-burn thrillers? [Yes, keep] [Getting bored] [Love them more]"
- Answer updates the relevant signal's weight with a targeted bump or decay

### 13.5 Nearest-neighbor hints (optional)

- Build a nightly index of `user_preference_profile` vectors (one number per dimension: net weight after profile rebuild)
- For any user, find K=20 nearest neighbors by cosine similarity
- Use their highly-rated titles as an *additional* candidate source (not a boost in ranking)
- Respect all existing hard filters
- Avoid cold-start explosion: require neighbor to have ≥ 10 ratings

## Explanation quality

### 13.6 Varied phrasing

- Expand reason-template inventory: 5 templates per reason type
- Randomize template per recommendation event
- Templates defined in i18n catalogs

### 13.7 Evidence specificity

- Prefer referencing specific titles over abstract signals:
  - Good: *"because you rated Parasite 5 stars"*
  - OK: *"because you like slow-burn tension"*
  - Avoid: *"based on your preferences"*
- If two reasons of similar score tie, prefer the one with a specific title reference

### 13.8 Recovery prompts

- After 3 `not_for_me` in a row on a feed, insert a "let's recalibrate" card:
  "Tell me what's off today: [Tone is wrong] [Too familiar] [Too obscure] [I'm just browsing]"
- Each answer updates a short-lived session overlay (not permanent signals)

## Data model additions

```sql
signal_weight_history(
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  signal_id bigint not null references preference_signals(id) on delete cascade,
  at timestamptz not null default now(),
  from_weight numeric(4,3) not null,
  to_weight numeric(4,3) not null,
  reason text not null                     -- 'feedback_pos' | 'feedback_neg' | 'decay' | 'check_in' | 'manual'
);
create index on signal_weight_history(user_id, at desc);

user_neighbors(
  user_id uuid references users(id) on delete cascade,
  neighbor_user_id uuid references users(id) on delete cascade,
  similarity numeric(5,4) not null,
  computed_at timestamptz not null default now(),
  primary key (user_id, neighbor_user_id)
);
create index on user_neighbors(user_id, similarity desc);
```

> Reparent-all: `signal_weight_history`. `user_neighbors` uses `user_id` both sides — reparent helper needs to rewrite both (already covered in the enumeration test).

## Work breakdown

### 13.9 Feedback-driven weight updates

- [ ] Extend recommendation feedback handler to compute and apply weight deltas
- [ ] Write `signal_weight_history` row per change
- [ ] Rebuild `user_preference_profile` after change

### 13.10 Decay job

- [ ] Nightly BullMQ job iterating users with recent activity (skip dormant)
- [ ] Batch updates; transactional per user
- [ ] Audit summary per run

### 13.11 Re-onboarding micro-flow

- [ ] Eligibility predicate: 30+ days since last check-in AND ≥30 rec events since
- [ ] UI: inline card on `/for-you` top slot
- [ ] Bot: periodic message (opt-out friendly)
- [ ] Backend endpoint mirrors Phase 4's `answer` path

### 13.12 Neighbor index

- [ ] Build script: compute vectors, nearest-neighbor via pgvector or a simple in-process KNN for small N
- [ ] Nightly rebuild; warm top-50 most-active users daily, others weekly
- [ ] Feed integration: add neighbor-sourced candidates at 10% weight

### 13.13 Explanation improvements

- [ ] Reason templates expanded and translated
- [ ] Reason selector prefers specific over abstract when scores tie
- [ ] Acceptance test: for a fixture profile with known liked titles, top-5 reasons reference ≥3 specific titles

### 13.14 Recovery prompts

- [ ] Track consecutive `not_for_me` per feed session in Redis
- [ ] Inject recalibration card at threshold
- [ ] Responses create session overlay signals that Phase 5 picks up for the next call

## Acceptance criteria

- A user who `not_for_me`s 3 horror-leaning picks sees fewer horror items in the next feed
- Rating a recommended movie 5 stars increases the weight of at least one signal that contributed
- Decay reduces an unused signal's weight after ~6 months to below the fresh-user threshold
- Re-onboarding prompt appears eligible users at most once per 30 days
- Explanations reference specific liked titles in ≥60% of top-3 recommendations for users with ≥5 ratings
- Neighbor-sourced candidates never bypass hard filters
- No personalization change writes a signal with `confidence < 0.5` without user confirmation

## Dependencies

- Phases 4, 5, 6, 9, 11 stable
- Enough users to have meaningful neighbors (neighbor feature off until then)
- Feedback volume sufficient to compute deltas without noise

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Weights oscillate on noisy feedback | Bound deltas; debounce per-signal updates; minimum weight floor |
| Users feel surveilled by "we noticed you stopped liking X" | Frame check-ins as collaborative; offer opt-out |
| Neighbor recommendations feel random | Limit share of candidates; still require signal overlap to score high |
| Decay kills useful signals for inactive users | Pause decay when user is inactive for >60 days |
| Explanation specificity leaks info (references private history) | Only reference the user's own activity — never someone else's |

## Estimated effort

**L (2–3 weeks).** Gains come from data + tuning, not code volume.
