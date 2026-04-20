# Phase 10 — Search Intelligence and Discovery Expansion

## Goal

Make search and discovery feel powerful without requiring the user to learn a query language. Support exact, fuzzy, descriptive ("quiet thriller set in Seoul"), and attribute-based queries (actor, director, year range, country, genre). Integrate the AI interpretation layer from Phase 9 so free-text queries are translated into structured filters that the existing index understands.

## Scope

In scope:

- Advanced structured filters on existing index
- Fuzzy + tsvector tuning
- Short-description / mood / vibe search
- Actor / director search
- Better ranking (popularity + profile-aware boost for logged-in users)
- Recommendation-assisted search ("you might also like…" shown with results)
- Saved searches (optional)
- Unified search entry point on web and bot

Out of scope:

- Full-text vector embeddings index (future if volume justifies it; noted in risks)
- Multi-modal (image) search
- Semantic clustering dashboards

## Search surfaces

| Surface | How it's used |
|---------|---------------|
| Web top-bar search | Quick title lookup with suggestions |
| `/search` page | Full search with filters on web |
| Bot `/search <query>` | Title lookup |
| Bot chat message | Routed through Phase 9 intent classifier; may become a search or a recommendation |

## Query pipeline

```
Query string
  │
  ▼
Normalize (trim, fold, detect locale)
  │
  ▼
Classify: structured? descriptive? title-lookup?
  │
  ├── Title-ish ───► titles_search_index (tsvector + trigram)
  │
  ├── Structured ──► parse filters ────► Postgres + filters
  │                  (e.g., "korean thriller 2020")
  │
  └── Descriptive ─► Phase 9 grounding: LLM (Haiku) extracts filters
                     into {genres?, countries?, years?, tones?,
                           pace?, keywords?, mustNotInclude?}
                     ► Postgres + filters + optional rec-engine boost
```

Output: a ranked list of titles + a "search explanation" string showing what the system interpreted ("Showing Korean thrillers released 2018–2023, sorted by relevance").

## Filters (first-class)

- `mediaType` — movie, tv, both
- `genres` — multi
- `countries` — multi
- `languages` — multi
- `yearFrom`, `yearTo`
- `minVoteAverage`
- `runtimeMinutesMax`, `runtimeMinutesMin`
- `person` — director or cast id
- `keywords` — multi (exposed to power users)
- `tones` (e.g., dark, feel-good) — mapped to keyword clusters
- `excludeKeywords`

User-facing: tags above results showing active filters; each removable.

## Ranking

Final score = `BM25ish(text relevance) * textWeight + popularityBoost + profileBoost - penalties`.

- `textWeight` is high for title-like queries, low for descriptive queries (where filter match is the main signal)
- `profileBoost` (logged-in users): small lift based on the user's preference profile — same vector-like scoring as Phase 5 but scaled down, so search still respects the query
- `penalties` — already-seen titles drop a few ranks (not filtered out of search, unlike feed)

## Work breakdown

### 10.1 Filter layer

- [ ] Shared Zod schema `SearchFilters`
- [ ] Query builder that composes tsvector match + predicate joins on `titles_genres`, `titles_people`, `titles_keywords`
- [ ] Proper handling of AND/OR (default: AND across filter categories, OR within a category)

### 10.2 Tsvector + trigram tuning

- [ ] Add `ts_config('simple')` variant alongside `english` for multi-language
- [ ] Trigram fallback kicks in when tsvector returns < 5 matches
- [ ] Per-title boost using popularity and recency

### 10.3 Descriptive query parser

- [ ] Phase 9 tool: `parseDescriptiveQuery(text, locale) -> SearchFilters`
- [ ] Output constrained to the same Zod schema
- [ ] Validate all values against canonical vocab; drop unknowns
- [ ] Cache parses for 24h per query string

### 10.4 Person search

- [ ] `titles_people` already has indexed `person_id` and `name`
- [ ] `/api/people/search?q=` returns people (separate endpoint used by filters)
- [ ] Selecting a person adds a filter chip

### 10.5 Saved searches (optional)

- [ ] Logged-in users can save `/search?...` state with a name
- [ ] Shown on the profile page

### 10.6 Web UI

- [ ] `/search` page with:
  - Query input with instant suggestions (titles + people)
  - Filter chips on the left (desktop) / drawer (mobile)
  - Active-filter row above results
  - Result grid
  - "Interpretation note": what the system understood
  - "You might also like" section at the bottom when results are thin
- [ ] Keyboard navigation (↑↓ in suggestions)

### 10.7 Bot

- [ ] `/search <query>` remains short-form title search
- [ ] Descriptive queries in chat route to Phase 9 handlers which may call this module
- [ ] If the parser returns filters, bot posts a short "Showing <filters>" message followed by results

### 10.8 Ranking experiments

- [ ] Versioned ranking config (`ranking_version` on result logs)
- [ ] A/B framework: assign users to a ranking variant by `hash(userId) % 2`
- [ ] Compare CTR on results

## Data model additions

```sql
search_events(
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  at timestamptz not null default now(),
  raw_query text,
  parsed_filters jsonb,
  source text,                             -- 'web_bar' | 'web_page' | 'bot_cmd' | 'chat'
  result_ids bigint[],
  ranking_version text
);

saved_searches(
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  filters jsonb not null,
  created_at timestamptz not null default now()
);
```

> `saved_searches` joins reparent-all. `search_events` we keep under the user id but the FK is `on delete set null` for retention.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search?q=&...filters` | Run search |
| GET | `/api/people/search?q=` | Person search |
| POST | `/api/search/saved` | Save a search |
| GET | `/api/search/saved` | List |
| DELETE | `/api/search/saved/:id` | Remove |

## Acceptance criteria

- Typing "Parasite" returns the movie in the top 3 results in <200ms
- Typing "Korean slow-burn thrillers from the 2010s" returns a sensible set with visible interpretation
- Filtering by director `Bong Joon-ho` returns his films; results exclude unrelated titles
- Descriptive query that parses to no filters gracefully falls back to keyword tsvector search
- Search event log captures every query with parsed filters for analytics
- Ranking A/B does not require a deploy to flip

## Dependencies

- Phases 3, 5, 9 complete
- Canonical vocab (genres, tones, keywords) curated — shared with Phase 4's taxonomy
- Anthropic API for descriptive parsing (Haiku)

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Descriptive queries produce wrong filters | Show interpretation; user can remove chips; log mismatches |
| Search latency grows with filter complexity | Ensure indexes on all filter columns; profile slow queries |
| "Tones" vocabulary drifts away from `preference_signals` | Keep a single canonical list; both systems import it |
| Search becomes recommendation | Keep a floor: any query word must appear in results unless filters-only; explain when not |
| Descriptive parsing cost | Cache per normalized query; queries are reused across users |

## Estimated effort

**L (2.5–3 weeks).** Most effort is ranking tuning and descriptive parser quality.
