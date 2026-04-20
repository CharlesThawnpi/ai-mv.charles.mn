# Runbooks

Operational runbooks referenced by the implementation plan.

- [backup-restore.md](./backup-restore.md) - restore the database to staging or recovery target and validate the app
- [deploy-rollback.md](./deploy-rollback.md) - rollback a bad deployment safely and verify recovery
- [bot-down.md](./bot-down.md) - recover Telegram bot delivery failures
- [tmdb-outage.md](./tmdb-outage.md) - operate safely when TMDB is degraded or unavailable
- [llm-outage.md](./llm-outage.md) - degrade gracefully when the LLM provider is failing or over budget

Keep these runbooks practical. Update commands, flags, URLs, dashboards, and escalation notes whenever the underlying procedure changes.
