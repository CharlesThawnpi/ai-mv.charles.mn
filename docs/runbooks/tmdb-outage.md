# Runbook: TMDB Outage Or Degradation

## Purpose

Keep the product usable when TMDB is slow, rate-limited, or unavailable.

## Expected product behavior

- cached title detail should still work
- cached trending and popular surfaces should still work until TTL expiry
- cold title fetches should fail clearly with retryable errors
- recommendation hot path should not call TMDB directly

## Triage

1. confirm whether failures are rate-limit, timeout, or upstream 5xx
2. check circuit-breaker state
3. inspect cache hit rates and queue backlog
4. confirm background refresh jobs are not amplifying the outage

## Response procedure

1. Pause non-essential TMDB refresh jobs.
2. Reduce refresh concurrency or request budget.
3. Extend cache TTLs temporarily for trending and popular endpoints if needed.
4. Keep serving cached data.
5. Surface a graceful fallback for cold misses:
   - web: retryable error or fallback list
   - bot: short apology and cached alternatives where possible

## Do not do

- do not clear caches during an upstream outage
- do not let background warming consume the remaining request budget
- do not block recommendation feed generation on uncached TMDB lookups

## Recovery

1. wait for upstream stability
2. close or reset the circuit breaker carefully
3. resume refresh jobs in small batches
4. watch error rate and cache freshness before restoring normal concurrency

## Validation

- cached detail and feed calls remain healthy
- TMDB error rate returns to normal
- refresh backlog begins shrinking
- user-facing cold-miss failures drop back to baseline
