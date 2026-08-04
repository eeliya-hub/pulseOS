import { Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';

// Shared chat rendering used by both the full AI Assistant page and the compact
// chat popover, so the two always look and behave identically.

// Inline emphasis: **bold** / __bold__, *italic*, `code`. Underscored italics are
// intentionally skipped so snake_case identifiers don't get mangled.
function parseInline(text) {
  const nodes = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*(?!\s)[^*]+\*)/g;
  let last = 0;
  let key = 0;
  let match = re.exec(text);
  while (match) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const tok = match[0];
    if (tok.startsWith('**') || tok.startsWith('__')) {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok[0] === '`') {
      nodes.push(
        <code key={key} className="rounded bg-white/12 px-1 py-0.5 font-mono text-[0.85em] text-cyan-100">
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <em key={key} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    key += 1;
    last = match.index + tok.length;
    match = re.exec(text);
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Lightweight markdown → styled React: headings (#…), bullet + numbered lists,
// blockquotes, rules and inline emphasis. So the model's markdown reads as real
// formatting instead of raw '#' and '*' symbols.
function formatText(text) {
  return (text || '').split('\n').map((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    const key = `l-${i}`;

    if (line.trim() === '') return <div key={key} className="h-2" aria-hidden="true" />;

    // Horizontal rule (---, ***, ___)
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      return <div key={key} className="my-2 h-px bg-white/15" aria-hidden="true" />;
    }

    // Heading (# … ######)
    const heading = line.match(/^\s*(#{1,6})\s*(.+)$/);
    if (heading) {
      const cls =
        heading[1].length <= 2
          ? 'mb-1 mt-2 text-[1.02rem] font-semibold text-white first:mt-0'
          : 'mb-1 mt-1.5 text-sm font-semibold text-white/90 first:mt-0';
      return (
        <p key={key} className={cls}>
          {parseInline(heading[2])}
        </p>
      );
    }

    // Bullet list (-, *, •)
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    if (bullet) {
      return (
        <div key={key} className="mb-1 flex gap-2">
          <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-cyan-200/70" aria-hidden="true" />
          <span className="min-w-0 flex-1">{parseInline(bullet[1])}</span>
        </div>
      );
    }

    // Numbered list (1. / 1))
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      return (
        <div key={key} className="mb-1 flex gap-2">
          <span className="shrink-0 font-semibold text-cyan-100/80">{numbered[1]}.</span>
          <span className="min-w-0 flex-1">{parseInline(numbered[2])}</span>
        </div>
      );
    }

    // Blockquote (> …)
    const quote = line.match(/^\s*>\s+(.+)$/);
    if (quote) {
      return (
        <p key={key} className="mb-1.5 border-l-2 border-white/20 pl-2.5 italic text-white/75">
          {parseInline(quote[1])}
        </p>
      );
    }

    return (
      <p key={key} className="mb-1.5">
        {parseInline(line)}
      </p>
    );
  });
}

function LoadingDots() {
  return (
    <div className="flex h-5 items-center space-x-1.5">
      {[0, 150, 300].map((delay) => (
        <div
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-100/60"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * The scrolling conversation thread. Owns its own auto-scroll so both hosts get
 * it for free.
 */
export function ChatThread({ messages, isLoading, toolActivity, userInitial = 'E', className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div ref={ref} className={`glass-scroll min-h-0 flex-1 space-y-4 overflow-y-auto ${className}`}>
      {messages.map((message, index) => {
        const isUser = message.role === 'user';
        return (
          <div
            key={`${message.role}-${index}`}
            className={`fade-in flex gap-3 ${isUser ? 'justify-end' : ''}`}
            style={{ '--delay': '0ms' }}
          >
            {!isUser ? (
              <span className="orb-button grid h-8 w-8 shrink-0 place-items-center rounded-full">
                <Sparkles className="h-3.5 w-3.5 text-white" aria-hidden="true" />
              </span>
            ) : null}

            <div
              className={`max-w-[75%] border border-white/10 p-3.5 text-sm leading-6 text-white/88 shadow-lg backdrop-blur-md ${
                isUser ? 'rounded-2xl rounded-tr-md bg-white/16' : 'rounded-2xl rounded-tl-md bg-white/6'
              }`}
            >
              {isUser ? (
                // A quick prompt shows its title; the full instruction still
                // went to Pulse and is there on hover.
                <p title={message.label ? message.text : undefined}>{message.label || message.text}</p>
              ) : (
                formatText(message.text)
              )}
            </div>

            {isUser ? (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/18 text-sm font-semibold shadow-lg">
                {userInitial}
              </span>
            ) : null}
          </div>
        );
      })}

      {isLoading ? (
        <div className="fade-in flex gap-3">
          <span className="orb-button grid h-8 w-8 shrink-0 place-items-center rounded-full">
            <Sparkles className="h-3.5 w-3.5 text-white" aria-hidden="true" />
          </span>
          <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-white/10 bg-white/5 px-4 py-3 shadow-lg backdrop-blur-md">
            <LoadingDots />
            {toolActivity ? <span className="text-xs font-medium text-white/60">{toolActivity}…</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
