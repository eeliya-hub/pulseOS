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
        <strong key={key} className="font-semibold text-moon">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok[0] === '`') {
      nodes.push(
        <code key={key} className="rounded bg-white/12 px-1 py-0.5 font-mono text-[0.85em] text-accent">
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
          ? 'mb-1 mt-2 text-[1.02rem] font-semibold text-moon first:mt-0'
          : 'mb-1 mt-1.5 text-sm font-semibold text-moon/90 first:mt-0';
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
          <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-accent/70" aria-hidden="true" />
          <span className="min-w-0 flex-1">{parseInline(bullet[1])}</span>
        </div>
      );
    }

    // Numbered list (1. / 1))
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      return (
        <div key={key} className="mb-1 flex gap-2">
          <span className="shrink-0 font-semibold text-accent/80">{numbered[1]}.</span>
          <span className="min-w-0 flex-1">{parseInline(numbered[2])}</span>
        </div>
      );
    }

    // Blockquote (> …)
    const quote = line.match(/^\s*>\s+(.+)$/);
    if (quote) {
      return (
        <p key={key} className="mb-1.5 border-l-2 border-white/20 pl-2.5 italic text-moon/75">
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
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60"
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
    <div ref={ref} className={`glass-scroll min-h-0 flex-1 space-y-6 overflow-y-auto ${className}`}>
      {messages.map((message, index) => {
        const isUser = message.role === 'user';
        return (
          <div key={`${message.role}-${index}`} className={`fade-in flex gap-3.5 ${isUser ? 'justify-end' : ''}`}>
            {!isUser ? (
              <span className="orb-button mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full">
                <Sparkles className="h-3.5 w-3.5 text-moon" aria-hidden="true" />
              </span>
            ) : null}

            {isUser ? (
              // A quick prompt shows its title; the full instruction still
              // went to Pulse and is there on hover.
              <p
                title={message.label ? message.text : undefined}
                className="max-w-[80%] rounded-[1.35rem] rounded-br-md bg-moon/[0.12] px-4 py-2.5 text-[0.9375rem] leading-relaxed text-moon"
              >
                {message.label || message.text}
              </p>
            ) : (
              <div className="min-w-0 max-w-[92%] pt-0.5 text-[0.9375rem] leading-[1.7] text-moon/90">
                {formatText(message.text)}
              </div>
            )}

            {isUser ? (
              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[0.75rem] font-semibold text-moon/70">
                {userInitial}
              </span>
            ) : null}
          </div>
        );
      })}

      {isLoading ? (
        <div className="fade-in flex items-center gap-3.5">
          <span className="orb-button grid h-7 w-7 shrink-0 place-items-center rounded-full">
            <Sparkles className="h-3.5 w-3.5 text-moon" aria-hidden="true" />
          </span>
          <LoadingDots />
          {toolActivity ? <span className="text-[0.875rem] text-dim">{toolActivity}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
