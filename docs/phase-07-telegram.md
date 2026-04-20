# Phase 7 — Telegram Bot MVP Integration

## Goal

Bring the same recommendation system into Telegram as a first-class client of the existing backend — not a separate product. Every bot interaction reads/writes the same `users`, `preference_signals`, and `user_titles` rows. A Telegram user who goes through `/start` gets the same kind of profile a web guest gets, and Phase 8 later lets them link it to a web account.

## Scope

In scope:

- Bot registration with BotFather
- Webhook deployment (or long-polling fallback for dev)
- `/start` onboarding flow via inline buttons
- Language selection
- Title-based taste capture (same tree as Phase 4, rendered as button flows)
- Rating interactions
- Recommendation delivery (`/recommend`)
- Title search (`/search`)
- Title lookup via inline query (optional)
- User identity creation via Telegram ID
- Shared data writes to central DB

Out of scope:

- Account linking with web (Phase 8)
- AI chat in Telegram (Phase 9)
- Admin moderation of bot usage (Phase 11)

## Architectural position

The bot is a **thin client**. It does not own:

- User records
- Preference signals
- Recommendation logic

It only:

- Converts Telegram updates → API calls
- Renders API responses as Telegram messages / inline keyboards
- Maintains a small in-memory conversation state (step + pending data) keyed by `(chat_id, user_id)`

State persistence for in-progress onboarding lives in the same `onboarding_sessions` table used by web.

## Tech choices

| Concern | Choice |
|---------|--------|
| Library | `grammy` (TypeScript, modern, plugin-friendly) |
| Transport | Webhook in prod, long-polling in dev |
| Deployment | Same `apps/bot` process; shares backend via internal HTTP or shared `core` package |
| Conversation state | Redis (short TTL) — resumable from `onboarding_sessions` if lost |
| Rate limiting | Token bucket per `telegram_user_id` |
| Inline keyboards | Preferred over free-text for every answer |

## Identity creation

On first bot contact (`/start` or any command):

1. Resolve `telegram_user_id` from update
2. Look up `auth_identities` row where `provider='telegram'` and `provider_subject=telegram_user_id`
3. If exists → load user
4. If not → create `users` row (`is_guest=true`, `display_name = telegram.first_name`) and an `auth_identities` row
5. Any later message reuses that mapping

The `sessions` table is **not** used for bot — Telegram is itself the authenticated channel. Instead, each API call from the bot carries a server-to-server token plus a `user_id` resolved internally.

## Command surface

| Command | Purpose |
|---------|---------|
| `/start` | Welcome, language selection, onboarding CTA |
| `/onboarding` | Start or resume onboarding |
| `/recommend` | Deliver N recommendations |
| `/search <query>` | Title search |
| `/watched` | Show watched + rating buttons |
| `/taste` | Show extracted taste profile |
| `/language` | Change locale |
| `/link` | Start web-linking flow (full implementation in Phase 8; placeholder here) |
| `/help` | Command list |

## Interaction patterns

All answer-giving is via inline keyboards. Free text is allowed only for:

- `/search <query>` (explicit command argument)
- Display name update (if user chooses)

Answer buttons encode the answer in `callback_data` using a compact schema:

```
ob:<sessionId>:<stepKey>:<answerKey>
rt:<titleId>:<rating>
rec:<eventId>:<titleId>:<action>      # action ∈ add, no, open
lang:<locale>
```

`callback_data` has a 64-byte limit — keep ids short (use UUIDs' first 8 chars, validate uniqueness per session).

## Flows

### `/start` → language → onboarding offer

```
Bot: Hi! Choose your language:  [English] [မြန်မာ]
User: taps English
Bot: Great. I'll help you find movies and series you'll love.
     Shall we do a 3-minute taste check?  [Yes, let's go] [Maybe later]
```

### Onboarding step: title reaction

```
Bot: You picked "Inception". How did you feel about it?
     [⭐️1] [⭐️2] [⭐️3] [⭐️4] [⭐️5] [Didn't finish]
User: taps ⭐️5
Bot: What made it great? (pick all that apply)
     [Story] [Pacing] [Visuals] [Characters] [Soundtrack]
     [Done ✓]
```

- Each tap toggles the selection (update message with ✓ prefix)
- `[Done ✓]` sends the full answer to `POST /api/onboarding/answer`

### Recommendation delivery

```
Bot: Here are picks for you:

📽  Tenet (2020) — 7.3/10
Why: you liked Inception; you prefer heist and mind-bending themes.
[Open] [Add] [Not for me]

📽  Arrival (2016) — 7.9/10
Why: you like cerebral sci-fi with emotional weight.
[Open] [Add] [Not for me]
...
```

Sent as separate messages or one message per title so buttons can be attached cleanly. Cap at 5 per `/recommend` to avoid flooding.

### Rating an existing title

```
Bot (from /watched): Inception (2010)
                    Your rating: ⭐️⭐️⭐️⭐️⭐️  [Edit]
User: taps Edit
Bot: Re-rate Inception:  [⭐️1] [⭐️2] [⭐️3] [⭐️4] [⭐️5]
```

## Rendering rules

- **Markdown**: use MarkdownV2 consistently; escape user input
- **Burmese**: no markdown italic/bold in Burmese text (render plain to avoid breaking fonts)
- **Images**: posters sent via `sendPhoto` with caption; cache Telegram `file_id` per title to avoid re-uploading
- **Keyboards**: never mix inline and reply keyboards in the same flow; stick to inline

## Work breakdown

### 7.1 Bot scaffolding

- [ ] `apps/bot` with grammy
- [ ] Webhook handler mounted under api process or separate (depending on infra)
- [ ] BotFather setup; webhook URL configured
- [ ] Shared `core` imports from monorepo

### 7.2 Identity resolution

- [ ] Middleware that, on every update, resolves or creates the Telegram user
- [ ] Adds `ctx.user` with `{id, preferredLocale, isGuest}`
- [ ] Uses Phase 2 `auth_identities` table

### 7.3 Conversation state

- [ ] Redis keyed by `bot:conv:{chatId}:{userId}` with TTL 1h
- [ ] Store current step and ephemeral selections (e.g., toggled answer buttons)
- [ ] On resume after TTL expiry, reload from `onboarding_sessions.progress`

### 7.4 Commands

- [ ] `/start`, `/language`, `/onboarding`, `/recommend`, `/search`, `/watched`, `/taste`, `/help`
- [ ] `/link` placeholder: "Coming soon" until Phase 8

### 7.5 Onboarding rendering

- [ ] Question tree → keyboard builder
- [ ] Title search: user types after `/search` or tapping "Add a title you've seen"
- [ ] Answer toggling: update inline keyboard on each tap
- [ ] "Done" confirms answer and advances

### 7.6 Recommendation rendering

- [ ] Calls Phase 5 feed endpoint
- [ ] Renders N items with photos + inline keyboards
- [ ] `Not for me` calls the feedback endpoint and offers one more replacement

### 7.7 Rate limiting

- [ ] Token bucket: 30 updates / minute per Telegram user
- [ ] Backoff on 429 from Telegram API (grammy handles most of this)

### 7.8 i18n

- [ ] Bot uses `packages/i18n` catalog with namespace `bot.*`
- [ ] Locale comes from `ctx.user.preferredLocale` (resolved at identity step)

### 7.9 Error handling

- [ ] Global error hook posts user-facing "Something went wrong, try again"
- [ ] Errors logged with `telegram_user_id` and update payload hash

### 7.10 Testing

- [ ] Unit tests for keyboard builders and callback_data parsers
- [ ] Integration test: replay a scripted update sequence against a test bot token in dev

## Data model touches

No new tables. New usage of:

- `auth_identities` with `provider='telegram'`
- `onboarding_sessions` / `onboarding_answers`
- `preference_signals` / `user_titles`
- `recommendation_events` with `source='tg_feed'`

## API surface

Bot does not introduce new public endpoints; it is an internal client. May introduce:

- `POST /internal/bot/resolve-user` — resolve/create user from Telegram payload (server-to-server, auth header `X-Bot-Token`)

## Acceptance criteria

- `/start` creates a user and invites onboarding in the user's selected language
- Completing onboarding via the bot writes the same signals as the web flow would
- `/recommend` returns personalized items with reasons derived from the same Phase 5 engine
- Rating via `/watched` updates signals; next `/recommend` reflects the change
- Telegram user exists as a standalone account (Phase 8 is where linking to Google becomes possible)
- No free-text answer is required outside `/search <query>` and display-name update
- Bot survives 1h Redis outage: onboarding can be resumed (backed by DB)
- Rate limiter prevents more than 30 updates/min from single user

## Dependencies

- Phases 2, 3, 4, 5 complete
- Bot token from BotFather
- Webhook endpoint publicly reachable with TLS
- Redis for conversation state

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `callback_data` 64-byte limit overflows | Compact key scheme; short session prefixes |
| Webhook outage loses updates | Use `getUpdates` fallback or setup failover; Telegram retries on failure |
| Poster spam hits upload limits | Cache `file_id` per title after first upload |
| Users bypass onboarding and request `/recommend` | Engine handles cold-start; bot nudges toward onboarding |
| Markdown escaping bugs in Burmese | Escape using grammy helpers; keep Burmese plain text |
| Same person using both bot and web without linking, then confusion | Link flow (Phase 8) resolves; before then, they are separate accounts by design |

## Estimated effort

**L (2–3 weeks).** The hard work is UX choreography in a constrained medium, not the backend.
