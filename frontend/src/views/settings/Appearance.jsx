import { ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import PulseMark from '../../components/PulseMark.jsx';
import { useMinute } from '../../hooks/useMinute.js';
import { useSettings } from '../../hooks/useSettings.js';
import { PHASES, phaseFor } from '../../hooks/useSky.js';
import { setWallpaper, useWallpaper } from '../../hooks/useWallpaper.js';
import { formatClock, greetingFor, meridiem } from '../../utils/dateTime.js';
import { fileToDataUrl } from '../../utils/images.js';
import { Choice, Group, Page, Preview, Row, Slider, ToggleRow } from './controls.jsx';

/**
 * Accents to choose from. Light, every one of them, because an accent is read
 * as type on a dark sky — the hour's own four are the first four after the sky's.
 */
const ACCENTS = [
  { id: 'sky', label: 'The sky’s own' },
  { id: '#a9bbff', label: 'Periwinkle' },
  { id: '#b9e4ff', label: 'Ice' },
  { id: '#ffc9a3', label: 'Peach' },
  { id: '#ffb59c', label: 'Ember' },
  { id: '#9ff0d0', label: 'Mint' },
  { id: '#ffe08a', label: 'Gold' },
  { id: '#ffa8cf', label: 'Rose' },
  { id: '#d4b4ff', label: 'Lilac' },
];

const SKIES = [
  { id: 'dawn', label: 'Dawn', hint: 'Peach, before eight' },
  { id: 'day', label: 'Day', hint: 'Clear blue' },
  { id: 'dusk', label: 'Dusk', hint: 'Embers, after five' },
  { id: 'night', label: 'Night', hint: 'Indigo, with a few stars' },
];

/** An hour's colours, as the sky draws them. */
const skyFill = (phase) => {
  const p = PHASES[phase];
  return `radial-gradient(90% 80% at 85% 15%, ${p.c}, transparent 70%), radial-gradient(80% 70% at 10% 10%, ${p.b}, transparent 70%), linear-gradient(170deg, ${p.a}, #0a0d1c)`;
};

/** All four hours in one swatch, turning — what "follow the hour" means. */
const HOURS_FILL = `conic-gradient(from 200deg, ${['dawn', 'day', 'dusk', 'night', 'dawn'].map((p) => PHASES[p].b).join(', ')})`;
const HOURS_ACCENT = `conic-gradient(from 200deg, ${['dawn', 'day', 'dusk', 'night', 'dawn'].map((p) => PHASES[p].accent).join(', ')})`;

/** The whole app, small, in the colours you've chosen. */
export function AppearancePreview() {
  const { settings } = useSettings();
  const wallpaper = useWallpaper();
  const bg = settings.background ?? {};
  const photo = bg.kind === 'photo' && wallpaper;
  const now = useMinute();

  return (
    <Preview>
      {photo ? (
        <>
          <div
            className="absolute -inset-4 bg-cover bg-center"
            style={{ backgroundImage: `url(${wallpaper})`, filter: bg.blur ? `blur(${bg.blur / 3}px)` : undefined }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--ink) 82%, transparent), var(--ink))',
              opacity: bg.dim ?? 0.7,
            }}
          />
        </>
      ) : (
        <div className="sky-stars" />
      )}

      <div className="absolute inset-x-5 top-4 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <PulseMark className="h-[0.55rem] w-[1.4rem] text-accent" />
          <span className="display-type text-[0.75rem] leading-none text-moon">Pulse</span>
        </span>
        <span className="display-figures text-[0.9rem] leading-none text-moon">
          {formatClock(now).replace(' : ', ':')}
          {meridiem(now) ? <span className="ml-0.5 text-[0.55rem] text-moon/60">{meridiem(now)}</span> : null}
        </span>
      </div>

      <p className="display-type absolute inset-x-5 top-[2.9rem] text-[1.45rem] leading-[1.05] text-moon">
        {greetingFor(now)}, <span className="name-mark">{settings.name || 'you'}</span>
      </p>
      <p className="t-meta absolute inset-x-5 top-[4.9rem] text-[0.6875rem]">One thing on today</p>

      <div className="preview-ground top-[64%]">
        <div className="mx-5 mt-3 grid grid-cols-3 gap-3">
          {[0.9, 0.7, 0.8].map((w, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-1 rounded-full bg-white/25" style={{ width: `${w * 60}%` }} />
              <div className="h-1 rounded-full bg-white/10" style={{ width: `${w * 90}%` }} />
              <div className="h-1 rounded-full bg-white/10" style={{ width: `${w * 75}%` }} />
            </div>
          ))}
        </div>
        <MiniBaseline className="absolute inset-x-0 bottom-2" />
      </div>
    </Preview>
  );
}

/** The tab bar's line with the beat at its centre, in the accent. */
export function MiniBaseline({ className = '' }) {
  return (
    <svg viewBox="0 0 240 20" preserveAspectRatio="none" className={`h-5 w-full ${className}`} fill="none">
      <path d="M0 13 H104 M136 13 H240" stroke="rgba(238,240,250,0.18)" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
      <path
        d="M104 13 L109 9 L113 18 L119 3 L125 15 L129 13 H136"
        style={{ stroke: 'var(--accent)' }}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function AppearancePane() {
  const { settings, update } = useSettings();
  const wallpaper = useWallpaper();
  const bg = { kind: 'sky', dim: 0.7, blur: 0, tint: true, ...settings.background };
  const setBg = (patch) => update((s) => ({ background: { ...bg, ...s.background, ...patch } }));
  const accent = ACCENTS.find((a) => a.id === (settings.accent || 'sky')) ?? ACCENTS[0];
  const sky = settings.skyPhase ?? 'auto';
  const current = phaseFor();
  const [error, setError] = useState('');
  const file = useRef(null);

  const choose = async (picked) => {
    if (!picked) return;
    setError('');
    try {
      setWallpaper(await fileToDataUrl(picked, 1920));
      setBg({ kind: 'photo' });
    } catch (e) {
      setError(e?.message || 'That file isn’t a picture this can read.');
    }
  };

  return (
    <Page>
      <Group title="Accent" note="The colour every highlight is drawn in — the horizon, your name, the beat in the tab bar.">
        <Row
          label={accent.label}
          hint={
            accent.id === 'sky'
              ? 'It changes with the hour, and takes a record’s colour in Music.'
              : 'Yours whatever the hour. Music still lends a record’s colour while you’re in it.'
          }
        >
          <div role="radiogroup" aria-label="Accent" className="flex items-center gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={a.id === accent.id}
                aria-label={a.label}
                title={a.label}
                onClick={() => update({ accent: a.id })}
                className="accent-chip focus:outline-none focus-visible:ring-2 focus-visible:ring-moon/70"
                style={{ '--chip': a.id === 'sky' ? '#a9bbff' : a.id, background: a.id === 'sky' ? HOURS_ACCENT : undefined }}
              />
            ))}
          </div>
        </Row>
      </Group>

      <Group
        title="Sky"
        note={bg.kind === 'photo' && wallpaper ? 'Behind your photo now — the hour still sets the accent if you haven’t chosen one.' : undefined}
      >
        <Choice
          selected={sky === 'auto'}
          onClick={() => update({ skyPhase: 'auto' })}
          lead={<span className="settings-sky-swatch" style={{ background: HOURS_FILL }} />}
          title="Follow the hour"
          meta={`It’s ${SKIES.find((s) => s.id === current)?.label.toLowerCase()} now`}
        />
        {SKIES.map((s) => (
          <Choice
            key={s.id}
            selected={sky === s.id}
            onClick={() => update({ skyPhase: s.id })}
            lead={<span className="settings-sky-swatch" style={{ background: skyFill(s.id) }} />}
            title={s.label}
            meta={s.hint}
          />
        ))}
      </Group>

      <Group title="Background" note="The living sky, or a photo of yours set back behind a veil so everything in front of it still reads.">
        <Choice
          selected={bg.kind !== 'photo' || !wallpaper}
          onClick={() => setBg({ kind: 'sky' })}
          lead={<span className="settings-sky-swatch" style={{ background: skyFill(sky === 'auto' ? current : sky) }} />}
          title="The living sky"
          meta="Colours that follow the hour"
        />
        <Choice
          selected={bg.kind === 'photo' && Boolean(wallpaper)}
          onClick={() => (wallpaper ? setBg({ kind: 'photo' }) : file.current?.click())}
          lead={
            wallpaper ? (
              <span className="settings-sky-swatch bg-cover bg-center" style={{ backgroundImage: `url(${wallpaper})` }} />
            ) : (
              <span className="settings-sky-swatch grid place-items-center bg-white/[0.06]">
                <ImagePlus className="h-4 w-4 text-moon/50" strokeWidth={1.6} />
              </span>
            )
          }
          title="A photo of yours"
          meta={wallpaper ? 'Kept on this machine' : 'Choose one from this Mac'}
        />
        {wallpaper ? (
          <Row label="The photo" hint="Another from this Mac, or back to the living sky and forget this one.">
            <button type="button" onClick={() => file.current?.click()} className="pill h-9 px-4">
              Change
            </button>
            <button
              type="button"
              onClick={() => {
                setWallpaper('');
                setBg({ kind: 'sky' });
              }}
              className="pill h-9 px-4 text-moon/75 hover:text-fall"
            >
              Remove
            </button>
          </Row>
        ) : null}
        {bg.kind === 'photo' && wallpaper ? (
          <>
            <Row label="Dim" hint="How far it sits back. Darker reads better.">
              <Slider
                label="Dim"
                value={bg.dim}
                min={0.1}
                max={0.9}
                onChange={(dim) => setBg({ dim })}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            </Row>
            <Row label="Soften" hint="A little blur turns a busy photo into light.">
              <Slider
                label="Soften"
                value={bg.blur}
                min={0}
                max={30}
                step={1}
                onChange={(blur) => setBg({ blur })}
                format={(v) => (v ? `${v}px` : 'Off')}
              />
            </Row>
            <ToggleRow
              label="Colour Pulse from the photo"
              hint="The sky’s glow takes the photo’s colours — and the accent too, unless you’ve chosen one."
              checked={bg.tint !== false}
              onChange={(tint) => setBg({ tint })}
            />
          </>
        ) : null}
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Group>
      {error ? <p className="mt-3 text-[0.875rem] text-fall">{error}</p> : null}

      <Group title="Motion">
        <ToggleRow
          label="Reduce motion"
          hint="Stills the sky’s drift, the breathing horizon, the light along the tab bar and the immersive player’s room. Views still change — they just don’t glide."
          checked={Boolean(settings.reduceMotion)}
          onChange={(reduceMotion) => update({ reduceMotion })}
        />
      </Group>
    </Page>
  );
}
