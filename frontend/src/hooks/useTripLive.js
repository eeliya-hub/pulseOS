import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api/backendClient.js';

/**
 * The live half of a trip: destination weather, the exchange rate, and the route
 * behind each flight number.
 *
 * Each feed refreshes on the rhythm its data changes — the weather
 * quarter-hourly, the ECB rate twice an hour, flight routes only when the flight
 * number or date does — and every one degrades to null rather than throwing, so
 * a provider having a bad day leaves the rest of the Travel view intact.
 */
const WEATHER_MS = 15 * 60 * 1000;
const FX_MS = 30 * 60 * 1000;
// The flight number is typed into the card itself, so the tracked list changes
// on every keystroke. Waiting for the typing to settle is what stops "BA117"
// costing five lookups — four of them for numbers the user never meant.
const TYPING_MS = 650;

export function useTripLive(trip) {
  const [weather, setWeather] = useState(null);
  const [fx, setFx] = useState(null);
  const [flights, setFlights] = useState({});
  const [tracking, setTracking] = useState(false);

  const destination = trip?.destination ?? null;
  const lat = destination?.lat ?? null;
  const lon = destination?.lon ?? null;
  const city = destination?.city ?? '';
  const homeCurrency = trip?.homeCurrency || 'GBP';
  const destCurrency = destination?.currency?.code || '';

  // Flight code + date pairs, as a stable string so the effect doesn't re-run on
  // every render. The date decides both what the backend looks up and how often
  // we ask: there's no point polling a flight that's three weeks away.
  const tracked = useMemo(
    () =>
      (trip?.flights ?? [])
        .map((f) => ({ code: (f.code || '').trim().toUpperCase(), date: (f.date || '').trim() }))
        .filter((f) => f.code),
    [trip?.flights],
  );
  const trackedKey = tracked.map((f) => `${f.code}@${f.date}`).join(',');

  /* Weather — by coordinates when we have them, by name otherwise. */
  useEffect(() => {
    if (!city && lat == null) {
      setWeather(null);
      return undefined;
    }
    let alive = true;
    const load = () =>
      api.weather
        .summary(lat != null ? { lat, lon } : { city })
        .then((data) => alive && setWeather(data))
        .catch(() => alive && setWeather(null));

    load();
    const timer = window.setInterval(load, WEATHER_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [city, lat, lon]);

  /* Exchange rate home → destination. */
  useEffect(() => {
    if (!destCurrency || !homeCurrency || destCurrency === homeCurrency) {
      setFx(null);
      return undefined;
    }
    let alive = true;
    const load = () =>
      api.travel
        .fx(homeCurrency, destCurrency)
        .then((data) => alive && setFx(data))
        .catch(() => alive && setFx(null));

    load();
    const timer = window.setInterval(load, FX_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [homeCurrency, destCurrency]);

  /* Flights — one route lookup per tracked flight. Routes don't change, so this
     runs when the flight number or date does, and not on a timer. */
  const trackedRef = useRef(tracked);
  trackedRef.current = tracked;

  // Passes are numbered so a slow one can't land on top of a newer one. Typing
  // starts a pass per settled value, and they don't come back in order.
  const passRef = useRef(0);

  const loadFlights = useCallback(async () => {
    const list = trackedRef.current;
    if (!list.length) {
      setFlights({});
      return;
    }
    const pass = (passRef.current += 1);
    setTracking(true);
    const results = await Promise.all(
      list.map(({ code, date }) =>
        api.travel
          .flight(code, date || undefined)
          .then((data) => [code, data])
          .catch(() => [code, null]),
      ),
    );
    if (pass !== passRef.current) return; // a newer pass owns the card now

    // Merge, never replace, and keep the better answer per flight number.
    //
    // This is what stops the card blanking itself. A lookup can come back empty
    // for reasons that say nothing about the flight — a rate limit, a blip, a
    // half-typed number — and both replacing the map wholesale and trusting a
    // fresh `found: false` would wipe a card that was reading perfectly a second
    // earlier. A route is keyed on the flight number, so a code we have already
    // resolved keeps what we know until something better arrives; a code the
    // user has just changed has no previous answer to keep, and so correctly
    // shows nothing rather than the last flight's airline under a new number.
    setFlights((prev) => {
      const next = {};
      for (const { code } of list) {
        const fresh = results.find(([c]) => c === code)?.[1] ?? null;
        const held = prev[code] ?? null;
        next[code] = fresh?.found || !held ? fresh : held;
      }
      return next;
    });
    setTracking(false);
  }, []);

  useEffect(() => {
    if (!trackedKey) {
      setFlights({});
      return undefined;
    }
    const timer = window.setTimeout(loadFlights, TYPING_MS);
    return () => window.clearTimeout(timer);
  }, [trackedKey, loadFlights]);

  return { weather, fx, flights, tracking, refreshFlights: loadFlights };
}
