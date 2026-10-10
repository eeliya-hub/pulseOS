import { useEffect, useState } from 'react';

/**
 * Your own photo behind Pulse, kept under its own key.
 *
 * Settings are written whole on every change, and a picture is a few hundred
 * kilobytes — carried inside them, every keystroke in a settings field would
 * rewrite it. Here it is written once, when you choose it. Being under the
 * `pulse.` prefix, it still travels in an export.
 */
const KEY = 'pulse.wallpaper.v1';

function read() {
  try {
    return window.localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

let image = typeof window === 'undefined' ? '' : read();
const listeners = new Set();

export const getWallpaper = () => image;

/** Keep a photo (a data URL), or '' to let it go. Throws if there isn't room. */
export function setWallpaper(next) {
  try {
    if (next) window.localStorage.setItem(KEY, next);
    else window.localStorage.removeItem(KEY);
  } catch {
    throw new Error('That photo is too big to keep. Try a smaller one.');
  }
  image = next || '';
  listeners.forEach((fn) => fn(image));
}

export function useWallpaper() {
  const [value, setValue] = useState(image);
  useEffect(() => {
    listeners.add(setValue);
    setValue(image);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}
