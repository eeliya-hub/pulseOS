import { config } from '../../config/env.js';
import { createCache } from '../../utils/cache.js';
import { appleProvider } from './apple.provider.js';
import { googleProvider } from './google.provider.js';
import { icalProvider } from './ical.provider.js';

// LifeHub calendar. Google + Apple are read+write; iCal feeds are read-only.
// Read results are cached briefly; writes clear the cache. A minute, not ten: a
// change made on a phone never reaches this app, so the cache is the only thing
// standing between an edit in Apple Calendar and it showing up here.
const cache = createCache(60 * 1000);

export const calendarService = {
  google: googleProvider,
  apple: appleProvider,

  async getAuthUrl() {
    return { url: await googleProvider.getAuthUrl() };
  },

  async connectGoogle(code, user) {
    return googleProvider.handleCallback(code, user);
  },

  disconnectGoogle(user) {
    cache.clear('events:');
    return googleProvider.disconnect(user);
  },

  connectApple(credentials, user) {
    return appleProvider.connect(credentials, user);
  },

  disconnectApple(user) {
    return appleProvider.disconnect(user);
  },

  status(user) {
    return {
      google: {
        configured: Boolean(config.google.clientId && config.google.clientSecret),
        connected: googleProvider.isConnected(user),
      },
      apple: { configured: true, connected: appleProvider.isConnected(user) },
    };
  },

  // The user's writable calendars across connected accounts (for the visibility
  // toggles + "add event to…" picker). iCal feeds are managed client-side.
  async listCalendars(user) {
    const jobs = [];
    if (googleProvider.isConnected(user)) jobs.push(googleProvider.listCalendars(user).catch(() => []));
    if (appleProvider.isConnected(user)) jobs.push(appleProvider.listCalendars(user).catch(() => []));
    const results = await Promise.all(jobs);
    return { calendars: results.flat() };
  },

  /**
   * Aggregate events. source: 'google' | 'apple' | 'ical' | 'all'.
   * `url` may be a comma-separated list of .ics feeds. Each event is tagged with
   * `calendarId`, `color`, `source` and (where writable) provider references.
   */
  async listEvents({ source = 'all', url, timeMin, timeMax, user } = {}) {
    // Only the END of the window is bucketed to its day. The caller sends "now +
    // 75 days", which differs on every single call — so the key never repeated,
    // the cache never hit once, and every refresh went live to Google and iCloud
    // while leaving behind an entry nothing would ever read again.
    //
    // The start stays exact on purpose: callers like "what's on today" trust the
    // range they asked for rather than filtering it, so two different windows
    // must never share an entry. Same start plus same end-day is the same query.
    const endDay = timeMax ? String(timeMax).slice(0, 10) : '';
    const key = `events:${source}:${url ?? ''}:${timeMin ?? ''}:${endDay}:${user ?? ''}`;
    const result = await cache.wrap(key, async () => {
      const jobs = [];
      // Which sources answered, so the caller can tell "nothing on" from "that
      // account failed". Swallowing every error into an empty list made a lapsed
      // sign-in look exactly like an empty week.
      const sources = {};
      const track = (name, promise) =>
        promise.then(
          (events) => {
            sources[name] = { ok: true, count: events.length };
            return events;
          },
          (error) => {
            sources[name] = {
              ok: false,
              // 401 here means the account needs reconnecting, not that the
              // request was malformed — worth saying so.
              reason: error?.status === 401 ? 'auth' : 'error',
              message: error?.message ?? 'Failed',
            };
            return [];
          },
        );

      if ((source === 'all' || source === 'google') && googleProvider.isConnected(user)) {
        jobs.push(track('google', googleProvider.listEvents({ timeMin, timeMax, user })));
      }
      if ((source === 'all' || source === 'apple') && appleProvider.isConnected(user)) {
        jobs.push(track('apple', appleProvider.listEvents({ timeMin, timeMax, user })));
      }
      if (source === 'all' || source === 'ical') {
        const urls = (url || config.ical.defaultFeedUrl || '')
          .split(',')
          .map((u) => u.trim())
          .filter(Boolean);
        for (const feed of urls) {
          jobs.push(
            icalProvider
              .listEvents(feed, { timeMin, timeMax })
              .then((evs) => evs.map((e) => ({ ...e, calendarId: feed, writable: false })))
              .catch(() => []),
          );
        }
      }

      const results = await Promise.all(jobs);
      return {
        events: results.flat().sort((a, b) => new Date(a.start) - new Date(b.start)),
        sources,
      };
    });
    // Don't hold a partial answer for the cache's full life: if a source failed,
    // the next request should try it again rather than serve the gap for minutes.
    if (Object.values(result.sources ?? {}).some((s) => !s.ok)) cache.clear(key);
    return result;
  },

  async createEvent(payload) {
    const provider = payload.source === 'apple' ? appleProvider : googleProvider;
    const result = await provider.createEvent(payload);
    cache.clear('events:');
    return result;
  },

  async updateEvent(payload) {
    const provider = payload.source === 'apple' ? appleProvider : googleProvider;
    const result = await provider.updateEvent(payload);
    cache.clear('events:');
    return result;
  },

  async deleteEvent(payload) {
    const provider = payload.source === 'apple' ? appleProvider : googleProvider;
    const result = await provider.deleteEvent(payload);
    cache.clear('events:');
    return result;
  },
};
