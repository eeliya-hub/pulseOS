import { Router } from 'express';
import { weatherController } from '../controllers/weather.controller.js';

export const weatherRouter = Router();

// GET /api/weather?city=London           (or ?lat=..&lon=..)
weatherRouter.get('/', weatherController.getCurrent);
// GET /api/weather/forecast?city=London
weatherRouter.get('/forecast', weatherController.getForecast);
// GET /api/weather/summary?city=London    (everything the dashboard renders)
weatherRouter.get('/summary', weatherController.getSummary);
