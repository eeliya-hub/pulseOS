import { Globe } from 'lucide-react';
import { useState } from 'react';
import { api } from '../services/api/backendClient.js';
import { faviconUrl, isSite } from '../services/launchpad/items.js';

/**
 * An app's own macOS icon, served by the backend, with a lettered fallback for
 * the ones whose icon can't be read.
 */
export function AppIcon({ app, className = 'h-11 w-11' }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={`grid ${className} shrink-0 place-items-center rounded-[0.85rem] bg-white/10 font-semibold text-white/70 shadow-lg`}
      >
        {app.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={api.launch.iconUrl(app)}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={`${className} shrink-0 object-contain drop-shadow-lg`}
    />
  );
}

/** A website shortcut — its favicon on a soft tile, globe fallback. */
export function SiteIcon({ url, className = 'h-11 w-11' }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`grid ${className} shrink-0 place-items-center rounded-[0.85rem] bg-white/10 shadow-lg ring-1 ring-white/10`}
    >
      {failed ? (
        <Globe className="h-1/2 w-1/2 text-cyan-100/70" strokeWidth={1.6} aria-hidden="true" />
      ) : (
        <img
          src={faviconUrl(url)}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-[55%] w-[55%] rounded object-contain"
        />
      )}
    </span>
  );
}

/** Either of the two, chosen by the item's shape. */
export default function LaunchIcon({ item, className }) {
  return isSite(item) ? <SiteIcon url={item.url} className={className} /> : <AppIcon app={item} className={className} />;
}
