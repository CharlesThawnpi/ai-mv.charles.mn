# Runbook: Deploy Rollback

## Purpose

Rollback a release that caused errors, regressions, or unsafe behavior.

## Triggers

- sustained increase in 5xx or latency
- broken onboarding, auth, feed, or bot flows
- bad migration behavior
- external dependency integration behaving unexpectedly after release

## Immediate response

1. Stop the rollout if it is still in progress.
2. Disable the related feature flag if the issue is feature-gated.
3. Decide whether code rollback alone is safe or whether database recovery is also needed.

## Standard rollback procedure

1. Identify the last known good image tag.
2. Run the rollback command or deploy script for that tag.
3. Confirm all services return healthy status.
4. Run smoke verification:
   - home page loads
   - `/api/me` works
   - onboarding start works
   - recommendation feed works
   - Telegram bot responds to `/start` or `/help`
5. Watch logs and metrics for at least one stabilization window.

## Database caution

Do not restore the database as part of a normal rollback unless one of these is true:

- the release included a destructive migration
- data written by the bad release is unsafe to keep
- application rollback cannot read the new schema safely

If database recovery is needed, switch to the backup/restore runbook and treat the incident as higher severity.

## Communication

- record the incident start time
- note the bad release tag and the restored release tag
- summarize user impact
- capture whether feature flags reduced blast radius

## Exit criteria

- error rate and latency return to baseline
- core user flows are passing
- no unexpected migration drift remains
- next steps for root-cause analysis are assigned
