# Pulse OS — Backend

An Express API gateway that fronts every external integration the dashboard
needs. Clean layered architecture, built to run locally now and lift into
Firebase Functions later with no route/service changes.

## Architecture

```
request → route → controller → service → provider(s) → external API
```

- **routes/** — URL → controller wiring, one file per feature.
- **controllers/** — thin HTTP glue (read req, call service, send res). No logic.
- **services/** — business logic + response normalization. UI-facing shapes live here.
- **services/<feature>/*.provider.js** — the actual external API calls. Swappable.
- **middleware/** — error handler, 404.
- **utils/** — `ApiError`, `fetchJson`, `asyncHandler`, `logger`, `tokenStore`.
- **config/env.js** — the ONLY place that reads `process.env`.

### Firebase-ready

`src/app.js` builds the Express app and **exports it without `listen()`**.
`src/index.js` calls `listen()` for local dev. `functions/index.js` shows how to
wrap the same app in a Cloud Function later — no route or service touches change.

## Run

```bash
cd backend
cp .env.example .env      # fill in the keys you want live
npm install               # add --include=optional for Google Calendar + iCal
npm run dev               # http://localhost:4000  (node --watch)
```

Nothing needs keys to boot. Unconfigured integrations return a clear
`503 { code: "NOT_CONFIGURED" }`. Check what's live:

```bash
curl http://localhost:4000/api/status
```

## Integrations & endpoints

| Domain   | Provider (free tier)                          | Endpoints |
|----------|-----------------------------------------------|-----------|
| Weather  | **OpenWeather** (1k/day)                       | `GET /api/weather?city=` · `GET /api/weather/forecast?city=` |
| Stocks   | **Finnhub** (60/min)                           | `GET /api/stocks?symbols=AAPL,MSFT` · `GET /api/stocks/:symbol` |
| News     | **GNews** (100/day)                            | `GET /api/news?category=` · `GET /api/news/search?q=` |
| Sports   | **TheSportsDB** (free, works with key `3`)     | `GET /api/sports/upcoming?league=epl` · `/results` · `/standings?league=&season=` |
| AI       | **Gemini** (default, free) · OpenAI · Claude   | `POST /api/ai/chat` `{ prompt \| messages, provider?, model?, system? }` |
| Calendar | **Google** (read+write) · **iCal** (read)      | `GET /api/calendar/google/auth` · `/events` · `POST /api/calendar/events` |
| Music    | **Spotify** (OAuth)                            | `GET /api/music/auth` · `/now-playing` · `/playlists` · `/recently-played` |

> Travel and Finance have **no** external API — they stay fully local/manual in
> the frontend (localStorage), as requested.

### Why these providers

Picked for **generous free tiers you won't blow through** in personal use.
Each domain uses a provider pattern, so swapping (e.g. Finnhub → Twelve Data,
GNews → NewsData) means writing one new `*.provider.js` and pointing the service
at it — controllers, routes, and the frontend never change.

### AI provider choice

Provider-agnostic: Gemini / OpenAI / Claude all implement the same `chat()`.
Default is **Gemini** (best free tier). Change globally with `AI_PROVIDER`, or
per request with `{ "provider": "claude" }`. Claude defaults to Haiku 4.5 (the
most affordable Claude model); set `CLAUDE_MODEL=claude-opus-4-8` for the most
capable.

### OAuth flows (Google Calendar, Spotify)

1. Hit `GET /api/calendar/google/auth` (or `/api/music/auth`) → returns a consent URL.
2. Open it, approve → provider redirects to the configured callback → tokens stored.
3. Data endpoints now work.

Tokens live in an in-memory `tokenStore` (fine for local single-user). For
production, swap the Map in `utils/tokenStore.js` for Firestore — call sites
don't change.

## Adding a new integration

1. `services/<feature>/<vendor>.provider.js` — the external calls.
2. `services/<feature>/<feature>.service.js` — normalize to a UI shape.
3. `controllers/<feature>.controller.js` — thin.
4. `routes/<feature>.routes.js` — wire URLs, mount in `routes/index.js`.
5. Add its keys to `config/env.js` + `.env.example`, and a line to `integrationStatus()`.
