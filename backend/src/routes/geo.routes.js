import { Router } from 'express';
import { geoService } from '../services/geo/geo.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const geoRouter = Router();

// GET /api/geo?q=Emirates Stadium, London  → { lat, lon, label } | null
geoRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await geoService.geocode(req.query.q));
  }),
);
