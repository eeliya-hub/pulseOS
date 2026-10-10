import { useEffect, useRef, useState } from 'react';

/**
 * An email's body, rendered where it cannot do any harm.
 *
 * The body goes into an iframe, written through `srcDoc`, with a sandbox that
 * allows exactly two things and no more:
 *
 *   allow-same-origin   so this component can read the text the user selects
 *                       inside it — which is what the "Ask Pulse" action on a
 *                       highlight is built on. Without it the selection is
 *                       unreachable from out here.
 *
 *   allow-popups        so a link in the mail still opens, in a new tab, when
 *   (+ -to-escape)      clicked. Without the second one the opened page
 *                       inherits this sandbox and arrives broken.
 *
 * `allow-scripts` is NOT granted, which is the whole point: no script in an
 * email can run, so sharing the origin costs nothing. The backend has already
 * stripped the script elements; this is the second, independent defence, and it
 * is the one that holds even if the first has a gap.
 */
export default function MailBody({ html, onSelect, onLinkCount }) {
  const frame = useRef(null);
  const [height, setHeight] = useState(240);

  useEffect(() => {
    const node = frame.current;
    if (!node) return undefined;

    let watch = null;
    const onLoad = () => {
      const doc = node.contentDocument;
      if (!doc) return;

      // The frame is sized to its content and scrolls with the pane, rather than
      // scrolling inside itself — two nested scrollbars in a reading pane is a
      // mess, and the selection menu would have to track both.
      const measure = () => {
        const next = Math.max(120, doc.documentElement?.scrollHeight ?? doc.body?.scrollHeight ?? 120);
        setHeight(next);
      };
      measure();
      // Images arriving and fonts settling both change the height after load.
      watch = new ResizeObserver(measure);
      if (doc.body) watch.observe(doc.body);
      for (const img of doc.images ?? []) img.addEventListener('load', measure, { once: true });

      onLinkCount?.(doc.querySelectorAll('a[href]').length);

      // What the user has highlighted, reported with where it is on screen so
      // the menu can appear beside it.
      const report = () => {
        const selection = doc.getSelection?.();
        const text = selection?.toString?.().trim() ?? '';
        if (!text) {
          onSelect?.(null);
          return;
        }
        let rect = null;
        try {
          const range = selection.getRangeAt(0).getBoundingClientRect();
          const frameRect = node.getBoundingClientRect();
          // The rectangle is in the FRAME's coordinates; the menu is positioned
          // in the page's, so it has to be offset by where the frame sits.
          rect = {
            top: frameRect.top + range.top,
            bottom: frameRect.top + range.bottom,
            left: frameRect.left + range.left,
            right: frameRect.left + range.right,
            width: range.width,
          };
        } catch {
          /* no usable range — the text alone is still worth reporting */
        }
        onSelect?.({ text, rect });
      };

      doc.addEventListener('mouseup', report);
      doc.addEventListener('keyup', report);
      // Clicking once anywhere clears a previous highlight's menu.
      doc.addEventListener('mousedown', () => onSelect?.(null));
    };

    node.addEventListener('load', onLoad);
    // srcDoc may already have loaded before this effect ran.
    if (node.contentDocument?.readyState === 'complete') onLoad();
    return () => {
      node.removeEventListener('load', onLoad);
      watch?.disconnect();
    };
    // Re-run for each new body.
  }, [html, onSelect, onLinkCount]);

  return (
    <iframe
      ref={frame}
      title="Message"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={document_(html)}
      className="w-full border-0 bg-transparent"
      style={{ height }}
    />
  );
}

/**
 * The page the body is dropped into.
 *
 * Pulse's own typography and colours, so a plain-text mail looks like it
 * belongs here, with the sender's own styling left to win where they set it —
 * a newsletter should still look like itself. `color-scheme: dark` stops a
 * table with no background of its own rendering as a white slab.
 */
const document_ = (html) => `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  :root { color-scheme: dark; }
  html, body {
    margin: 0; padding: 0; background: transparent;
    color: rgba(238,240,250,0.88);
    font-family: 'Schibsted Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 15px; line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    overflow-wrap: break-word; word-break: break-word;
  }
  body { padding: 2px 0 8px; }
  a { color: #a9bbff; text-decoration: underline; text-underline-offset: 2px; }
  img, video, table { max-width: 100% !important; height: auto; }
  table { border-collapse: collapse; }
  blockquote {
    margin: 0.75em 0; padding-left: 0.9em;
    border-left: 2px solid rgba(255,255,255,0.14);
    color: rgba(238,240,250,0.56);
  }
  /* The quoted history of a reply, dimmed so the new words lead. */
  .pulse-quote { color: rgba(238,240,250,0.45); }
  pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; white-space: pre-wrap; }
  hr { border: 0; border-top: 1px solid rgba(255,255,255,0.1); }
  h1,h2,h3,h4 { font-family: Newsreader, Georgia, serif; font-weight: 400; line-height: 1.25; }
  ::selection { background: color-mix(in srgb, #a9bbff 38%, transparent); }
  /* An image held back leaves a quiet placeholder rather than a broken frame. */
  img[data-blocked-src] {
    min-width: 18px; min-height: 18px;
    background: rgba(255,255,255,0.05);
    outline: 1px dashed rgba(255,255,255,0.16); outline-offset: 1px;
    border-radius: 3px;
  }
</style></head>
<body>${html ?? ''}</body></html>`;
