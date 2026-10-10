import {
  ArrowLeft,
  Calendar,
  HardDrive,
  Home,
  LayoutGrid,
  Mail as MailIcon,
  MapPin,
  Moon,
  Music,
  Newspaper,
  Palette,
  PanelBottom,
  Sparkles,
  UserRound,
  Waypoints,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Ground, SkyZone } from '../components/Stage.jsx';
import { AppearancePane, AppearancePreview } from './settings/Appearance.jsx';
import { ConnectionsPane, ConnectionsPreview } from './settings/Connections.jsx';
import { DataPane, DataPreview } from './settings/Data.jsx';
import { HomePane, HomePreview } from './settings/Home.jsx';
import { LaunchpadPane, LaunchpadPreview } from './settings/Launchpad.jsx';
import { LifePane, LifePreview } from './settings/LifeHub.jsx';
import { MailPane, MailPreview } from './settings/Mail.jsx';
import { MarketsPane, MarketsPreview } from './settings/Markets.jsx';
import { MusicPane, MusicPreview } from './settings/Music.jsx';
import { PulsePane, PulsePreview } from './settings/Pulse.jsx';
import { RestingPane, RestingPreview } from './settings/Resting.jsx';
import { TabsPane, TabsPreview } from './settings/TabBar.jsx';
import { TravelPane, TravelPreview } from './settings/Travel.jsx';
import { YouPane, YouPreview } from './settings/You.jsx';

/**
 * Every section, in the order the rail reads, under the heading it sits in:
 * what's yours, then the views in the order the tab bar first had them, then
 * the machine. Each has a colour of its own (`tint`) — its mark in the rail,
 * the tile by its name, the glow behind its header — so you can tell where you
 * are from across the room.
 */
const SECTIONS = [
  {
    id: 'you',
    group: 'Yours',
    label: 'You',
    icon: UserRound,
    tint: '#a5b4ff',
    lede: 'Your name, where you are, your birthday, and the units you think in.',
    Pane: YouPane,
    Preview: YouPreview,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    tint: '#d0a6ff',
    lede: 'The colour of every highlight, the sky behind everything — or a photo of yours — and how much it all moves.',
    Pane: AppearancePane,
    Preview: AppearancePreview,
  },
  {
    id: 'tabs',
    label: 'Tab bar',
    icon: PanelBottom,
    tint: '#8ad3ff',
    lede: 'Which views sit along the foot of the screen, and in what order.',
    Pane: TabsPane,
    Preview: TabsPreview,
  },
  {
    id: 'resting',
    label: 'Resting',
    icon: Moon,
    tint: '#f3d58c',
    lede: 'When Home goes to the clock, and what the clock tells you while it’s there.',
    Pane: RestingPane,
    Preview: RestingPreview,
  },
  {
    id: 'home',
    group: 'Views',
    label: 'Home',
    icon: Home,
    tint: '#7db4ff',
    lede: 'The event Home keeps an eye on for you, and the apps it keeps to hand.',
    Pane: HomePane,
    Preview: HomePreview,
  },
  {
    id: 'launchpad',
    label: 'Launchpad',
    icon: LayoutGrid,
    tint: '#e59cf0',
    lede: 'Everything you open from Pulse, the folders it’s filed in, and what this Mac has installed.',
    Pane: LaunchpadPane,
    Preview: LaunchpadPreview,
  },
  {
    id: 'life',
    label: 'Life Hub',
    icon: Calendar,
    tint: '#79dca2',
    lede: 'The calendars Pulse reads and writes, and which of them you see.',
    Pane: LifePane,
    Preview: LifePreview,
  },
  {
    id: 'mail',
    label: 'Mail',
    icon: MailIcon,
    tint: '#9fd0ff',
    lede: 'The mailboxes Pulse reads and writes, what it’s allowed to do with them, and what your assistant is given.',
    Pane: MailPane,
    Preview: MailPreview,
  },
  {
    id: 'pulse',
    label: 'Pulse',
    icon: Sparkles,
    tint: '#7fe6dc',
    lede: 'How your assistant talks to you, the voice it speaks in, and what it remembers.',
    // Four things about your assistant, each its own tab.
    tabs: [
      { id: 'personality', label: 'Personality' },
      { id: 'voice', label: 'Voice' },
      { id: 'prompts', label: 'Quick prompts' },
      { id: 'memory', label: 'Memory' },
    ],
    Pane: PulsePane,
    Preview: PulsePreview,
  },
  {
    id: 'markets',
    label: 'Markets & News',
    icon: Newspaper,
    tint: '#ffcf73',
    lede: 'What you hold, what runs across the top, the news you open on and the teams you follow.',
    Pane: MarketsPane,
    Preview: MarketsPreview,
  },
  {
    id: 'music',
    label: 'Music',
    icon: Music,
    tint: '#ff94b6',
    lede: 'Your Spotify, where it plays, and the room it fills when you go full screen.',
    Pane: MusicPane,
    Preview: MusicPreview,
  },
  {
    id: 'travel',
    label: 'Travel',
    icon: MapPin,
    tint: '#ffad80',
    lede: 'Which trip Travel opens on, the money you think in, and what its map draws.',
    Pane: TravelPane,
    Preview: TravelPreview,
  },
  {
    id: 'connections',
    group: 'This machine',
    label: 'Connections',
    icon: Waypoints,
    tint: '#7dd8f0',
    lede: 'Everything Pulse can reach on your behalf, and what’s left of today’s AI allowance.',
    Pane: ConnectionsPane,
    Preview: ConnectionsPreview,
  },
  {
    id: 'data',
    label: 'Your data',
    icon: HardDrive,
    tint: '#b9c1d4',
    lede: 'What Pulse keeps on this machine, and how to carry it to another.',
    Pane: DataPane,
    Preview: DataPreview,
  },
];

/**
 * Settings: somewhere you go from Home, not a tab. The tab bar steps away while
 * it's open, so the page has the whole screen.
 *
 * It keeps the house shape — sky, horizon, ground — split once, down the whole
 * height: the way back and the sections on the left, the section you're in on
 * the right. Its header names it, in its own colour, beside a live preview of
 * what it shapes; below the horizon, its settings run down one column in
 * groups. Nothing needs saving: every change is made as you make it.
 */
export default function Settings({ initialSection = 'you', initialTab, backLabel = 'Home', onClose }) {
  const [sectionId, setSectionId] = useState(() => (SECTIONS.some((s) => s.id === initialSection) ? initialSection : 'you'));
  const section = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];
  const [tabs, setTabs] = useState(() => (initialTab ? { [sectionId]: initialTab } : {}));
  const tab = section.tabs ? (tabs[section.id] ?? section.tabs[0].id) : null;
  const [modal, setModal] = useState(false);
  const railRef = useRef(null);
  const scrollRef = useRef(null);

  const go = useCallback((id) => {
    setSectionId(id);
    setModal(false);
  }, []);

  // A new section, or a new tab within one, starts at its top.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [sectionId, tab]);

  // Escape leaves — unless it's leaving a field, or something is open on top.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || modal) return;
      const el = e.target;
      if (el?.matches?.('input, textarea, select') || el?.isContentEditable) {
        el.blur();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, onClose]);

  // Up and down the rail with the arrow keys, the way a list of sections should.
  const onRailKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = SECTIONS.findIndex((s) => s.id === sectionId);
    const next = SECTIONS[(i + (e.key === 'ArrowDown' ? 1 : -1) + SECTIONS.length) % SECTIONS.length];
    go(next.id);
    railRef.current?.querySelector(`[data-section="${next.id}"]`)?.focus({ preventScroll: true });
  };

  const { Pane, Preview } = section;
  const Icon = section.icon;

  return (
    <div className="flex h-full flex-col" data-settings="" style={{ '--tint': section.tint }}>
      {/* ── Sky: the way back, and the section you're in ─────────────────── */}
      <SkyZone className="settings-sky grid grid-cols-[15rem_minmax(0,1fr)_auto] items-end gap-x-10">
        <span className="settings-glow" aria-hidden="true" />
        <button type="button" onClick={onClose} className="pill relative h-9 self-start justify-self-start px-3.5 text-moon/80">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </button>

        <div key={section.id} className="settings-swap relative min-w-0">
          <p className="flex items-center gap-2.5">
            <span className="section-tile section-tile--lg">
              <Icon strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="t-eyebrow" style={{ color: 'color-mix(in srgb, var(--tint) 78%, var(--moon))' }}>
              Settings
            </span>
          </p>
          <h1 className="t-hero mt-3 truncate">{section.label}</h1>
          <p className="t-lede mt-2.5 max-w-[40rem]">{section.lede}</p>
          {section.tabs ? (
            <div className="pill-group mt-5" role="tablist" aria-label={`${section.label} settings`}>
              {section.tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={t.id === tab}
                  onClick={() => setTabs((all) => ({ ...all, [section.id]: t.id }))}
                  className="pill h-8 px-4 text-[0.8125rem]"
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div key={`preview-${section.id}`} className="settings-swap relative hidden lg:block">
          <Preview />
        </div>
      </SkyZone>

      {/* ── Ground: the sections, and the one you're in ──────────────────── */}
      <Ground className="ground--flush grid grid-cols-[15rem_minmax(0,1fr)] gap-x-10">
        <nav className="flex min-h-0 flex-col pt-5" aria-label="Settings sections">
          <div ref={railRef} className="hide-scrollbar -ml-2 min-h-0 flex-1 overflow-y-auto pb-6" onKeyDown={onRailKey}>
            {SECTIONS.map((s) => {
              const SectionIcon = s.icon;
              return (
                <Fragment key={s.id}>
                  {s.group ? <p className="settings-rail-group">{s.group}</p> : null}
                  <button
                    type="button"
                    data-section={s.id}
                    onClick={() => go(s.id)}
                    aria-current={s.id === section.id ? 'page' : undefined}
                    className="settings-rail-row focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    style={{ '--tint': s.tint }}
                  >
                    <span className="section-tile">
                      <SectionIcon strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="truncate">{s.label}</span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        </nav>

        <div ref={scrollRef} className="settings-scroll glass-scroll min-h-0 min-w-0 overflow-y-auto">
          <div key={`${section.id}:${tab ?? ''}`}>
            <Pane tab={tab} onModal={setModal} onSection={go} />
          </div>
        </div>
      </Ground>
    </div>
  );
}
