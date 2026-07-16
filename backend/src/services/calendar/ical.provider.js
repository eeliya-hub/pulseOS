import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { eventsFromParsed } from './icalParse.js';

// iCal (.ics) feeds — READ ONLY. Uses `node-ical` to fetch + parse; recurrence
// expansion and windowing live in the shared icalParse helper.
const INTEGRATION = 'iCal';

async function loadNodeIcal() {
  try {
    const mod = await import('node-ical');
    return mod.default ?? mod;
  } catch {
    throw ApiError.notConfigured(`${INTEGRATION} (run "npm install node-ical" in backend/)`);
  }
}

export const icalProvider = {
  /**
   * @param {string} [feedUrl] .ics URL; falls back to ICAL_FEED_URL from env.
   * @param {{timeMin?:string,timeMax?:string}} [window]
   */
  async listEvents(feedUrl, { timeMin, timeMax } = {}) {
    const url = feedUrl || config.ical.defaultFeedUrl;
    if (!url) throw ApiError.badRequest('Provide an `url` to an .ics feed (or set ICAL_FEED_URL).');

    const nodeIcal = await loadNodeIcal();
    const data = await nodeIcal.async.fromURL(url);
    return eventsFromParsed(data, { timeMin, timeMax, source: 'ical' }).sort(
      (a, b) => new Date(a.start) - new Date(b.start),
    );
  },
};
