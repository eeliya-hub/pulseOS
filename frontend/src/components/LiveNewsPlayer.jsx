import Hls from 'hls.js';
import { ChevronLeft, ChevronRight, ExternalLink, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

// UK 24/7 news channels that play inline via hls.js — every URL below was verified
// HTTPS, CORS-enabled and DRM-free from a UK connection. Sky News and Euronews come
// off Samsung TV Plus (Xumo / Rakuten) through matthuisman's stable jmp2.uk
// redirector; BBC News is the BBC's own adaptive Akamai feed (note: it carries a
// BSL signer during the BBC's scheduled signed zones); GB News (Amagi) and TalkTV
// (Wurl) stream openly on FAST platforms. These are UK-geo feeds — the tile is meant
// to be watched from the UK. Use the ‹ › controls to switch channels.
const SOURCES = [
  {
    label: 'Sky News',
    url: 'https://jmp2.uk/stvp-GB3300002NF',
    site: 'https://news.sky.com/watch-live',
  },
  {
    label: 'BBC News',
    url: 'https://vs-hls-push-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_news_channel_hd/iptv_hd_abr_v1.m3u8',
    site: 'https://www.bbc.co.uk/iplayer/live/bbcnews',
  },
  {
    label: 'GB News',
    url: 'https://amg01076-lightningintern-gbnewsau-samsungau-et7fz.amagi.tv/playlist/amg01076-lightningintern-gbnewsau-samsungau/playlist.m3u8',
    site: 'https://www.gbnews.com/watch-live',
  },
  {
    label: 'TalkTV',
    url: 'https://488f4ce4.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctZ2JfVGFsa19ITFM/playlist.m3u8',
    site: 'https://www.talk.tv/watch',
  },
  {
    label: 'Euronews',
    url: 'https://jmp2.uk/stvp-GB2600019ON',
    site: 'https://www.euronews.com/live',
  },
];

const STORAGE_KEY = 'pulse.newsChannel';

export default function LiveNewsPlayer() {
  const videoRef = useRef(null);
  const [index, setIndex] = useState(() => {
    const saved = Number(window.localStorage?.getItem(STORAGE_KEY));
    return Number.isInteger(saved) && saved >= 0 && saved < SOURCES.length ? saved : 0;
  });
  // Bumped by the Retry button to re-run the load effect for the same channel.
  const [reloadKey, setReloadKey] = useState(0);
  const [failed, setFailed] = useState(false);
  // Cold first loads of these live feeds can take longer than the watchdog to
  // start rendering; we silently retry once per channel before showing the card.
  const autoRetryRef = useRef(0);

  // Each channel change gets a fresh auto-retry budget. (Declared before the load
  // effect so it resets first when `index` changes.)
  useEffect(() => {
    autoRetryRef.current = 0;
  }, [index]);

  // Move to the previous/next channel, wrapping around, and remember the choice.
  const go = useCallback((dir) => {
    setIndex((i) => {
      const next = (i + dir + SOURCES.length) % SOURCES.length;
      try {
        window.localStorage?.setItem(STORAGE_KEY, String(next));
      } catch {
        /* private mode / storage disabled — non-fatal */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const source = SOURCES[index];
    if (!video || !source) return undefined;

    // A fresh attempt on this channel: clear any previous failure.
    setFailed(false);

    let hls;
    let done = false;
    let recovered = 0;

    // Some open restreams answer at the network level but never actually render
    // (partial-content quirks etc.) without ever firing a *fatal* hls error. The
    // watchdog surfaces the retry card if playback hasn't started in time.
    const watchdog = window.setTimeout(() => {
      if (video.readyState >= 3) return;
      // Give a cold first attempt one silent retry before surfacing the error.
      if (autoRetryRef.current < 1) {
        autoRetryRef.current += 1;
        setReloadKey((k) => k + 1);
      } else {
        markFailed();
      }
    }, 9000);

    const markFailed = () => {
      if (done) return;
      done = true;
      window.clearTimeout(watchdog);
      setFailed(true);
    };
    const onPlaying = () => {
      done = true;
      window.clearTimeout(watchdog);
    };
    video.addEventListener('playing', onPlaying);

    // Browsers block unmuted autoplay until the user has interacted with the
    // page. So we arm a one-time listener that unmutes the moment the user
    // touches/clicks/scrolls anywhere — that first gesture satisfies the policy.
    const GESTURES = ['pointerdown', 'keydown', 'touchstart'];
    const unmute = () => {
      GESTURES.forEach((e) => window.removeEventListener(e, unmute));
      video.muted = false;
      video.play().catch(() => {});
    };
    const armUnmute = () => GESTURES.forEach((e) =>
      window.addEventListener(e, unmute, { once: true, passive: true }),
    );

    // Play with sound by default; if the browser rejects it, fall back to a muted
    // autoplay and arm the gesture listener so sound comes on at first interaction.
    const play = () => {
      video.muted = false;
      video.play().catch(() => {
        video.muted = true;
        armUnmute();
        video.play().catch(() => {});
      });
    };

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS: native HLS (follows the jmp2.uk redirect transparently)
      video.src = source.url;
      video.addEventListener('error', markFailed);
      play();
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        // Never downscale the rendition just because the tile is small — we always
        // want the full-resolution feed regardless of the element's pixel size.
        capLevelToPlayerSize: false,
        // Assume a fast line and skip the low-bitrate probe so ABR opens straight at
        // the top rendition instead of ramping up from the bottom.
        startLevel: -1,
        abrEwmaDefaultEstimate: 12_000_000,
        testBandwidth: false,
        // A deeper buffer keeps the highest-bitrate feed steady.
        maxBufferLength: 30,
        liveSyncDurationCount: 3,
        startFragPrefetch: true,
      });
      hls.loadSource(source.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Pin to the top rendition for the best possible picture, then let ABR take
        // back over so a genuine bandwidth drop still protects against stalls.
        const top = hls.levels.length - 1;
        if (top > 0) {
          hls.startLevel = top;
          hls.nextLevel = top;
        }
        play();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        // Give transient blips a couple of chances to self-heal before giving up,
        // so a momentary network/decoder hiccup doesn't drop the whole tile.
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recovered < 2) {
          recovered += 1;
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recovered < 2) {
          recovered += 1;
          hls.recoverMediaError();
        } else {
          markFailed();
        }
      });
    } else {
      markFailed();
    }

    return () => {
      window.clearTimeout(watchdog);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', markFailed);
      GESTURES.forEach((e) => window.removeEventListener(e, unmute));
      if (hls) hls.destroy();
    };
  }, [index, reloadKey]);

  const active = SOURCES[index];

  return (
    <>
      {/* Channel switcher — ‹ LIVE · Name › */}
      <div className="absolute left-3 top-3 z-30 flex items-center gap-0.5 rounded-full bg-black/50 py-1 pl-1 pr-1 backdrop-blur-md">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous channel"
          className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-1.5 px-1.5">
          <span className="glow-dot h-1.5 w-1.5 rounded-full bg-rose-400 text-rose-400" aria-hidden="true" />
          <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-white/90">
            Live · {active.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next channel"
          className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <a
        href={active.site}
        target="_blank"
        rel="noreferrer"
        className="absolute right-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85 backdrop-blur-md transition hover:bg-black/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        Open site
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>

      <video
        ref={videoRef}
        className="h-full w-full bg-black object-cover"
        autoPlay
        playsInline
        controls
      />

      {failed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 px-4 text-center backdrop-blur-sm">
          <span className="glow-dot h-2 w-2 rounded-full bg-rose-400 text-rose-400" aria-hidden="true" />
          <p className="display-type text-lg font-light text-white/90">{active.label} is live now</p>
          <p className="max-w-xs text-xs text-white/50">
            The inline stream didn’t start from your region. Retry, switch channel with ‹ ›, or open
            the broadcast in a new tab.
          </p>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                autoRetryRef.current = 0;
                setReloadKey((k) => k + 1);
              }}
              className="soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
            <a
              href={active.site}
              target="_blank"
              rel="noreferrer"
              className="soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Watch {active.label}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </>
  );
}
