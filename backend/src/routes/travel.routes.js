import { Router } from 'express';
import { travelController } from '../controllers/travel.controller.js';

export const travelRouter = Router();

// Destination lookup — coordinates, time zone, currency, country facts, photo.
travelRouter.get('/destination', travelController.destination);

// Live flight tracking (keyless ADS-B).
travelRouter.get('/flight', travelController.flight);
travelRouter.get('/aircraft', travelController.aircraft);

// Live exchange rates + 30-day history.
travelRouter.get('/fx', travelController.fx);

// Hotels, restaurants and sights (Google Places when keyed, OSM otherwise).
travelRouter.get('/places', travelController.places);
travelRouter.get('/photos', travelController.photos);
travelRouter.get('/photo', travelController.photo);
travelRouter.get('/places/:id', travelController.placeDetails);
