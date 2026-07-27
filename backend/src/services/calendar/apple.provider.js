import { ApiError } from '../../utils/ApiError.js';
import { tokenStore } from '../../utils/tokenStore.js';
import { buildICS } from './icalBuild.js';
import { eventsFromParsed } from './icalParse.js';

// Apple iCloud Calendar via CalDAV (read + write). iCloud has no OAuth, so the
// user authenticates with their Apple ID + an app-specific password.
const INTEGRATION = 'Apple Calendar';
const SERVER_URL = 'https://caldav.icloud.com';

async function loadTsdav() {
  try {
    return await import('tsdav');
  } catch {
    throw ApiError.notConfigured(`${INTEGRATION} (run "npm install tsdav" in backend/)`);
  }
}
async function loadNodeIcal() {
  try {
    const mod = await import('node-ical');
    return mod.default ?? mod;
  } catch {
    throw ApiError.notConfigured(`${INTEGRATION} (run "npm install node-ical" in backend/)`);
  }
}

async function makeClient({ appleId, appPassword }) {
  const { createDAVClient } = await loadTsdav();
  return createDAVClient({
    serverUrl: SERVER_URL,
    credentials: { username: appleId, password: appPassword },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
}

// iCloud colours are #RRGGBB or #RRGGBBAA — trim any alpha.
const normColor = (c) => (c ? `#${String(c).replace('#', '').slice(0, 6)}` : null);
const isEventCalendar = (c) => !c.components || c.components.includes('VEVENT');

// Reuse the CalDAV client + calendar list across requests. iCloud throttles
// repeated Basic-auth logins, and re-logging-in (plus re-listing calendars) on
// every request was intermittently failing — which surfaced as "no events".
// Caching those makes reads both faster and far more reliable.
const CLIENT_TTL = 10 * 60 * 1000;
const clientCache = new Map(); // userKey -> { client, at }
const calCache = new Map(); // userKey -> { calendars, at }
const userKey = (user) => user || 'default';

function invalidate(user) {
  clientCache.delete(userKey(user));
  calCache.delete(userKey(user));
}

async function getClient(user, fresh = false) {
  const key = userKey(user);
  const hit = clientCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CLIENT_TTL) return hit.client;
  const creds = tokenStore.get('apple', user);
  if (!creds) throw ApiError.unauthorized('Apple Calendar not connected.');
  const client = await makeClient(creds);
  clientCache.set(key, { client, at: Date.now() });
  return client;
}

// The user's event calendars, cached briefly (they rarely change).
async function getEventCalendars(user, fresh = false) {
  const key = userKey(user);
  const hit = calCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CLIENT_TTL) return hit.calendars;
  const client = await getClient(user, fresh);
  const calendars = (await client.fetchCalendars()).filter(isEventCalendar);
  calCache.set(key, { calendars, at: Date.now() });
  return calendars;
}

export const appleProvider = {
  isConnected: (user) => tokenStore.has('apple', user),

  async connect({ appleId, appPassword } = {}, user) {
    if (!appleId || !appPassword) {
      throw ApiError.badRequest('Provide your Apple ID and an app-specific password.');
    }
    try {
      const client = await makeClient({ appleId, appPassword });
      const calendars = await client.fetchCalendars();
      if (!calendars?.length) throw new Error('no calendars returned');
      tokenStore.set('apple', { appleId, appPassword }, user);
      return { connected: true, calendars: calendars.length };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.unauthorized(
        'Could not sign in to iCloud. Check your Apple ID and app-specific password (create one at appleid.apple.com → Sign-In and Security → App-Specific Passwords).',
      );
    }
  },

  disconnect(user) {
    tokenStore.clear('apple', user);
    invalidate(user);
    return { connected: false };
  },

  async listCalendars(user) {
    if (!this.isConnected(user)) return [];
    const calendars = await getEventCalendars(user);
    return calendars.map((c) => ({
      id: c.url,
      name: c.displayName || 'Calendar',
      color: normColor(c.calendarColor),
      source: 'apple',
      writable: !c.readOnly,
    }));
  },

  async listEvents({ timeMin, timeMax, user } = {}) {
    const nodeIcal = await loadNodeIcal();
    const start = (timeMin ? new Date(timeMin) : new Date()).toISOString();
    const end = (timeMax ? new Date(timeMax) : new Date(Date.now() + 60 * 86_400_000)).toISOString();

    // Fetch every calendar's objects in parallel. If EVERY calendar read fails,
    // the whole attempt failed (a dead client / iCloud throttle) — throw so the
    // caller can retry or serve a cached result, rather than reporting "no events".
    const fetchAll = async (fresh) => {
      const client = await getClient(user, fresh);
      const calendars = await getEventCalendars(user, fresh);
      let failures = 0;

      const perCalendar = await Promise.all(
        calendars.map(async (calendar) => {
          const meta = {
            calendarId: calendar.url,
            calendarName: calendar.displayName || 'Calendar',
            color: normColor(calendar.calendarColor),
            calendarWritable: !calendar.readOnly,
          };
          let objects;
          try {
            objects = await client.fetchCalendarObjects({ calendar, timeRange: { start, end } });
          } catch {
            failures += 1;
            return [];
          }
          const events = [];
          for (const obj of objects) {
            if (!obj?.data) continue;
            try {
              const parsed = nodeIcal.sync.parseICS(obj.data);
              for (const ev of eventsFromParsed(parsed, { timeMin, timeMax, source: 'apple' })) {
                events.push({
                  ...ev,
                  calendarId: meta.calendarId,
                  calendarName: meta.calendarName,
                  color: meta.color,
                  providerUrl: obj.url,
                  etag: obj.etag,
                  // Recurring events can be deleted (whole series, or one occurrence
                  // via EXDATE) but not edited — rebuilding would drop their RRULE.
                  writable: meta.calendarWritable,
                  editable: meta.calendarWritable && !ev.recurring,
                });
              }
            } catch {
              /* skip unparseable object */
            }
          }
          return events;
        }),
      );

      if (calendars.length && failures === calendars.length) {
        throw new Error('All Apple calendar reads failed');
      }
      return perCalendar.flat();
    };

    let all;
    try {
      all = await fetchAll(false);
    } catch {
      // A cached client/login can go stale (iCloud drops it) — rebuild once.
      invalidate(user);
      all = await fetchAll(true);
    }
    return all.sort((a, b) => new Date(a.start) - new Date(b.start));
  },

  async createEvent({ calendarId, title, description, location, start, end, allDay, user }) {
    if (!title || !start) throw ApiError.badRequest('An event needs at least a `title` and `start`.');
    const client = await getClient(user);
    const calendars = await getEventCalendars(user);
    const calendar = calendars.find((c) => c.url === calendarId) || calendars[0];
    if (!calendar) throw ApiError.badRequest('No writable iCloud calendar found.');
    const uid = `pulseos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@icloud`;
    const iCalString = buildICS({ uid, title, description, location, start, end, allDay });
    await client.createCalendarObject({ calendar, filename: `${uid}.ics`, iCalString });
    return { id: uid, source: 'apple', calendarId: calendar.url };
  },

  async updateEvent({ providerUrl, etag, uid, title, description, location, start, end, allDay, user }) {
    if (!providerUrl) throw ApiError.badRequest('Missing the event reference to update.');
    const client = await getClient(user);
    const iCalString = buildICS({
      uid: uid || `pulseos-${Date.now()}@icloud`,
      title,
      description,
      location,
      start,
      end,
      allDay,
    });
    await client.updateCalendarObject({ calendarObject: { url: providerUrl, data: iCalString, etag } });
    return { updated: true, source: 'apple' };
  },

  async deleteEvent({ providerUrl, etag, calendarId, scope, recurring, occurrenceStart, allDay, user }) {
    if (!providerUrl) throw ApiError.badRequest('Missing the event reference to delete.');
    const client = await getClient(user);

    // Delete a single occurrence of a series by adding an EXDATE to the master.
    if (recurring && scope !== 'all' && occurrenceStart) {
      try {
        const calendars = await getEventCalendars(user);
        const calendar = calendars.find((c) => c.url === calendarId) || calendars[0];
        const [obj] = await client.fetchCalendarObjects({ calendar, objectUrls: [providerUrl] });
        if (obj?.data) {
          const exdate = allDay
            ? `EXDATE;VALUE=DATE:${icsCompact(occurrenceStart, true)}`
            : `EXDATE:${icsCompact(occurrenceStart, false)}`;
          const data = obj.data.replace(/END:VEVENT/, `${exdate}\r\nEND:VEVENT`);
          await client.updateCalendarObject({ calendarObject: { url: providerUrl, data, etag: obj.etag } });
          return { deleted: true, scope: 'this' };
        }
      } catch {
        /* fall through to deleting the whole object */
      }
    }

    await client.deleteCalendarObject({ calendarObject: { url: providerUrl, etag } });
    return { deleted: true, scope: 'all' };
  },
};

const pad2 = (n) => String(n).padStart(2, '0');
function icsCompact(iso, allDay) {
  const d = new Date(iso);
  const ymd = `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
  return allDay ? ymd : `${ymd}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}
