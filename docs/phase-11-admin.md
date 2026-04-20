# Phase 11 — Admin and Analytics Tools

## Goal

Give operators the smallest useful set of tools to run the platform: see how it's being used, tune what's configurable, review user reports, and intervene when needed — **without building a full CMS.** The bias is toward oversight and tuning, not day-to-day content management.

## Scope

In scope:

- Admin authentication + role gating
- Basic dashboards: user activity, onboarding funnel, recommendation CTR, chat usage, cost
- Question-set management (promote / demote onboarding versions)
- Keyword / tone vocab management
- Report queue (user-submitted: bad recommendation, missing title, offensive content)
- Title cache management (force refresh, blacklist)
- User lookup and soft-moderation (mute bot access, revoke sessions)
- Feature flags

Out of scope:

- Full CMS for editorial content
- Billing / subscriptions (Phase 14)
- Full audit UI (logs viewable in CLI + files)

## Roles

- `admin` — can do anything
- `analyst` — read-only across dashboards + user lookup (no mutations)
- `moderator` — handle reports, title blacklist

Roles stored on the user row:

```sql
alter table users add column roles text[] not null default '{}';
create index on users using gin(roles);
```

## Auth for admin

- Admin login is the normal Google OAuth flow
- Access to `/admin/*` is gated by `roles` containing `admin` / `analyst` / `moderator`
- 2FA required for `admin` role: TOTP via `otplib`, enforced on every login older than 12h
- Admin actions logged in `audit_log_admin`

## Dashboards

Minimal, focused; everything queryable from Postgres — no separate OLAP.

1. **Overview**
   - DAU / WAU / MAU
   - Guest vs logged-in ratio
   - New users per day (by identity provider)
   - Link completions per day
2. **Onboarding funnel**
   - Starts → step 3 → step 5 → completed (per day)
   - Avg duration
   - Abandon rate per step
3. **Recommendation quality**
   - Feed requests per day
   - Click-through rate on recommendations
   - `not_for_me` rate
   - Avg score of clicked items
   - Hard-filter drop rate (alerting if too high)
4. **Chat**
   - Messages per day
   - Cost per day
   - Top intents
   - Avg tokens per turn
5. **Content cache**
   - Titles in cache
   - Cache hit rate on searches and feeds
   - TMDB error rate
6. **Bot**
   - DAU from TG vs web
   - Command frequency
7. **Reports**
   - Open report count by type
   - Avg time-to-resolution

All dashboards: absolute numbers + 7-day and 30-day trends. Charts via a lightweight client-side chart library (e.g., uPlot or Recharts).

## Management tools

### 11.a Question-set management

- [ ] View all `onboarding_question_sets` versions
- [ ] Clone a version, edit the JSON definition in a code-like editor, save as new version
- [ ] Set one version as "active" (new onboarding sessions use this version)
- [ ] Compare step-level completion rates between versions

### 11.b Vocab management

- [ ] View canonical vocab: genres, tones, keyword clusters, countries
- [ ] Add / merge / deprecate entries
- [ ] Changes propagate via a file-backed source-of-truth committed to the repo; the admin UI is a PR generator, not a direct DB write — this preserves review and avoids runtime drift

### 11.c Report queue

- [ ] List of `user_reports` with type, reporter, title, message, timestamp
- [ ] Report types: `bad_recommendation`, `missing_title`, `offensive_content`, `wrong_metadata`, `other`
- [ ] Actions: mark resolved, add note, force-refresh title, blacklist title, escalate
- [ ] Blacklist scoping: `{globally, per_country}` — blacklisted titles do not appear in feeds or search

### 11.d Title management

- [ ] Search title by id or name
- [ ] View cached payload
- [ ] Actions: refresh, blacklist, unblacklist
- [ ] Cannot edit metadata directly (source of truth stays TMDB)

### 11.e User lookup

- [ ] Search by id, email, Telegram username
- [ ] View identities, signals, ratings, recent sessions, recent chat (redacted body preview)
- [ ] Actions: revoke sessions, mute bot access, mark spam, issue role (only for admins)
- [ ] Never show plaintext chat content in list views; only on a detail page with an audit log row written on access

### 11.f Feature flags

- [ ] Simple KV in DB: `flags(name, enabled, rollout_percent, audience)`
- [ ] Helper `isEnabled(name, userId)` supports gradual rollout by `hash(userId)`
- [ ] Useful flags: `chat_enabled`, `descriptive_search_enabled`, `bot_chat_enabled`

## Data model additions

```sql
user_reports(
  id bigserial primary key,
  reporter_user_id uuid references users(id) on delete set null,
  report_type text not null,
  subject_title_id bigint,
  subject_event_id bigint,
  message text,
  status text not null default 'open',    -- 'open' | 'resolved' | 'dismissed'
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id)
);

title_blacklist(
  title_id bigint primary key references titles_cache(id) on delete cascade,
  scope text not null,                    -- 'global' | 'country:<iso>'
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

feature_flags(
  name text primary key,
  enabled boolean not null default false,
  rollout_percent int not null default 0, -- 0..100
  audience jsonb,                         -- optional: {roles: [...], userIds: [...]}
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

audit_log_admin(
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_user_id uuid not null,
  action text not null,
  target text,                            -- free-form: 'user:uuid' | 'title:123' | 'flag:xyz'
  detail jsonb
);
```

## Work breakdown

### 11.1 Admin shell

- [ ] Route group `/admin/*` in web app
- [ ] Role guard middleware
- [ ] Top-nav with sections: Overview, Users, Content, Reports, Onboarding, Flags, Audit
- [ ] 2FA enforcement for `admin`

### 11.2 Dashboards

- [ ] SQL queries in `packages/analytics` with parameterized date ranges
- [ ] Materialize heavy aggregates into `analytics_daily` tables refreshed hourly
- [ ] Charts on dashboard pages

### 11.3 Report workflow

- [ ] User-facing "Report" button on title card and chat message → writes `user_reports`
- [ ] Admin queue with filter by type/status
- [ ] Resolution actions (blacklist, refresh, note)

### 11.4 Title cache tools

- [ ] Force-refresh button calls Phase 3 job queue
- [ ] Blacklist toggle

### 11.5 User tools

- [ ] Lookup endpoints (server-side only; no data leaves the admin page)
- [ ] Action buttons issue audited mutations
- [ ] Access to chat content requires a reason-string that is stored in audit log

### 11.6 Feature flag engine

- [ ] `isEnabled(name, user)` helper
- [ ] Admin page to toggle flags + rollout percent
- [ ] Stats: feature-enabled active users

### 11.7 Alerting

- [ ] Simple thresholds (e.g., `not_for_me` rate >25%, TMDB error rate >5%)
- [ ] Post to a Slack/Discord webhook or send email

## API surface

Admin endpoints live under `/admin/api/*` and require role checks. Examples:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/api/overview` | Top-line metrics |
| GET | `/admin/api/funnel/onboarding` | Funnel data |
| GET | `/admin/api/reports?status=open` | Report queue |
| POST | `/admin/api/reports/:id/resolve` | Resolve a report |
| POST | `/admin/api/titles/:id/blacklist` | Blacklist |
| POST | `/admin/api/titles/:id/refresh` | Refresh cache |
| GET | `/admin/api/users/:id` | User detail |
| POST | `/admin/api/users/:id/mute-bot` | Mute |
| POST | `/admin/api/flags/:name` | Update flag |

## Acceptance criteria

- Admin dashboards load in <1s for the default 7-day window
- A non-admin cannot reach any `/admin/*` page or endpoint
- Every admin mutation writes to `audit_log_admin`
- Reports submitted from web and bot both appear in the queue
- Blacklisting a title removes it from subsequent feeds within one rec cycle
- Feature flag rollout percent changes take effect on next request (no deploy required)
- Chat content is never shown in a list view; audit row exists for each open

## Dependencies

- All MVP phases stable
- Real usage to populate meaningful analytics
- Webhook URL for alerts

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Admin becomes a day-job | Keep scope minimal; automate with flags and CLI for edge cases |
| Vocab edits cause engine drift | Vocab changes go through the repo via PR generator |
| Admin access abuse | 2FA + audit log + monthly access review |
| Dashboard queries get slow | Daily aggregates; query cost caps |

## Estimated effort

**L (2–3 weeks).** Value is in what you *don't* build — stay lean.
