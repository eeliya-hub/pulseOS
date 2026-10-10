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
| AI       | **Gemini** (default, free) · OpenAI · Claude   | `POST /api/ai/chat` `{ prompt \| messages, provider?, model?, system?, thinking?, json? }` |
| Calendar | **Google** (read+write) · **iCal** (read)      | `GET /api/calendar/google/auth` · `/events` · `POST /api/calendar/events` |
| Music    | **Spotify** (OAuth)                            | `GET /api/music/auth` · `/now-playing` · `/playlists` · `/recently-played` |
| Email    | **Gmail** (REST) · **Outlook/M365** (Graph)    | `GET /api/mail/status` · `/summary` · `/mailboxes` · `/messages` · `/messages/:id` · `/threads/:id` · `/context` · `POST /send` · `/drafts` · `/messages/:id/move` |
| Travel   | **Keyless**: adsbdb + adsb.lol/airplanes.live (flights) · Frankfurter/ECB (FX) · Nominatim + Wikipedia (places, photos) · optional **Google Places** | `GET /api/travel/destination?q=` · `/flight?code=BA117&date=` · `/fx?from=GBP&to=JPY` · `/places?q=&kind=hotel` · `/photos?q=` · `/photo?ref=` |

> Finance has **no** external API — it stays fully local/manual in the frontend
> (localStorage). Travel keeps its trips local too; only the live data
> (flights, rates, weather, places) comes from the backend.

### Email

Provider-agnostic, behind one internal abstraction:

```
Gmail REST  ─┐
             ├─ provider adapter → mail.service → routes → UI / AI / tasks / calendar
MS Graph    ─┘
```

Nothing above `mail.service.js` knows which provider an account belongs to.
Each adapter declares its own **capabilities**, and the UI offers only what is
actually there — Gmail's Primary/Social/Promotions/Updates appear for a Gmail
account and are absent for Outlook, rather than showing four mailboxes that
would always be empty.

- **Mailboxes** are canonical (`inbox · starred · important · drafts · sent ·
  archive · spam · trash`) and mapped per provider: Gmail labels one way,
  Graph's well-known folders the other. Gmail has no Archive label, so archive
  is a search (`-in:inbox -in:trash …`); Graph has no Starred folder, so starred
  is a filter on the flag. Spam and bin are **never** counted in any inbox figure.
- **Multiple accounts.** Mail is the first integration with more than one
  account of a kind, stored as `mail:<provider>:<accountId>` in the token store.
  Reads across accounts interleave by date and each message carries its
  `accountId`; the page cursor is one token *per account*, so paging works the
  same for one mailbox or several.
- **Separate grant from the calendar.** Mail asks for mail scopes only, lands on
  its own redirect, and is stored under its own key — so connecting or revoking
  a mailbox never touches `GOOGLE_CLIENT_ID`'s calendar sign-in, and neither
  token works for the other.
- **Scopes.** Gmail: `gmail.modify`, `gmail.send`, `gmail.compose`. Graph:
  `Mail.ReadWrite`, `Mail.Send`. The full `https://mail.google.com/` scope is
  deliberately *not* requested, so **nothing can permanently delete mail** —
  there is no move target but inbox, archive, spam and bin.
- **Bodies are sanitised server-side** (`sanitize.js`) before they cross the
  wire, and the reader renders what survives inside an iframe sandboxed without
  `allow-scripts`. Two independent defences, because an email body is the one
  input an attacker chooses. Remote images are held back by default — loading
  one tells the sender the mail was opened.
- **Nothing is persisted.** The service has no storage layer: listings are held
  in memory for `MAIL_LIST_TTL_MS`, bodies for `MAIL_MESSAGE_TTL_MS`, and an
  explicit refresh bypasses both. The frontend keeps *headers* in localStorage
  so the inbox paints instantly, and never a body.
- **`GET /api/mail/context`** is the only door to the assistant, and a narrow
  one: `message`, `thread` (last 3 of it), `search` and `priority` (headers
  only), each with a hard ceiling. There is no request shape that hands a model
  a mailbox.
- **Dates are not the model's job.** Asked for the calendar date of "Thursday's
  design review", a model answers confidently and wrongly, and differently on a
  second run. So it is asked only to *quote* the email's own words — `dateText:
  "end of day Friday"` — and `frontend/src/services/mail/dates.js` does the
  arithmetic against the date the email was SENT, in code with tests. The
  resolved date and the phrase it came from are shown together in the UI, which
  is the only way to spot a misreading.
- **Yahoo** is absent because Yahoo retired its Mail API: access is IMAP/SMTP
  with OAuth2, and those scopes are not self-served — a third party must apply
  to Yahoo and be approved first. The adapter interface is shaped so a Yahoo
  provider is one more file if that approval exists.

Run the mail and provider tests with `npm test` in `backend/`.

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

### Asking for JSON, and paying for thinking

Two options on `/api/ai/chat` that only Gemini acts on (the others ignore them,
and a caller that wants JSON from them still has to parse it out of prose):

- **`json`** — a JSON schema, or `true`. The answer comes back as that shape
  rather than as prose with a code fence around it.
- **`thinking`** — `'none' | 'low' | 'high'`. Gemini 3 reasons before it
  answers, and **`maxTokens` is the budget for the thinking and the answer
  together**. This is worth knowing because the failure mode is silent: a caller
  that asks for a small JSON object inside a small budget gets a *truncated*
  200, not an error — the mail feature spent 670 of its 700 tokens reasoning and
  returned `{"title": "Design review", "date": "2`, which parsed as nothing and
  surfaced as "Pulse could not read anything definite out of that" on every
  single request. Pass `thinking: 'low'` for extraction work, or raise
  `maxTokens` well above the size of the answer you want.

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
