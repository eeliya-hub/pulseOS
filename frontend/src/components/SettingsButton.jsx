import { Download, Settings, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { describe, download, restore } from '../services/backup.js';
import { useSettings } from '../hooks/useSettings.js';
import SportsFollowPicker from './SportsFollowPicker.jsx';
import StocksPicker from './StocksPicker.jsx';

// A self-contained settings entry point: a subtle gear that opens a modal to
// edit name + location. The `data-settings` markers let the screensaver's
// wake-on-touch handler ignore taps here (see App.jsx).
export default function SettingsButton({
  className = '',
  label = false,
  title = 'Settings',
  fields = ['name', 'location', 'sports', 'afk', 'data'],
}) {
  const [open, setOpen] = useState(false);
  const { settings, update } = useSettings();

  return (
    <>
      <button
        type="button"
        data-settings=""
        onClick={() => setOpen(true)}
        aria-label="Settings"
        className={[label ? 'pill h-9 px-3 text-moon/75' : 'pill h-11 w-11 px-0 text-moon/70', className].join(' ')}
      >
        <Settings className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
        {label ? (
          <span className="text-[0.75rem] font-medium">Settings</span>
        ) : null}
      </button>

      {open
        ? createPortal(
        <div
          data-settings=""
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="fade-in absolute inset-0 bg-ink/70 backdrop-blur-md" aria-hidden="true" />
          <div className="theme-popover launcher-rise relative z-10 w-full max-w-sm rounded-[1.75rem] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="display-type text-[1.75rem] leading-none text-moon">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close settings"
                className="pill h-8 w-8 px-0 text-moon/70"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {fields.includes('name') ? (
              <Field
                label="Your name"
                value={settings.name}
                onChange={(v) => update({ name: v })}
                placeholder="Your name"
                hint="Used for your greeting"
              />
            ) : null}
            {fields.includes('location') ? (
              <Field
                className={fields.includes('name') ? 'mt-4' : ''}
                label="Location"
                value={settings.location}
                onChange={(v) => update({ location: v })}
                placeholder="e.g. Ashford"
                hint="Used for your local news — a town or county"
              />
            ) : null}
            {fields.includes('sports') ? (
              <div className={fields.length > 1 ? 'mt-4' : ''}>
                <SportsFollowPicker />
              </div>
            ) : null}
            {fields.includes('stocks') ? (
              <div className={fields.length > 1 ? 'mt-4' : ''}>
                <StocksPicker />
              </div>
            ) : null}
            {fields.includes('ticker') ? (
              <div className={fields.length > 1 ? 'mt-4' : ''}>
                <StocksPicker
                  setting="ticker"
                  label="Top ticker tape"
                  hint="What scrolls across the top. Stocks or crypto — BTC, ETH, SOL all work."
                  placeholder="e.g. BTC"
                />
              </div>
            ) : null}

            {fields.includes('data') ? (
              <DataTransfer className={fields.length > 1 ? 'mt-5' : ''} />
            ) : null}

            {fields.includes('afk') ? (
              <Toggle
                className={fields.length > 1 ? 'mt-5' : ''}
                label="Immersive player when idle"
                hint="If music is playing when the screen goes idle, show the full-screen player with the time. Tap it to come back."
                checked={settings.afkImmersive !== false}
                onChange={(v) => update({ afkImmersive: v })}
              />
            ) : null}
            {fields.includes('ai') ? (
              <Textarea
                className={fields.length > 1 ? 'mt-4' : ''}
                label="How Pulse should talk to you"
                value={settings.aiInstructions ?? ''}
                onChange={(v) => update({ aiInstructions: v })}
                placeholder="e.g. Keep replies short and direct. Call me Eel. Be upbeat in the mornings. Always give times in 24h."
                hint="Your assistant follows this in every chat and voice reply"
              />
            ) : null}
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Toggle({ label, hint, checked, onChange, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <span className="min-w-0">
        <span className="block text-[0.875rem] text-moon/90">{label}</span>
        {hint ? <span className="mt-1 block text-[0.75rem] leading-snug text-dim">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
          checked ? 'bg-moon' : 'bg-white/15',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-1 h-4 w-4 rounded-full shadow transition-all duration-300',
            checked ? 'left-6 bg-ink' : 'left-1 bg-moon',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

/**
 * Carrying your setup between copies of Pulse.
 *
 * A browser keeps this per origin, and the desktop app serves itself on a
 * different port to the dev server — so to a browser they are two unrelated
 * sites. Nothing moves between them on its own, and none of it is on the
 * server to fetch: your trips, your launchpad and your conversations live in
 * the browser. Hence a file.
 *
 * Connected accounts are not in it, and are not meant to be. Spotify and the
 * calendars hold tokens on the server against this machine, and a copy would be
 * a copy of a credential — reconnecting takes a click and means the new copy
 * owns its own access.
 */
function DataTransfer({ className = '' }) {
  const [note, setNote] = useState(null);
  const file = useRef(null);

  const save = () => {
    const payload = download();
    const parts = describe(payload);
    setNote({
      tone: 'ok',
      text: parts.length ? `Saved: ${parts.join(', ').toLowerCase()}.` : 'Saved, though there was little to save.',
    });
  };

  const load = async (chosen) => {
    if (!chosen) return;
    try {
      const restored = await restore(chosen);
      setNote({
        tone: 'ok',
        text: `Restored ${restored.length ? restored.join(', ').toLowerCase() : 'your backup'}. Reloading…`,
      });
      // Every store reads its key once at startup, so the page has to come back
      // for any of this to be visible.
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setNote({ tone: 'bad', text: e.message });
    }
  };

  return (
    <div className={className}>
      <span className="t-label mb-2 block">Your data</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          className="soft-button inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-moon/90 focus:outline-none"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export
        </button>
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="soft-button inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-moon/90 focus:outline-none"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Import
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => load(e.target.files?.[0])}
      />
      <span className="mt-1.5 block pl-1 text-[0.75rem] text-dim">
        {note ? (
          <span className={note.tone === 'bad' ? 'text-rose-300' : 'text-moon/70'}>{note.text}</span>
        ) : (
          'Trips, to-dos, launchpad, folders and conversations. Connected accounts stay behind — sign in again on the other copy.'
        )}
      </span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="t-label mb-2 block">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-full bg-white/[0.07] px-4 text-[0.9375rem] text-moon shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] outline-none transition placeholder:text-moon/35 focus:bg-white/[0.1] focus:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
      />
      {hint ? <span className="mt-1.5 block pl-1 text-[0.75rem] text-dim">{hint}</span> : null}
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="t-label mb-2 block">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="glass-scroll w-full resize-none rounded-[1.25rem] bg-white/[0.07] px-4 py-3 text-[0.9375rem] leading-6 text-moon shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] outline-none transition placeholder:text-moon/35 focus:bg-white/[0.1] focus:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
      />
      {hint ? <span className="mt-1.5 block pl-1 text-[0.75rem] text-dim">{hint}</span> : null}
    </label>
  );
}
