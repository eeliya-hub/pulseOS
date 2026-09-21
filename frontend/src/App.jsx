import {
  Calendar,
  Home,
  LayoutGrid,
  MapPin,
  Music as MusicIcon,
  Newspaper,
  Sparkles,
} from 'lucide-react';
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
import AISettings from './views/AISettings.jsx';
import HomeView from './views/Home.jsx';
import IdleScreen from './views/IdleScreen.jsx';
import Launchpad from './views/Launchpad.jsx';
import MusicImmersive from './components/MusicImmersive.jsx';
import { useSettings } from './hooks/useSettings.js';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer.js';
import LifeHub from './views/LifeHub.jsx';
import Markets from './views/Markets.jsx';
import Music from './views/Music.jsx';
import Travel from './views/Travel.jsx';

const navItems = [
  {
    id: 'home',
    label: 'Home',
    Icon: Home,
    color: 'from-accent/85 to-blue-500/85',
  },
  {
    id: 'launchpad',
    label: 'Launchpad',
    Icon: LayoutGrid,
    color: 'from-purple-300/85 to-pink-500/85',
  },
  {
    id: 'life',
    label: 'Life Hub',
    Icon: Calendar,
    color: 'from-emerald-300/85 to-accent/85',
  },
  {
    id: 'ai',
    label: 'AI Assistant',
    Icon: Sparkles,
    color: 'from-emerald-300/85 to-purple-500/85',
  },
  {
    id: 'markets',
    label: 'Markets & News',
    Icon: Newspaper,
    color: 'from-accent/85 to-purple-500/85',
  },
  {
    id: 'music',
    label: 'Music',
    Icon: MusicIcon,
    color: 'from-pink-300/85 to-rose-500/85',
  },
  {
    id: 'travel',
    label: 'Travel',
    Icon: MapPin,
    color: 'from-amber-300/85 to-pink-500/85',
  },
];

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
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [now, setNow] = useState(() => new Date());

  // Idle + music playing + opted in = the immersive player stands in for the
  // screensaver. Anything else falls through to the usual idle screen.
  const { settings } = useSettings();
  const { state: playerState } = useSpotifyPlayer();
  const afkImmersive = settings.afkImmersive !== false && Boolean(playerState?.track) && !playerState.paused;
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

  const activeItem = useMemo(
    () => navItems.find((item) => item.id === activeView) ?? navItems[0],
    [activeView],
  );

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
  const openAiSettings = useCallback(() => {
    setPulseMode('closed');
    setIsIdleScreen(false);
    setShowAiSettings(true);
  }, []);
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
    idleTimerRef.current = window.setTimeout(() => {
      setIsIdleScreen(true);
      setActiveView('home');
    }, 20000);
  }, []);

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

  // Double-tap Space anywhere (outside a text field / control) to open Pulse Voice.
  useEffect(() => {
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
  }, []);

  const views = {
    home: <HomeView {...viewProps} />,
    life: <LifeHub />,
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
  };

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
            className="min-h-0 flex-1 px-5 pb-[6.5rem] pt-2 md:px-8"
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
      />

      {pulseMode === 'menu' && (
        <PulseLauncher
          onChat={openPulseChat}
          onVoice={() => setPulseMode('voice')}
          onSettings={openAiSettings}
          onClose={() => setPulseMode('closed')}
        />
      )}

      {showAiSettings && <AISettings onClose={() => setShowAiSettings(false)} />}
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

      {/* Floating controller — on every view except the full Music player + idle. */}
      {!isIdleScreen && activeView !== 'music' && <MiniPlayer />}

      {!boot.done && <LoadingScreen progress={boot.progress} label={boot.label} exiting={boot.exiting} />}
    </div>
  );
}
