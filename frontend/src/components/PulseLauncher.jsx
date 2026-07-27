import { MessageSquareText, Mic, Settings } from 'lucide-react';
import { createPortal } from 'react-dom';

/**
 * The compact chooser that pops above the dock when you tap the Pulse orb —
 * just round icons: a text chat, a voice conversation, and settings.
 *
 * @param {object} p
 * @param {()=>void} p.onChat
 * @param {()=>void} p.onVoice
 * @param {()=>void} p.onSettings  open the full-page AI settings
 * @param {()=>void} p.onClose
 */
export default function PulseLauncher({ onChat, onVoice, onSettings, onClose }) {
  return createPortal(
    <div data-settings="" className="fixed inset-0 z-[64]" onClick={onClose} role="presentation">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[5.75rem] flex justify-center px-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="theme-card pointer-events-auto fade-in flex items-center gap-2.5 rounded-full p-2.5 shadow-2xl">
          <button
            type="button"
            onClick={onChat}
            aria-label="Text chat"
            title="Text chat"
            className="orb-button grid h-12 w-12 place-items-center rounded-full text-white transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/50"
          >
            <MessageSquareText className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onVoice}
            aria-label="Voice"
            title="Voice"
            className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-violet-300/85 to-cyan-400/85 text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/50"
          >
            <Mic className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onSettings}
            aria-label="Pulse AI settings"
            title="Pulse AI settings"
            className="grid h-12 w-12 place-items-center rounded-full bg-white/[0.06] text-white/60 ring-1 ring-white/10 transition hover:bg-white/[0.1] hover:text-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
