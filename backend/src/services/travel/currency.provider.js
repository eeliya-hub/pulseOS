import { fetchJson } from '../../utils/httpClient.js';
import { wikiSearch, wikiSummary } from './wikipedia.js';

/**
 * Live exchange rates, keyless.
 *
 * Frankfurter publishes the European Central Bank's daily reference rates —
 * accurate, free, no signup, no attribution string to display. It only covers
 * the ~30 currencies the ECB quotes, so anything outside that (THB, AED, VND…)
 * falls through to exchangerate-api's open endpoint, which is also free and
 * covers 160+.
 */
const FRANKFURTER = 'https://api.frankfurter.dev/v1';
const OPEN_ER = 'https://open.er-api.com/v6';

export const currencyProvider = {
  /**
   * One rate: how many `to` you get for 1 `from`.
   *
   * @returns {Promise<{rate:number, date:string, source:string}|null>}
   */
  async rate(from, to) {
    const base = (from || '').toUpperCase();
    const quote = (to || '').toUpperCase();
    if (!base || !quote) return null;
    if (base === quote) return { rate: 1, date: today(), source: 'identity' };

    const ecb = await fetchJson(`${FRANKFURTER}/latest?base=${base}&symbols=${quote}`, {
      integration: 'Frankfurter',
      timeoutMs: 8000,
    }).catch(() => null);

    const ecbRate = ecb?.rates?.[quote];
    if (ecbRate) return { rate: ecbRate, date: ecb.date ?? today(), source: 'ECB via Frankfurter' };

    const open = await fetchJson(`${OPEN_ER}/latest/${base}`, {
      integration: 'exchangerate-api',
      timeoutMs: 8000,
    }).catch(() => null);

    const openRate = open?.rates?.[quote];
    if (!openRate) return null;
    return {
      rate: openRate,
      date: (open.time_last_update_utc || '').slice(5, 16) || today(),
      source: 'exchangerate-api',
    };
  },

  /**
   * Daily closes for the last `days` days, oldest first — the sparkline under
   * the converter. ECB only, since it's the only free source with history;
   * returns an empty list for pairs it doesn't quote.
   */
  async series(from, to, days = 30) {
    const base = (from || '').toUpperCase();
    const quote = (to || '').toUpperCase();
    if (!base || !quote || base === quote) return [];

    const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const data = await fetchJson(`${FRANKFURTER}/${start}..?base=${base}&symbols=${quote}`, {
      integration: 'Frankfurter',
      timeoutMs: 8000,
    }).catch(() => null);

    const rates = data?.rates ?? {};
    return Object.keys(rates)
      .sort()
      .map((date) => ({ date, rate: rates[date]?.[quote] }))
      .filter((point) => point.rate != null);
  },
};

const today = () => new Date().toISOString().slice(0, 10);

/** "JPY" → "Japanese Yen", straight from the runtime's own currency names. */
export function currencyName(code) {
  const iso = (code || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso)) return null;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(iso);
    return name && name !== iso ? name : null;
  } catch {
    return null;
  }
}

/**
 * A picture of the money itself.
 *
 * Wikipedia keeps a "Banknotes of the …" article for most currencies, and its
 * lead image is exactly what's wanted: the current series of notes. Searching
 * for it beats guessing the title, because the article names don't follow the
 * ISO names ("Banknotes of the pound sterling", not "British Pound"). The
 * currency's own article is the fallback, though it often leads with a coin.
 */
export async function banknotePhoto(code) {
  const name = currencyName(code);
  if (!name) return null;

  const pages = await wikiSearch(`${name} banknotes`, 4);
  // An article actually about the notes wins over one that merely mentions them.
  const ranked = [...pages].sort(
    (a, b) => Number(/^banknotes/i.test(b.key)) - Number(/^banknotes/i.test(a.key)),
  );

  const found = [];
  for (const page of ranked.slice(0, 2)) {
    const summary = await wikiSummary(page.key);
    if (summary?.photo?.url) found.push(summary);
  }
  // Only spend another request when the search turned up nothing usable.
  if (!found.length) {
    const fallback = await wikiSummary(name);
    if (fallback?.photo?.url) found.push(fallback);
  }

  // Some of these articles lead with a street scene rather than the notes
  // ("Banknotes of the Thai baht" opens on a Songkran photo), so prefer an image
  // whose file name says it's money before settling for the first one going.
  const money = found.find((summary) => /note|banknote|currency|money|bill|kronur|yen|euro/i.test(summary.photo.url));
  const best = money ?? found[0];
  return best
    ? { url: best.photo.url, title: best.title, wikiUrl: best.wikiUrl, credit: 'Wikipedia' }
    : null;
}
