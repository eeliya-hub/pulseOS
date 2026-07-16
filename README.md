# Pulse OS

A personal command-center dashboard — a React frontend (Vite) and an Express
backend that fronts weather, stocks, news, sports, AI, calendar, and music.

## Layout

```
pulseos/
├── frontend/        React + Vite dashboard (the existing app)
│   └── src/
│       ├── views/           Home, Finance, Travel, Music, Markets, LifeHub, …
│       ├── components/       GlassCard, Dock, InlineEdit, …
│       ├── hooks/            useFinanceStore, useTravelStore, …
│       └── services/api/
│           ├── backendClient.js   ← calls the Express backend
│           └── *.js               ← existing mock services (migrate over gradually)
│
└── backend/         Express API gateway (clean route → controller → service → provider)
    ├── src/
    │   ├── app.js           builds the app (Firebase-ready — no listen())
    │   ├── index.js         local server bootstrap
    │   ├── config/env.js    all env access
    │   ├── routes/          weather, stocks, news, sports, ai, calendar, music
    │   ├── controllers/
    │   ├── services/<feature>/<vendor>.provider.js
    │   ├── middleware/
    │   └── utils/
    └── functions/           Firebase Functions entry (placeholder)
```

## Quickstart

```bash
# 1. Backend
cd backend
cp .env.example .env         # add keys for the integrations you want live
npm install
npm run dev                  # http://localhost:4000  →  /api/status shows what's live

# 2. Frontend (separate terminal)
cd frontend
npm install                  # (already installed)
npm run dev                  # http://localhost:5173
```

Or from the repo root (installs both via npm workspaces):

```bash
npm install
npm run dev                  # runs frontend + backend together (needs `concurrently`)
```

## Integrations

| Domain | Provider | Free tier | Notes |
|---|---|---|---|
| Weather | OpenWeather | 1,000/day | key required |
| Stocks | Finnhub | 60/min | key required |
| News | GNews | 100/day | key required |
| Sports | TheSportsDB | free | works out of the box (key `3`) |
| AI | Gemini / OpenAI / Claude | Gemini free | provider-swappable; default Gemini |
| Calendar (LifeHub) | Google (read+write) + iCal (read) | free | OAuth |
| Music | Spotify | free | OAuth |
| Travel, Finance | — | — | **local only**, no API (manual + localStorage) |

See [backend/README.md](backend/README.md) for endpoint details, the provider
pattern, and how to add a new integration. Everything runs without keys —
unconfigured integrations return a clear `503 NOT_CONFIGURED`.

## Future: Firebase

The backend is structured so `src/app.js` (which builds the app without calling
`listen()`) can be wrapped by Cloud Functions — see `backend/functions/index.js`.
The in-memory OAuth `tokenStore` swaps for Firestore with no call-site changes.
