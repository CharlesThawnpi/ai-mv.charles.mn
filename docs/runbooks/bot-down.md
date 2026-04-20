# Runbook: Telegram Bot Down

## Purpose

Recover from bot delivery failures, webhook errors, or degraded Telegram command handling.

## Symptoms

- `/start` or `/recommend` stops responding
- webhook delivery failures spike
- bot process is unhealthy or repeatedly crashing
- inline keyboard callbacks fail

## Triage

1. Check bot process health and recent deploy history.
2. Check webhook status and recent failure logs.
3. Confirm the shared backend API is healthy.
4. Check Redis availability if conversation state is timing out unexpectedly.
5. Confirm Telegram webhook secret validation is still configured correctly.

## Common failure branches

### Bot process down

1. restart the bot service
2. confirm it can reach API, Redis, and Postgres as required
3. verify `/help` or `/start` in a real Telegram chat

### Webhook misconfigured or unreachable

1. inspect current webhook URL and secret token
2. restore the expected webhook configuration
3. verify TLS and public reachability
4. confirm Telegram retries begin succeeding

### Backend healthy but callbacks failing

1. inspect callback parsing errors
2. check payload length assumptions
3. confirm the current bot release matches the callback schema expected by the backend

## Temporary degradation mode

If the bot cannot fully recover quickly:

- keep `/start`, `/help`, and `/recommend` available if possible
- temporarily disable chat-heavy or stateful flows
- post a short user-facing message that the bot is in reduced mode

## Validation

- `/start` resolves or creates a user
- onboarding resumes correctly
- `/recommend` returns personalized results
- callback buttons work
- logs show normal update throughput

## After action

- document root cause
- update this runbook if the recovery path changed
- add or refine alerting if detection was late
