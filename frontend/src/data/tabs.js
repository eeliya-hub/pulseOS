import { Calendar, Home, LayoutGrid, MapPin, Music, Newspaper, Sparkles } from 'lucide-react';

/**
 * The views the tab bar can hold. Their order, and which are put away, are
 * yours (Settings → Tab bar); Ask Pulse always stands in the middle, and Home is
 * always there — Settings lives on it.
 *
 * Mail is deliberately NOT here. It belongs to the Life Hub and is opened from
 * its card, the same way Settings belongs to Home — email is part of the day,
 * not another destination alongside it.
 */
export const TABS = {
  home: { id: 'home', label: 'Home', Icon: Home },
  launchpad: { id: 'launchpad', label: 'Launchpad', Icon: LayoutGrid },
  life: { id: 'life', label: 'Life Hub', Icon: Calendar },
  markets: { id: 'markets', label: 'Markets & News', Icon: Newspaper },
  music: { id: 'music', label: 'Music', Icon: Music },
  travel: { id: 'travel', label: 'Travel', Icon: MapPin },
};

export const ASK_PULSE = { id: 'ai', label: 'AI Assistant', Icon: Sparkles };

/** The bar as you've arranged it: your tabs either side of Ask Pulse. */
export function tabBar(order = Object.keys(TABS), hidden = []) {
  const shown = order.filter((id) => TABS[id] && (id === 'home' || !hidden.includes(id)));
  const half = Math.ceil(shown.length / 2);
  return [...shown.slice(0, half).map((id) => TABS[id]), ASK_PULSE, ...shown.slice(half).map((id) => TABS[id])];
}
