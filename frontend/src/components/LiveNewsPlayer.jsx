import Hls from 'hls.js';
import { ChevronLeft, ChevronRight, ExternalLink, Minimize2, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api/backendClient.js';
import { NEWS_CHANNELS, useLiveNews } from '../services/news/liveChannels.js';

/**
 * The live news tile — and, when it has been given the screen, the full-screen
 * player. Which channel is on lives in the shared store so the assistant can put
 * one on by name; this component just plays whatever is selected.
 */
export default function LiveNewsPlayer({ immersive = false, onExit = null }) {
  const videoRef = useRef(null);
  const { index, setChannelIndex, immersive: playingFullScreen } = useLiveNews();
  // Only one copy of a live stream at a time: when the full-screen player has
  // the channel, the dashboard tile stands down rather than pulling the same
  // feed twice.
  const standby = !immersive && playingFullScreen;
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

  // Move to the previous/next channel, wrapping around.
  const go = useCallback((dir) => setChannelIndex(index + dir), [index, setChannelIndex]);

  useEffect(() => {
    const video = videoRef.current;
    const source = NEWS_CHANNELS[index];
    if (!video || !source || standby) return undefined;

    // A fresh attempt on this channel: clear any previous failure.
    setFailed(false);

    let hls;
    let done = false;
    let cancelled = false;
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

    // Redirector channels get resolved to their real playlist first; everything
    // else is already a direct URL and starts immediately.
    const streamUrl = (source.viaRedirect
      ? api.news.stream(source.url).then((d) => d.url)
      : Promise.resolve(source.url)
    ).then((url) => (source.viaProxy ? api.news.hlsUrl(url) : url));

    // hls.js FIRST, native HLS only as the fallback. Chrome answers
    // canPlayType('application/vnd.apple.mpegurl') with "maybe" — truthy, but it
    // has no real HLS support, so testing that first sent every desktop session
    // down the native path and hls.js was never used. Whether a channel played
    // then came down to what the browser could stumble through on its own.
    if (Hls.isSupported()) {
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
      hls.attachMedia(video);
      streamUrl.then((url) => !cancelled && hls.loadSource(url), markFailed);
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
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS: native HLS.
      video.addEventListener('error', markFailed);
      streamUrl.then((url) => {
        if (cancelled) return;
        video.src = url;
        play();
      }, markFailed);
    } else {
      markFailed();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', markFailed);
      GESTURES.forEach((e) => window.removeEventListener(e, unmute));
      if (hls) hls.destroy();
    };
  }, [index, reloadKey, standby]);

  const active = NEWS_CHANNELS[index];

  return (
    <>
      {/* Channel switcher — ‹ LIVE · Name › */}
      <div className="absolute left-3 top-3 z-30 flex items-center gap-0.5 rounded-full bg-black/50 py-1 pl-1 pr-1 backdrop-blur-md">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous channel"
          className="flex h-6 w-6 items-center justify-center rounded-full text-moon/70 transition hover:bg-white/15 hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-1.5 px-1.5">
          <span className="glow-dot h-1.5 w-1.5 rounded-full bg-rose-400 text-rose-400" aria-hidden="true" />
          <span className="whitespace-nowrap text-[0.75rem] font-semibold text-moon/90">
            <span className="font-semibold">Live</span>&ensp;{active.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next channel"
          className="flex h-6 w-6 items-center justify-center rounded-full text-moon/70 transition hover:bg-white/15 hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
        <a
          href={active.site}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[0.75rem] font-semibold text-moon/85 backdrop-blur-md transition hover:bg-black/70 hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          Open site
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
        {immersive && onExit ? (
          <button
            type="button"
            onClick={onExit}
            aria-label="Leave full screen"
            className="grid h-7 w-7 place-items-center rounded-full bg-black/50 text-moon/85 backdrop-blur-md transition hover:bg-black/70 hover:text-moon focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <video
        ref={videoRef}
        className="h-full w-full bg-black object-contain"
        autoPlay
        playsInline
        controls
      />

      {standby && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/80 px-4 text-center backdrop-blur-sm">
          <p className="text-xs font-medium text-moon/55">
            {active.label}, full screen
          </p>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 px-4 text-center backdrop-blur-sm">
          <span className="glow-dot h-2 w-2 rounded-full bg-rose-400 text-rose-400" aria-hidden="true" />
          <p className="display-type text-lg font-light text-moon/90">{active.label} is live now</p>
          <p className="max-w-xs text-xs text-moon/50">
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
              className="soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-moon/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
            <a
              href={active.site}
              target="_blank"
              rel="noreferrer"
              className="soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-moon/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
