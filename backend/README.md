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
| Search   | **Keyless** (DuckDuckGo/Google News/Wikipedia) · Brave · Tavily | `GET /api/search?q=` · `GET /api/search/status` |
| Sports   | **TheSportsDB** (free, works with key `3`)     | `GET /api/sports/upcoming?league=epl` · `/results` · `/standings?league=&season=` |
| AI       | **Gemini** (default, free) · OpenAI · Claude   | `POST /api/ai/chat` `{ prompt \| messages, provider?, model?, system? }` |
| Calendar | **Google** (read+write) · **iCal** (read)      | `GET /api/calendar/google/auth` · `/events` · `POST /api/calendar/events` |
| Music    | **Spotify** (OAuth)                            | `GET /api/music/auth` · `/now-playing` · `/playlists` · `/recently-played` |
| Travel   | **Keyless**: adsbdb + adsb.lol/airplanes.live (flights) · Frankfurter/ECB (FX) · Nominatim + Wikipedia (places, photos) · optional **Google Places** | `GET /api/travel/destination?q=` · `/flight?code=BA117&date=` · `/fx?from=GBP&to=JPY` · `/places?q=&kind=hotel` · `/photos?q=` · `/photo?ref=` |

> Finance has **no** external API — it stays fully local/manual in the frontend
> (localStorage). Travel keeps its trips local too; only the live data
> (flights, rates, weather, places) comes from the backend.

### Travel

Everything works with **no keys at all**:

- **Flights** — routes (airline, both airports with coordinates) from
  [adsbdb](https://www.adsbdb.com), live position/altitude/speed from
  [adsb.lol](https://adsb.lol) with [airplanes.live](https://airplanes.live) as
  fallback. Both are community ADS-B networks: an aircraft shows up as soon as
  it's airborne and in receiver range. Gate numbers and scheduled times are the
  one thing free feeds don't carry — those need a paid airline schedule API.

  Tracking is **date-aware**: airlines reuse a flight number every day, so
  `/flight?code=BA117&date=2026-08-20` only looks for an aircraft on the day it
  departs (plus the morning after, for overnight long-hauls). Any other date
  returns the route with a `scheduled`/`completed` status and `daysAway`, so a
  trip three weeks out never shows someone else's aircraft as yours.

  Airline logos and banners come from the Traverse project's public Firebase
  Storage bucket, keyed by ICAO code (`BAW.png`, `JAL.png`). Override the base
  with `AIRLINE_ART_BASE`, or clear it to fall back to the plane glyph.

  The flight card's backdrop is one of the airline's own aircraft: Wikipedia's
  lead image for the carrier, which is a photo of their fleet for nearly every
  airline. No registration to type and no key.

  For a specific airframe, `GET /api/travel/aircraft?registration=G-STBA` returns
  its type and operator from adsbdb's registry plus a photo of that exact
  aeroplane from [Planespotters](https://www.planespotters.net/photo/api) — whose
  API wants a contact URL or email in the User-Agent (`AIRCRAFT_PHOTO_CONTACT`)
  and a photographer credit. (adsbdb's own `url_photo` links point at
  airport-data.com, which now 404s.)
- **Currency** — the ECB's daily reference rates via
  [Frankfurter](https://frankfurter.dev), with `open.er-api.com` covering the
  currencies the ECB doesn't quote. Includes 30 days of history for the trend,
  and a picture of the destination's banknotes: Wikipedia keeps a "Banknotes of
  the …" article for most currencies, and `/fx` returns its lead image (cached a
  week, since a note series doesn't change).
- **Maps** — the frontend draws OpenStreetMap data on CARTO's dark basemap, so
  it matches the dashboard and needs no Maps key.
- **Places & photos** — Nominatim search plus Wikipedia imagery.

Setting `GOOGLE_PLACES_API_KEY` upgrades place search to **Google Places (New)**:
ratings, review counts, price level, open-now and real venue photos. The key
stays server-side — photos are proxied through `GET /api/travel/photo?ref=`.

`GET /api/travel/photos?q=teamLab Planets&lat=&lon=&placeId=` returns up to six
pictures for anything on an itinerary: Google's venue photos when keyed, and a
Wikipedia image when not, so hotels and landmarks are illustrated either way.

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
