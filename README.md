# Locali: AI concierge for places nearby

**Live:** https://local-jade-delta.vercel.app (open it on a phone, or use a phone-sized window)

Locali is a mobile web app for finding cafés, restaurants, bars and things to do nearby. The new idea on top of the usual "search and map": **tell the concierge Lumi what kind of evening you want, and it finds real open places that fit**, or builds a timed plan for the whole evening. Then you can let friends vote on the options or turn the pick into an event they can join.

## It works as a web app (PWA)

Locali is a Progressive Web App, so it installs on a phone without an app store:

- **iPhone (Safari):** Share → *Add to Home Screen*. **Android (Chrome):** menu → *Install app*.
- It opens full-screen from its own icon, without the browser bar, like a native app.
- On Android, long-press the icon for shortcuts: *Ask the concierge*, *Saved places*.
- Layout respects the notch and the home indicator (safe areas), portrait orientation, 16 px inputs so iOS does not zoom.
- On desktop it renders as a phone-width column.

Data is live (places, weather, the concierge), so the app needs a connection; there is no offline mode.

## Pages (5)

| Page | What you can do |
| --- | --- |
| **Discover** `/` | Pick your location (remembered), categories, best places nearby as photo cards, weather chip, recently viewed, "Surprise me". Full-screen map: drag to load any area, tap a pin to preview, filter by category or by **public events** |
| **Search** `/search` | Text search with *Open now* and price filters, recent searches, category grid |
| **Place** `/place/[id]` | Photos, rating, walking time, open status, hours (today highlighted), reviews, mini-map. **Route** opens Google Maps with the venue by name (walking, or transit when far). Save, share, add to a group vote, **create an event** |
| **Lumi (concierge)** `/concierge` | The new feature, see below. Chat history is kept and synced to the account |
| **Saved** `/saved` | Profile, saved places on a map with notes and a walk through all of them, **votes and events** (yours and the ones you answered), **conversations** with Lumi |

UI in Ukrainian and English (auto-detected, switchable).

## The new feature: Lumi and plans with friends

1. **Ask in plain words:** "dinner with my parents, they like fish", "date for 4 hours, cocktails at the end". Voice input works too.
2. Lumi searches, checks opening hours, distance, price and reviews, and answers with **1-3 picks with reasons**, or a **timed evening plan** (19:00 dinner → 21:15 bar, 6 min walk) that is checked against opening hours and walking time.
3. **Let friends vote:** any set of places (from Lumi or added by hand from any place page) becomes a live poll link. No sign-up needed to vote; link previews in Telegram/Viber show the options and a photo.
4. **Events:** turn a place or the vote winner into an event with date, time and a note. Friends answer *going / maybe / can't* and add it to their calendar (.ics).
   - **Private** (default): only people with the link see it.
   - **Public:** shown to everyone nearby on the map (Events filter, dark date pins). Publishing needs an account.

## External APIs

| Service | Used for | Key |
| --- | --- | --- |
| **Google Places API (New)** | Main source: search, details, ratings, reviews, photos | server-side |
| **OpenStreetMap** via Geoapify (or Overpass) | Automatic fallback when Google fails or is out of quota; areas cached in Postgres for 24 h | server-side |
| **Google Street View Static** | Street photo of the venue entrance when the venue has no photo of its own | server-side |
| **Gemini API** (default) / **Claude API** | Concierge, behind one provider-neutral interface (`src/lib/llm`) | server-side |
| **Open-Meteo** | Weather on Discover and as context for Lumi (rain → indoors, warm → terraces) | none |
| **MapLibre + OpenFreeMap** | Vector map tiles | none |

All provider responses are normalised into one `Place` type, so the UI and the agent never depend on a specific provider.

**Photos.** Venue's own photo (Google, or the preview image of its website with logos, social avatars and stock images filtered out) → Google Street View of the entrance (Google's own imagery within 35 m) → an illustrated tile with the category icon. No stock photos that could pass for the real place. The venue photo always stays first, so it comes back as soon as the Google quota resets.

**Cost control.** Field masks request only what the UI shows; Google photos are capped at 3 per place; **Lumi searches OpenStreetMap** (5-8 searches per request, free and cached) and only its final 2-3 picks are looked up on Google for ratings, photos and reviews; Street View panorama lookups are free and stored in the database, images are cached by the CDN for a week, and a daily counter stops at 300 images, below the free monthly tier.

## Lumi, the agent

`src/lib/concierge/agent.ts` runs a tool-use loop with four tools: `search_places` (several in parallel, with an optional area like "Podil"), `get_place_details`, `present_picks`, `present_plan`.

Guardrails:
- **No invented places.** Every place in the answer must have come back from a tool call in this run (`validatePicks`); otherwise the model gets an error and has to fix it.
- **Realistic plans.** `validatePlan` checks opening hours at each stop's time, no overlaps, and walking legs of 25 minutes or less.
- **Never a dead end.** Gemini models are ranked fastest first, each call has a 12 s limit, a model that times out or hits its quota rests for 10 minutes, and the whole run has a deadline. If the model still runs out of time, the best places already found are shown instead of an error.
- Tool inputs are validated with Zod; bad input goes back to the model as a tool error.

## Security and user data

- **Passwords:** scrypt with a per-user salt, constant-time comparison, same work for unknown emails (no account enumeration).
- **Sessions:** random 256-bit token in an `httpOnly`, `SameSite=Lax`, `Secure` cookie. Only its SHA-256 is stored, so a database leak does not expose live sessions.
- **Authorization:** saved places, chats and owned events are always scoped by the session user. Place data is fetched on the server, never trusted from the client.
- **Votes and RSVPs** without an account use an anonymous random `httpOnly` cookie, one answer per browser. Private events and polls are never listed; only their random link opens them.
- **CSRF:** SameSite cookies plus an Origin check on every write.
- **Secrets** stay on the server. The Google photo and Street View endpoints proxy images, so keys never reach the browser. The photo proxy accepts only Google photo references and the website-photo fetcher blocks private network addresses (SSRF).
- **Rate limits** on sign-in, concierge, votes, events, geocoding and photo endpoints; input validation with Zod on every route.

## Tests

82 unit tests (Vitest) in `tests/`:

| File | What it covers |
| --- | --- |
| `auth` | hashing, sessions, cookie handling |
| `concierge` | agent loop, `validatePicks`, `validatePlan`, deadline and best-effort fallback, model fallback |
| `places`, `osm` | Google and OSM normalisation, opening-hours parsing, Google → OSM fallback, distance filter, Geoapify mapping |
| `site-photo` | finding a venue's photo on its website, SSRF protection |
| `features` | polls, events, `.ics` export, routes (walking vs transit, named destinations) |
| `public-events` | which public events show on the map (time window, radius, order) |
| `street-view` | camera heading towards the venue, cache keys, pano id validation |
| `http-and-limits`, `i18n` | rate limiter, Origin check (CSRF), language detection and translations |

They focus on the logic where a bug would mislead the user or leak data: the agent's guardrails, opening hours, auth, and what is public versus private.

```bash
npm test               # unit tests
npm run test:coverage
npm run typecheck
npm run lint
```

## How AI agents were used and checked

- **Claude Code** wrote most of the code from my specs and feedback, one feature at a time, with typecheck, lint and tests after each change.
- A separate **review agent** read the code without seeing my reasoning and reported 10 problems (security, edge cases, error handling); all were fixed and covered by tests.
- **Checks beyond tests:** every visible change was opened in a phone-sized browser locally and again on production after deploy; API endpoints were checked with real requests; problems I hit while using the app on my phone (slow concierge answers, a 299-minute walking leg, missing photos, share links) became fixes plus tests.

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
| `DATABASE_URL` | yes | Postgres (Neon in production). Migrations also run on every Vercel build |
| `GEMINI_API_KEY` | for Lumi | Free key from aistudio.google.com; models are auto-detected, or set `GEMINI_MODELS` |
| `ANTHROPIC_API_KEY` | alternative | Claude instead of Gemini (`CONCIERGE_MODEL`) |
| `GOOGLE_PLACES_API_KEY` | recommended | Google Places, and Street View photos if that API is enabled on the key |
| `GEOAPIFY_API_KEY` | recommended | Fast OpenStreetMap fallback (free, no card). Without it the public Overpass API is used |
| `STREETVIEW_DAILY_LIMIT` | optional | Street View images per day, default 300 |
| `PLACES_PROVIDER=demo` | optional | Offline mode with 20 fictional Kyiv venues |

## Time and limitations

About 8 hours of work in one day (see the git history).

- Rate limits and the short response cache are in memory per serverless instance; production at scale would use Redis.
- Google Places has a monthly free quota; when photos run out, venues fall back to Street View and illustrated tiles.
- **Demo shortcut:** Google photo URLs are stored for 3 days (`google_photos`) so the free photo quota lasts. Google's terms do not allow storing their content, so a production build would drop this table and pay per photo view instead.
- OpenStreetMap venues have no ratings or reviews.
- No email verification or password reset.
- Public events have no moderation or reporting yet (an account is required to publish).
- Lumi's answers take a few seconds while it searches; progress is shown step by step.
