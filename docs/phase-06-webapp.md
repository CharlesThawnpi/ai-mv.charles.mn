# Phase 6 — WebApp MVP Experience

## Goal

Deliver a polished, mobile-first WebApp that makes the backend work (Phases 1–5) feel like a real product. The WebApp must be usable by a first-time visitor with thumbs on a 360px-wide phone, with every core loop (discover → onboard → get recommendations → rate) completable in under 5 minutes.

## Scope

In scope:

- Landing / home page
- Guest entry + Google sign-in UX
- Onboarding flow UI (consumes Phase 4 API)
- Recommendation feed
- Title detail page
- Search page
- Watched list page
- Profile / preferences page (including retake onboarding, language toggle, identities)
- Guest → Google upgrade prompts
- Mobile-first layout with desktop adaptation
- Accessibility baseline (WCAG AA for color + focus)

Out of scope:

- Telegram bot (Phase 7)
- Link Telegram UI (Phase 8)
- AI chat surface (Phase 9)

## Design principles

1. **Thumb-first.** Primary actions are always reachable in the bottom 60% of the screen.
2. **One decision per screen** during onboarding. Desktop may show multiple, but the same component respects mobile constraints first.
3. **No modal traps.** Anything dismissable has a visible close control; browser back always works.
4. **Fast perceived load.** Skeleton cards while fetching; never a blank screen.
5. **Burmese first-class.** Burmese rendering is tested on real devices; fonts loaded appropriately; line-height gives room for complex scripts.
6. **No dead ends.** Every empty state offers a next action.

## Information architecture

```
/[locale]/
├─ /                         # Home (trending + CTA)
├─ /onboarding/[step]        # Wizard
├─ /for-you                  # Personalized feed (guarded: requires some signals)
├─ /search                   # Search page
├─ /title/[mediaType]/[id]   # Detail
├─ /watched                  # My watched + rated list
├─ /profile
│   ├─ /                     # Profile summary
│   ├─ /taste                # Extracted signals (read + manage)
│   ├─ /language             # Locale + content origins
│   └─ /identities           # Google, guest (+ placeholder for Telegram link, Phase 8)
└─ /auth/*                   # Handled by auth.js
```

## Navigation

- **Mobile**: bottom tab bar — `Home`, `For you`, `Search`, `Watched`, `Profile`
- **Desktop**: left rail with same items; content max-width 1100px
- **Top bar (all viewports)**: app name, language toggle, account menu

## Screens (key specs)

### Home (`/`)

- Hero: single-sentence tagline + "Find your next watch" CTA
- If guest with no onboarding: CTA → `/onboarding/1`
- If onboarded: CTA → `/for-you`
- Below hero: trending movies carousel, trending series carousel (from `/api/titles/trending`)
- Tapping a card opens detail page

### Onboarding (`/onboarding/[step]`)

- Progress bar N of 7
- Step 3 (title seeding): search box + grid of results; selected titles pinned as chips at top
- Step 4 (title reaction): single-card screen, swipe-forward pattern
- Skip surfaces on optional steps only
- "You can change these anytime" note on final screen
- On complete: redirect to `/for-you`

### For-you feed (`/for-you`)

- Vertical list of recommendation cards (mobile) / 3-column grid (desktop)
- Each card: poster, title, year, 2-line reason, action buttons `Add`, `Not for me`, `Open`
- Infinite scroll in batches of 20 (pagination on recommendation event)
- Empty state: "Complete onboarding to unlock" + button
- Refresh pulls a new recommendation event

### Title detail (`/title/[mediaType]/[id]`)

- Backdrop banner (desktop) / poster-first layout (mobile)
- Title, year, genres, runtime
- Synopsis (localized)
- Top cast (6 items with photos)
- Director(s)
- Keywords as chips (subtle)
- Action bar: `Mark watched`, `Rate`, `Add to watchlist`
- "Why you'd like it" panel (if from feed): inline explanation
- Below: "Similar" carousel (reuses scoring on-the-fly for ~10 candidates)

### Search (`/search`)

- Search input; debounced queries to `/api/titles/search`
- Results: poster grid
- Empty state: trending as fallback
- No filters in MVP (that is Phase 10)

### Watched (`/watched`)

- Tabs: `Watched`, `Want to watch`, `Dropped`
- List of `user_titles` rows with inline rating control (1–5 stars)
- Changing a rating triggers re-extraction (Phase 4 extractor runs)

### Profile (`/profile`)

- Avatar (initial if guest, Google picture if signed in) + display name + locale
- Links: Taste, Language & origins, Identities, Retake onboarding, Sign out
- Guest banner: "Sign in to save your taste across devices"
- Identities screen previews the Telegram row as `Not linked` (actual linking in Phase 8)

### Taste (`/profile/taste`)

- Sections: Likes, Dislikes, Hard avoids
- Each signal shown as a chip with weight as a small bar
- Trash-icon to soft-remove; undo toast
- "These are learned from your onboarding and ratings"

## Component system

- Framework: React + Tailwind
- Primitives: `Card`, `Chip`, `Button`, `IconButton`, `Input`, `SearchInput`, `PosterThumb`, `StarRating`, `BottomTabBar`, `Skeleton`
- Form controls respect mobile safe-area insets
- Icons: a single icon package (Lucide), no PNG icons
- Keyboard: all interactive elements reachable; visible focus ring

## State management

- Server data: TanStack Query for caching + background refresh
- Session: cookies; API returns `/api/me` which populates a small client store
- URL is the state for filters/pagination where practical
- Avoid global state libraries; prefer colocated hooks

## Performance budget

- First Contentful Paint on 3G / mid-range Android < 2.5s
- JS bundle on first load < 180KB gzipped (excluding fonts/images)
- TTI on `/for-you` < 3.5s with warm cache
- Images lazy-loaded with `loading="lazy"` and explicit width/height

## Accessibility checklist

- Color contrast AA for text and chips
- `alt` on every poster image (title + year)
- All tap targets ≥ 40×40 CSS px
- Language switch updates `lang` attribute
- Star rating control is keyboard-operable

## i18n

- All strings in `packages/i18n/locales/{en,my}.json`
- Burmese-specific CSS class for font (Pyidaungsu or Noto Sans Myanmar) with `line-height: 1.8`
- Numbers/dates: `Intl.NumberFormat` / `Intl.DateTimeFormat` with locale

## Work breakdown

### 6.1 Design tokens and primitives

- [ ] Tailwind theme: color palette, typography scale, spacing, shadows, radii
- [ ] Primitive components in `apps/web/src/components/ui`
- [ ] Storybook (optional) or simple showcase page at `/__ui` in dev only

### 6.2 Layout shell

- [ ] Root layout with top bar + bottom tab bar
- [ ] Locale-aware routing
- [ ] Loading and error boundaries at page and layout levels

### 6.3 Screens

- [ ] Home (with trending carousels)
- [ ] Onboarding wizard (reuses Phase 4 API)
- [ ] For-you feed (reuses Phase 5 API)
- [ ] Title detail
- [ ] Search
- [ ] Watched (with inline rating)
- [ ] Profile (+ Taste, Language, Identities sub-pages)

### 6.4 Auth UX

- [ ] Google button with clear scope description
- [ ] Guest banner component, shown on `/for-you`, `/watched`, `/profile`
- [ ] Post-login redirect preserves intent (deep link back)

### 6.5 Performance

- [ ] Route-level code splitting
- [ ] Image component with TMDB-sized `srcset`
- [ ] Prefetch detail page on card hover/focus
- [ ] Lighthouse CI in PR pipeline with budgets

### 6.6 QA

- [ ] Smoke Playwright: guest home → onboarding → feed → detail → watched → sign in → same data
- [ ] Mobile device lab pass (real Android + iOS Safari)
- [ ] Burmese rendering pass (diacritics + line breaks)

## Acceptance criteria

- A first-time mobile visitor can complete onboarding and see a personalized feed in under 5 minutes without any instructions
- All screens render correctly at 360px, 768px, 1280px
- Locale toggle switches every user-facing string (no English fallbacks on Burmese screens except where TMDB has no translation; those are tagged)
- `/for-you` shows personalized items with clear "because..." reasons
- Rating a title on `/watched` updates signals and the next feed reflects it
- Guest completes onboarding, signs in with Google → all watched/ratings still present
- Lighthouse Performance ≥85, Accessibility ≥95, Best Practices ≥95 on `/` and `/for-you` mobile

## Dependencies

- Phases 2, 3, 4, 5 complete
- Translation catalogs populated for all onboarding + UI strings
- Design palette approved

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Mobile Safari quirks (100vh, safe-area) | Test on real iPhone; use `dvh` units and safe-area env vars |
| Burmese font file is heavy | Subset the font; load only needed glyphs; `font-display: swap` |
| Image bandwidth blows past VPS egress | Use TMDB's CDN (direct URLs, not proxied); pick size per viewport |
| Onboarding step 4 feels tedious | Animation + progress per title; cap at 5 reactions even if user seeded more |
| Desktop grid feels sparse | Fill with supplementary cards that still score > threshold |

## Estimated effort

**XL (3–5 weeks).** Screen count is modest but polish matters and Burmese QA adds real time.
