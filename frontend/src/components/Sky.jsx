import { useEffect } from 'react';
import { useSettings } from '../hooks/useSettings.js';
import { useWallpaper } from '../hooks/useWallpaper.js';

/**
 * The light behind everything — see useSky() for where its colour comes from.
 * Purely atmospheric: it takes no input and is hidden from assistive tech.
 *
 * Or a photo of yours, if you've chosen one in Settings: set back behind a veil
 * of the ground's own ink, as dim and as soft as you asked, so the type in
 * front of it still reads.
 */
export default function Sky() {
  const { settings } = useSettings();
  const wallpaper = useWallpaper();
  const bg = settings.background ?? {};
  const photo = bg.kind === 'photo' && wallpaper;

  // Type set straight on a photo needs a shadow to hold it off the picture —
  // styles.css gives the sky's type one while this says a photo is behind it.
  useEffect(() => {
    document.documentElement.dataset.background = photo ? 'photo' : 'sky';
  }, [photo]);

  return (
    <div className="sky" aria-hidden="true">
      {photo ? (
        <>
          <div
            className="sky-photo"
            style={{ backgroundImage: `url(${wallpaper})`, filter: bg.blur ? `blur(${bg.blur}px)` : undefined }}
          />
          <div className="sky-photo-veil" style={{ opacity: bg.dim ?? 0.7 }} />
        </>
      ) : (
        <>
          <div className="sky-field" />
          <div className="sky-stars" />
        </>
      )}
      <div className="sky-horizon" />
      <div className="sky-vignette" />
      <div className="sky-grain" />
    </div>
  );
}
