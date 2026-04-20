# Phase 2 — Core Account and Identity System

## Goal

Create a single, unified user identity so that a guest, a Google-logged-in web user, and (later) a Telegram user can all map to one internal `user_id`. The identity model must be **merge-safe from day one** because we will link Telegram → web account in Phase 8, and because guests will upgrade to logged-in users.

## Scope

In scope:

- Guest mode (anonymous but persistent via cookie)
- Google OAuth login flow on web
- Session handling (cookie-based, server-issued)
- `users` + `auth_identities` tables fully fleshed out
- Guest → Google upgrade path (merge guest activity into permanent account)
- Telegram identity scaffolding (no bot yet; table shape and merge rules only)
- Profile view (read/write display name and preferred locale)

Out of scope:

- Bot itself (Phase 7)
- Account linking one-time code flow (Phase 8)
- AI chat auth concerns (Phase 9)

## Identity model principles

1. **`users.id` is the single source of truth.** Never join on provider subject.
2. **An `auth_identity` row = one credential belonging to one user.** A user may have many identities (guest+google+telegram).
3. **Guests are real users** with `is_guest=true`. Upgrading a guest = marking the user `is_guest=false` and adding a google identity. The `user_id` is preserved — watch history, ratings, and preferences remain.
4. **Merging two users happens only when a Google login collides with an existing Google identity.** In that case, the *other* session's guest data is reparented to the canonical user and the guest user is soft-deleted.
5. **Linking (Phase 8) never silently destroys data.** Conflicts produce an explicit audit row and a user-facing prompt.

## Work breakdown

### 2.1 Database: finalize identity schema

Extend Phase 1 tables:

```sql
users(
  id uuid primary key,
  created_at timestamptz not null default now(),
  display_name text,
  preferred_locale text not null default 'en',
  is_guest boolean not null default true,
  merged_into_user_id uuid references users(id),  -- soft-delete pointer
  deleted_at timestamptz
);

auth_identities(
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,                 -- 'guest' | 'google' | 'telegram'
  provider_subject text not null,
  email text,                             -- google only
  email_verified boolean,
  telegram_username text,                 -- telegram only, filled in Phase 7
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unique(provider, provider_subject)
);

sessions(
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,                 -- which identity opened this session
  ip inet,
  user_agent text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

audit_log_identity(
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_user_id uuid,
  event text not null,                    -- 'guest_created' | 'google_login' | 'guest_upgraded' | 'user_merged' | ...
  detail jsonb
);
```

### 2.2 Guest mode

- [ ] On first visit (no session cookie), the API issues a guest:
  1. Create `users` row (`is_guest=true`)
  2. Create `auth_identities` with `provider='guest'`, `provider_subject = random 128-bit token`
  3. Create `sessions` row, set `sid` httpOnly secure cookie
- [ ] Guest sessions expire after 90 days of inactivity (rolling)
- [ ] Guest upgrade: if a logged-in Google identity attaches to the same session, migrate the user row in place (do not create a new user)

### 2.3 Google OAuth flow

- [ ] Route: `GET /auth/google/start` → redirect to Google with `state` (signed, includes current `session.id`)
- [ ] Route: `GET /auth/google/callback` → verify state, exchange code, fetch profile
- [ ] Decision tree on callback:

  ```
  let googleIdentity = findByProviderSubject('google', sub)
  let sessionUser    = currentSessionUser() // may be guest

  if googleIdentity && sessionUser && googleIdentity.user_id != sessionUser.id:
      # Collision: logged-in Google account already exists; guest data needs merging
      merge(sessionUser -> googleIdentity.user_id)
      setSession(googleIdentity.user_id)
      audit('user_merged', {from: sessionUser.id, into: googleIdentity.user_id})

  elif googleIdentity:
      setSession(googleIdentity.user_id)
      audit('google_login')

  elif sessionUser && sessionUser.is_guest:
      # Upgrade in place
      update users set is_guest=false, display_name=google.name where id=sessionUser.id
      insert auth_identities (provider='google', ...)
      audit('guest_upgraded')

  else:
      # New user, no session context
      create users + auth_identities + session
      audit('google_login')
  ```

- [ ] All branches idempotent — replaying the callback does not duplicate rows
- [ ] PKCE enabled

### 2.4 Session handling

- [ ] Server-side sessions, not JWT (simpler revocation)
- [ ] Cookie: `sid`, httpOnly, secure, sameSite=lax, path=/
- [ ] Rolling expiry: every request within window extends `expires_at`
- [ ] `GET /api/me` returns the current user (`{id, displayName, isGuest, identities: ['guest','google'], locale}`)
- [ ] `POST /api/auth/logout` revokes the session but leaves the user row (so they could log back in)

### 2.5 User merge helper (internal)

Implemented applying the **transactional core + async processing** architectural rule. The core identity merge must be fully transactional in `packages/core/identity/merge.ts`:

```
merge(sourceUserId, targetUserId):
  tx:
    # 1. Critical identity reparenting in core transaction
    update auth_identities set user_id=target where user_id=source and provider != 'google'
    update sessions set user_id=target where user_id=source
    update users set merged_into_user_id=target, deleted_at=now() where id=source
    audit('user_merged', {source, target})
    
    # 2. Publish Domain Event to Redis Job Queue
    publish(UserMergedEvent {source, target})
```

The helper must be **safe and auditable**. Secondary recalculations (reparenting onboarding answers, heavy ratings tables, or re-indexing watch histories) should be handled asynchronously via the `UserMergedEvent` worker jobs whenever scale demands, though early implementation can keep light tables in the core transaction.

Clarification for test coverage:

- Central identity rows must be asserted inside the direct merge unit test.
- Event workers handling the propagation to child domains (e.g., `onboarding_answers`) must be covered by integration tests confirming the message queue consumer processes them correctly.

### 2.6 Profile endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/me` | Returns user summary; creates guest if none |
| PATCH | `/api/me` | Update `displayName`, `preferredLocale` |
| GET | `/api/me/identities` | List attached identities (redacted subjects) |
| POST | `/api/auth/logout` | End current session |

### 2.7 Telegram identity scaffolding

No bot code yet. Only:

- [ ] `auth_identities.provider = 'telegram'` is a valid value with `provider_subject = telegram_user_id`
- [ ] `merge()` accepts telegram-provider rows
- [ ] Reserve column `telegram_username` (nullable)

### 2.8 Web UI additions

- [ ] "Continue as guest" on home page (actually a no-op beyond showing app — cookie already issued)
- [ ] "Sign in with Google" button in top bar
- [ ] Account menu: display name, locale toggle, logout
- [ ] Upgrade banner for guests on key surfaces ("Save your taste — sign in")

## API surface (Phase 2)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/google/start` | Begin OAuth |
| GET | `/auth/google/callback` | OAuth callback |
| POST | `/api/auth/logout` | End session |
| GET | `/api/me` | Current user |
| PATCH | `/api/me` | Update profile |
| GET | `/api/me/identities` | List identities |

## Acceptance criteria

- Fresh browser: first request produces a guest user and session cookie
- Guest can set `preferredLocale` and it persists across browser restarts
- "Sign in with Google" as a guest upgrades the same `user_id` (verified via DB query)
- Signing in with Google in a brand-new browser creates a fresh user
- Signing in with Google on a guest session where that Google identity already exists merges the guest into the existing user, and `merged_into_user_id` points to the surviving row
- `GET /api/me` works for guests and logged-in users
- All identity state changes produce audit rows
- Unit test: enumerate every `user_id` column in schema and assert `merge()` handles it

## Dependencies

- Phase 1 schema + auth scaffolding
- Google OAuth client ID + secret provisioned
- `SESSION_SECRET` generated and stored as env var
- Cookie domain decided (apex vs subdomain)

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Data loss during guest-upgrade race condition | Wrap every upgrade/merge in a single DB transaction; serialize on `users.id` |
| Two tabs race: one upgrades, one does not | Session cookie is the pivot; both tabs share it — safe |
| Google returns email-only, no `sub` (shouldn't happen) | Reject auth and log; require `sub` |
| Future phases forget to reparent their tables | Reparent-all test (see 2.5) |
| Abusive guest creation (many cookies) | Rate-limit guest creation by IP |

## Estimated effort

**M (1.5–2 weeks).** The merge logic deserves careful testing; rest is routine.
