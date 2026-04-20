# Phase 3 — Title Metadata and Content Ingestion Layer

## Goal

Provide a fast, consistent, and cost-efficient source of movie and series metadata. External APIs (TMDB primary) are the source of truth; our database caches the shape we need for search, display, and recommendation scoring. The system remains **recommendation-focused, not streaming-focused** — we do not resolve "where to watch" links in this phase.

## Scope

In scope:

- TMDB client: search, details, trending, discover (both `movie` and `tv`)
- Normalized internal `Title` shape
- Local cache tables for titles, credits, keywords, genres
- Exact + fuzzy search endpoint
- Refresh strategy (TTL + on-demand)
- Asian and worldwide content support (no geo filter in fetch)
- Poster / backdrop URL helpers

Out of scope:

- Recommendation scoring (Phase 5)
- Free-text / mood search (Phase 10)
- User-owned watched/rating data (Phase 4)
- Admin tools (Phase 11)

## Internal `Title` shape

This is the contract every client (web, bot, recommendation engine) consumes. TMDB field names must not leak beyond `packages/tmdb`.

```ts
type Title = {
  id: number;                 // TMDB id, prefixed in DB if we later add other sources
  mediaType: 'movie' | 'tv';
  titleOriginal: string;
  titleLocalized: Record<string, string>;  // { en: "...", my: "..." } where available
  year: number | null;
  endYear: number | null;     // tv only
  runtimeMinutes: number | null;
  genres: string[];           // canonical slugs: 'action', 'romance', ...
  countries: string[];        // ISO 3166-1 alpha-2
  spokenLanguages: string[];  // ISO 639-1
  overview: Record<string, string>; // { en, my }
  posterUrl: string | null;
  backdropUrl: string | null;
  popularity: number;
  voteAverage: number;
  voteCount: number;
  keywords: string[];         // TMDB keyword slugs — crucial for taste signals
  credits: {
    directors: { id: number; name: string }[];
    topCast:   { id: number; name: string; character: string }[];
  };
  externalIds: { imdb?: string; tmdb: number };
  refreshedAt: string;
};
```

## Data model additions

```sql
titles_cache(
  id bigint primary key,                 -- tmdb_id
  media_type text not null,              -- 'movie' | 'tv'
  payload jsonb not null,                -- serialized Title
  popularity numeric(10,3) not null default 0,
  refreshed_at timestamptz not null default now(),
  stale_after timestamptz not null       -- refreshed_at + TTL based on popularity
);

titles_search_index(
  title_id bigint primary key references titles_cache(id) on delete cascade,
  title_original text not null,
  title_en text,
  title_my text,
  search_tsv tsvector
);
create index titles_search_gin on titles_search_index using gin(search_tsv);

titles_keywords(
  title_id bigint references titles_cache(id) on delete cascade,
  keyword text not null,
  primary key (title_id, keyword)
);
create index on titles_keywords(keyword);

titles_genres(
  title_id bigint references titles_cache(id) on delete cascade,
  genre text not null,
  primary key (title_id, genre)
);
create index on titles_genres(genre);

titles_people(
  title_id bigint references titles_cache(id) on delete cascade,
  person_id bigint not null,
  name text not null,
  role text not null,                    -- 'director' | 'cast'
  cast_order int,
  primary key (title_id, person_id, role)
);
create index on titles_people(person_id);
```

> Keywords/genres/people are denormalized from the jsonb payload for indexable querying by the recommendation engine (Phase 5). The jsonb remains the canonical payload for the client.
>
> Implementation clarification: do not rely on a bare TMDB numeric id as the only durable database key. In production, keep either a synthetic internal `titles_cache.id` or a namespaced/composite unique key such as `(source, media_type, source_id)`. This prevents movie/TV id collisions and leaves room for future secondary metadata sources. All later `title_id` foreign keys should reference the stable internal row identity.

## Work breakdown

### 3.1 TMDB client hardening (`packages/tmdb`)

- [ ] Strongly-typed response shapes (generated from TMDB OpenAPI or hand-written)
- [ ] Normalizer module: TMDB response → `Title`
- [ ] Language fan-out: call with `language=en-US` and `language=my-MM` (fallback to `en` when `my` empty), merge into `titleLocalized` / `overview`
- [ ] Fetch credits + keywords in the same batch (`append_to_response=credits,keywords`)
- [ ] Global rate-limit queue (TMDB ~40 req/10s). Simple token bucket.
- [ ] Circuit breaker: open on 5 consecutive failures, half-open after 30s

### 3.2 Cache layer

- [ ] Read path: `getTitle(id, mediaType)` returns cached if fresh; otherwise fetch, normalize, upsert, return
- [ ] TTL strategy (popularity-aware):
  - popularity ≥ 50: 24h
  - popularity 10–50: 7d
  - popularity < 10: 30d
- [ ] Background refresh worker: nightly cron refreshes top-1000 popular titles
- [ ] Hot cache: Redis `title:{id}` with 10-minute TTL to shield DB

### 3.3 Search

Two endpoints, two strategies:

- **Exact/near-exact search** — used in onboarding ("type a movie you've seen")
  - Query Postgres `titles_search_index` with tsvector + trigram fallback
  - If fewer than 5 results, **also** call TMDB `/search/multi`, normalize, upsert, return
- **Fuzzy search** — used in general web search box
  - Same as above but threshold is lower

Response shape:

```json
{
  "results": [ { "id": 27205, "mediaType": "movie", "titleLocalized": {...}, "year": 2010, "posterUrl": "..." } ],
  "source": "cache" | "tmdb-fallback"
}
```

### 3.4 Discover lists

- [ ] Trending (day/week) — cached for 1h
- [ ] Popular (movie/tv) — cached for 6h
- [ ] By country (e.g., KR, TH, JP, TW, CN, MM) — for Asian content surfaces
- [ ] By genre
- [ ] Each endpoint paginates, page size 20

### 3.5 Poster / image URLs

- [ ] Central helper: `imageUrl(path, size)` → TMDB image CDN
- [ ] Sizes: `poster-sm`, `poster-md`, `poster-lg`, `backdrop-md`, `backdrop-lg`
- [ ] Provide `srcset` hints in API payload for web to use

### 3.6 Background jobs

- [ ] Job runner (`packages/jobs`) on top of BullMQ + Redis
- [ ] Jobs:
  - `tmdb.refreshTitle(id)` — refresh single title
  - `tmdb.refreshPopular()` — nightly, top-N
  - `tmdb.warmOnboarding()` — ensure onboarding seed titles are cached

### 3.7 Admin CLI (developer-only, not yet the Phase 11 admin UI)

- [ ] `pnpm tmdb:refresh <id>`
- [ ] `pnpm tmdb:seed-popular` (for dev DBs)

## API surface (Phase 3)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/titles/search?q=&media=&page=` | Search |
| GET | `/api/titles/:mediaType/:id` | Full title detail |
| GET | `/api/titles/trending?media=&window=day\|week` | Trending |
| GET | `/api/titles/popular?media=&country=&genre=&page=` | Popular/discover |
| POST | `/api/titles/:id/refresh` | Force-refresh (dev-only, gated) |

## Acceptance criteria

- Searching "Inception" returns the movie in <200ms when cached, <1s cold (from TMDB fallback)
- Searching in Burmese locale returns localized strings when TMDB has them
- Title detail includes genres, keywords, top 10 cast, and director(s)
- Trending endpoint returns 20 items in <100ms from cache
- Killing TMDB access: cached lookups still succeed; cold lookups return a clear 503 with `retryable:true`
- Database contains rows in `titles_search_index`, `titles_keywords`, `titles_genres`, `titles_people` for every cached title
- A nightly job run refreshes popular titles without duplicating rows
- Adding a second data source later (e.g., JustWatch for availability) does not require schema migration — it becomes another normalized producer

## Dependencies

- Phase 1 TMDB client scaffolding
- Redis (now required, not optional)
- Postgres `pg_trgm` extension enabled

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| TMDB rate limits during bulk warm | Token bucket + nightly job chunked to 30 req/10s |
| Localized metadata gaps (Burmese sparse on TMDB) | Always fallback to English; mark language-missing titles for later community translation |
| Search is slow on cold DB | `pg_trgm` index + tsvector + Redis read-through |
| Stale data in popular titles | Popularity-aware TTL + manual `POST /refresh` for ops |
| Cache bloat | Evict titles not read in 180 days via nightly job |

## Estimated effort

**L (2–3 weeks).** Most effort goes to robust normalization, caching, and search tuning.
