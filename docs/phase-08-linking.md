# Phase 8 — Web and Telegram Account Linking

## Goal

Let a person who has used the WebApp (as guest or Google user) and the Telegram bot combine their two separate `users` rows into a single account. The surviving account inherits watched list, ratings, and preference signals from both sides. Linking is **user-initiated, token-based, auditable, and irreversible in one click** — but fully auditable and with a safety prompt on conflicting data.

## Scope

In scope:

- "Link Telegram" page on web
- One-time code generation with short TTL
- `/link <code>` command in the bot
- Server-side verification and merge
- Merge rules for overlapping data (e.g., both sides rated the same title differently)
- Audit logging
- Unlink flow (rare but needed — for future, implement basic form)
- Prevention of double-linking (one Telegram account may link to exactly one web user at a time, and vice versa)

Out of scope:

- Multi-Google on one account (not requested)
- Link via deep link (Telegram t.me URL) — can come later; code flow first

## User flow

```
┌──────── WEB ────────┐                       ┌──── TELEGRAM ─────┐
1. Sign in with Google                         (user has onboarded the bot)
2. /profile/identities → "Link Telegram"
3. Web generates 6-char code                    4. User taps "Link account"
   Displays: ABC123 (valid 10 min)                 or sends /link ABC123
4. POST /api/link/start → code
                                                5. Bot verifies code with backend
                                                   POST /internal/bot/link/verify
                                                6. Backend merges users (tg → web)
                                                7. Bot replies: "Linked!"
└─────────────────────┘                       └───────────────────┘
Web polls or uses SSE to detect success; flips UI to "Linked with @username"
```

## Merge rules

Always merge the **Telegram-side user into the web-side user**. The web user is canonical after linking because (a) it usually holds the Google identity and (b) it is the point where most long-form interaction happens.

For each owned table:

| Table | Rule |
|-------|------|
| `auth_identities` | Reparent TG identity to web user_id |
| `user_titles` | Rating conflict: keep the higher-rated side if both present; attach a merge note; pick the more recent `status` |
| `preference_signals` | Union; where same `(dim, value, polarity, source)` exists, keep higher weight; re-run aggregation to rebuild `user_preference_profile` |
| `onboarding_sessions` / `answers` | Reparent all; do not attempt to blend answer sets |
| `recommendation_events` | Reparent all |
| `recommendation_interactions` | Reparent all |

> The reparent-all helper (Phase 2.5) is reused. Linking = `merge(tgUserId, webUserId)`.

**Conflict preview**: before the merge commits, the API returns a summary of conflicts. If there are any (same title rated differently), the web UI shows a confirmation screen:

```
Heads up — you rated Inception differently on each account:
  Web: ⭐️⭐️⭐️⭐️
  Telegram: ⭐️⭐️⭐️⭐️⭐️
We'll keep the higher rating (⭐️⭐️⭐️⭐️⭐️).
[Continue]  [Cancel]
```

Auto-continue for conflict-free cases.

## Security model

- Code is 6 base32 characters (no ambiguous chars: no 0, O, 1, I) → ~1 billion codes; short enough to type, long enough to brute-force infeasibly in 10 minutes
- Server-side rate limit: max 5 bot verifications per Telegram user per hour
- Single-use: verifying a code invalidates it
- TTL: 10 minutes
- Code is bound to the initiating web session at issuance time — must match at verification
- Audit row written on issue, verify, success, failure

## Data model additions

```sql
link_codes(
  code text primary key,                   -- 6 char
  issuing_user_id uuid not null references users(id) on delete cascade,
  issuing_session_id uuid not null references sessions(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references users(id),
  status text not null default 'active'   -- 'active' | 'consumed' | 'expired' | 'revoked'
);
create index on link_codes(issuing_user_id, status);

audit_log_link(
  id bigserial primary key,
  at timestamptz not null default now(),
  event text not null,                     -- 'code_issued' | 'code_verified_ok' | 'code_verified_fail' | 'merge_completed' | 'unlink'
  web_user_id uuid,
  tg_user_id uuid,
  detail jsonb
);
```

## Work breakdown

### 8.1 Web page (`/profile/identities`)

- [ ] UI state: `Not linked` | `Code active (shows code + countdown)` | `Conflict preview` | `Linked with @username`
- [ ] "Generate code" button (disabled if identity already linked)
- [ ] Countdown timer; regenerate if expired
- [ ] After code is verified, page either auto-transitions (SSE) or user clicks "Check status"
- [ ] Conflict summary screen with cancel option

### 8.2 Code issuance

- [ ] `POST /api/link/start` → returns `{code, expiresAt}`
- [ ] Guards: user must not already have a linked Telegram identity
- [ ] Uses CSPRNG; avoids ambiguous chars
- [ ] Stores row in `link_codes`

### 8.3 Bot verification

- [ ] `/link ABC123` in bot
- [ ] Calls `POST /internal/bot/link/verify` with `{code, telegramUserId}`
- [ ] Backend steps:
  1. Load code row; check status=active, not expired
  2. Mark `consumed_at`, `consumed_by_user_id = tgUserId` atomically
  3. Compute merge conflicts (return them to bot for preview only if interactive approval is wanted — MVP skips approval in bot and forwards to web for confirmation)
  4. If bot is in "approve on web" mode: return `needsApproval=true`; web flips to conflict preview; user taps Continue → `POST /api/link/confirm` runs merge
  5. If no conflicts: merge immediately and return `linked=true`
- [ ] Bot replies with appropriate message

### 8.4 Merge execution

- [ ] `link/confirm` endpoint (or internal step) calls `merge(tgUserId, webUserId)`
- [ ] On success: audit `merge_completed` with summary of reparented row counts
- [ ] Rebuild `user_preference_profile` for the surviving user
- [ ] Invalidate rec feed cache

### 8.5 Status polling / SSE

- [ ] `GET /api/link/status?code=ABC123` returns state
- [ ] Web polls every 2s while code is active (simpler than SSE for MVP)

### 8.6 Unlink (minimal)

- [ ] `DELETE /api/link/telegram` → removes the telegram identity row; audits `unlink`
- [ ] Does not try to split merged data back (impossible by design); warns user

### 8.7 Conflict detection helpers

- [ ] `computeLinkConflicts(tgUserId, webUserId)` — returns arrays of rating conflicts, status conflicts
- [ ] Unit tests cover: matching ratings, mismatched ratings, one-sided ratings, overlapping watchlists

## API surface

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/link/start` | Issue code (web, auth required) |
| GET | `/api/link/status?code=` | Poll link state |
| POST | `/api/link/confirm` | Run the merge after conflict preview |
| DELETE | `/api/link/telegram` | Remove link |
| POST | `/internal/bot/link/verify` | Bot-side verification (server-to-server) |

## Acceptance criteria

- Issuing a code returns a 6-char code that expires in 10 minutes
- A verified code cannot be verified again
- Linking merges preference signals and watched titles; web user sees both datasets after
- A rating conflict triggers the preview screen; accepting keeps the higher rating
- Audit rows exist for every code issue, verify (pass/fail), and merge
- A Telegram account already linked to one web user cannot be linked to another without explicit unlink
- A web user with an existing Telegram identity cannot issue a new code
- Invalid, expired, or consumed codes each produce distinct bot responses

## Dependencies

- Phase 2 identity + merge helper
- Phase 7 bot online and handling commands
- Redis (for code rate limiting)

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Phishing: someone tricks a user into typing a code in the bot | Code is useless without the user's own web session having issued it; 10-min TTL; audit |
| Accidental merge of wrong accounts (user confusion) | Conflict preview on web; require explicit confirm when conflicts exist |
| Merge is slow and partial | Single DB transaction; rollback on any error; no external side effects inside tx |
| Orphaned sessions after merge | Revoke sessions of the merged-away user |
| User wants to unlink and re-link to a different account | Allowed; audit logs show history; data stays on the current user |

## Estimated effort

**M (1.5–2 weeks).** Merge + conflict logic is the bulk; UI is small.
