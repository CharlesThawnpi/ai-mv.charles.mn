# Runbook: Database Backup Restore

## Purpose

Restore the primary database into staging or a recovery target and prove the application can boot against it.

## When to use

- monthly restore drill
- suspected data loss
- bad migration recovery rehearsal
- pre-production validation of backup integrity

## Preconditions

- access to the backup store
- access to the target Postgres instance
- application secrets for the target environment
- enough disk space for the restore target

## Procedure

1. Announce the restore in the team channel and note the reason.
2. Identify the backup artifact and target timestamp.
3. Restore into a non-production database first unless this is a real disaster recovery event.
4. Apply WAL replay or point-in-time recovery steps if required.
5. Point staging API and workers at the restored database.
6. Run basic verification:
   - app boots
   - migrations report expected state
   - `/healthz` is healthy
   - `/readyz` passes once dependencies are reachable
   - sample user lookup works
   - recommendation feed works for a known test user
7. Record restore duration, backup age, and any data gaps.

## Validation checklist

- latest expected tables exist
- row counts are plausible for key tables
- newest audit rows are present up to the intended recovery point
- guest upgrade and recommendation queries still work
- bot and web can both read the restored data model

## Escalate if

- restore exceeds the target recovery window
- WAL replay is incomplete or corrupted
- migrations are out of sync with the restored schema
- key user-owned tables are missing or obviously truncated

## After action

- log the drill or incident in the ops journal
- update this runbook if any command or assumption was wrong
