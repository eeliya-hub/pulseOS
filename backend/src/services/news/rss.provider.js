import { fetchText } from '../../utils/httpClient.js';

// Minimal, dependency-free RSS/Atom reader — enough for the standard feeds we
// use (BBC Local, etc.). Handles CDATA, common entities, and item images.
const INTEGRATION = 'RSS';

function decode(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function tagText(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decode(match[1]) : null;
}

function itemImage(block) {
  const media = block.match(/<media:(?:thumbnail|content)[^>]*\burl="([^"]+)"/i);
  if (media) return decode(media[1]);
  const enclosure = block.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*type="image/i);
  return enclosure ? decode(enclosure[1]) : null;
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const rssProvider = {
  async fetch(url) {
    const xml = await fetchText(url, {
      integration: INTEGRATION,
      timeoutMs: 12_000,
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) PulseOS/0.1' },
    });

    // Channel/feed title becomes the source label (e.g. "BBC News - Kent").
    const source = tagText(xml.split(/<item[\s>]/i)[0], 'title') ?? 'RSS';

    const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

    return blocks
      .map((block) => {
        // RSS <link>text</link>; Atom <link href="..."/>
        const link = tagText(block, 'link') || block.match(/<link[^>]*\bhref="([^"]+)"/i)?.[1];
        return {
          title: tagText(block, 'title'),
          url: link ? decode(link) : null,
          image: itemImage(block),
          source,
          publishedAt: toIso(tagText(block, 'pubDate') || tagText(block, 'published') || tagText(block, 'updated')),
          description: tagText(block, 'description'),
        };
      })
      .filter((a) => a.title && a.url);
  },
};
