# Phase 5 — Recommendation Engine MVP

## Goal

Ship a recommendation engine that produces **believable, explainable** suggestions using structured signals — not LLM reasoning. The engine is deterministic, testable, and cheap to run. It reads `preference_signals`, filters by `user_titles` and hard negatives, scores candidate titles, and returns ranked results with per-item explanations.

## Scope

In scope:

- Candidate generation (pull a pool of titles to score)
- Scoring function (rule-based, weighted)
- Hard filters (no-go keywords, already seen)
- Negative preference penalties (soft filters)
- Diversity and novelty controls
- Explanations ("because you liked X and prefer Y")
- Recommendation feed endpoint
- Click and feedback tracking
- Recommendation history

Out of scope:

- LLM explanations (Phase 9 may augment)
- Collaborative filtering (Phase 13)
- Mood/vibe search (Phase 10)

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                 GET /api/recommend/feed                      │
│                                                              │
│  1. Load user_preference_profile (Redis cached)              │
│  2. Candidate generator — returns ~300 title_ids             │
│  3. Hard filter — drop seen/rated/disliked/no-go titles     │
│  4. Scorer — score each remaining candidate                  │
│  5. Diversity pass — MMR-lite to spread genre/origin         │
│  6. Explainer — attach reason strings per item               │
│  7. Persist recommendation_events                            │
│  8. Return top N with explanations                           │
│  9. Publish async Domain Event (RecommendationGeneratedEvent)│
└──────────────────────────────────────────────────────────────┘
```

> **Future-proof rule validation:** MVP strictly relies on deterministic, rule-based recommendation logic and exact constraints. While schemas should be `pgvector`-ready via early migrations, no core recommendation path relies on vectors or LLMs in Phases 1-5.

## Candidate generation

Pull ~300 titles per request (deduplicated):

1. **Personal anchors**: for each top-weighted `like` signal in `genre`, `keyword`, `director`, `actor`, `country` — query `titles_keywords` / `titles_genres` / `titles_people` for titles tagged with that value, ordered by popularity. Pull ~50 per dimension.
2. **Trending in preferred origins**: top trending titles per `country` preference.
3. **"Similar-to" expansion**: for the user's top 3 most-loved seeded titles, pull TMDB `/similar` (cached).
4. **Cold-start fallback** (if profile is nearly empty): return popular + trending per origin preference.

Union and deduplicate; cap at 300.

## Scoring

Per candidate, compute:

```
score = baseQuality * (1 + Σ match(signal_i, title)) - Σ penalty(dislike_j, title)
```

Where:

- `baseQuality = 0.6 * voteAverage/10 + 0.4 * log(popularity+1)/log(maxPopularity+1)`
  (normalized to `[0,1]`)
- `match(signal, title)`:
  - if signal dimension matches title (e.g., `genre:sci-fi` and title has that genre): contribute `signal.weight * signal.confidence`
  - `keyword` signals get higher bonus (keywords are fine-grained)
  - `director`/`actor` signals get a one-shot bonus if present
- `penalty(dislike, title)`: same but subtracted; `trope_avoid` signals with confidence=1.0 act as *hard filters*, not penalties

Rule: the engine works entirely on numbers; nothing requires model inference.

## Hard filters (applied before scoring)

- Title is in `user_titles` with status `seen`, `dropped`, or rating present
- Title contains any `trope_avoid` keyword with `confidence=1.0` (the no-gos)
- Title has zero genre overlap AND zero keyword overlap AND user profile is not empty (i.e., complete mismatch)
- Title popularity < threshold (avoid returning obscure 0-vote titles)

## Soft filters (penalties, not removals)

- Origin not in user's preferred origins → ×0.8
- Spoken language not in user's subtitle/dub preferences → ×0.9
- Length far outside the user's preferred runtime band (if learned) → ×0.9

## Diversity pass

After scoring, apply a small MMR-style pass: penalize the Nth candidate's score by a factor proportional to its similarity to the (N-1) already-selected results. Cheap implementation: after picking the top item, penalize remaining items sharing its primary genre by 10%, then re-sort, repeat.

Goal: final top-20 contains at most 6 titles of the same primary genre.

## Explanations

Each returned title carries a structured reason array. UI renders it with i18n strings:

```json
{
  "titleId": 27205,
  "score": 0.78,
  "reasons": [
    { "type": "matched_liked_title", "refTitleId": 98, "i18nKey": "recommend.reason.similarTo" },
    { "type": "matched_signal", "dimension": "genre", "value": "sci-fi", "i18nKey": "recommend.reason.genre" },
    { "type": "matched_signal", "dimension": "keyword", "value": "heist", "i18nKey": "recommend.reason.keyword" }
  ]
}
```

Rendered: *"Because you liked **Inception** and tend to enjoy **sci-fi** with **heist** themes."*

Rules:

- Never more than 2 reasons per item in the UI (pick highest contributors)
- Reasons are extracted from the actual score math — we cannot fabricate a reason that did not move the score

## Data model additions

```sql
recommendation_events(
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  source text not null,                    -- 'web_feed' | 'tg_feed' | 'chat' (Phase 9)
  profile_snapshot jsonb not null,         -- for reproducibility
  results jsonb not null                   -- [{titleId, score, reasons:[...]}]
);

recommendation_interactions(
  id bigserial primary key,
  event_id bigint not null references recommendation_events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  title_id bigint not null,
  action text not null,                    -- 'view_detail' | 'not_for_me' | 'added_watchlist' | 'rated'
  at timestamptz not null default now(),
  detail jsonb
);
create index on recommendation_interactions(user_id, at desc);
```

> Both tables join `reparent-all` (Phase 2.5).

## Work breakdown

### 5.1 Engine core (`packages/core/recommend`)

- [ ] `buildCandidates(profile) -> titleId[]`
- [ ] `scoreTitle(profile, title) -> { score, contributions[] }`
- [ ] `applyHardFilters(profile, title) -> boolean`
- [ ] `diversify(scoredList) -> scoredList`
- [ ] `explain(contributions) -> Reason[]`
- [ ] Top-level `recommend(userId, {count, source}) -> RecommendationEvent`
- [ ] Pure functions where possible; IO isolated to data loaders

### 5.2 Profile cache

- [ ] On any write to `preference_signals` or `user_titles`, invalidate `user_preference_profile` cache
- [ ] `user_preference_profile` is rebuilt lazily on next recommendation call
- [ ] Redis mirror with 5-minute TTL

### 5.3 API endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/recommend/feed?count=20` | Returns recommendation event + results |
| POST | `/api/recommend/feedback` | Body: `{titleId, action: 'not_for_me'\|'added_watchlist', eventId}` |
| GET | `/api/recommend/history?limit=50` | Past recommendation events |

### 5.4 Feedback loop (modular event-driven tracking)

- [ ] `not_for_me` interaction persists to DB and publishes `RecommendationFeedbackReceivedEvent`.
- [ ] Async worker consumes event to write `- title:{id}` (confidence 0.9) + adjust weights.
- [ ] `added_watchlist` → publishes event which writes `+ title:{id}` (confidence 0.7).
- [ ] Async event model prevents blocking the UI and keeps domain logic decoupled.

### 5.5 Cold-start handling

- [ ] If profile is empty (no onboarding completion): return popular titles in user's preferred origins or global trending; mark event `source='cold_start'`
- [ ] Nudge UI: "Complete onboarding to personalize"

### 5.6 Evaluation harness

- [ ] `packages/core/recommend/eval` — given synthetic profiles, assert:
  - No-go keywords never appear
  - Seen titles never appear
  - Top 20 has ≤6 of any single genre
  - Top 3 each include at least one signal-based explanation
- [ ] Snapshot test: fixture profiles → deterministic top-10 (so refactors are caught)

## API payload example

```json
{
  "eventId": 901,
  "generatedAt": "2026-04-20T09:11:00Z",
  "source": "web_feed",
  "items": [
    {
      "title": { "id": 98, "mediaType": "movie", "titleLocalized": {...}, "posterUrl": "..." },
      "score": 0.83,
      "reasons": [
        { "type": "matched_liked_title", "refTitleId": 27205 },
        { "type": "matched_signal", "dimension": "keyword", "value": "heist" }
      ]
    }
  ]
}
```

## Acceptance criteria

- A user who seeds 3 sci-fi titles and no-goes "horror" never sees horror titles in their feed
- Explanations reference at least one concrete signal the user actually provided
- `not_for_me` on a title removes it from the next 30 days of feeds and reduces that genre's influence slightly
- Cold-start users still get a reasonable feed (trending in preferred origins)
- Feed response < 300ms at the 95th percentile with a warm profile cache
- Running engine with empty profile returns cold-start results without errors
- Evaluation harness passes for all fixture profiles
- No call to any LLM or external API in the hot path (TMDB only via cache)

## Dependencies

- Phase 4 onboarding (produces signals)
- Phase 3 content layer (provides keywords, genres, credits)
- Redis for profile cache

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Engine looks "random" to users | Keep top-3 reasons traceable to signals; show explanation in UI |
| Genre over-concentration | Diversity pass; tune after looking at feed data |
| Hard filters remove too much | Log hard-filter drop counts per request; alert if >70% of candidates drop |
| Score values drift over time | Versioned scoring (`scoring_version` on events) so A/B comparisons remain valid |
| Feedback loop creates echo chamber | Bound negative title-signal weight to 0.5; apply decay in Phase 13 |

## Estimated effort

**L (2.5–3 weeks).** Implementation is straightforward; most effort is tuning against real profiles.
