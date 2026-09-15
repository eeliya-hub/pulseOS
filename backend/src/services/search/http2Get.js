import http2 from 'node:http2';
import { fetchText } from '../../utils/httpClient.js';

/**
 * Fetch a page over HTTP/2, the way a browser would.
 *
 * Search engines fingerprint their callers, and speaking HTTP/1.1 while claiming
 * to be Chrome is the giveaway: DuckDuckGo answers those with a 202 challenge
 * page and no results. Node's global fetch is HTTP/1.1 only, so the scrapers go
 * through here instead — same request over h2 comes back with the actual page.
 *
 * Falls back to plain fetch if the host won't do h2, so a site that only speaks
 * HTTP/1.1 still works.
 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BROWSER_HEADERS = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
  'upgrade-insecure-requests': '1',
};

export async function http2Get(url, { timeoutMs = 10_000, integration = 'Web search' } = {}) {
  try {
    return await viaHttp2(url, timeoutMs);
  } catch {
    // h2 refused (some hosts still don't offer it) — take what HTTP/1.1 gives us.
    return fetchText(url, { integration, timeoutMs, headers: BROWSER_HEADERS });
  }
}

function viaHttp2(url, timeoutMs, redirects = 0) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const session = http2.connect(target.origin, { settings: { enablePush: false } });
    const done = (fn, value) => {
      session.close();
      fn(value);
    };

    session.on('error', reject);
    session.setTimeout(timeoutMs, () => done(reject, new Error(`h2 timed out after ${timeoutMs}ms`)));

    const req = session.request({
      ':method': 'GET',
      ':path': `${target.pathname}${target.search}`,
      ...BROWSER_HEADERS,
    });

    let status = 0;
    let location = null;
    let body = '';

    req.on('response', (headers) => {
      status = headers[':status'];
      location = headers.location ?? null;
    });
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('error', (error) => done(reject, error));
    req.on('end', () => {
      session.close();
      if (status >= 300 && status < 400 && location && redirects < 3) {
        resolve(viaHttp2(new URL(location, target).toString(), timeoutMs, redirects + 1));
        return;
      }
      if (status >= 400) {
        reject(new Error(`h2 ${status}`));
        return;
      }
      resolve(body);
    });
    req.end();
  });
}
