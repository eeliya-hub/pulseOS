import { Router } from 'express';
import { calendarController } from '../controllers/calendar.controller.js';

export const calendarRouter = Router();

// Connection status (which calendars are configured/connected)
calendarRouter.get('/status', calendarController.status);

// OAuth (Google, read+write)
calendarRouter.get('/google/auth', calendarController.googleAuth);
calendarRouter.get('/google/callback', calendarController.googleCallback);

// Apple iCloud (CalDAV) — connect with Apple ID + app-specific password
calendarRouter.post('/apple/connect', calendarController.appleConnect);
calendarRouter.post('/apple/disconnect', calendarController.appleDisconnect);

// The user's calendars (Google + Apple) for visibility toggles + add-to picker
calendarRouter.get('/calendars', calendarController.listCalendars);

// Events — read aggregates all sources; write goes to Google/Apple by `source`.
calendarRouter.get('/events', calendarController.listEvents);
calendarRouter.post('/events', calendarController.createEvent);
calendarRouter.patch('/events', calendarController.updateEvent);
calendarRouter.delete('/events', calendarController.deleteEvent);
