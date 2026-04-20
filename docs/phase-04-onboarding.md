# Phase 4 — Structured Onboarding and Taste Capture

## Goal

Turn "I don't know what this person likes" into a clean, structured preference profile that the recommendation engine (Phase 5) can consume — **using mostly buttons, choices, and ratings, not free-text**. Free-text input is accepted but always distilled into typed signals before storage. The onboarding flow works identically on web and Telegram (Phase 7 uses the same question tree).

## Scope

In scope:

- Onboarding wizard (web)
- Question tree definition and versioning
- Title selection (pick titles the user has seen)
- Per-title reaction flow (rating + why-liked / why-disliked multiple choice)
- Dislike / avoidance capture
- Signal extraction from structured answers
- Preference profile storage (typed signals with weights)
- Bilingual questions and answer options
- Skip/resume support (guest AND logged-in)

Out of scope:

- Telegram rendering (Phase 7 — same backend, different UI)
- AI free-text interpretation (Phase 9)
- Recommendation output (Phase 5)

## Taxonomy: what counts as a "signal"

A **signal** is a single typed preference fact: `(dimension, value, polarity, weight, source)`.

- `dimension` ∈ { `genre`, `subgenre`, `tone`, `pace`, `theme`, `era`, `country`, `language`, `keyword`, `director`, `actor`, `trope_avoid` }
- Recommended extension: include `title` as a valid dimension for explicit one-title likes/dislikes and recommendation suppression (`title:{id}`), since later phases already use it for feedback and exclusions.
- `value` — canonical slug, e.g. `tone:melancholic`, `pace:slow-burn`, `genre:romance`
- `polarity` ∈ { `like`, `dislike` }
- `weight` — float in `[0, 1]`, computed (see below)
- `source` — how it was captured: `onboarding_rating`, `onboarding_reason`, `rating_explicit`, `chat_inferred`, etc.
- `confidence` — `[0, 1]`, lower when inferred, higher when the user explicitly chose

The entire recommendation engine reads from this signal table. Everything else is a producer.

## Question tree

Version the question tree as a file in `packages/core/onboarding/questions.v1.ts`. Each version becomes a row in `onboarding_question_sets` for reproducibility.

Example flow (7–10 steps max, designed for ~3 minutes):

1. **Locale + content preferences**
   - Preferred language(s) for subtitles/dub (multi-select)
   - Preferred content origins (KR / JP / TH / US / UK / MM / IN / EU / any — multi-select)
2. **Genre starting mood** (pick top 3 out of 12 chips)
3. **Title seeding** — search + pick titles you have seen (min 3, max 10)
4. **Per-title reaction** — for each selected title:
   - Rating: 1 / 2 / 3 / 4 / 5 stars (or "didn't finish")
   - If rating ≥ 4: "What made it great?" (multi-select: story, characters, visuals, humor, pacing, soundtrack, emotion, world-building, ...)
   - If rating ≤ 2: "What didn't work?" (multi-select: pacing too slow, too violent, predictable plot, weak characters, dragged on, boring visuals, ...)
   - If "didn't finish": "Why did you drop it?" (same dislike list)
5. **Absolute no-gos** — themes/tropes you refuse (multi-select: graphic violence, heavy romance, jump-scare horror, heavy drama, musical numbers, ...)
6. **Mood right now** — optional: what are you in the mood for today? (light/heavy, short/long, fun/thoughtful) — stored as *session context*, not a permanent signal
7. **Done** — show "we've built your taste profile" summary screen with a few inferred traits

## Signal extraction rules

Deterministic function `extractSignals(answer) -> Signal[]`.

Examples:

- Rating 5 on *Inception*:
  - `+ genre:sci-fi` weight 0.7 confidence 0.8 source `onboarding_rating`
  - `+ keyword:heist` weight 0.5 confidence 0.7 source `onboarding_rating`
  - `+ director:{id}` weight 0.4 confidence 0.7
- Rating 5 + reason "pacing":
  - `+ pace:fast` weight 0.8 confidence 0.9
- Rating 1 + reason "too slow":
  - `- pace:slow-burn` weight 0.7 confidence 0.9
  - `- title:{id}` weight 1.0 confidence 1.0 (never recommend this)
- No-go "graphic violence":
  - `- keyword:gore` weight 1.0 confidence 1.0 (hard filter)
  - `- keyword:violence-graphic` weight 1.0 confidence 1.0

Weights: rating-derived weights follow a curve:
`weight = (rating - 3) / 2` clamped to `[-1, 1]`; dislikes become negative polarity.

Confidence:
- explicit choice → 0.9–1.0
- derived from rating only → 0.6–0.8
- inferred from chat (Phase 9) → 0.3–0.6, requires confirmation to reach ≥0.8

## Data model additions

```sql
onboarding_question_sets(
  id serial primary key,
  version int not null unique,             -- 1, 2, 3...
  definition jsonb not null,               -- the tree itself, for reproducibility
  created_at timestamptz default now()
);

onboarding_sessions(
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  question_set_id int not null references onboarding_question_sets(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'in_progress',  -- 'in_progress' | 'completed' | 'abandoned'
  progress jsonb not null default '{}'::jsonb  -- {step: n, answers: {...}}
);

onboarding_answers(
  id bigserial primary key,
  session_id uuid not null references onboarding_sessions(id) on delete cascade,
  step_key text not null,                  -- 'origins' | 'genre_mood' | 'title_reaction:27205' | ...
  answer jsonb not null,
  answered_at timestamptz not null default now(),
  unique(session_id, step_key)             -- idempotent re-answer = update
);

user_titles(
  user_id uuid not null references users(id) on delete cascade,
  title_id bigint not null references titles_cache(id),
  status text not null,                    -- 'seen' | 'dropped' | 'want_to_watch'
  rating int,                              -- 1..5, null if not rated
  rated_at timestamptz,
  source text not null,                    -- 'onboarding' | 'later_rating' | 'import'
  primary key (user_id, title_id)
);

preference_signals(
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  dimension text not null,                 -- 'genre' | 'tone' | ...
  value text not null,                     -- canonical slug
  polarity text not null,                  -- 'like' | 'dislike'
  weight numeric(4,3) not null,            -- 0..1
  confidence numeric(4,3) not null,        -- 0..1
  source text not null,
  created_at timestamptz not null default now(),
  superseded_by bigint references preference_signals(id),
  unique(user_id, dimension, value, polarity, source)  -- one per (dim,val,pol,source); re-extraction updates
);
create index on preference_signals(user_id) where superseded_by is null;

user_preference_profile(  -- denormalized fast-read aggregate, rebuilt on signal write
  user_id uuid primary key references users(id) on delete cascade,
  profile jsonb not null,                  -- {likes: {...}, dislikes: {...}, hardFilters: [...]}
  rebuilt_at timestamptz not null default now()
);
```

> Merge-safety clarification: `onboarding_sessions`, `user_titles`, `preference_signals`, and `user_preference_profile` belong in the direct reparent path because they carry `user_id`. `onboarding_answers` follows its parent `onboarding_sessions` row and should be verified by integration test rather than the direct `user_id` enumeration test.

## Work breakdown

### 4.1 Question tree definition

- [ ] `questions.v1.ts` exporting the tree + metadata (step keys, conditional branches)
- [ ] Seed it into `onboarding_question_sets` via migration
- [ ] Translations in `packages/i18n/locales/en.json` under `onboarding.v1.*`, mirror in `my.json`
- [ ] Answer options use canonical slugs; display strings come from i18n

### 4.2 Signal extractor (`packages/core/onboarding/extract.ts`)

- [ ] Pure function `extract(answer, context) -> Signal[]`
- [ ] Unit tests cover each question type with several inputs
- [ ] Deterministic: same input → same output

### 4.3 Session & progress endpoints

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/onboarding/start` | Creates `onboarding_sessions`; returns first step |
| GET | `/api/onboarding/current` | Resume in-progress session |
| POST | `/api/onboarding/answer` | Body: `{stepKey, answer}`. Writes answer, returns next step |
| POST | `/api/onboarding/complete` | Finalizes, triggers extraction, returns summary |
| GET | `/api/onboarding/summary` | Human-readable profile (for the done screen) |

- [ ] `answer` is idempotent on `(sessionId, stepKey)` — user can go back and change
- [ ] Completion runs `extract()` across all answers, writes to `preference_signals`, rebuilds `user_preference_profile`
- [ ] If user goes back and changes an answer after completion, extraction re-runs; superseded signals are marked

### 4.4 Web wizard UI

- [ ] Route: `/[locale]/onboarding/[step]`
- [ ] Single-page wizard with progress bar (N of 7)
- [ ] Title search component reuses Phase 3 `/api/titles/search`
- [ ] Per-title reaction screen: one card at a time, large touch targets
- [ ] Skip button on any step except no-gos (no-gos are important enough to require explicit answer even if empty)
- [ ] Done screen summarizes "You lean toward fast-paced sci-fi and avoid graphic horror"
- [ ] Guest users can complete onboarding; data lives on their guest user row (upgrades carry it)

### 4.5 Summary and edit-later

- [ ] `/[locale]/profile/taste` — read-only view of extracted signals grouped by dimension
- [ ] "Retake onboarding" button → new session, old one kept for history
- [ ] "Remove this preference" → write a supersession row with weight 0

### 4.6 Bot-readiness

- [ ] Same API surface is reachable from the bot later; do not fork the server logic
- [ ] Ensure answer payloads are JSON and do not depend on web-specific shapes

## Acceptance criteria

- A new guest can complete onboarding in under 4 minutes
- Leaving mid-flow and returning same-session resumes at the correct step
- Completing onboarding writes ≥10 signals for a typical 3-title seed
- Signals have canonical slugs; no free-text stored in `preference_signals.value`
- Changing an answer after completion re-extracts and supersedes old signals
- Guest user completes onboarding, logs in with Google → profile preserved
- Burmese locale renders question text and option labels correctly
- Unit tests: 20+ fixtures covering each question with representative answers

## Dependencies

- Phase 2 identity (guest + logged-in)
- Phase 3 title search + details
- i18n catalog populated for onboarding v1

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Flow too long → users drop off | Enforce 7-step limit; analytics track per-step drop |
| Title seed too US-centric | Pre-compute regional trending seeds per origin preference |
| Signal extractor becomes a tangle | Keep it pure + unit-tested; one rule per answer type |
| No-go items ignored downstream | Mark hard filters with `confidence=1.0, weight=1.0`; engine enforces them as *filters*, not scoring |
| Signal double-counting | Unique constraint on `(user_id, dimension, value, polarity, source)` |

## Estimated effort

**L (2–3 weeks).** The question tree and signal extractor need iteration with real users.
