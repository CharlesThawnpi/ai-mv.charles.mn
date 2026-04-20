# Phase 9 — AI-Assisted Chat and Taste Refinement

## Goal

Add AI where it genuinely helps: interpreting vague requests ("I want something quiet but not sad"), explaining why a recommendation fits, and proposing taste refinements — **without making the product dependent on an LLM.** The structured engine from Phase 5 remains authoritative. The AI becomes a smart front door and a refiner, not the brain.

## Scope

In scope:

- AI chat UI on web and in Telegram
- "Find me a movie like…" mode
- Mood/vibe request parsing
- Recommendation explanations (optional LLM polishing of Phase 5 reasons)
- Free-text taste capture → proposed signals → user confirmation before saving
- Chat message logging
- Confidence-based preference storage
- Guardrails against hallucinated titles

Out of scope:

- Multi-turn task agents
- Voice
- AI-driven search (Phase 10)

## Design rules

1. **The LLM never writes to `preference_signals` directly.** It proposes; the user accepts, the system writes (with `source='chat_confirmed'`, `confidence≥0.8`).
2. **The LLM never invents titles.** Title mentions must be resolved against our content layer (Phase 3) before rendering. Unresolved mentions are dropped or marked.
3. **Every recommendation still comes from the engine.** The LLM picks the seed context and re-narrates; it does not rank.
4. **All chat is cheap.** Default to Haiku-class models; upgrade to stronger only for explicitly harder operations. Always cache prompts and reuse message history selectively.
5. **No PII leaves the backend.** User messages may mention real people's names, but the prompt is scoped; we never send user identity.

## Architecture

```
        ┌─────────────┐
User -> │ Chat client │  (web or bot)
        └──────┬──────┘
               │ POST /api/chat/messages
               ▼
        ┌─────────────┐       1. classify intent (local tiny classifier or small LLM)
        │ Chat router │       2. pick handler: 'find_similar'|'mood_request'|'explain_rec'|
        └──────┬──────┘          'propose_taste'|'smalltalk'
               ▼
        ┌───────────────────────────────────────────────┐
        │ Handler (deterministic wrapper)               │
        │  - loads profile                              │
        │  - queries engine / content DB                │
        │  - assembles grounded context                 │
        │  - calls internal **LLM Gateway**             │
        │  - returns structured message                 │
        └───────────────────────────────┬───────────────┘
                                        ▼
                                 ┌──────────────┐
                                 │ LLM Gateway  │ -> Routes to Anthropic / OpenAI / Local
                                 └──────────────┘
```

## Chat turn lifecycle

1. **Classify intent** — cheap call or rule-based. Allowed intents:
   - `find_similar_to_title`
   - `mood_request`
   - `explain_recommendation`
   - `taste_refinement` (e.g., "I'm growing bored of superhero stuff")
   - `title_lookup`
   - `smalltalk` / `other` (polite deflect)
2. **Ground** — look up referenced titles, load current profile snapshot
3. **Tool call** — deterministic tools:
   - `searchTitles(query) -> Title[]`
   - `recommend({constraints, seeds}) -> RecEvent`
   - `getTitleDetail(id) -> Title`
   - `proposeSignalsFromText(text) -> Signal[] (low confidence)`
4. **LLM step (optional)** — format output, refine phrasing. Model sees only the structured context it needs
5. **Validate** — every title mention is cross-checked against the engine's output; unknown titles are stripped
6. **Persist** — chat messages + any signals the user confirms

## Free-text → signals

Example turn:

```
User: I love stuff with quiet tension, single-location thrillers, slow reveals.
Bot:  Got it. I'm hearing a lean toward these traits — confirm which feel right:
      [ ] pace: slow-burn
      [ ] tone: tense
      [ ] theme: single-location
      [ ] theme: psychological
      [✓ Save selected]  [Skip]
```

- Tapping save writes `preference_signals` with `source='chat_confirmed'`, `confidence=0.9`
- Dismissing = nothing written
- If the user simply talks and does not confirm, the system can still keep *shadow signals* (`confidence=0.4`, `source='chat_inferred'`) that influence a specific recommendation event but expire after 7 days if unconfirmed

## Guardrails

- **Title hallucination**: before rendering, scan LLM output for title phrases; require each to resolve via `searchTitles`. If no match → replace with a generic "[a similar title]" or drop. Log cases for review.
- **Prompt injection** via user message: treat user text as data only; never let it change the tool schema. The LLM is given a system prompt plus a `USER_MESSAGE` field that is unambiguously marked.
- **Sensitive topics**: if the user requests extreme content already in their `no-go` list, surface refusal with explanation referencing their own setting.
- **Cost**: per-user cap on chat calls per day (e.g., 50) to avoid abuse.

## Models & LLM Gateway

The architecture mandates an **internal LLM Gateway / AI Service Layer**. The system must never be deeply coupled to a single provider's SDK. Provider selection, rate limits, and fallbacks are handled centrally by this gateway.

*Implementation recommendation (example only):*
- Default: **Claude Haiku 4.5** for intent classification, signal extraction, light phrasing.
- Stronger: **Claude Sonnet 4.6** for longer synthesis if the faster model misses nuance.

*Future-proof rule:* The backend architecture supports swapping to OpenAI, Gemini, or local models dynamically without rewriting the chat handler logic. The frontend never holds API keys. Use **prompt caching** strategies centrally in the gateway.

## Data model additions

```sql
chat_conversations(
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  source text not null,                    -- 'web' | 'telegram'
  started_at timestamptz not null default now(),
  last_message_at timestamptz
);

chat_messages(
  id bigserial primary key,
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role text not null,                      -- 'user' | 'assistant' | 'tool'
  content jsonb not null,                  -- {text, toolCalls?, toolResults?, titleRefs?}
  model text,                              -- null for user messages
  tokens_input int,
  tokens_output int,
  cost_micros bigint,
  created_at timestamptz not null default now()
);
create index on chat_messages(conversation_id, created_at);

chat_proposed_signals(
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  message_id bigint not null references chat_messages(id) on delete cascade,
  signal jsonb not null,                   -- {dimension, value, polarity}
  status text not null default 'pending', -- 'pending' | 'accepted' | 'dismissed' | 'expired'
  decided_at timestamptz
);
```

> Reparent-all (Phase 2.5) must cover `chat_conversations`, `chat_messages`, `chat_proposed_signals`.

## Web chat surface

- Route: `/[locale]/chat`
- Conversation list (left on desktop, drawer on mobile)
- Input at bottom; send on Enter (Shift+Enter for newline)
- Assistant messages support:
  - Plain text
  - Title cards (same component as feed) with actions
  - Proposed-signal chips with checkboxes + Save
- "This was helpful / not helpful" on each assistant message

## Telegram chat surface

- Any non-command text message to the bot enters chat mode
- Same backend routes; replies use inline keyboards for signal confirmation
- Long assistant replies split across messages; title cards are separate `sendPhoto` messages

## Work breakdown

### 9.1 Chat infrastructure

- [ ] `packages/core/chat` with intent classifier, handlers, tool registry
- [ ] `packages/core/ai` — thin wrapper around Anthropic SDK with caching, retries, cost accounting
- [ ] Chat conversation + message endpoints

### 9.2 Intent classifier

- [ ] Start with rule-based (regex + keyword) for `find_similar_to_title`, `title_lookup`, `smalltalk`
- [ ] Fall back to Haiku for ambiguous messages with a constrained enum output schema

### 9.3 Handlers

- [ ] `find_similar_to_title`: extract title, call engine seeded with that title, return top 5
- [ ] `mood_request`: extract mood adjectives, map to signal dimensions (tone/pace/theme), call engine with a temporary overlay on top of profile
- [ ] `explain_recommendation`: given `{titleId, eventId}`, produce a natural-language version of the engine's reason array
- [ ] `taste_refinement`: call `proposeSignalsFromText` and present chips for confirmation
- [ ] `title_lookup`: search and return a card
- [ ] `smalltalk`: short, friendly, redirect to useful actions

### 9.4 Signal proposal pipeline

- [ ] LLM prompt asks for a JSON array of `{dimension, value, polarity, rationaleSnippet}` from user text
- [ ] Validate each proposal against the canonical dimension/value enum; drop unknowns
- [ ] Store as `chat_proposed_signals`; surface to user with confirm/dismiss

### 9.5 Confidence-aware engine use

- [ ] Engine (Phase 5) already supports `confidence` in signal weights. Ensure inferred/unconfirmed signals contribute proportionally lower weight.
- [ ] New parameter `recommend({overlaySignals})` adds temporary signals for a single call (mood requests).

### 9.6 Cost and quota

- [ ] Per-user quota (reset daily) on chat calls
- [ ] Soft limit → user sees "Taking a short break from deep chat today; still here for quick lookups"
- [ ] Hard limit → read-only chat view

### 9.7 Observability

- [ ] Log every LLM call with latency, tokens, cost, success/fail
- [ ] Weekly view in admin (Phase 11) of top models + cost per user

## API surface

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/conversations` | Start a new conversation |
| GET | `/api/chat/conversations` | List |
| POST | `/api/chat/messages` | Send message, get assistant reply |
| POST | `/api/chat/signals/:id/accept` | Accept a proposed signal |
| POST | `/api/chat/signals/:id/dismiss` | Dismiss |

## Acceptance criteria

- "Find me something like Parasite but lighter" returns engine-backed suggestions, not LLM-invented titles
- Saying "I like slow-burn thrillers" shows a Save-selected prompt with matching slugs; accepting writes signals with confidence=0.9
- Explaining a recommendation reuses Phase 5 reasons as grounded facts
- No title ever appears in a chat response if it is not in `titles_cache`
- Assistant message payloads include structured `titleRefs[]` that link to our IDs
- Daily chat quota enforced; exceeding it produces a graceful downgrade
- Chat history persists across sessions and across platforms after linking (Phase 8)

## Dependencies

- Phases 4, 5, 6, 7 stable
- Anthropic API key provisioned
- Prompt caching enabled
- Canonical value enum for signal dimensions finalized (so LLM outputs can be validated)

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Hallucinated titles | Strict post-validation against content layer; drop unresolved |
| Cost surprises | Per-user quota, caching, cheap default model |
| LLM outputs in the wrong language | Include user locale in system prompt; return 400 + retry if mismatched |
| Users over-trust vague signal proposals | Require explicit confirmation; never auto-save |
| Prompt injection from user text | Treat input as data; never concat directly into tool definitions |
| Latency in Telegram chat | Show "thinking…" indicator; keep single-call handlers under 3s |

## Estimated effort

**L (3–4 weeks).** Most effort is hardening the grounding and guardrails, not prompt writing.
