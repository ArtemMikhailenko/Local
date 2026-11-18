# Locali — AI concierge for places nearby

A mobile web take on Google Maps / TripAdvisor discovery, rebuilt around one new idea: **describe the evening you want, and an AI concierge finds 3 real places that fit**. It checks what is open, how far it is, the price and the reviews, then explains each pick.

Built as a mobile-first web app (Next.js 15, App Router). Works in any phone browser; on desktop it renders as a phone-width column.

## Pages (5)

| Page | What you can do |
| --- | --- |
| **Discover** `/` | Categories, top places nearby as swipeable cards, live map with rating pins, quick concierge prompts |
| **Search** `/search` | Debounced text search with *Open now* and price filters, recent searches, browse grid |
| **Place** `/place/[id]` | Photo gallery, rating, walking time, open status, directions / website / call, hours (today highlighted), reviews, mini-map, "find places like this" |
| **Concierge** `/concierge` (new feature) | Chat-style AI concierge with live progress ("Searched “wine bar” · 6 found"), 1–3 picks with reasons and insider tips, one-tap refinements ("Cheaper options", "Somewhere quieter") that keep context |
| **Saved** `/saved` | Private list and map of saved places, profile, sign out. Sign-in / sign-up is a bottom sheet available everywhere |

## Run locally

Requirements: Node 20+, PostgreSQL 14+.

```bash
npm install
createdb locali
cp .env.example .env.local     # fill in keys, see below
npm run db:migrate
npm run dev                    # http://localhost:3000
```

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (Neon / Vercel Postgres in production) |
| `ANTHROPIC_API_KEY` | for the concierge | Claude API key |
| `GOOGLE_PLACES_API_KEY` | optional | Google Places API (New). **Without it the app runs in demo mode** on a built-in dataset of 20 fictional venues in central Kyiv, so it can be reviewed with zero setup. A "DEMO" badge is shown in the header |
| `CONCIERGE_MODEL` | optional | Defaults to `claude-opus-5-5` |

Tests and checks:

```bash
npm test              # unit tests (Vitest)
npm run test:coverage
npm run typecheck
npm run lint
```

## Architecture

```
src/
  app/                 pages + API route handlers
    api/auth/*         signup, login, logout
    api/places/*       search + details (provider-agnostic)
    api/photo          Google photo proxy (keeps the key server-side)
    api/saved          per-user saved places
    api/concierge      streams NDJSON events from the agent
  lib/
    places/            Place model, Google Places adapter, demo provider, TTL cache
    concierge/         agent loop (Claude tool use) + picks validation
    auth/              scrypt hashing, session tokens, cookie handling
    db/                Drizzle schema (users, sessions, saved_places, concierge_runs)
  components/          UI: cards, rows, map (MapLibre + OpenFreeMap), tab bar, auth sheet
tests/                 Vitest unit tests
```

### External API integration

- **Google Places API (New)**: `places:searchText` with location bias, `openNow` and price filters; `places/{id}` for details. Field masks request only what the UI shows (cost control). Responses are normalized into one `Place` type, so the UI and the agent never see provider-specific shapes. A 10-minute in-memory cache keeps quota use low.
- **Claude API** (`@anthropic-ai/sdk`) for the concierge, see below.
- **OpenFreeMap** vector tiles rendered with MapLibre GL (no key needed).

### The concierge agent

`src/lib/concierge/agent.ts` runs a manual tool-use loop with three tools:

1. `search_places(query, open_now?, max_price?, radius_m?)`: the model can call it several times in parallel ("wine bar" + "rooftop bar").
2. `get_place_details(place_id)`: hours and reviews when they matter.
3. `present_picks(intro, picks[])`: strict-schema final answer.

Guardrails:
- **No hallucinated venues.** Every `place_id` in `present_picks` must have come back from a tool call in this run, otherwise the call is returned to the model as an error and it has to fix it (`validatePicks`).
- Tool inputs are validated with Zod before execution; bad input becomes an `is_error` tool result, not a crash.
- Hard cap on turns, refusal handling, server-side fallback model on refusals.
- Stable system prompt with prompt caching; volatile context (time, location, saved places, earlier requests) goes in the user message.
- The user's saved places are passed as a taste signal, so picks get more personal over time.

## Security and user data

- Passwords: scrypt (N=16384) with a random salt per user, constant-time comparison, and the same work for unknown emails so response time does not reveal which accounts exist.
- Sessions: 256-bit random token in an `httpOnly`, `SameSite=Lax`, `Secure` (prod) cookie. **Only its SHA-256 is stored**, so a database leak does not expose live sessions. Logout deletes the session row.
- Authorization: every saved-places query is scoped by the session user id; place snapshots are fetched server-side, never trusted from the client.
- CSRF: SameSite cookie plus an Origin check on every state-changing route.
- Secrets: API keys live only on the server. Photos are proxied (`/api/photo`) with a strict `places/{id}/photos/{id}` pattern, so the endpoint cannot be used to fetch arbitrary URLs (SSRF).
- Rate limits on auth (10/min/IP) and concierge (8/min per user or IP).
- Input validation with Zod on every API route.

## Known limitations

- Rate limiter and response cache are in-memory per serverless instance; production would use Redis/Upstash.
- Google Places free usage is limited per month; photos are the most expensive call.
- No email verification or password reset.
- Concierge answers take several seconds because the model calls tools before answering; progress is streamed so the wait is visible.
