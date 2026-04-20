# Phase 12 — Quality, Security, and Production Hardening

## Goal

Take the platform from "works for early users" to "safe to grow with." Close the common classes of production issues: outages, data loss, abuse, and leaks. Add the observability needed to catch problems before users do.

## Scope

In scope:

- Structured logging + request tracing end-to-end
- Error tracking and alerting
- Metrics + dashboards (infra + app)
- Rate limiting across all surfaces
- Input validation hardening
- Auth/session hardening
- Secrets management
- Database backup + point-in-time recovery
- Deployment safety (staging, rollback, zero-downtime)
- Bot abuse protection
- Webhook validation
- Performance targets & load test

Out of scope:

- Multi-region HA (future)
- Full SOC-style compliance

## Observability

### 12.1 Logs

- [ ] All services emit JSON logs with: `ts`, `level`, `msg`, `service`, `env`, `request_id`, `user_id?`, `source?`, `duration_ms?`
- [ ] Log aggregation: a single managed stack is fine (e.g., BetterStack, Axiom) — keep cost light
- [ ] Retention: 30 days for info, 90 days for warn+, 1 year for security events
- [ ] PII policy: never log user input bodies of chat; log metadata + hash

### 12.2 Tracing

- [ ] OpenTelemetry SDK in api + bot
- [ ] Trace context propagated from inbound request through tool calls
- [ ] Sampled at 10% baseline, 100% for 5xx

### 12.3 Metrics

- [ ] Per-service: RPS, p50/p95/p99 latency, error rate, CPU, memory
- [ ] App-specific: TMDB error rate, cache hit rate, feed latency, LLM cost/day, active sessions
- [ ] Dashboards (Grafana or vendor equivalent)

### 12.4 Alerting

- [ ] Pages: service error rate >2% for 5 min, DB CPU >80% for 10 min, TMDB circuit open, disk >85%
- [ ] Warnings: LLM cost/day >budget, cache hit rate <target, bot webhook failures

## Reliability

### 12.5 Database

- [ ] Daily logical backups + WAL archiving for PITR
- [ ] Backups stored off-host (S3-compatible; separate provider from VPS)
- [ ] Monthly restore drill (restore to staging from backup; validate app works)
- [ ] Primary-replica (streaming replication) recommended once users justify; not day-one
- [ ] Migrations gated in CI; manual approval for destructive ones

### 12.6 Deployment

- [ ] Two environments: staging (mirrors prod), production
- [ ] Zero-downtime rolling deploy (Docker Compose with wait-for-healthy pattern, or behind Caddy with graceful drain)
- [ ] Feature flags (Phase 11) used for risky releases
- [ ] Rollback script: `deploy.sh rollback` pins the previous image tag
- [ ] Release tags: `app-yyyy-mm-dd-hhmm`
- [ ] Post-deploy smoke test script

### 12.7 Secrets

- [ ] Secrets in a managed store (SOPS+age in repo, or Doppler, or Infisical — pick one, document)
- [ ] No secrets in `.env` on developer laptops beyond local dev values
- [ ] Rotation playbook for: DB password, Google OAuth secret, TMDB key, Anthropic key, bot token, session secret

## Security

### 12.8 Input validation

- [ ] Every endpoint uses Zod schema at the boundary
- [ ] Query params, body, and path params all validated
- [ ] File uploads (if any) size and type checked

### 12.9 Auth/session

- [ ] Cookies: httpOnly, secure, sameSite=lax, rotating session IDs on privilege change
- [ ] CSRF: double-submit token on state-changing non-API-only requests
- [ ] OAuth state + PKCE (already from Phase 2; verify)
- [ ] Session expiry: 30 days rolling; absolute max 180 days
- [ ] Revoke sessions on password-equivalent events (email change at Google side is invisible; not our concern)
- [ ] Guard against open redirects in OAuth `redirect_uri`

### 12.10 Bot abuse

- [ ] Per-user rate limits (already Phase 7); add per-IP when webhook detects patterns
- [ ] Abuse heuristics: >100 /recommend/day from one user → throttle + notify admin
- [ ] Block well-known abusive patterns (repeat identical messages, high-speed identical queries)
- [ ] Report button → auto-mute if 5+ users report the same bot user

### 12.11 Webhook validation

- [ ] Telegram: verify `secret_token` on incoming webhook (set via `setWebhook`)
- [ ] Google OAuth: verify `state` + `nonce`
- [ ] Anthropic: no incoming webhooks; N/A
- [ ] Any future third-party webhook uses HMAC or JWS

### 12.12 Transport

- [ ] TLS 1.2+ only (Caddy default is fine)
- [ ] HSTS enabled with 1-year max-age once confident
- [ ] Security headers: CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [ ] CSP: strict-dynamic; nonces for inline scripts (Next.js App Router compatible)

### 12.13 Dependency hygiene

- [ ] `pnpm audit` in CI; block high+ severity in prod deploys
- [ ] Renovate or Dependabot for weekly updates
- [ ] Lockfile enforced

## Performance

### 12.14 Targets (p95)

| Endpoint | Target |
|----------|--------|
| `/api/me` | 50ms |
| `/api/titles/search` | 200ms cache, 800ms cold |
| `/api/titles/:id` | 80ms cache, 600ms cold |
| `/api/recommend/feed` | 300ms warm, 1s cold |
| `/api/chat/messages` | 2.5s (bounded by LLM) |

### 12.15 Load test

- [ ] k6 scripts for feed, search, onboarding answer, chat
- [ ] Run against staging: 50 RPS sustained, 200 RPS spike
- [ ] Tune DB pool, Redis timeouts, worker counts from observed bottlenecks

### 12.16 Caching pass

- [ ] Verify `user_preference_profile` cache hits on feed
- [ ] Verify Redis hit rate on title detail > 85%
- [ ] HTTP caching on public endpoints (`Cache-Control: s-maxage`)

## Work breakdown

### 12.17 Hardening tasks

- [ ] Install OTEL SDK + wire up
- [ ] Configure log aggregation + redaction
- [ ] Set up metrics scrape + dashboards
- [ ] Define alert routes (on-call or single-person PagerDuty-lite via webhook)
- [ ] Implement rate limit middleware (Redis-backed token bucket) at API gateway
- [ ] Audit every endpoint for Zod coverage
- [ ] Add CSRF middleware to state-changing non-pure-API routes
- [ ] Add CSP + security headers via Caddy
- [ ] Secrets migration to chosen store
- [ ] Backup + PITR config
- [ ] Rollback script + runbook
- [ ] Webhook secret for Telegram configured
- [ ] Abuse heuristics service
- [ ] k6 load test + tune
- [ ] Write `docs/runbooks/*.md` for: DB restore, deploy rollback, bot down, TMDB outage, LLM outage

Initial recommended runbooks now live under `docs/runbooks/`. Keep them updated whenever a related procedure, command, or dependency changes.

## Acceptance criteria

- One query in the log system can trace a user's request across web → api → rec engine → TMDB (via `request_id`)
- 5xx rate <0.5% under normal traffic
- Restoring from last night's backup to staging succeeds within 30 min
- Deploying a change + rolling back completes in <5 min with no data loss
- Load test: 50 RPS sustained with p95 within budget
- `pnpm audit` clean before deploy
- All security headers green on observatory.mozilla.org (A grade)
- Abuse user gets throttled automatically; admin gets notified

## Dependencies

- Real user traffic (or simulated) to tune thresholds
- Budget line for observability vendor (or self-hosted Grafana stack)
- Off-host backup destination

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Over-alerting burnout | Start with few alerts; add based on real incidents |
| Cost blowup on observability | Pick retention carefully; sample traces; dedupe log fields |
| Hardening steps break existing flows | Roll each change out behind a flag in staging |
| Backup exists but restore untested | Monthly drill is mandatory |

## Estimated effort

**L (2–3 weeks).** Lots of small pieces; skip nothing that touches data or secrets.
