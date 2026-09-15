import { useEffect, useState } from 'react';

/**
 * The live news channels, and which one is on.
 *
 * The list used to live inside LiveNewsPlayer, and the choice was that
 * component's own state — which meant nothing outside the tile could name a
 * channel or turn one on. It lives here so the assistant can ("put BBC News on"),
 * and so the full-screen player and the dashboard tile agree on what is playing.
 *
 * Every URL below was verified HTTPS, CORS-enabled and DRM-free from a UK
 * connection. Sky News and Euronews come off Samsung TV Plus (Xumo / Rakuten)
 * through matthuisman's stable jmp2.uk redirector — those two are marked
 * `viaRedirect`, because the browser can't follow it: a cross-origin request has
 * to pass the CORS check on every hop and that 302 carries no
 * access-control-allow-origin, so hls.js dies on the very first request. The
 * backend follows it for us and hands back the real playlist. BBC News is the
 * BBC's own adaptive Akamai feed (note: it carries a BSL signer during the BBC's
 * scheduled signed zones); GB News (Amagi) and TalkTV (Wurl) stream openly on
 * FAST platforms. These are UK-geo feeds — meant to be watched from the UK.
 */
export const NEWS_CHANNELS = [
  {
    id: 'sky-news',
    label: 'Sky News',
    aka: ['sky'],
    url: 'https://jmp2.uk/stvp-GB3300002NF',
    viaRedirect: true,
    site: 'https://news.sky.com/watch-live',
  },
  {
    id: 'bbc-news',
    label: 'BBC News',
    aka: ['bbc', 'bbc news channel', 'the bbc'],
    url: 'https://vs-hls-push-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_news_channel_hd/iptv_hd_abr_v1.m3u8',
    site: 'https://www.bbc.co.uk/iplayer/live/bbcnews',
  },
  {
    id: 'gb-news',
    label: 'GB News',
    aka: ['gb', 'gbnews', 'great british news'],
    url: 'https://amg01076-lightningintern-gbnewsau-samsungau-et7fz.amagi.tv/playlist/amg01076-lightningintern-gbnewsau-samsungau/playlist.m3u8',
    site: 'https://www.gbnews.com/watch-live',
  },
  {
    id: 'talktv',
    label: 'TalkTV',
    aka: ['talk tv', 'talk'],
    url: 'https://488f4ce4.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctZ2JfVGFsa19ITFM/playlist.m3u8',
    site: 'https://www.talk.tv/watch',
  },
  {
    id: 'euronews',
    label: 'Euronews',
    aka: ['euro news', 'euronews live'],
    url: 'https://jmp2.uk/stvp-GB2600019ON',
    viaRedirect: true,
    site: 'https://www.euronews.com/live',
  },
  {
    id: 'talksport',
    label: 'talkSPORT',
    aka: ['talk sport', 'sports talk', 'the sports station'],
    url: 'https://jmp2.uk/stvp-GB30003577',
    viaRedirect: true,
    // Its playlist allows CORS but its segments come off a CloudFront host that
    // sends none, so hls.js loads the manifest and then fails on every segment.
    // Routed through the backend, which adds the header the CDN omits.
    viaProxy: true,
    site: 'https://talksport.com/radio/listen-live/',
  },
];

const STORAGE_KEY = 'pulse.newsChannel';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Find a channel from however it was said — "bbc", "BBC News", "put the news on
 * sky". Exact name first, then a known alias, then a contains match either way
 * round, so both "bbc" and "the bbc news channel please" land on the same feed.
 */
export function resolveChannel(spoken) {
  const needle = norm(spoken);
  if (!needle) return null;
  const names = (c) => [c.label, c.id, ...(c.aka ?? [])].map(norm).filter(Boolean);

  const exact = NEWS_CHANNELS.find((c) => names(c).includes(needle));
  if (exact) return exact;

  // Longest name wins, not first in the list: "put talksport on" contains
  // TalkTV's "talk" as well as talkSPORT's own name, and the longer match is the
  // one that was meant.
  let best = null;
  let bestLength = 0;
  for (const channel of NEWS_CHANNELS) {
    for (const name of names(channel)) {
      const matched = needle.includes(name) || name.includes(needle);
      if (matched && name.length > bestLength) {
        best = channel;
        bestLength = name.length;
      }
    }
  }
  return best;
}

// ── Shared state: which channel, and whether it has the screen ─────────────
function loadIndex() {
  try {
    const saved = Number(window.localStorage?.getItem(STORAGE_KEY));
    return Number.isInteger(saved) && saved >= 0 && saved < NEWS_CHANNELS.length ? saved : 0;
  } catch {
    return 0;
  }
}

let state = { index: loadIndex(), immersive: false };
const subscribers = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  subscribers.forEach((fn) => fn(state));
}

export const getLiveNews = () => state;

/** Switch channel by list position, wrapping around. */
export function setChannelIndex(index) {
  const next = ((index % NEWS_CHANNELS.length) + NEWS_CHANNELS.length) % NEWS_CHANNELS.length;
  try {
    window.localStorage?.setItem(STORAGE_KEY, String(next));
  } catch {
    /* private mode / storage disabled — non-fatal */
  }
  setState({ index: next });
  return NEWS_CHANNELS[next];
}

/** Put a named channel on. Returns the channel, or null if the name matched none. */
export function setChannel(spoken) {
  const found = resolveChannel(spoken);
  if (!found) return null;
  return setChannelIndex(NEWS_CHANNELS.indexOf(found));
}

/**
 * Give the player the whole screen, or hand it back.
 *
 * This is the app's own full screen — a fixed overlay — not the browser's.
 * `requestFullscreen()` needs a user gesture, and "put the news on" spoken out
 * loud is not one, so the browser would refuse it. An overlay always works, and
 * keeps the app's own chrome.
 */
export const setImmersive = (immersive) => setState({ immersive: Boolean(immersive) });

/** React binding for the shared channel state. */
export function useLiveNews() {
  const [snap, setSnap] = useState(state);
  useEffect(() => {
    subscribers.add(setSnap);
    setSnap(state);
    return () => subscribers.delete(setSnap);
  }, []);
  return {
    ...snap,
    channel: NEWS_CHANNELS[snap.index],
    channels: NEWS_CHANNELS,
    setChannelIndex,
    setChannel,
    setImmersive,
  };
}
