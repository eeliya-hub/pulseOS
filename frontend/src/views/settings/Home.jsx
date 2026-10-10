import { ImagePlus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import LaunchIcon, { BrowserBadge } from '../../components/LaunchIcon.jsx';
import { useCalendarEvents } from '../../hooks/useCalendarEvents.js';
import { useLifeData } from '../../hooks/useLifeData.js';
import { useMinute } from '../../hooks/useMinute.js';
import { useSettings } from '../../hooks/useSettings.js';
import { homeItems, itemKey, itemLabel } from '../../services/launchpad/items.js';
import { fileToDataUrl } from '../../utils/images.js';
import { buildUpcoming, dateLabel, normTitle, relDay, startsIn, uniqueEventChoices } from '../../utils/upcoming.js';
import { Choice, Field, Group, Page, Preview, Row, ToggleRow } from './controls.jsx';

const SLOTS = 12;
const DEFAULT_LABEL = 'Highlighted event';
const SHOWN = 8;

/** Every event coming up, and the one the highlight is following. */
function useFollowed(pinned) {
  const life = useLifeData();
  const calendar = useCalendarEvents();
  const now = useMinute();
  const upcoming = useMemo(() => buildUpcoming([...life.events, ...calendar.events], now), [life.events, calendar.events, now]);
  const followed = pinned.match ? upcoming.find((e) => normTitle(e.title) === normTitle(pinned.match)) : upcoming[0];
  return { upcoming, followed: followed ?? null, loading: calendar.loading, now };
}

const pinnedOf = (settings) => ({ label: DEFAULT_LABEL, match: '', title: '', image: '', excludeFromUpcoming: false, ...settings.pinned });

/** The corner of Home that keeps an eye on one thing, as it will read. */
export function HomePreview() {
  const { settings } = useSettings();
  const pinned = pinnedOf(settings);
  const { followed, now } = useFollowed(pinned);
  return (
    <Preview>
      <div className="absolute inset-x-6 top-6">
        <div className="flex items-center justify-between gap-3">
          <p className="t-label flex min-w-0 items-center gap-2 text-[0.75rem]">
            {followed ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: followed.color }} /> : null}
            <span className="truncate">{pinned.label}</span>
          </p>
          {followed ? (
            <p className="display-figures shrink-0 text-[0.9375rem] italic leading-none text-accent">
              {startsIn(followed.offset, followed.time, now)}
            </p>
          ) : null}
        </div>
        {followed ? (
          <div className="mt-3.5 flex items-start gap-3.5">
            {pinned.image ? (
              <img src={pinned.image} alt="" className="h-[4.25rem] w-[4.25rem] shrink-0 rounded-[0.9rem] object-cover ring-1 ring-white/15" />
            ) : null}
            <div className="min-w-0">
              <p className="t-title truncate text-[1.5rem] leading-[1.15]">{pinned.title || followed.title}</p>
              <p className="mt-1 truncate text-[0.8125rem] text-moon/85">
                {dateLabel(followed.key)},&ensp;{followed.timeLabel || 'All day'}
              </p>
              {followed.meta ? <p className="t-micro mt-0.5 truncate italic">{followed.meta}</p> : null}
            </div>
          </div>
        ) : (
          <p className="t-meta mt-4">{pinned.match ? `No “${pinned.match}” coming up` : 'Nothing coming up'}</p>
        )}
      </div>
    </Preview>
  );
}

export function HomePane() {
  const { settings, update } = useSettings();
  const pinned = pinnedOf(settings);
  const setPinned = (patch) => update((s) => ({ pinned: { ...pinned, ...s.pinned, ...patch } }));
  const { upcoming, followed, loading } = useFollowed(pinned);
  const choices = useMemo(() => uniqueEventChoices(upcoming), [upcoming]);
  const [all, setAll] = useState(false);
  const listed = all ? choices : choices.slice(0, SHOWN);
  const matching = (event) => normTitle(event.title) === normTitle(pinned.match);

  return (
    <Page>
      <Group title="Highlighted event" note="The corner of Home that keeps an eye on one thing for you — a shift, a lecture, the next anything.">
        <Row label="What Home calls it">
          <Field
            value={pinned.label}
            delay={400}
            onCommit={(label) => setPinned({ label: label.trim() || DEFAULT_LABEL })}
            placeholder="My next shift"
            aria-label="What Home calls it"
          />
        </Row>
        <Row label="Shown as" hint="Renamed on Home only — your calendar keeps its own title.">
          <Field
            value={pinned.title}
            delay={400}
            onCommit={(title) => setPinned({ title: title.trim() })}
            placeholder={followed?.title || 'Its own title'}
            aria-label="Shown as"
          />
        </Row>
        <PictureRow image={pinned.image} onChange={(image) => setPinned({ image })} />
        <ToggleRow
          label="Keep it out of Upcoming"
          hint="Every time it comes round, not just the next — so Upcoming has room for everything else."
          checked={Boolean(pinned.excludeFromUpcoming)}
          onChange={(excludeFromUpcoming) => setPinned({ excludeFromUpcoming })}
        />
      </Group>

      <Group title="It follows">
        <Choice
          selected={!pinned.match}
          onClick={() => setPinned({ match: '', title: '' })}
          lead={<span className="settings-swatch bg-accent" />}
          title="Whatever’s next"
          meta="The next thing on any of your calendars"
        />
        {pinned.match && !choices.some(matching) ? (
          <Choice
            selected
            onClick={() => {}}
            lead={<span className="settings-swatch bg-white/30" />}
            title={pinned.match}
            meta="Nothing by that name coming up"
          />
        ) : null}
        {listed.map((event) => (
          <Choice
            key={event.sourceId}
            selected={matching(event)}
            onClick={() => setPinned({ match: event.title })}
            lead={<span className="settings-swatch" style={{ background: event.color }} />}
            title={event.title}
            meta={`Next ${relDay(event.offset, event.key).toLowerCase()}${event.allDay ? '' : `, ${event.time}`}`}
          />
        ))}
        {choices.length > SHOWN ? (
          <button type="button" onClick={() => setAll((v) => !v)} className="settings-choice justify-center text-[0.875rem] text-moon/70">
            {all ? 'Fewer' : `All ${choices.length} coming up`}
          </button>
        ) : null}
        {choices.length === 0 ? (
          <p className="px-5 py-4 text-[0.9375rem] text-dim">{loading ? 'Reading your calendars…' : 'Nothing coming up to follow.'}</p>
        ) : null}
        <Row label="Or any title" hint="Follows the next event called exactly this — handy for a shift that repeats.">
          <Field
            value={pinned.match}
            delay={500}
            onCommit={(match) => setPinned({ match: match.trim() })}
            placeholder="e.g. Shift at B&Q"
            aria-label="Follow events with this title"
          />
        </Row>
      </Group>

      <HomeApps />
    </Page>
  );
}

function PictureRow({ image, onChange }) {
  const input = useRef(null);
  const pick = async (file) => {
    if (!file) return;
    try {
      onChange(await fileToDataUrl(file));
    } catch {
      /* not an image this can read — leave the old one */
    }
  };
  return (
    <Row
      label="Picture"
      hint="Beside it on Home — a logo, a face, a place."
      lead={
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-label={image ? 'Change the picture' : 'Add a picture'}
          className="lift grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[0.8rem] bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
        >
          {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-4 w-4 text-moon/40" strokeWidth={1.6} />}
        </button>
      }
    >
      <button type="button" onClick={() => input.current?.click()} className="pill h-9 px-4">
        {image ? 'Change' : 'Choose'}
      </button>
      {image ? (
        <button type="button" onClick={() => onChange('')} className="pill h-9 px-4 text-moon/70">
          Remove
        </button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </Row>
  );
}

/** Which of the launchpad Home keeps to hand, picked straight off the shelf. */
function HomeApps() {
  const { settings, update } = useSettings();
  const launchpad = useMemo(() => settings.launchpad ?? [], [settings.launchpad]);
  const following = !Array.isArray(settings.homeLaunchpad);
  const chosen = following ? launchpad.slice(0, SLOTS).map(itemKey) : settings.homeLaunchpad;
  const on = new Set(chosen);
  const full = chosen.length >= SLOTS;
  const shown = homeItems(launchpad, settings.homeLaunchpad);

  const toggle = (item) => {
    const key = itemKey(item);
    if (on.has(key)) update({ homeLaunchpad: chosen.filter((k) => k !== key) });
    else if (!full) update({ homeLaunchpad: [...chosen, key] });
  };

  return (
    <Group
      title="Apps on Home"
      note={
        following
          ? 'Following the launchpad’s first twelve. Tap any to choose your own.'
          : `${shown.length} of ${SLOTS} chosen. Tap to put one on Home or take it off.`
      }
      action={
        following ? null : (
          <button type="button" onClick={() => update({ homeLaunchpad: null })} className="pill h-8 px-3.5">
            Follow the launchpad
          </button>
        )
      }
      pad
    >
      {launchpad.length === 0 ? (
        <p className="py-2 text-[0.9375rem] text-dim">Nothing on the launchpad yet — add apps and sites there first.</p>
      ) : (
        <div className="cascade grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-1">
          {launchpad.map((item) => {
            const lit = on.has(itemKey(item));
            const label = itemLabel(item);
            return (
              <button
                key={itemKey(item)}
                type="button"
                onClick={() => toggle(item)}
                aria-pressed={lit}
                aria-label={`${lit ? 'Take' : 'Put'} ${label} ${lit ? 'off' : 'on'} Home`}
                disabled={!lit && full}
                className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl px-1 py-3 transition hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-30"
              >
                <span className={`relative block h-11 w-11 transition duration-300 ${lit ? '' : 'scale-90 opacity-40 grayscale'}`}>
                  <LaunchIcon item={item} className="h-full w-full" />
                  <BrowserBadge item={item} />
                </span>
                <span className={`w-full truncate text-center text-[0.75rem] ${lit ? 'text-moon' : 'text-dim'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </Group>
  );
}
