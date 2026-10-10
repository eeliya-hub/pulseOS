import { Plane } from 'lucide-react';
import { MAP_LAYERS } from '../../data/travelMapLayers.js';
import { useSettings } from '../../hooks/useSettings.js';
import { useTravelStore } from '../../hooks/useTravelStore.js';
import { Choice, Field, Group, Page, Preview, Row, ToggleRow } from './controls.jsx';

const layersOf = (settings) => ({ ...Object.fromEntries(MAP_LAYERS.map((l) => [l.key, true])), ...settings.travelMapLayers });

const day = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const span = (trip) => [day(trip.start), day(trip.end)].filter(Boolean).join(' to ');

/** The trip Travel opens on, as its header reads. */
export function TravelPreview() {
  const { settings } = useSettings();
  const { trip } = useTravelStore();
  const layers = layersOf(settings);
  const dest = trip?.destination;
  return (
    <Preview>
      <p className="t-label absolute left-5 top-4 text-[0.75rem]">Travel opens on</p>
      <div className="absolute left-5 top-9 flex items-center gap-2.5">
        {dest?.flag ? <span className="text-[1.5rem] leading-none">{dest.flag}</span> : <Plane className="h-5 w-5 text-moon/60" strokeWidth={1.6} />}
        <p className="display-type text-[1.75rem] leading-none text-moon">{dest?.city || trip?.name || 'No trip yet'}</p>
      </div>
      {trip ? <p className="t-meta absolute left-5 top-[4.75rem] text-[0.75rem]">{span(trip)}</p> : null}
      {trip && dest?.currency?.code ? (
        <p className="absolute bottom-4 left-5 text-[0.75rem] text-moon/70">
          <span className="clock-figures font-semibold text-moon">{trip.homeCurrency || 'GBP'}</span> into{' '}
          <span className="clock-figures font-semibold text-moon">{dest.currency.code}</span>
        </p>
      ) : null}
      <div className="absolute bottom-4 right-5 flex items-center gap-3">
        {MAP_LAYERS.map((l) => (
          <span key={l.key} className={`flex items-center gap-1.5 text-[0.6875rem] ${layers[l.key] !== false ? 'text-moon/75' : 'text-moon/25 line-through'}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: l.color, opacity: layers[l.key] !== false ? 1 : 0.3 }} />
            {l.label}
          </span>
        ))}
      </div>
    </Preview>
  );
}

export function TravelPane() {
  const { settings, update } = useSettings();
  const travel = useTravelStore();
  const layers = layersOf(settings);
  const trip = travel.trip;
  const destCurrency = trip?.destination?.currency?.code;

  return (
    <Page>
      <Group title="Trips" note="Travel opens on the one you pick. Plan and edit trips in Travel itself.">
        {travel.trips.map((t) => (
          <Choice
            key={t.id}
            selected={t.id === travel.activeId}
            onClick={() => travel.selectTrip(t.id)}
            lead={
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[0.8rem] bg-white/[0.06] text-[1.25rem]">
                {t.destination?.flag || <Plane className="h-4 w-4 text-moon/60" strokeWidth={1.6} />}
              </span>
            }
            title={t.name}
            meta={[t.destination?.city, span(t)].filter(Boolean).join(', ')}
          />
        ))}
      </Group>

      {trip ? (
        <Group title="Your money" note={`For ${trip.name}.`}>
          <Row
            label="Home currency"
            hint={`What the converter turns ${destCurrency || 'local money'} into. A three-letter code — GBP, EUR, USD.`}
          >
            <Field
              value={trip.homeCurrency ?? 'GBP'}
              transform={(v) => v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)}
              delay={500}
              onCommit={(code) => code.length === 3 && travel.patchTrip({ homeCurrency: code })}
              placeholder="GBP"
              aria-label="Home currency"
              className="clock-figures w-[7rem] text-center tracking-[0.06em]"
            />
          </Row>
        </Group>
      ) : null}

      <Group title="Trip map" note="What the map draws. Its own filter on the map changes these too — they’re one setting.">
        {MAP_LAYERS.map((layer) => (
          <ToggleRow
            key={layer.key}
            label={layer.label}
            hint={layer.hint}
            checked={layers[layer.key] !== false}
            onChange={(on) => update((s) => ({ travelMapLayers: { ...layersOf(s), [layer.key]: on } }))}
            lead={<span className="settings-swatch" style={{ background: layer.color }} />}
          />
        ))}
      </Group>
    </Page>
  );
}
