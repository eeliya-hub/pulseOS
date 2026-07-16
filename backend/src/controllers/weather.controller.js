import { weatherService } from '../services/weather/weather.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const parseParams = (req) => ({
  city: req.query.city,
  lat: req.query.lat,
  lon: req.query.lon,
  units: req.query.units,
});

export const weatherController = {
  getCurrent: asyncHandler(async (req, res) => {
    res.json(await weatherService.getCurrent(parseParams(req)));
  }),

  getForecast: asyncHandler(async (req, res) => {
    res.json(await weatherService.getForecast(parseParams(req)));
  }),

  getSummary: asyncHandler(async (req, res) => {
    res.json(await weatherService.getSummary(parseParams(req)));
  }),
};
