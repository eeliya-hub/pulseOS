import { calendarService } from '../services/calendar/calendar.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const calendarController = {
  // GET /api/calendar/google/auth → { url }
  googleAuth: asyncHandler(async (_req, res) => {
    res.json(await calendarService.getAuthUrl());
  }),

  // GET /api/calendar/google/callback?code=...
  googleCallback: asyncHandler(async (req, res) => {
    await calendarService.connectGoogle(req.query.code);
    // Notify the opener (the app) and auto-close the OAuth popup/tab.
    res.set('Content-Type', 'text/html').send(
      `<!doctype html><meta charset="utf-8"><title>Connected</title>
       <body style="font-family:system-ui;background:#0b1220;color:#e8eefc;display:grid;place-items:center;height:100vh;margin:0">
       <div style="text-align:center">
         <p style="font-size:20px;font-weight:300">✅ Google Calendar connected</p>
         <p style="opacity:.6;font-size:13px">You can close this window.</p>
       </div>
       <script>
         try { window.opener && window.opener.postMessage('pulse:google-calendar-connected', '*'); } catch (e) {}
         setTimeout(() => window.close(), 1200);
       </script></body>`,
    );
  }),

  // POST /api/calendar/google/disconnect
  googleDisconnect: asyncHandler(async (_req, res) => {
    res.json(calendarService.disconnectGoogle());
  }),

  // GET /api/calendar/status → { google: {...}, apple: {...} }
  status: asyncHandler(async (_req, res) => {
    res.json(calendarService.status());
  }),

  // POST /api/calendar/apple/connect { appleId, appPassword }
  appleConnect: asyncHandler(async (req, res) => {
    const { appleId, appPassword } = req.body ?? {};
    res.json(await calendarService.connectApple({ appleId, appPassword }));
  }),

  // POST /api/calendar/apple/disconnect
  appleDisconnect: asyncHandler(async (_req, res) => {
    res.json(calendarService.disconnectApple());
  }),

  // GET /api/calendar/events?source=all|google|ical&url=...&timeMin=...&timeMax=...
  listEvents: asyncHandler(async (req, res) => {
    res.json(
      await calendarService.listEvents({
        source: req.query.source,
        url: req.query.url,
        timeMin: req.query.timeMin,
        timeMax: req.query.timeMax,
      }),
    );
  }),

  // GET /api/calendar/calendars → { calendars: [{ id, name, color, source, writable }] }
  listCalendars: asyncHandler(async (_req, res) => {
    res.json(await calendarService.listCalendars());
  }),

  // POST /api/calendar/events { source, calendarId, title, start, end, allDay, ... }
  createEvent: asyncHandler(async (req, res) => {
    res.status(201).json(await calendarService.createEvent(req.body ?? {}));
  }),

  // PATCH /api/calendar/events { source, calendarId/eventId or providerUrl/etag, ... }
  updateEvent: asyncHandler(async (req, res) => {
    res.json(await calendarService.updateEvent(req.body ?? {}));
  }),

  // DELETE /api/calendar/events { source, calendarId/eventId or providerUrl/etag }
  deleteEvent: asyncHandler(async (req, res) => {
    res.json(await calendarService.deleteEvent(req.body ?? {}));
  }),
};
