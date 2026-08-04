import { fetchJson, fetchText } from '../../utils/httpClient.js';
import { rssProvider } from '../news/rss.provider.js';
import { decodeEntities, htmlToText } from './pageText.js';

// The always-available search provider: no API key, no account, no cost. Used
// whenever Brave/Tavily aren't configured, and as the safety net if they fail.
//
// No single keyless source is dependable on its own — DuckDuckGo's HTML endpoint
// answers freely one minute and rate-limits the next — so this queries several
// in parallel and merges them:
//   • DuckDuckGo (lite HTML)  general web results, when it feels like answering
//   • Bing News RSS           fresh coverage of any topic, with direct article URLs
//   • Google News RSS         a second news index, in case Bing is having a moment
//   • Wikipedia               background on people, places, teams, concepts
//   • DuckDuckGo Instant      a straight answer for facts and definitions
// Between them, something always comes back.
const INTEGRATION = 'Web search';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

// Search engines wrap results in a click-tracking redirect that carries the real
// destination in a query param (DuckDuckGo: uddg, Bing: url). Unwrap it so the
// URL is citable — and so the page behind it can actually be read.
function unwrap(href = '', param) {
  const raw = href.startsWith('//') ? `https:${href}` : href;
  try {
    return new URL(raw).searchParams.get(param) || raw;
  } catch {
    return raw;
  }
}

/** General web results — DuckDuckGo's no-JS "lite" page, scraped. */
async function duckDuckGo(query, max) {
  const html = await fetchText(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=uk-en`, {
    integration: INTEGRATION,
    timeoutMs: 10_000,
    headers: { 'user-agent': UA, accept: 'text/html', 'accept-language': 'en-GB,en;q=0.9' },
  });

  // Ads are marked as sponsored rows — drop them before pairing links to snippets.
  const clean = html.replace(/<tr class="result-sponsored">[\s\S]*?<\/tr>/gi, '');
  const linkRe = /<a\b([^>]*class=['"][^'"]*result-link[^'"]*['"][^>]*)>([\s\S]*?)<\/a>/gi;
  const hits = [...clean.matchAll(linkRe)];

  return hits
    .map((hit, i) => {
      const href = hit[1].match(/href=['"]([^'"]+)['"]/i)?.[1];
      const title = htmlToText(hit[2], 200);
      if (!href || !title) return null;
      const url = unwrap(decodeEntities(href), 'uddg');
      if (!url.startsWith('http')) return null;

      // The snippet sits between this result and the next one.
      const from = hit.index + hit[0].length;
      const to = i + 1 < hits.length ? hits[i + 1].index : clean.length;
      const snippet = clean.slice(from, to).match(/result-snippet['"][^>]*>([\s\S]*?)<\/td>/i)?.[1];

      return { title, url, snippet: snippet ? htmlToText(snippet, 400) : '', source: hostOf(url), publishedAt: null };
    })
    .filter(Boolean)
    .slice(0, max);
}

/** Bing News RSS — keyless, fresh, and its links unwrap to the real article. */
async function bingNews(query, max) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS&setmkt=en-GB`;
  const articles = await rssProvider.fetch(url);
  return articles
    .map((a) => {
      const link = unwrap(a.url, 'url');
      return {
        title: a.title,
        url: link,
        snippet: a.description ? htmlToText(a.description, 400) : '',
        source: hostOf(link),
        publishedAt: a.publishedAt,
      };
    })
    .filter((a) => a.url?.startsWith('http'))
    .slice(0, max);
}

/** Google News RSS — the backup news index. Links stay behind a redirect. */
async function googleNews(query, max) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`;
  const articles = await rssProvider.fetch(url);
  return articles.slice(0, max).map((a) => {
    // Google News titles end in " - Outlet"; lift that out as the source.
    const split = (a.title || '').lastIndexOf(' - ');
    return {
      title: split > 0 ? a.title.slice(0, split) : a.title,
      url: a.url,
      // Their description is just the headline again as a link — no value.
      snippet: '',
      source: split > 0 ? a.title.slice(split + 3) : 'Google News',
      publishedAt: a.publishedAt,
    };
  });
}

/** DuckDuckGo Instant Answer — an authoritative abstract for entities/definitions. */
async function instantAnswer(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const data = await fetchJson(url, { integration: INTEGRATION, timeoutMs: 8_000, headers: { 'user-agent': UA } });

  const answer = (data.Answer && String(data.Answer).trim()) || (data.AbstractText || '').trim() || null;
  const results = [];
  if (data.AbstractURL && data.AbstractText) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL,
      snippet: data.AbstractText,
      source: data.AbstractSource || hostOf(data.AbstractURL),
      publishedAt: null,
    });
  }
  return { answer, results };
}

/** Wikipedia — reliable background on people, places, teams, concepts. */
async function wikipedia(query, limit = 2) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(limit),
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    exlimit: String(limit),
  });
  const data = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`, {
    integration: INTEGRATION,
    timeoutMs: 8_000,
    headers: { 'user-agent': UA },
  });

  return Object.values(data.query?.pages ?? {})
    .filter((p) => p.extract)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .slice(0, limit)
    .map((p) => ({
      title: p.title,
      url: `https://en.wikipedia.org/?curid=${p.pageid}`,
      snippet: decodeEntities(p.extract).slice(0, 600),
      source: 'Wikipedia',
      publishedAt: null,
    }));
}

// The same story from two sources (or the same link twice) is wasted context.
function dedupe(results) {
  const seen = new Set();
  return results.filter((r) => {
    if (!r?.url || !r.title) return false;
    const byUrl = r.url.split('?')[0].replace(/\/$/, '').toLowerCase();
    const byTitle = `t:${r.title.trim().toLowerCase()}`;
    if (seen.has(byUrl) || seen.has(byTitle)) return false;
    seen.add(byUrl);
    seen.add(byTitle);
    return true;
  });
}

// Round-robin the sources rather than concatenating them, so one chatty source
// (news always returns ten items) can't push the encyclopedic one off the end.
function interleave(...lists) {
  const out = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length), 0); i += 1) {
    for (const list of lists) if (list[i]) out.push(list[i]);
  }
  return out;
}

// Freshness codes (Brave's vocabulary, which the service speaks) → a cutoff.
const WINDOW_DAYS = { pd: 1, pw: 7, pm: 30, py: 365 };

export const openWebProvider = {
  id: 'open-web',
  isConfigured: () => true, // no key, always available

  async search({ query, max = 8, freshness }) {
    const [ddg, bing, instant, wiki] = await Promise.all([
      duckDuckGo(query, max).catch(() => []),
      bingNews(query, max).catch(() => []),
      instantAnswer(query).catch(() => ({ answer: null, results: [] })),
      wikipedia(query).catch(() => []),
    ]);

    // Only reach for the second news index if the first came back thin.
    const news = bing.length >= 2 ? bing : [...bing, ...(await googleNews(query, max).catch(() => []))];

    // General web results lead when we have them; otherwise a direct answer,
    // then news and background alternating so both make the cut.
    const results = dedupe([...instant.results, ...interleave(ddg, news, wiki)]);

    // Asked for recent results only: drop dated ones that fall outside the
    // window. Undated results (Wikipedia, reference pages) aren't news and are
    // kept — they're background, not stale coverage.
    const cutoff = WINDOW_DAYS[freshness] ? Date.now() - WINDOW_DAYS[freshness] * 86_400_000 : null;
    const filtered = cutoff
      ? results.filter((r) => !r.publishedAt || new Date(r.publishedAt).getTime() >= cutoff)
      : results;
    // If the window empties the page, answer with what there is rather than
    // nothing — a slightly older result beats "I couldn't find anything".
    const inWindow = filtered.length >= 2 ? filtered : results;

    // A headline with no summary (all Google News gives us) is the weakest thing
    // we can hand the model — keep it, but never above a result it can read.
    const ranked = [...inWindow.filter((r) => r.snippet), ...inWindow.filter((r) => !r.snippet)];

    return {
      provider: ddg.length ? 'duckduckgo' : 'open-web',
      answer: instant.answer,
      results: ranked.slice(0, max),
    };
  },
};
