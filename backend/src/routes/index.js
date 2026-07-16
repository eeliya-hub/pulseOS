import { Router } from 'express';
import { integrationStatus } from '../config/env.js';
import { aiLimiter, mutationLimiter } from '../middleware/rateLimit.js';
import { quotaSnapshot } from '../services/ai/quota.js';
import { aiRouter } from './ai.routes.js';
import { calendarRouter } from './calendar.routes.js';
import { geoRouter } from './geo.routes.js';
import { launchRouter } from './launch.routes.js';
import { musicRouter } from './music.routes.js';
import { newsRouter } from './news.routes.js';
import { sportsRouter } from './sports.routes.js';
import { stocksRouter } from './stocks.routes.js';
import { weatherRouter } from './weather.routes.js';

export const apiRouter = Router();

// Liveness + which integrations are configured (drives frontend "setup" hints).
apiRouter.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
apiRouter.get('/status', (_req, res) => res.json({ integrations: integrationStatus() }));

// How much of each AI provider's usage cap is spent, and when it resets. The UI
// can show "AI paused until midnight" instead of a bare 429.
apiRouter.get('/usage', (_req, res) => res.json({ ai: quotaSnapshot() }));

// Feature routers. Each owns a clean route → controller → service → provider path.
// The global limiter (app.js) already applies; these add a tighter budget where
// the upstream is metered (AI) or changes state (calendar/music writes).
apiRouter.use('/weather', weatherRouter);
apiRouter.use('/stocks', stocksRouter);
apiRouter.use('/news', newsRouter);
apiRouter.use('/sports', sportsRouter);
apiRouter.use('/ai', aiLimiter, aiRouter);
apiRouter.use('/calendar', mutationLimiter, calendarRouter);
apiRouter.use('/geo', geoRouter);
apiRouter.use('/music', mutationLimiter, musicRouter);
apiRouter.use('/launch', launchRouter);
