import { airlineArtService } from '../services/travel/airlineArt.service.js';
import { travelService } from '../services/travel/travel.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const num = (value) => (value === undefined || value === '' ? undefined : Number(value));

export const travelController = {
  // GET /api/travel/destination?q=Tokyo
  destination: asyncHandler(async (req, res) => {
    const data = await travelService.destination(req.query.q);
    if (!data) throw ApiError.notFound(`No destination found for “${req.query.q ?? ''}”.`);
    res.json(data);
  }),

  // GET /api/travel/flight?code=BA117&date=2026-08-20
  flight: asyncHandler(async (req, res) => {
    const data = await travelService.flight(req.query.code, req.query.date, {
      live: req.query.live !== '0' && req.query.live !== 'false',
    });
    if (!data) throw ApiError.badRequest('Provide a `code` flight number, e.g. BA117.');
    res.json(data);
  }),

  // GET /api/travel/aircraft?registration=G-UZLA
  aircraft: asyncHandler(async (req, res) => {
    res.json(await travelService.aircraft(req.query.registration));
  }),

  // GET /api/travel/fx?from=GBP&to=JPY&amount=50
  fx: asyncHandler(async (req, res) => {
    const data = await travelService.fx({
      from: req.query.from,
      to: req.query.to,
      amount: req.query.amount ?? 1,
      history: req.query.history !== 'false',
    });
    if (!data) throw ApiError.notFound(`No exchange rate for ${req.query.from} → ${req.query.to}.`);
    res.json(data);
  }),

  // GET /api/travel/places?q=ramen&lat=&lon=&kind=food
  places: asyncHandler(async (req, res) => {
    const results = await travelService.places({
      q: req.query.q,
      lat: num(req.query.lat),
      lon: num(req.query.lon),
      kind: req.query.kind,
      limit: num(req.query.limit) ?? 8,
    });
    res.json({ source: travelService.placesSource(), results });
  }),

  // GET /api/travel/photos?q=teamLab Planets&lat=&lon=&placeId=
  photos: asyncHandler(async (req, res) => {
    const results = await travelService.photos({
      q: req.query.q,
      placeId: req.query.placeId,
      lat: num(req.query.lat),
      lon: num(req.query.lon),
      limit: num(req.query.limit) ?? 6,
    });
    res.json({ source: travelService.placesSource(), results });
  }),

  // GET /api/travel/places/:id
  placeDetails: asyncHandler(async (req, res) => {
    res.json(await travelService.placeDetails(req.params.id));
  }),

  /**
   * GET /api/travel/photo?ref=places/…/photos/…&w=800
   * Proxies a Google place photo so the API key stays on the server. Cached hard
   * at the browser — a hotel's photo doesn't change during a trip.
   */
  /**
   * GET /api/travel/airline-art?icao=BAW&kind=logos
   * An airline's crest or banner, with cache headers its bucket refuses to send.
   */
  airlineArt: asyncHandler(async (req, res) => {
    const { buffer, type } = await airlineArtService.fetch(req.query.icao, req.query.kind);
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=2592000, immutable');
    res.send(buffer);
  }),

  photo: asyncHandler(async (req, res) => {
    const { buffer, contentType } = await travelService.placePhoto(req.query.ref, req.query.w);
    res.set('content-type', contentType);
    res.set('cache-control', 'public, max-age=86400, immutable');
    res.send(buffer);
  }),
};
