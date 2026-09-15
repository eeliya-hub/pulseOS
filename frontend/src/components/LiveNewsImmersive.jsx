import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import LiveNewsPlayer from './LiveNewsPlayer.jsx';
import { useLiveNews } from '../services/news/liveChannels.js';

/**
 * The live channel with the whole screen.
 *
 * The app's own full screen rather than the browser's: `requestFullscreen()`
 * needs a user gesture, and "put BBC News on" said out loud is not one, so the
 * browser would refuse. An overlay always works.
 *
 * It sits above the voice assistant deliberately — asking for a channel while
 * talking to Pulse means you want to watch it, and the conversation carries on
 * underneath.
 */
export default function LiveNewsImmersive() {
  const { immersive, channel, setImmersive } = useLiveNews();

  // Escape leaves, like every other overlay in the app.
  useEffect(() => {
    if (!immersive) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setImmersive(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [immersive, setImmersive]);

  if (!immersive) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black" role="region" aria-label={`${channel.label} live`}>
      <LiveNewsPlayer immersive onExit={() => setImmersive(false)} />
    </div>,
    document.body,
  );
}
