import { useEffect, useMemo, useRef, useState } from 'react';
import { compileScript, readCue, sentenceIndexAt } from '../services/ai/voiceScript.js';

/**
 * Follows the voice through one spoken answer.
 *
 * Two things happen here and nowhere else: the transcript is compiled into a
 * timeline whenever it grows, and that timeline is read once per frame at
 * wherever the voice has actually got to. Everything the screen shows — which
 * card, which rows, which sentence — comes out of that single reading, so the
 * three can't drift apart the way they did when each was decided separately.
 *
 * The compile is deliberately not on every token: it is O(sentences × cards) and
 * the transcript grows a few characters at a time, so it runs when a sentence
 * completes (or the cards change), which is the only time the answer can differ.
 */
export function useVoiceScript({ panels, transcript, speaking, getSpokenChars, holdReceipt = true }) {
  // Where the voice has been. Passed back into the compiler so a late sentence
  // can never re-plan a passage that has already been shown.
  const floorRef = useRef(null);
  const [script, setScript] = useState(() => ({ sentences: [], cues: [] }));

  useEffect(() => {
    floorRef.current = null; // a new answer plans from scratch
  }, [panels, speaking]);

  // Recompiling on every token would be wasteful and pointless — the answer
  // cannot change meaningfully a character at a time. A finished sentence always
  // triggers one; mid-sentence it settles every dozen characters, which is far
  // ahead of the voice either way since the text arrives seconds before its
  // audio.
  const settled = useMemo(() => {
    const finished = /[.!?…\n]\s*$/.test(transcript);
    return finished ? transcript.length : transcript.length - (transcript.length % 12);
  }, [transcript]);

  useEffect(() => {
    setScript(compileScript(panels, transcript, floorRef.current));
    // `transcript` is read at the moment a boundary is reached; listing it would
    // recompile on every character for no change in the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels, settled]);

  const [position, setPosition] = useState({ sentence: -1, word: 0, panelIndex: -1, itemIds: EMPTY });

  const scriptRef = useRef(script);
  const speakingRef = useRef(speaking);
  const totalRef = useRef(transcript.length);
  scriptRef.current = script;
  speakingRef.current = speaking;
  totalRef.current = transcript.length;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const current = scriptRef.current;
      // Finished: the whole answer is on screen and nothing is being said about
      // any of it, so the card steps aside and the transcript reads in full.
      const chars = speakingRef.current ? getSpokenChars(totalRef.current) : totalRef.current;
      const cue = speakingRef.current ? readCue(current, chars) : NO_CUE;
      const sentence = sentenceIndexAt(current, chars);

      // How far into that sentence, so the transcript lights word by word rather
      // than a whole sentence at a time.
      let word = 0;
      const said = current.sentences[sentence];
      if (said) {
        const through = Math.max(0, Math.min(1, (chars - said.start) / Math.max(1, said.end - said.start)));
        word = Math.min(said.words.length - 1, Math.floor(through * said.words.length));
      }

      if (speakingRef.current && cue.panelIndex >= 0) floorRef.current = { charIndex: chars, panelIndex: cue.panelIndex };

      setPosition((prev) =>
        prev.sentence === sentence && prev.word === word && prev.panelIndex === cue.panelIndex && prev.itemIds === cue.itemIds
          ? prev
          : { sentence, word, panelIndex: cue.panelIndex, itemIds: cue.itemIds },
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getSpokenChars]);

  // A Set is what the cards take, and its identity has to be stable or every
  // card re-renders sixty times a second.
  const spotlight = useMemo(() => new Set(position.itemIds), [position.itemIds]);

  // Once the answer is over, the receipt stays up: what was just done is exactly
  // what someone looks at after the voice stops. Other cards step aside as before.
  // `holdReceipt` is off while tools run, so the next request's progress shows.
  const receipt = useMemo(() => panels.find((p) => p.receipt) ?? null, [panels]);
  const panel =
    position.panelIndex >= 0 ? (panels[position.panelIndex] ?? null) : !speaking && holdReceipt ? receipt : null;

  return { sentences: script.sentences, sentence: position.sentence, word: position.word, panel, spotlight };
}

const EMPTY = [];
const NO_CUE = { panelIndex: -1, itemIds: EMPTY };
