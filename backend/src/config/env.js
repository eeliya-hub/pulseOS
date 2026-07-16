import dotenv from 'dotenv';

// Load backend/.env. In Firebase Functions this is a no-op (config comes from
// the runtime environment / functions config), which is exactly what we want.
dotenv.config();

const get = (key, fallback = '') => process.env[key] ?? fallback;
const num = (key, fallback) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
};

/**
 * Central, typed view of configuration. Nothing else in the app should read
 * process.env directly — import from here so every integration's requirements
 * live in one place.
 */
export const config = {
  env: get('NODE_ENV', 'development'),
  port: Number(get('PORT', '4000')),
  // Comma-separated list of allowed frontend origins for CORS.
  corsOrigins: get('CORS_ORIGINS', 'http://localhost:5173,http://localhost:5174,http://localhost:5175')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Request-rate ceilings, per client IP. These shape bursts (a runaway poll
  // loop in the UI); the AI *spend* cap below is what bounds totals.
  // Any `max` of 0 disables that limiter.
  rateLimit: {
    windowMs: num('RATE_LIMIT_WINDOW_MS', 60_000),
    max: num('RATE_LIMIT_MAX', 240), // all /api reads: ~4 req/s sustained
    aiWindowMs: num('AI_RATE_LIMIT_WINDOW_MS', 60_000),
    // /api/ai — metered upstream. One chat message can cost up to MAX_STEPS (6)
    // calls, since the agent loop re-posts after each round of tool calls; this
    // has to leave room for a few messages a minute without 429ing mid-turn.
    aiMax: num('AI_RATE_LIMIT_MAX', 30),
    writeWindowMs: num('WRITE_RATE_LIMIT_WINDOW_MS', 60_000),
    writeMax: num('WRITE_RATE_LIMIT_MAX', 30), // calendar/music mutations
  },

  weather: {
    openWeatherKey: get('OPENWEATHER_API_KEY'),
  },
  stocks: {
    finnhubKey: get('FINNHUB_API_KEY'),
  },
  news: {
    gnewsKey: get('GNEWS_API_KEY'),
  },
  sports: {
    // TheSportsDB works with the free shared key "3" for testing.
    sportsDbKey: get('THESPORTSDB_API_KEY', '3'),
    // API-Sports (api-sports.io) — legacy, unused now.
    apiSportsKey: get('APISPORTS_KEY'),
    // Football-Data.org (football). Header X-Auth-Token. Accepts a VITE_-prefixed
    // name too, in case it was added to a frontend .env.
    footballDataKey: get('FOOTBALL_DATA_API_KEY') || get('VITE_FOOTBALL_DATA_API_KEY'),
    // balldontlie (NBA + NFL). Header Authorization.
    balldontlieKey: get('BALLDONTLIE_API_KEY') || get('VITE_BALLDONTLIE_API_KEY'),
    // F1 (Jolpica/Ergast) needs no key.
  },
  ai: {
    // Which provider ai.service uses by default: 'gemini' | 'openai' | 'claude'.
    provider: get('AI_PROVIDER', 'gemini'),
    geminiKey: get('GEMINI_API_KEY'),
    geminiModel: get('GEMINI_MODEL', 'gemini-3-flash-preview'),
    openaiKey: get('OPENAI_API_KEY'),
    openaiModel: get('OPENAI_MODEL', 'gpt-4o-mini'),
    claudeKey: get('ANTHROPIC_API_KEY'),
    claudeModel: get('CLAUDE_MODEL', 'claude-haiku-4-5-20251001'),

    // Ceiling on `maxTokens` a request may ask for — a client can't ask the
    // model for a 100k-token answer and run the token budget down in one call.
    maxTokensCap: num('AI_MAX_TOKENS_CAP', 2048),

    /**
     * Hard usage caps, enforced against persisted counters in services/ai/quota.js.
     * Reaching one returns 429 instead of calling the provider. A metric set to 0
     * means "no cap".
     *
     * Gemini's defaults sit under Google's free-tier limits for Flash
     * (~10 requests/min, ~250/day), so there is never billable usage to charge —
     * that's what makes the assistant free to run.
     */
    quota: {
      gemini: {
        // Google's free tier allows ~10 requests/min for Flash; going over gets
        // rejected by Google (not billed), but a whole agent turn is up to 6
        // calls, so keep a little headroom rather than throttling mid-answer.
        minute: { requests: num('GEMINI_MAX_REQUESTS_PER_MINUTE', 12) },
        day: {
          requests: num('GEMINI_MAX_REQUESTS_PER_DAY', 200),
          tokens: num('GEMINI_MAX_TOKENS_PER_DAY', 1_000_000),
        },
        month: {
          requests: num('GEMINI_MAX_REQUESTS_PER_MONTH', 5_000),
          tokens: num('GEMINI_MAX_TOKENS_PER_MONTH', 20_000_000),
        },
      },
      // Paid providers: deliberately tiny defaults, since every call costs money.
      openai: {
        minute: { requests: num('OPENAI_MAX_REQUESTS_PER_MINUTE', 5) },
        day: { requests: num('OPENAI_MAX_REQUESTS_PER_DAY', 50), tokens: num('OPENAI_MAX_TOKENS_PER_DAY', 200_000) },
        month: { requests: num('OPENAI_MAX_REQUESTS_PER_MONTH', 500) },
      },
      claude: {
        minute: { requests: num('CLAUDE_MAX_REQUESTS_PER_MINUTE', 5) },
        day: { requests: num('CLAUDE_MAX_REQUESTS_PER_DAY', 50), tokens: num('CLAUDE_MAX_TOKENS_PER_DAY', 200_000) },
        month: { requests: num('CLAUDE_MAX_REQUESTS_PER_MONTH', 500) },
      },
    },
  },
  google: {
    clientId: get('GOOGLE_CLIENT_ID'),
    clientSecret: get('GOOGLE_CLIENT_SECRET'),
    redirectUri: get('GOOGLE_REDIRECT_URI', 'http://localhost:4000/api/calendar/google/callback'),
  },
  ical: {
    // Optional default .ics feed URL to read when none is supplied per-request.
    defaultFeedUrl: get('ICAL_FEED_URL'),
  },
  spotify: {
    clientId: get('SPOTIFY_CLIENT_ID'),
    clientSecret: get('SPOTIFY_CLIENT_SECRET'),
    // Spotify requires 127.0.0.1 (not "localhost") for loopback redirect URIs.
    redirectUri: get('SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:4000/api/music/callback'),
  },
};

/**
 * Reports which integrations have the credentials they need. The frontend can
 * hit /api/status to know what's live vs. what still needs setup.
 */
export function integrationStatus() {
  return {
    weather: Boolean(config.weather.openWeatherKey),
    stocks: Boolean(config.stocks.finnhubKey),
    news: Boolean(config.news.gnewsKey),
    sports: {
      football: Boolean(config.sports.footballDataKey),
      nba: Boolean(config.sports.balldontlieKey),
      nfl: Boolean(config.sports.balldontlieKey),
      f1: true, // Jolpica needs no key
    },
    ai: {
      gemini: Boolean(config.ai.geminiKey),
      openai: Boolean(config.ai.openaiKey),
      claude: Boolean(config.ai.claudeKey),
      default: config.ai.provider,
    },
    calendar: {
      google: Boolean(config.google.clientId && config.google.clientSecret),
      ical: Boolean(config.ical.defaultFeedUrl) || 'per-request',
    },
    music: Boolean(config.spotify.clientId && config.spotify.clientSecret),
  };
}
