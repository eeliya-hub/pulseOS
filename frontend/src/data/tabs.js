import { Calendar, Home, KanbanSquare, LayoutGrid, Mail, MapPin, Music, Newspaper, Sparkles } from 'lucide-react';

/**
 * The views the tab bar can hold. Their order, and which are put away, are
 * yours (Settings → Tab bar); Ask Pulse always stands in the middle, and Home is
 * always there — Settings lives on it.
 *
 * Mail and Projects used to live inside the Life Hub — mail on a card in its
 * sky, projects as a column of its ground. Both outgrew it: an inbox you work
 * in and a board you drag things around are destinations, not summaries, and
 * the Life Hub was carrying three jobs on one screen. It keeps the day; they
 * get their own tabs.
 */
export const TABS = {
  home: { id: 'home', label: 'Home', Icon: Home },
  launchpad: { id: 'launchpad', label: 'Apps', Icon: LayoutGrid },
  life: { id: 'life', label: 'Schedule', Icon: Calendar },
  mail: { id: 'mail', label: 'Mail', Icon: Mail },
  projects: { id: 'projects', label: 'Projects', Icon: KanbanSquare },
  markets: { id: 'markets', label: 'News', Icon: Newspaper },
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
