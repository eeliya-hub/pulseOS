import { Settings, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
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
  fields = ['name', 'location', 'sports'],
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
        className={[
          'inline-flex items-center gap-1.5 text-white/40 transition hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
          className,
        ].join(' ')}
      >
        <Settings className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
        {label ? (
          <span className="text-[10px] font-medium uppercase tracking-[0.2em]">Settings</span>
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
          <div className="absolute inset-0 bg-[#070b18]/70 backdrop-blur-sm" aria-hidden="true" />
          <div className="theme-card fade-in relative z-10 w-full max-w-sm rounded-3xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="display-type text-lg font-light text-white text-glow">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close settings"
                className="grid h-8 w-8 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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

function Field({ label, value, onChange, placeholder, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-white/12"
      />
      {hint ? <span className="mt-1 block text-[10px] text-white/38">{hint}</span> : null}
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="glass-scroll w-full resize-none rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm leading-6 text-white outline-none transition placeholder:text-white/30 focus:border-cyan-100/40 focus:bg-white/12"
      />
      {hint ? <span className="mt-1 block text-[10px] text-white/38">{hint}</span> : null}
    </label>
  );
}
