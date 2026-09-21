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
  fields = ['name', 'location', 'sports', 'afk'],
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
