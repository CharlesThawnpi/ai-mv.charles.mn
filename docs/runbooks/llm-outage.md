# Runbook: LLM Outage Or Cost Guardrail

## Purpose

Operate safely when the AI provider is failing, timing out, or temporarily disabled for cost control.

## Expected degraded behavior

- recommendation feed still works because the deterministic engine remains primary
- title lookup still works through content/search endpoints
- chat may downgrade to simple grounded responses or be temporarily disabled
- no durable preference write should depend on a live LLM call

## Triggers

- provider timeouts or elevated error rate
- schema validation failures across many chat turns
- daily cost budget exceeded
- feature flag intentionally disabling chat features

## Response procedure

1. Confirm whether the problem is provider availability, quota, or application-side validation.
2. Disable the affected chat feature flag if needed.
3. Keep deterministic flows enabled:
   - recommendation feed
   - search
   - title detail
4. Downgrade chat behavior:
   - turn off taste-proposal writes
   - return short fallback guidance
   - suggest onboarding or search as alternatives
5. Monitor cost and provider status until stable.

## User-facing fallback guidance

- "Chat is taking a short break right now, but recommendations and search are still available."
- avoid implying lost data if only the AI layer is down

## Validation after recovery

- chat requests succeed within latency budget
- title references in chat responses validate correctly
- quota and cost accounting resume normally
- accepted signal writes work again only after confirmation flow is verified

## After action

- log the outage duration and degraded mode used
- update prompts, retries, or quotas if they contributed
- refresh this runbook when the fallback behavior changes
