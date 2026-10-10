# Pulse OS

A personal command-centre dashboard — one screen that never scrolls, carrying
weather, calendar, email, news, markets, sport, music and travel, with an AI assistant
that can read all of it and act on it. React + Vite frontend, Express backend.

> **New — Mail.** Gmail and Outlook now connect, and Pulse reads a message to
> find the meetings, deadlines and tasks in it, proposing each for your calendar
> and to-do list. It never sends, files or deletes anything without you.
> **[Read the announcement](https://eeliya-hub.github.io/pulseOS/announcements.html#mail)**.
>
> **The launch film is out.** Two and a half minutes on every part of Pulse OS,
> and a thirty-second ad made for phones. Watch both on the
> **[site](https://eeliya-hub.github.io/pulseOS/)**, or read the
> **[announcements](ANNOUNCEMENT.md)**.

<p align="center">
  <a href="https://eeliya-hub.github.io/pulseOS/"><img src="docs/launch/launch-preview.gif" width="100%" alt="Scenes from the Pulse OS launch film — watch it on the launch page"></a>
</p>

> **v2 "Afterglow"** (21 September) rebuilt the whole frontend around a shared
> spatial system and a background that follows the time of day, made Travel
> live, and taught the assistant to speak. The full before/after is further down
> **[ANNOUNCEMENT.md](ANNOUNCEMENT.md#pulse-os-v2--afterglow)**.

![Pulse OS home](docs/release/gallery/home.jpg)

## Layout

```
pulseos/
├── frontend/        React + Vite dashboard
│   └── src/
│       ├── views/           Home, Launchpad, LifeHub, Mail, Markets, Music, Travel, AIAssistant
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
