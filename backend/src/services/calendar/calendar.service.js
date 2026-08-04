import { config } from '../../config/env.js';
import { createCache } from '../../utils/cache.js';
import { appleProvider } from './apple.provider.js';
import { googleProvider } from './google.provider.js';
import { icalProvider } from './ical.provider.js';

// LifeHub calendar. Google + Apple are read+write; iCal feeds are read-only.
// Read results are cached briefly; writes clear the cache.
const cache = createCache(10 * 60 * 1000);

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
    const key = `events:${source}:${url ?? ''}:${timeMin ?? ''}:${timeMax ?? ''}:${user ?? ''}`;
    return cache.wrap(key, async () => {
      const jobs = [];

      if ((source === 'all' || source === 'google') && googleProvider.isConnected(user)) {
        jobs.push(googleProvider.listEvents({ timeMin, timeMax, user }).catch(() => []));
      }
      if ((source === 'all' || source === 'apple') && appleProvider.isConnected(user)) {
        jobs.push(appleProvider.listEvents({ timeMin, timeMax, user }).catch(() => []));
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
      return { events: results.flat().sort((a, b) => new Date(a.start) - new Date(b.start)) };
    });
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
