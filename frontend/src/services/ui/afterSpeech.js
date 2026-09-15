/**
 * Things that should happen once Pulse has finished saying its piece.
 *
 * Some actions would talk over their own announcement if they fired the moment
 * the tool ran — handing the screen to a live channel while the sentence
 * introducing it is still being spoken, for one. Queue those here and they run
 * when the voice actually stops.
 *
 * With no voice session running (the text assistant), there is nothing to wait
 * for, so callbacks run immediately.
 */
let queue = [];
let closeSession = null;

/** Run `fn` when Pulse stops speaking — or now, if it isn't speaking at all. */
export function afterSpeech(fn) {
  if (typeof fn !== 'function') return;
  if (!closeSession) {
    fn(); // no voice session to wait on
    return;
  }
  queue.push(fn);
}

/** Ask for the voice session to close once the current answer has been spoken. */
export function endSessionAfterSpeech() {
  if (!closeSession) return false;
  queue.push(() => closeSession?.());
  return true;
}

/** VoiceAssistant registers how to close itself while it is mounted. */
export function onVoiceClose(fn) {
  closeSession = fn;
  return () => {
    if (closeSession === fn) closeSession = null;
    queue = [];
  };
}

/**
 * Called when the voice stops. Runs everything waiting.
 *
 * Drains rather than taking one snapshot: a callback may queue another (the
 * takeover asking for the session to close after it), and a snapshot would leave
 * that one sitting there until the next time Pulse spoke — which, having just
 * closed the session, would be never.
 */
export function runAfterSpeech() {
  let guard = 0;
  while (queue.length && guard < 10) {
    guard += 1;
    const pending = queue;
    queue = [];
    for (const fn of pending) {
      try {
        fn();
      } catch {
        /* one bad callback shouldn't strand the rest */
      }
    }
  }
}

/** Drop anything waiting — the user interrupted, so the answer never landed. */
export function clearAfterSpeech() {
  queue = [];
}
