import {
  Calendar,
  Home,
  MapPin,
  Music as MusicIcon,
  Newspaper,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import bgImage from './assets/bg.jpg';
import Dock from './components/Dock.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import TopBar from './components/TopBar.jsx';
import { useConversations } from './hooks/useConversations.js';
import { runPreload } from './services/preload.js';
import AIAssistant from './views/AIAssistant.jsx';
import Finance from './views/Finance.jsx';
import HomeView from './views/Home.jsx';
import IdleScreen from './views/IdleScreen.jsx';
import LifeHub from './views/LifeHub.jsx';
import Markets from './views/Markets.jsx';
import Music from './views/Music.jsx';
import Travel from './views/Travel.jsx';

const navItems = [
  {
    id: 'home',
    label: 'Home',
    Icon: Home,
    color: 'from-cyan-300/85 to-blue-500/85',
  },
  {
    id: 'life',
    label: 'Life Hub',
    Icon: Calendar,
    color: 'from-emerald-300/85 to-cyan-500/85',
  },
  {
    id: 'markets',
    label: 'Markets & News',
    Icon: Newspaper,
    color: 'from-cyan-300/85 to-purple-500/85',
  },
  {
    id: 'ai',
    label: 'AI Assistant',
    Icon: Sparkles,
    color: 'from-emerald-300/85 to-purple-500/85',
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
  {
    id: 'finance',
    label: 'Finance',
    Icon: Wallet,
    color: 'from-purple-300/85 to-pink-500/85',
  },
];

export default function App() {
  const [activeView, setActiveView] = useState('home');
  const [isIdleScreen, setIsIdleScreen] = useState(true);
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [now, setNow] = useState(() => new Date());
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

  const openAssistantWithPrompt = useCallback((prompt) => {
    setPendingPrompt(prompt);
    setActiveView('ai');
    setIsIdleScreen(false);
  }, []);

  const handlePromptConsumed = useCallback(() => {
    setPendingPrompt('');
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

  const views = {
    home: <HomeView {...viewProps} />,
    life: <LifeHub />,
    finance: <Finance />,
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
      />
    ),
  };

  return (
    <div
      className="theme-bg relative h-dvh overflow-hidden bg-midnight font-sans text-white selection:bg-cyan-200/25"
      style={{ backgroundImage: `url(${bgImage})` }}
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
      <div className="ambient-layer" aria-hidden="true" />
      <div className="ambient-sheen" aria-hidden="true" />
      <div className="ambient-stars" aria-hidden="true" />
      <div className="ambient-grain" aria-hidden="true" />

      {isIdleScreen ? (
        <IdleScreen now={now} />
      ) : (
        <div className="relative z-10 flex h-dvh flex-col">
          <TopBar activeLabel={activeItem.label} now={now} />

          <main
            id="main-content"
            className="min-h-0 flex-1 px-5 pb-[6.5rem] pt-2 md:px-8"
          >
            <div key={activeView} className="fade-in mx-auto h-full max-w-[1280px]">
              {views[activeView]}
            </div>
          </main>
        </div>
      )}

      <Dock
        items={navItems}
        activeView={activeItem.id}
        onChange={(view) => activate(view)}
      />

      {!boot.done && <LoadingScreen progress={boot.progress} label={boot.label} exiting={boot.exiting} />}
    </div>
  );
}
