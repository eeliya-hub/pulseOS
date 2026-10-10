import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sky from './components/Sky.jsx';
import { useSky } from './hooks/useSky.js';
import ChatPopover from './components/ChatPopover.jsx';
import Dock from './components/Dock.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import MiniPlayer from './components/MiniPlayer.jsx';
import PulseLauncher from './components/PulseLauncher.jsx';
import TopBar from './components/TopBar.jsx';
import VoiceAssistant from './components/VoiceAssistant.jsx';
import LiveNewsImmersive from './components/LiveNewsImmersive.jsx';
import { onNavigate } from './services/ui/navigation.js';
import { useConversations } from './hooks/useConversations.js';
import { runPreload } from './services/preload.js';
import AIAssistant from './views/AIAssistant.jsx';
import HomeView from './views/Home.jsx';
import IdleScreen from './views/IdleScreen.jsx';
import Launchpad from './views/Launchpad.jsx';
import MusicImmersive from './components/MusicImmersive.jsx';
import { useSettings } from './hooks/useSettings.js';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer.js';
import LifeHub from './views/LifeHub.jsx';
import Mail from './views/Mail.jsx';
import Markets from './views/Markets.jsx';
import Music from './views/Music.jsx';
import Settings from './views/Settings.jsx';
import Travel from './views/Travel.jsx';
import { applyMotion } from './services/ui/motion.js';
import { tabBar } from './data/tabs.js';

// What the way back out of Settings says, by where you came from.
const BACK_LABEL = {
  home: 'Home',
  launchpad: 'Launchpad',
  life: 'Life Hub',
  mail: 'Mail',
  ai: 'Ask Pulse',
  markets: 'Markets & News',
  music: 'Music',
  travel: 'Travel',
};

export default function App() {
  useSky();
  const [activeView, setActiveView] = useState('home');

  // The assistant can move the dashboard: "put BBC News on" has to be able to
  // get to the news view before it can turn a channel on.
  useEffect(
    () =>
      onNavigate((id) => {
        setIsIdleScreen(false);
        setActiveView((current) => (id === current ? current : id));
      }),
    [],
  );
  const [isIdleScreen, setIsIdleScreen] = useState(true);
  // The Pulse assistant overlay: 'closed' | 'menu' (chat/voice chooser) |
  // 'chat' (compact popover) | 'voice'. Expanding the popover routes to the
  // full 'ai' page with the same conversation.
  const [pulseMode, setPulseMode] = useState('closed');
  // Settings is a place, not a tab: which section it opens on, and the view to
  // go back to when you leave.
  const [settingsAt, setSettingsAt] = useState({ section: 'you', tab: undefined, from: 'home' });
  const [pendingPrompt, setPendingPrompt] = useState('');
  // A message the Life Hub's mail card asked to open, so arriving in Mail lands
  // on the one you clicked rather than on the top of the inbox.
  const [pendingMessage, setPendingMessage] = useState(null);
  const [now, setNow] = useState(() => new Date());

  // Idle + music playing + opted in = the immersive player stands in for the
  // screensaver. Anything else falls through to the usual idle screen.
  const { settings } = useSettings();
  const { state: playerState, controls: playerControls } = useSpotifyPlayer();
  const afkImmersive = settings.afkImmersive !== false && Boolean(playerState?.track) && !playerState.paused;
  // Seconds on Home before the clock takes over; 0 means it never does.
  const idleAfter = Number.isFinite(settings.idleAfter) ? settings.idleAfter : 20;
  // The tab bar as arranged in Settings.
  const navItems = useMemo(() => tabBar(settings.tabs, settings.hiddenTabs), [settings.tabs, settings.hiddenTabs]);
  const voiceShortcut = settings.voiceShortcut !== false;

  useEffect(() => applyMotion(Boolean(settings.reduceMotion)), [settings.reduceMotion]);

  // Ask Spotify what is already playing, once, at launch. Nothing else did:
  // devices were only polled from the Music view, so opening Pulse with a record
  // already on somewhere else left the shell believing nothing was playing — and
  // going idle then dropped to the clock instead of the immersive player.
  useEffect(() => {
    playerControls.refreshDevices?.();
  }, [playerControls]);
  const [boot, setBoot] = useState({ progress: 0, label: '', done: false, exiting: false });
  const idleTimerRef = useRef(null);

  // Preload the main data sources on launch so switching tabs is instant.
  useEffect(() => {
    let alive = true;
    const finish = () => {
      if (!alive) return;
      setBoot((b) => ({ ...b, progress: 1, exiting: true }));
      window.setTimeout(() => alive && setBoot((b) => ({ ...b, done: true })), 550);
    };
    runPreload((progress, label) => alive && setBoot((b) => ({ ...b, progress, label }))).finally(finish);
    const cap = window.setTimeout(finish, 12000); // never hang
    return () => {
      alive = false;
      window.clearTimeout(cap);
    };
  }, []);
  const {
    conversations,
    activeId,
    active,
    setActiveMessages,
    newConversation,
    selectConversation,
    deleteConversation,
  } = useConversations();

  const activeItem = useMemo(() => {
    // Views that live inside another one keep that one lit in the bar.
    const inBar = activeView === 'mail' ? 'life' : activeView;
    return navItems.find((item) => item.id === inBar) ?? navItems[0];
  }, [activeView, navItems]);

  // A text conversation that's sat idle for over an hour is stale — the next time
  // it's opened, start fresh instead of resuming a cold thread. A ref keeps the
  // check reading the latest conversation without churning the callbacks below.
  const CHAT_STALE_MS = 60 * 60 * 1000;
  const activeRef = useRef(active);
  activeRef.current = active;
  const rotateIfStale = useCallback(() => {
    const conv = activeRef.current;
    if (conv?.updatedAt && conv.messages.length > 1 && Date.now() - conv.updatedAt > CHAT_STALE_MS) {
      newConversation();
    }
  }, [CHAT_STALE_MS, newConversation]);

  const openAssistantWithPrompt = useCallback(
    (prompt) => {
      rotateIfStale();
      setPendingPrompt(prompt);
      setActiveView('ai');
      setIsIdleScreen(false);
      setPulseMode('closed');
    },
    [rotateIfStale],
  );

  const handlePromptConsumed = useCallback(() => {
    setPendingPrompt('');
  }, []);

  // Pulse launcher/popover controls. Tapping the dock orb toggles the chooser;
  // expanding the popover hands the conversation to the full 'ai' page.
  const togglePulseMenu = useCallback(() => {
    setIsIdleScreen(false);
    setPulseMode((mode) => (mode === 'closed' ? 'menu' : 'closed'));
  }, []);
  const openPulseChat = useCallback(() => {
    rotateIfStale();
    setPulseMode('chat');
  }, [rotateIfStale]);
  const viewRef = useRef(activeView);
  viewRef.current = activeView;
  const openSettings = useCallback((section = 'you', tab) => {
    const from = viewRef.current;
    setSettingsAt((prev) => ({ section, tab, from: from === 'settings' ? prev.from : from }));
    setPulseMode('closed');
    setIsIdleScreen(false);
    setActiveView('settings');
  }, []);
  const closeSettings = useCallback(() => {
    setActiveView(settingsAt.from ?? 'home');
  }, [settingsAt.from]);
  // The assistant's own settings live in Settings now, under Pulse.
  const openAiSettings = useCallback(() => openSettings('pulse'), [openSettings]);
  const expandPulse = useCallback(() => {
    setPulseMode('closed');
    setActiveView('ai');
    setIsIdleScreen(false);
  }, []);

  const viewProps = {
    onNavigate: (view) => {
      setActiveView(view);
      setIsIdleScreen(false);
    },
    onAskPulse: openAssistantWithPrompt,
  };

  const resetIdleTimer = useCallback(() => {
    window.clearTimeout(idleTimerRef.current);
    if (!idleAfter) return;
    idleTimerRef.current = window.setTimeout(() => {
      setIsIdleScreen(true);
      setActiveView('home');
    }, idleAfter * 1000);
  }, [idleAfter]);

  const activate = useCallback((view = 'home') => {
    // Just wake / navigate; the effect below owns the idle timer (Home only).
    setIsIdleScreen(false);
    setActiveView(view);
  }, []);

  useEffect(() => {
    const clockInterval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    // The idle-return-to-screensaver only applies on the Home tab. Every other
    // view stays put until the user navigates away themselves.
    if (isIdleScreen || activeView !== 'home') {
      window.clearTimeout(idleTimerRef.current);
      return undefined;
    }

    resetIdleTimer();

    const handleActivity = () => {
      resetIdleTimer();
    };
    const activityEvents = ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'scroll'];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    return () => {
      window.clearTimeout(idleTimerRef.current);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
    };
  }, [isIdleScreen, activeView, resetIdleTimer]);

  useEffect(() => {
    if (!isIdleScreen) return undefined;

    const handleWake = (event) => {
      if (event.target?.closest?.('[data-settings]')) return;
      activate('home');
    };
    window.addEventListener('keydown', handleWake);

    return () => window.removeEventListener('keydown', handleWake);
  }, [activate, isIdleScreen]);

  // Double-tap Space anywhere (outside a text field / control) to open Pulse Voice
  // — unless it's been switched off in Settings.
  useEffect(() => {
    if (!voiceShortcut) return undefined;
    let lastSpace = 0;
    const isTyping = (el) => {
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        tag === 'A' ||
        Boolean(el.closest?.('[role="button"]'))
      );
    };
    const onKeyDown = (event) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      if (event.repeat || isTyping(event.target)) return;
      const now = Date.now();
      if (now - lastSpace < 400) {
        lastSpace = 0;
        event.preventDefault();
        setIsIdleScreen(false);
        setPulseMode('voice');
      } else {
        lastSpace = now;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [voiceShortcut]);

  const openMail = useCallback(
    (message) => {
      setPendingMessage(message?.id ? message : null);
      setActiveView('mail');
      setIsIdleScreen(false);
    },
    [],
  );

  const views = {
    home: <HomeView {...viewProps} onOpenSettings={() => openSettings('you')} />,
    life: <LifeHub onOpenMail={openMail} />,
    mail: (
      <Mail
        initialMessage={pendingMessage}
        onOpenSettings={() => openSettings('mail')}
        onBack={() => setActiveView('life')}
      />
    ),
    launchpad: <Launchpad />,
    markets: <Markets />,
    music: <Music />,
    travel: <Travel />,
    ai: (
      <AIAssistant
        conversations={conversations}
        activeId={activeId}
        messages={active.messages}
        setMessages={setActiveMessages}
        onNewConversation={newConversation}
        onSelectConversation={selectConversation}
        onDeleteConversation={deleteConversation}
        initialPrompt={pendingPrompt}
        onPromptConsumed={handlePromptConsumed}
        onOpenAiSettings={openAiSettings}
      />
    ),
    settings: (
      <Settings
        initialSection={settingsAt.section}
        initialTab={settingsAt.tab}
        backLabel={BACK_LABEL[settingsAt.from] ?? 'Home'}
        onClose={closeSettings}
      />
    ),
  };
  const inSettings = activeView === 'settings';

  return (
    <div
      className="relative h-dvh overflow-hidden bg-ink font-sans text-moon"
      onPointerDownCapture={(event) => {
        if (event.target?.closest?.('[data-settings]')) return;
        if (isIdleScreen) activate('home');
      }}
      onKeyDownCapture={(event) => {
        if (event.target?.closest?.('[data-settings]')) return;
        if (isIdleScreen) activate('home');
      }}
      // The shell is one screen and never scrolls. Overflow-hidden still lets
      // script scroll it — a focus or a scrollIntoView reaching for something
      // past the edge — and that shifts every view up off the top; put it back.
      onScroll={(event) => {
        if (event.target === event.currentTarget && event.currentTarget.scrollTop) event.currentTarget.scrollTop = 0;
      }}
      role="presentation"
    >
      <Sky />

      {isIdleScreen && afkImmersive ? (
        // Going idle with music on lands in the immersive player rather than the
        // screensaver — a tap anywhere takes you back to Home, same as waking.
        <MusicImmersive afk now={now} onClose={() => activate('home')} />
      ) : isIdleScreen ? (
        <IdleScreen now={now} />
      ) : (
        <div className="relative z-10 flex h-dvh flex-col">
          <TopBar now={now} />

          <main
            id="main-content"
            className={`min-h-0 flex-1 px-5 pt-2 md:px-8 ${inSettings ? 'pb-0' : 'pb-[6.5rem]'}`}
          >
            <div key={activeView} className="view-enter mx-auto h-full max-w-[80rem]">
              <ErrorBoundary resetKey={activeView}>{views[activeView]}</ErrorBoundary>
            </div>
          </main>
        </div>
      )}

      <Dock
        items={navItems}
        activeView={activeItem.id}
        onChange={(view) => (view === 'ai' ? togglePulseMenu() : activate(view))}
        away={inSettings && !isIdleScreen}
      />

      {pulseMode === 'menu' && (
        <PulseLauncher
          onChat={openPulseChat}
          onVoice={() => setPulseMode('voice')}
          onSettings={openAiSettings}
          onClose={() => setPulseMode('closed')}
        />
      )}

      {pulseMode === 'chat' && (
        <ChatPopover
          messages={active.messages}
          setMessages={setActiveMessages}
          onClose={() => setPulseMode('closed')}
          onExpand={expandPulse}
          onVoice={() => setPulseMode('voice')}
          onNewChat={newConversation}
        />
      )}
      {pulseMode === 'voice' && <VoiceAssistant onClose={() => setPulseMode('closed')} />}

      {/* A live channel given the whole screen — above everything, including voice */}
      <LiveNewsImmersive />

      {/* Floating controller — on every view except the full Music player, Settings and idle. */}
      {!isIdleScreen && activeView !== 'music' && !inSettings && <MiniPlayer />}

      {!boot.done && <LoadingScreen progress={boot.progress} label={boot.label} exiting={boot.exiting} />}
    </div>
  );
}
