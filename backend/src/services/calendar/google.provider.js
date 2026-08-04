import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { tokenStore } from '../../utils/tokenStore.js';

// Google Calendar — READ + WRITE via OAuth 2.0 across ALL of the user's calendars.
const INTEGRATION = 'Google Calendar';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const dateOnly = (d) => new Date(d).toISOString().slice(0, 10);

// Build a Google start/end object. All-day uses {date}; timed uses {dateTime}.
// Google treats all-day end.date as exclusive, so nudge it to at least the next day.
function gTime(value, { allDay, isEnd, start } = {}) {
  if (!allDay) return { dateTime: new Date(value).toISOString() };
  let day = dateOnly(value);
  if (isEnd && start && day <= dateOnly(start)) {
    day = dateOnly(new Date(new Date(start).getTime() + 86_400_000));
  }
  return { date: day };
}

const mapGoogleEvent = (e, cal) => ({
  id: e.id,
  calendarId: cal.id,
  calendarName: cal.name,
  source: 'google',
  color: cal.color,
  writable: cal.writable,
  editable: cal.writable, // Google supports editing single recurrence instances
  recurring: Boolean(e.recurringEventId),
  recurringEventId: e.recurringEventId || null,
  title: e.summary,
  description: e.description,
  location: e.location,
  start: e.start?.dateTime || e.start?.date,
  end: e.end?.dateTime || e.end?.date,
  allDay: Boolean(e.start?.date && !e.start?.dateTime),
  htmlLink: e.htmlLink,
});

async function loadGoogleApis() {
  try {
    const mod = await import('googleapis');
    return mod.google;
  } catch {
    throw ApiError.notConfigured(`${INTEGRATION} (run "npm install googleapis" in backend/)`);
  }
}

function requireCreds() {
  const { clientId, clientSecret } = config.google;
  if (!clientId || !clientSecret) throw ApiError.notConfigured(INTEGRATION);
}

async function oauthClient() {
  requireCreds();
  const google = await loadGoogleApis();
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}

async function authedCalendar(user) {
  const tokens = tokenStore.get('google', user);
  if (!tokens) throw ApiError.unauthorized('Google Calendar not connected. Visit /api/calendar/google/auth first.');
  const google = await loadGoogleApis();
  const auth = await oauthClient();
  auth.setCredentials(tokens);
  auth.on('tokens', (fresh) => tokenStore.set('google', { ...tokens, ...fresh }, user));
  return google.calendar({ version: 'v3', auth });
}

async function calendarMeta(client) {
  try {
    const { data } = await client.calendarList.list();
    const cals = (data.items ?? []).map((c) => ({
      id: c.id,
      name: c.summaryOverride || c.summary,
      color: c.backgroundColor,
      writable: ['owner', 'writer'].includes(c.accessRole),
      primary: Boolean(c.primary),
    }));
    return cals.length ? cals : [{ id: 'primary', name: 'Primary', writable: true }];
  } catch {
    return [{ id: 'primary', name: 'Primary', writable: true }];
  }
}

export const googleProvider = {
  async getAuthUrl() {
    const auth = await oauthClient();
    return auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
  },

  async handleCallback(code, user) {
    if (!code) throw ApiError.badRequest('Missing `code` from Google OAuth callback.');
    const auth = await oauthClient();
    const { tokens } = await auth.getToken(code);
    tokenStore.set('google', tokens, user);
    return { connected: true };
  },

  isConnected: (user) => tokenStore.has('google', user),

  /**
   * Drop the stored tokens. Needed as its own action because a refresh token can
   * die while still sitting in the store (Google expires them for OAuth clients
   * in Testing mode, and a user can revoke access at any time) — at which point
   * reconnecting is the only fix, and you can't reconnect what still claims to
   * be connected.
   */
  disconnect(user) {
    tokenStore.clear('google', user);
    return { connected: false };
  },

  async listCalendars(user) {
    const client = await authedCalendar(user);
    return (await calendarMeta(client)).map((c) => ({ ...c, source: 'google' }));
  },

  async listEvents({ timeMin, timeMax, maxResults = 100, user } = {}) {
    const client = await authedCalendar(user);
    const cals = await calendarMeta(client);
    const timeMinIso = timeMin || new Date().toISOString();
    const perCalendar = await Promise.all(
      cals.map((cal) =>
        client.events
          .list({ calendarId: cal.id, timeMin: timeMinIso, timeMax, maxResults, singleEvents: true, orderBy: 'startTime' })
          .then(({ data }) => (data.items ?? []).map((e) => mapGoogleEvent(e, cal)))
          .catch(() => []),
      ),
    );
    return perCalendar.flat();
  },

  async createEvent({ calendarId = 'primary', title, description, location, start, end, allDay, user }) {
    if (!title || !start) throw ApiError.badRequest('An event needs at least a `title` and `start`.');
    const client = await authedCalendar(user);
    const { data } = await client.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        description,
        location,
        start: gTime(start, { allDay }),
        end: gTime(end || start, { allDay, isEnd: true, start }),
      },
    });
    return { id: data.id, calendarId, htmlLink: data.htmlLink, source: 'google' };
  },

  async updateEvent({ calendarId = 'primary', eventId, title, description, location, start, end, allDay, user }) {
    if (!eventId) throw ApiError.badRequest('Provide the `eventId` to update.');
    const client = await authedCalendar(user);
    const requestBody = { summary: title, description, location };
    if (start) requestBody.start = gTime(start, { allDay });
    if (end || start) requestBody.end = gTime(end || start, { allDay, isEnd: true, start });
    const { data } = await client.events.patch({ calendarId, eventId, requestBody });
    return { id: data.id, calendarId, source: 'google' };
  },

  async deleteEvent({ calendarId = 'primary', eventId, recurringEventId, scope, user }) {
    const client = await authedCalendar(user);
    // scope 'all' deletes the whole series; otherwise just this occurrence.
    const id = scope === 'all' && recurringEventId ? recurringEventId : eventId;
    if (!id) throw ApiError.badRequest('Provide the `eventId` to delete.');
    await client.events.delete({ calendarId, eventId: id });
    return { deleted: true };
  },
};
