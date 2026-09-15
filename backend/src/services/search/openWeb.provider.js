import { fetchJson } from '../../utils/httpClient.js';
import { http2Get } from './http2Get.js';
import { rssProvider } from '../news/rss.provider.js';
import { decodeEntities, htmlToText } from './pageText.js';

// The always-available search provider: no API key, no account, no cost. Used
// whenever Brave/Tavily aren't configured, and as the safety net if they fail.
//
// No single keyless source is dependable on its own — DuckDuckGo now answers a
// 202 anti-bot challenge more often than it answers a query — so this asks
// several in parallel and merges them:
//   • DuckDuckGo (lite + full HTML, over HTTP/2)  the general web index — what
//                             answers how-to, local and long-tail questions that
//                             news feeds know nothing about
//   • Bing News RSS           fresh coverage of any topic, with direct article URLs
//   • Google News RSS         a second news index, in case Bing is having a moment
//   • Wikipedia               background on people, places, teams, concepts
//   • DuckDuckGo Instant      a straight answer for facts and definitions
//
// General web results lead the merge. Without that, a blocked DuckDuckGo left
// only the news feeds, and every question — "how do I fix this error", "what
// time does the shop shut" — came back as news articles about the subject.
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
  // Over HTTP/2 — see http2Get. On HTTP/1.1 this endpoint answers a 202 bot
  // challenge and no results, which is what left general web search empty.
  const html = await http2Get(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=uk-en`, {
    integration: INTEGRATION,
    timeoutMs: 10_000,
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

/**
 * DuckDuckGo's full HTML page — a second surface on the same index, parsed from
 * a different layout. When the lite page is having a moment this usually isn't.
 */
async function duckDuckGoHtml(query, max) {
  const html = await http2Get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=uk-en`, {
    integration: INTEGRATION,
    timeoutMs: 10_000,
  });

  const results = [];
  const blockRe = /<div class="result results_links[^"]*"[\s\S]*?<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<div class="result results_links|<\/body)/gi;
  for (const [, href, rawTitle, rest] of html.matchAll(blockRe)) {
    const url = unwrap(decodeEntities(href), 'uddg');
    const title = htmlToText(rawTitle, 200);
    if (!url.startsWith('http') || !title) continue;
    const snippet = rest.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    results.push({
      title,
      url,
      snippet: snippet ? htmlToText(snippet[1], 500) : '',
      source: hostOf(url),
      publishedAt: null,
    });
    if (results.length >= max) break;
  }
  return results;
}

/**
 * Stack Exchange — the one general source that answers reliably from a server
 * (no scraping, no key, no bot challenge). Only returns anything for technical
 * questions, which is exactly when it's the best answer on the page.
 */
async function stackExchange(query, max = 3) {
  const params = new URLSearchParams({
    order: 'desc',
    sort: 'relevance',
    q: query,
    site: 'stackoverflow',
    pagesize: String(max),
    filter: '!nNPvSNdWme', // question body + excerpt
  });
  const ask = (search) =>
    fetchJson(`https://api.stackexchange.com/2.3/search/advanced?${search}`, {
      integration: INTEGRATION,
      timeoutMs: 8_000,
      // No accept-encoding header on purpose: setting it by hand stops undici
      // decompressing the reply, and Stack Exchange always gzips.
      headers: { 'user-agent': UA },
    });

  let data = await ask(params);
  // Their full-text search wants every word to match, so a natural question
  // ("how do I fix ENOSPC on macOS") finds nothing. Retry on the distinctive
  // words alone — the error code, the library name — which is what a person
  // would have typed anyway.
  if (!(data.items ?? []).length) {
    const keywords = query
      .replace(/[^\w\s.-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !/^(what|when|where|which|how|does|do|the|and|for|with|from|that|this|about|fix|error|make|need)$/i.test(word))
      .slice(0, 3)
      .join(' ');
    if (!keywords) return [];
    const retry = new URLSearchParams(params);
    retry.set('q', keywords);
    data = await ask(retry);

    // Still nothing: search titles for the single most distinctive word. An
    // error code or library name on its own is usually the best query anyway.
    if (!(data.items ?? []).length) {
      const rarest = keywords.split(' ').sort((a, b) => b.length - a.length)[0];
      const byTitle = new URLSearchParams(params);
      byTitle.delete('q');
      byTitle.set('intitle', rarest);
      data = await ask(byTitle);
    }
  }

  return (data.items ?? [])
    .filter((item) => item.title && item.link)
    .slice(0, max)
    .map((item) => ({
      title: decodeEntities(item.title),
      url: item.link,
      snippet: htmlToText(item.body ?? '', 500),
      source: 'Stack Overflow',
      publishedAt: item.creation_date ? new Date(item.creation_date * 1000).toISOString() : null,
    }));
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
    const [ddg, ddgHtml, bing, instant, wiki, stack] = await Promise.all([
      duckDuckGo(query, max).catch(() => []),
      duckDuckGoHtml(query, max).catch(() => []),
      bingNews(query, max).catch(() => []),
      instantAnswer(query).catch(() => ({ answer: null, results: [] })),
      wikipedia(query).catch(() => []),
      stackExchange(query).catch(() => []),
    ]);

    // Only reach for the second news index if the first came back thin.
    const news = bing.length >= 2 ? bing : [...bing, ...(await googleNews(query, max).catch(() => []))];

    // General web results lead — they're what answers a question. News and
    // background follow, alternating so neither crowds the other out. A direct
    // instant answer, when there is one, goes first of all.
    // The scraped general engines lead when they're answering.
    const web = interleave(ddg, ddgHtml);
    // Order: a direct answer, then the general web, then news and background.
    // Stack Overflow goes last — it's the dependable source when the engines are
    // blocked, but it shouldn't answer "what time does the shop close".
    const results = dedupe([...instant.results, ...web, ...interleave(news, wiki), ...stack]);

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

    // Headlines with no summary (all Google News gives us) are the weakest thing
    // we can hand the model, so they sink — but only past their own group, or a
    // Stack Overflow body would outrank the web result that actually answers.
    const ranked = inWindow.length > 4 ? [...inWindow.filter((r) => r.snippet || r.publishedAt), ...inWindow.filter((r) => !r.snippet && !r.publishedAt)] : inWindow;

    return {
      provider: web.length ? 'duckduckgo' : 'open-web',
      answer: instant.answer,
      results: ranked.slice(0, max),
    };
  },
};
