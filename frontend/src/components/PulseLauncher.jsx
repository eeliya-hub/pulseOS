import { MessageSquareText, Mic, Settings } from 'lucide-react';
import { createPortal } from 'react-dom';

/**
 * The chooser that rises above the dock when you tap the Pulse orb: talk, type,
 * or change how Pulse behaves. Talking is the lit pill — it's the fastest way in.
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
        className="pointer-events-none absolute inset-x-0 bottom-[6.75rem] flex justify-center px-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="theme-popover launcher-rise pointer-events-auto flex items-center gap-1 rounded-full p-1.5">
          <button type="button" onClick={onVoice} aria-label="Voice" title="Voice" className="pill pill-lit h-11 px-5 text-[0.875rem]">
            <Mic className="h-4 w-4" aria-hidden="true" />
            Talk
          </button>
          <button type="button" onClick={onChat} aria-label="Text chat" title="Text chat" className="pill h-11 px-5 text-[0.875rem]">
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            Type
          </button>
          <button
            type="button"
            onClick={onSettings}
            aria-label="Pulse AI settings"
            title="Pulse AI settings"
            className="pill h-11 w-11 px-0 text-moon/70"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
