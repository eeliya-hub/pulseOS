<h1 align="center">Pulse OS</h1>

<p align="center">
  <strong>Your whole day, on one calm screen.</strong><br>
  Your plans, your mail, your projects, the weather, the news, your music and
  wherever you are headed — in one place, lit by the hour you are actually in,
  with an assistant that can read all of it and act on it.
</p>

<p align="center">
  <a href="https://eeliya-hub.github.io/pulseOS/"><strong>The site</strong></a> ·
  <a href="https://eeliya-hub.github.io/pulseOS/updates.html">Updates</a> ·
  <a href="https://eeliya-hub.github.io/pulseOS/announcements.html">Announcements</a>
</p>

---

### The tour — every part of it, asked for out loud

<video src="https://github.com/eeliya-hub/pulseOS/releases/download/films/pulseos-tour.mp4" controls muted poster="https://eeliya-hub.github.io/pulseOS/films/tour-poster.jpg" width="100%"></video>

Four and a half minutes through the whole app. Every section opens by asking
Pulse for something, and it does it — moves the meeting, writes the reply, puts
the card on the board. *(If the player does not load, [watch it on the
site](https://eeliya-hub.github.io/pulseOS/).)*

### Morning to midnight — the whole day, at speed

<video src="https://github.com/eeliya-hub/pulseOS/releases/download/films/pulseos-day.mp4" controls muted poster="https://eeliya-hub.github.io/pulseOS/films/day-poster.jpg" width="340"></video>

Two minutes, no interface — a day in Pulse OS told in motion, from the first
alarm to the last song.

---

> **Latest — Mail, Projects and Schedule, talking to each other.** Projects is a
> board with a timeline and a table, Schedule is rebuilt around the month, and
> Mail feeds both: a date into your calendar, a line onto a board. Ask Pulse can
> read a board and change it.
> **[Read the announcement](https://eeliya-hub.github.io/pulseOS/announcements.html#whats-new)**
> · **[All updates](https://eeliya-hub.github.io/pulseOS/updates.html)**

React + Vite frontend, Express backend. Built in the open — the code, the films
and every write-up are here.

![Pulse OS home](docs/release/gallery/home.jpg)

## Layout

```
pulseos/
├── frontend/        React + Vite dashboard
│   └── src/
│       ├── views/           Home, Launchpad, LifeHub (Schedule), Projects, Mail, Markets, Music, Travel, AIAssistant
│       ├── components/      Stage (sky/horizon/ground), Sky, Dock, MusicImmersive, …
│       ├── hooks/           useSky, useWholeRows, useTravelStore, useSpotifyPlayer, …
│       └── services/api/
│           └── backendClient.js   ← the one place the frontend calls the backend
│
└── backend/         Express API gateway (clean route → controller → service → provider)
    ├── src/
    │   ├── app.js           builds the app (Firebase-ready — no listen())
    │   ├── index.js         local bootstrap; also attaches the voice WebSocket
    │   ├── config/env.js    all env access
    │   ├── routes/          weather, stocks, news, sports, ai, calendar, music,
    │   │                    mail, travel, search, geo, launch
    │   ├── controllers/
    │   ├── services/<feature>/<vendor>.provider.js
    │   ├── realtime/        voiceGateway.js — browser WS ↔ Gemini Live
    │   ├── middleware/      cors, rate limiting, error handling
    │   └── utils/           TTL cache, token store, usage meter
    └── functions/           Firebase Functions entry
```

Every view is composed of the same three parts — a **sky zone**, a **horizon**
at a fixed height, and a full-bleed **ground** split into columns — defined once
in [`frontend/src/components/Stage.jsx`](frontend/src/components/Stage.jsx).

## Quickstart

From the repo root (npm workspaces installs both packages):

```bash
npm install
npm run dev          # frontend on :5173, backend on :4000
```

Or separately:

```bash
cd backend && cp .env.example .env && npm run dev    # :4000 — /api/status shows what's live
cd frontend && npm run dev                            # :5173
```

`.env` is optional. The server boots with zero keys; unconfigured integrations
return a clear `503 NOT_CONFIGURED` instead of crashing.

## Integrations

| Domain | Provider | Notes |
|---|---|---|
| Weather | OpenWeather | key required |
| Stocks & crypto | Finnhub, CoinGecko | Finnhub key required |
| News | GNews + RSS | key required; local news resolved by town/county |
| Live TV | HLS streams via hls.js | keyless |
| Sport | Football-Data.org, balldontlie, Jolpica/Ergast | F1 is keyless |
| Calendar | Google (read+write), Apple iCloud (CalDAV), public `.ics` | OAuth |
| Music | Spotify Web API + Web Playback SDK + Connect; LRCLIB lyrics | OAuth; lyrics keyless |
| Email | Gmail (REST), Outlook/Microsoft 365 (Graph) | OAuth; read, send, drafts, archive — never permanent delete |
| Travel | Google Places *or* OpenStreetMap, AeroDataBox, OpenFreeMap | degrades to keyless |
| Search | Brave, Tavily, or keyless open web | optional keys |
| AI | Gemini (default), OpenAI, Claude | swappable per request |
| Voice | Gemini Live API over WebSocket | shares the typed assistant's tools |
| Track tempo | ReccoBeats | keyless; fallback for `/api/music/features`, which Spotify 403s |

See [backend/README.md](backend/README.md) for endpoint details, the provider
pattern, and how to add a new integration.

## Cost and safety

Every route passes through an in-memory rate limiter, with tighter caps on the
AI route and on anything that mutates state. A separate, disk-persisted usage
meter enforces hard daily and monthly request and token budgets per AI provider,
checked *before* each call — the default Gemini budgets sit under its free tier,
so the assistant cannot run up a bill. The TTL cache serves stale data rather
than failing when a provider rate-limits.

## Firebase

`src/app.js` builds the Express app without calling `listen()`, so Cloud
Functions can wrap it — see `backend/functions/index.js`. The voice WebSocket is
attached in `src/index.js` rather than the app factory, deliberately, so the
Firebase path stays clean. The OAuth `tokenStore` swaps for Firestore with no
call-site changes.

## Documentation

- [The launch page](https://eeliya-hub.github.io/pulseOS/) — the launch film and the ad, in the browser
- [ANNOUNCEMENT.md](ANNOUNCEMENT.md) — the launch film, and the v2 release notes with before/after imagery
- [docs/launch/PRESS.md](docs/launch/PRESS.md) — the press kit: words to post, posters, previews and stills
- [docs/launch/CREDITS.md](docs/launch/CREDITS.md) — credits and licences for the films
- [docs/PulseOS-Doc.html](docs/PulseOS-Doc.html) — the full project document (source for the PDF)
- [backend/README.md](backend/README.md) — API surface and provider pattern
